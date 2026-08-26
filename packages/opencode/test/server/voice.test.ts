import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  audioFormat,
  payloadError,
  transcriptText,
  transcribe,
  voiceConfig,
  voiceStatus,
  type VoiceRuntime,
} from "../../src/server/voice"

describe("voice transcription", () => {
  test("maps common audio filenames to OpenRouter formats", () => {
    expect(audioFormat("clip.webm", "audio/webm;codecs=opus")).toBe("webm")
    expect(audioFormat("clip.m4a")).toBe("m4a")
    expect(audioFormat("clip.mp4", "audio/mp4")).toBe("m4a")
    expect(audioFormat("clip.wav")).toBe("wav")
    expect(audioFormat("clip.mp3")).toBe("mp3")
  })

  test("reads transcript text from provider payloads", () => {
    expect(transcriptText({ text: " hello " })).toBe("hello")
    expect(transcriptText({ transcript: "world" })).toBe("world")
    expect(transcriptText("raw")).toBe("raw")
    expect(transcriptText({})).toBe("")
  })

  test("extracts provider error messages without leaking bodies", () => {
    expect(payloadError({ error: { message: "invalid key" } }, "fallback")).toBe("invalid key")
    expect(payloadError({ detail: "model not loaded" }, "fallback")).toBe("model not loaded")
    expect(payloadError(undefined, "fallback")).toBe("fallback")
  })

  test("defaults to auto routing with NVIDIA Nemotron streaming ASR", () => {
    const config = voiceConfig({})
    expect(config.backend).toBe("auto")
    expect(config.openrouterModel).toBe("nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b")
    expect(config.localUrl).toBe("http://127.0.0.1:7003")
  })

  test("advertises recent non-OpenAI OpenRouter speech models", async () => {
    const status = await voiceStatus({
      env: {},
      fetch: async () => new Response("down", { status: 503 }),
    })
    expect(status.models).toContain("nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b")
    expect(status.models).toContain("qwen/qwen3-asr-flash-2026-02-10")
    expect(status.models).toContain("x-ai/grok-stt-1.0")
    expect(status.models).not.toContain("openai/whisper-large-v3-turbo")
    expect(status.models).not.toContain("openai/gpt-4o-mini-transcribe")
  })

  test("prefers a healthy local sidecar, then OpenRouter", async () => {
    const calls: string[] = []
    const authFile = path.join(await mkdtemp(path.join(tmpdir(), "opencode-voice-")), "auth.json")
    await writeFile(
      authFile,
      JSON.stringify({
        openrouter: { type: "api", key: "or-test" },
      }),
    )
    const runtime: VoiceRuntime = {
      env: {},
      authFile,
      fetch: async (input) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith("/health")) return Response.json({ ok: true, loaded: true })
        if (url.endsWith("/transcribe")) return Response.json({ text: " from the sidecar ", language: "en" })
        throw new Error(`unexpected ${url}`)
      },
    }
    const status = await voiceStatus(runtime)
    expect(status.ok).toBe(true)
    expect(status.backends).toEqual([
      { id: "local", ready: true },
      { id: "openrouter", ready: true },
    ])
    const result = await transcribe({ bytes: new Uint8Array([1, 2, 3]), filename: "clip.webm" }, runtime)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.backend).toBe("local")
      expect(result.text).toBe("from the sidecar")
    }
    expect(calls.some((url) => url.endsWith("/transcribe"))).toBe(true)
    expect(calls.some((url) => url.includes("openrouter.ai"))).toBe(false)
  })

  test("falls through to OpenRouter when the sidecar is down", async () => {
    const authFile = path.join(await mkdtemp(path.join(tmpdir(), "opencode-voice-")), "auth.json")
    await writeFile(authFile, JSON.stringify({ openrouter: { type: "api", key: "or-test" } }))
    const runtime: VoiceRuntime = {
      env: { OPENCODE_VOICE_MODEL: "qwen/qwen3-asr-0.6b" },
      authFile,
      fetch: async (input, init) => {
        const url = String(input)
        if (url.endsWith("/health")) return new Response("nope", { status: 503 })
        if (url.includes("openrouter.ai")) {
          const body = JSON.parse(String(init?.body)) as {
            model: string
            input_audio: { format: string }
          }
          expect(body.model).toBe("qwen/qwen3-asr-0.6b")
          expect(body.input_audio.format).toBe("webm")
          return Response.json({ text: "cloud transcript" })
        }
        throw new Error(`unexpected ${url}`)
      },
    }
    const result = await transcribe({ bytes: new Uint8Array([9, 9]), filename: "talk.webm" }, runtime)
    expect(result).toEqual({
      ok: true,
      text: "cloud transcript",
      backend: "openrouter",
      model: "qwen/qwen3-asr-0.6b",
    })
  })

  test("ignores OpenAI keys and does not call api.openai.com", async () => {
    const authFile = path.join(await mkdtemp(path.join(tmpdir(), "opencode-voice-")), "auth.json")
    await writeFile(authFile, JSON.stringify({ openai: { type: "api", key: "sk-test" } }))
    const runtime: VoiceRuntime = {
      env: { OPENAI_API_KEY: "sk-env" },
      authFile,
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith("/health")) return new Response("nope", { status: 503 })
        throw new Error(`unexpected ${url}`)
      },
    }
    const result = await transcribe({ bytes: new Uint8Array([4, 5]), filename: "talk.webm" }, runtime)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(503)
      expect(result.error).toContain("OPENROUTER_API_KEY")
      expect(result.error).not.toContain("OpenAI")
    }
  })

  test("rejects empty audio before calling a provider", async () => {
    const result = await transcribe({ bytes: new Uint8Array(), filename: "empty.webm" }, { fetch: async () => {
      throw new Error("should not fetch")
    } })
    expect(result).toEqual({ ok: false, status: 400, error: "empty audio" })
  })
})
