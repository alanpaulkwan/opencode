import { describe, expect, test } from "bun:test"
import { authTokenFromCredentials } from "./server"
import { transcribeVoice } from "./voice-client"

describe("voice client", () => {
  test("posts audio to the same-origin voice route with basic auth", async () => {
    const calls: { url: string; headers: HeadersInit | undefined; filename?: string }[] = []
    const result = await transcribeVoice({
      url: "http://100.77.34.92:4003/",
      username: "opencode",
      password: "secret",
      blob: new Blob(["abc"], { type: "audio/webm" }),
      filename: "recording.webm",
      fetch: async (url, init) => {
        const form = init?.body as FormData
        const file = form.get("file") as File
        calls.push({ url: String(url), headers: init?.headers, filename: file?.name })
        return Response.json({ text: "  hello from whisper  ", backend: "openrouter", model: "openai/whisper-large-v3-turbo" })
      },
    })
    expect(result).toEqual({
      ok: true,
      text: "hello from whisper",
      backend: "openrouter",
      model: "openai/whisper-large-v3-turbo",
    })
    expect(calls[0]?.url).toBe("http://100.77.34.92:4003/voice/transcribe")
    expect(calls[0]?.filename).toBe("recording.webm")
    expect((calls[0]?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${authTokenFromCredentials({ username: "opencode", password: "secret" })}`,
    )
  })

  test("maps empty transcripts to a dedicated empty result", async () => {
    const result = await transcribeVoice({
      url: "http://localhost:4096",
      blob: new Blob(["x"], { type: "audio/webm" }),
      filename: "recording.webm",
      fetch: async () => Response.json({ text: "   " }),
    })
    expect(result).toEqual({ ok: false, error: "No speech detected", empty: true })
  })
})
