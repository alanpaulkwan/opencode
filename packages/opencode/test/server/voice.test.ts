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

  test("defaults to auto routing with the fast OpenRouter whisper model", () => {
    const config = voiceConfig({})
    expect(config.backend).toBe("auto")
    expect(config.openrouterModel).toBe("openai/whisper-large-v3-turbo")
    expect(config.localUrl).toBe("http://127.0.0.1:7003")
  })

  test("advertises summer 2026 fast OpenRouter speech models", async () => {
    const status = await voiceStatus({
      env: {},
      fetch: async () => new Response("down", { status: 503 }),
    })
    expect(status.models).toContain("openai/whisper-large-v3-turbo")
    expect(status.models).toContain("openai/gpt-4o-mini-transcribe")
    expect(status.models).toContain("qwen/qwen3-asr-flash-2026-02-10")
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
      { id: "openai", ready: false },
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

  test("falls through to OpenAI when the sidecar and OpenRouter are unavailable", async () => {
    const authFile = path.join(await mkdtemp(path.join(tmpdir(), "opencode-voice-")), "auth.json")
    await writeFile(authFile, JSON.stringify({ openai: { type: "api", key: "sk-test" } }))
    const runtime: VoiceRuntime = {
      env: {},
      authFile,
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith("/health")) return new Response("nope", { status: 503 })
        if (url.includes("api.openai.com")) return Response.json({ text: "from gpt-4o-mini-transcribe" })
        throw new Error(`unexpected ${url}`)
      },
    }
    const result = await transcribe({ bytes: new Uint8Array([4, 5]), filename: "talk.webm" }, runtime)
    expect(result).toEqual({
      ok: true,
      text: "from gpt-4o-mini-transcribe",
      backend: "openai",
      model: "gpt-4o-mini-transcribe",
    })
  })

  test("rejects empty audio before calling a provider", async () => {
    const result = await transcribe({ bytes: new Uint8Array(), filename: "empty.webm" }, { fetch: async () => {
      throw new Error("should not fetch")
    } })
    expect(result).toEqual({ ok: false, status: 400, error: "empty audio" })
  })
})
