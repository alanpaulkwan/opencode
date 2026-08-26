import { authTokenFromCredentials } from "./server"

export type VoiceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type VoiceTranscribeInput = {
  url: string
  username?: string
  password?: string
  blob: Blob
  filename: string
  fetch?: VoiceFetch
}

export type VoiceTranscribeResult =
  | { ok: true; text: string; backend?: string; model?: string }
  | { ok: false; error: string; empty?: boolean }

export async function transcribeVoice(input: VoiceTranscribeInput): Promise<VoiceTranscribeResult> {
  const form = new FormData()
  form.append(
    "file",
    new File([input.blob], input.filename, { type: input.blob.type || "application/octet-stream" }),
  )
  const headers: Record<string, string> = {}
  if (input.password) {
    headers.Authorization = `Basic ${authTokenFromCredentials({
      username: input.username,
      password: input.password,
    })}`
  }
  const response = await (input.fetch ?? fetch)(`${input.url.replace(/\/+$/, "")}/voice/transcribe`, {
    method: "POST",
    headers,
    body: form,
  }).catch(() => undefined)
  if (!response) return { ok: false, error: "Couldn't reach the transcription service" }
  const payload = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined
  if (!response.ok) {
    const error = typeof payload?.error === "string" && payload.error.trim() ? payload.error.trim() : `Transcription failed (${response.status})`
    return { ok: false, error }
  }
  const text = typeof payload?.text === "string" ? payload.text.trim() : ""
  if (!text) return { ok: false, error: "No speech detected", empty: true }
  return {
    ok: true,
    text,
    backend: typeof payload?.backend === "string" ? payload.backend : undefined,
    model: typeof payload?.model === "string" ? payload.model : undefined,
  }
}
