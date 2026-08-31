import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  audioFormat,
  payloadError,
  transcriptText,
  transcribe,
  transcribeBody,
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
    expect(
      transcriptText({
        results: { channels: [{ alternatives: [{ transcript: " from nova " }] }] },
      }),
    ).toBe("from nova")
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
    expect(status.models).toContain("elevenlabs/scribe_v2")
    expect(status.models).toContain("deepgram/nova-3")
    expect(status.models).toContain("google/chirp-3")
    expect(status.models).toContain("fish-audio/transcribe-1")
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
      { id: "elevenlabs", ready: false },
      { id: "deepgram", ready: false },
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

  test("uses ElevenLabs Scribe before OpenRouter when both keys are present", async () => {
    const authFile = path.join(await mkdtemp(path.join(tmpdir(), "opencode-voice-")), "auth.json")
    await writeFile(
      authFile,
      JSON.stringify({
        elevenlabs: { type: "api", key: "el-test" },
        openrouter: { type: "api", key: "or-test" },
      }),
    )
    const runtime: VoiceRuntime = {
      env: {},
      authFile,
      fetch: async (input, init) => {
        const url = String(input)
        if (url.endsWith("/health")) return new Response("nope", { status: 503 })
        if (url.includes("api.elevenlabs.io")) {
          const form = init?.body as FormData
          expect(form.get("model_id")).toBe("scribe_v2")
          return Response.json({ text: " from scribe ", language_code: "eng" })
        }
        throw new Error(`unexpected ${url}`)
      },
    }
    const result = await transcribe({ bytes: new Uint8Array([9, 9]), filename: "talk.webm" }, runtime)
    expect(result).toEqual({
      ok: true,
      text: "from scribe",
      backend: "elevenlabs",
      model: "scribe_v2",
      language: "eng",
    })
  })

  test("uses Deepgram Nova-3 when only a Deepgram key is configured", async () => {
    const authFile = path.join(await mkdtemp(path.join(tmpdir(), "opencode-voice-")), "auth.json")
    await writeFile(authFile, JSON.stringify({ deepgram: { type: "api", key: "dg-test" } }))
    const runtime: VoiceRuntime = {
      env: {},
      authFile,
      fetch: async (input, init) => {
        const url = String(input)
        if (url.endsWith("/health")) return new Response("nope", { status: 503 })
        if (url.includes("api.deepgram.com")) {
          expect(url).toContain("model=nova-3")
          expect((init?.headers as Record<string, string>).Authorization).toBe("Token dg-test")
          return Response.json({
            results: { channels: [{ alternatives: [{ transcript: " from nova-3 " }] }] },
          })
        }
        throw new Error(`unexpected ${url}`)
      },
    }
    const result = await transcribe({ bytes: new Uint8Array([8, 8]), filename: "talk.webm" }, runtime)
    expect(result).toEqual({
      ok: true,
      text: "from nova-3",
      backend: "deepgram",
      model: "nova-3",
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
      expect(result.error).toContain("ELEVENLABS_API_KEY")
      expect(result.error).not.toContain("OpenAI")
    }
  })

  test("rejects empty audio before calling a provider", async () => {
    const result = await transcribe({ bytes: new Uint8Array(), filename: "empty.webm" }, { fetch: async () => {
      throw new Error("should not fetch")
    } })
    expect(result).toEqual({ ok: false, status: 400, error: "empty audio" })
  })

  test("parses multipart from raw body bytes when the HTTP source is not a Web Request", async () => {
    const boundary = "----opencodeVoiceTest"
    const body = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="recording.webm"\r\n`,
      `Content-Type: audio/webm\r\n\r\n`,
      "abc",
      `\r\n--${boundary}--\r\n`,
    ].join("")
    const bytes = new TextEncoder().encode(body).buffer
    const contentType = `multipart/form-data; boundary=${boundary}`
    const result = await transcribeBody(bytes, contentType, {
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith("/health")) return Response.json({ ok: true, loaded: true })
        if (url.endsWith("/transcribe")) return Response.json({ text: " from reconstructed body " })
        throw new Error(`unexpected ${url}`)
      },
    })
    expect(result).toEqual({
      status: 200,
      body: { text: "from reconstructed body", backend: "local", model: "local", language: undefined },
    })
  })
})
