import path from "path"
import { Global } from "@opencode-ai/core/global"

export type VoiceBackend = "auto" | "local" | "openrouter"

export const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b"
export const DEFAULT_LOCAL_URL = "http://127.0.0.1:7003"
export const FAST_OPENROUTER_MODELS = [
  "nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b",
  "qwen/qwen3-asr-flash-2026-02-10",
  "qwen/qwen3-asr-0.6b",
  "x-ai/grok-stt-1.0",
  "mistralai/voxtral-mini-transcribe",
  "microsoft/mai-transcribe-1.5",
] as const

export type VoiceConfig = {
  backend: VoiceBackend
  localUrl: string
  openrouterModel: string
}

export type VoiceStatus = {
  ok: boolean
  backend: VoiceBackend
  model: string
  models: readonly string[]
  backends: { id: Exclude<VoiceBackend, "auto">; ready: boolean }[]
}

export type TranscribeInput = {
  bytes: Uint8Array
  filename: string
  mime?: string
  language?: string
}

export type TranscribeOk = {
  ok: true
  text: string
  backend: Exclude<VoiceBackend, "auto">
  model: string
  language?: string
}

export type TranscribeErr = {
  ok: false
  error: string
  status: number
}

export type TranscribeResult = TranscribeOk | TranscribeErr

export type VoiceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type VoiceRuntime = {
  env?: Record<string, string | undefined>
  fetch?: VoiceFetch
  authFile?: string
}

type ReadyBackend = {
  id: Exclude<VoiceBackend, "auto">
  ready: boolean
  model: string
}

export function voiceConfig(env: Record<string, string | undefined> = process.env): VoiceConfig {
  const backend = parseBackend(env.OPENCODE_VOICE_BACKEND)
  return {
    backend,
    localUrl: (env.OPENCODE_VOICE_URL ?? DEFAULT_LOCAL_URL).replace(/\/+$/, ""),
    openrouterModel: env.OPENCODE_VOICE_MODEL ?? DEFAULT_OPENROUTER_MODEL,
  }
}

export function audioFormat(filename: string, mime?: string) {
  const ext = path.extname(filename).replace(".", "").toLowerCase()
  const fromMime = mime?.split(";")[0]?.split("/")[1]?.toLowerCase()
  const raw = ext || fromMime || "webm"
  if (raw === "mpeg" || raw === "mpga") return "mp3"
  if (raw === "x-m4a" || raw === "mp4") return "m4a"
  if (raw === "wave") return "wav"
  return raw
}

export function transcriptText(payload: unknown) {
  if (typeof payload === "string") return payload.trim()
  if (!payload || typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  if (typeof record.text === "string") return record.text.trim()
  if (typeof record.transcript === "string") return record.transcript.trim()
  return ""
}

export function payloadError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback
  const record = payload as Record<string, unknown>
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim()
  if (typeof record.detail === "string" && record.detail.trim()) return record.detail.trim()
  const nested = record.error
  if (nested && typeof nested === "object" && typeof (nested as { message?: unknown }).message === "string") {
    return ((nested as { message: string }).message).trim()
  }
  return fallback
}

export async function voiceStatus(runtime: VoiceRuntime = {}): Promise<VoiceStatus> {
  const env = runtime.env ?? process.env
  const config = voiceConfig(env)
  const backends = await readyBackends(config, runtime)
  const active = backends.find((item) => item.ready)
  return {
    ok: !!active,
    backend: config.backend,
    model: active?.model ?? config.openrouterModel,
    models: FAST_OPENROUTER_MODELS,
    backends: backends.map((item) => ({ id: item.id, ready: item.ready })),
  }
}

export async function transcribe(input: TranscribeInput, runtime: VoiceRuntime = {}): Promise<TranscribeResult> {
  if (input.bytes.byteLength === 0) return { ok: false, status: 400, error: "empty audio" }
  const env = runtime.env ?? process.env
  const config = voiceConfig(env)
  const backends = await readyBackends(config, runtime)
  const order =
    config.backend === "auto" ? backends.filter((item) => item.ready) : backends.filter((item) => item.id === config.backend)
  if (order.length === 0) {
    return {
      ok: false,
      status: 503,
      error:
        "No speech-to-text backend is ready. Set OPENROUTER_API_KEY or start the local voice-service.",
    }
  }

  const errors: string[] = []
  for (const backend of order) {
    const result = await transcribeWith(backend.id, input, config, runtime)
    if (result.ok) return result
    errors.push(`${backend.id}: ${result.error}`)
    if (config.backend !== "auto") return result
  }
  return { ok: false, status: 502, error: errors.join(" | ") }
}

export async function transcribeRequest(request: Request, runtime: VoiceRuntime = {}): Promise<{ status: number; body: unknown }> {
  const form = await request.formData().catch(() => undefined)
  const file = form?.get("file")
  if (!(file instanceof Blob)) return { status: 400, body: { error: "missing audio file" } }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const filename = "name" in file && typeof file.name === "string" && file.name ? file.name : "recording.webm"
  const language = optionalString(form?.get("language"))
  const result = await transcribe({ bytes, filename, mime: file.type, language }, runtime)
  if (!result.ok) return { status: result.status, body: { error: result.error } }
  return {
    status: 200,
    body: {
      text: result.text,
      backend: result.backend,
      model: result.model,
      language: result.language,
    },
  }
}

function parseBackend(value: string | undefined): VoiceBackend {
  if (value === "local" || value === "openrouter") return value
  return "auto"
}

function optionalString(value: FormDataEntryValue | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

async function readyBackends(config: VoiceConfig, runtime: VoiceRuntime): Promise<ReadyBackend[]> {
  const env = runtime.env ?? process.env
  const openrouterKey = await apiKey(env, runtime.authFile)
  const localReady = await localHealth(config.localUrl, runtime.fetch ?? fetch)
  return [
    { id: "local", ready: localReady, model: "local" },
    { id: "openrouter", ready: !!openrouterKey, model: config.openrouterModel },
  ]
}

async function transcribeWith(
  backend: Exclude<VoiceBackend, "auto">,
  input: TranscribeInput,
  config: VoiceConfig,
  runtime: VoiceRuntime,
): Promise<TranscribeResult> {
  if (backend === "local") return transcribeLocal(input, config, runtime)
  return transcribeOpenRouter(input, config, runtime)
}

async function transcribeLocal(input: TranscribeInput, config: VoiceConfig, runtime: VoiceRuntime): Promise<TranscribeResult> {
  const form = new FormData()
  form.set("file", audioBlob(input), input.filename)
  if (input.language) form.set("language", input.language)
  const response = await send(`${config.localUrl}/transcribe`, { method: "POST", body: form }, runtime)
  if (!response) return { ok: false, status: 503, error: "local voice-service is not running" }
  const payload = await readJson(response)
  if (!response.ok) return { ok: false, status: 502, error: payloadError(payload, "local transcription failed") }
  const text = transcriptText(payload)
  if (!text) return { ok: false, status: 422, error: "No speech detected" }
  const language = payload && typeof payload === "object" ? (payload as { language?: string }).language : undefined
  return { ok: true, text, backend: "local", model: "local", language }
}

async function transcribeOpenRouter(
  input: TranscribeInput,
  config: VoiceConfig,
  runtime: VoiceRuntime,
): Promise<TranscribeResult> {
  const env = runtime.env ?? process.env
  const key = await apiKey(env, runtime.authFile)
  if (!key) return { ok: false, status: 503, error: "OpenRouter API key is not configured" }
  const format = audioFormat(input.filename, input.mime)
  const response = await send(
    "https://openrouter.ai/api/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://opencode.ai",
        "X-OpenRouter-Title": "OpenCode voice input",
      },
      body: JSON.stringify({
        model: config.openrouterModel,
        language: input.language,
        input_audio: {
          data: Buffer.from(input.bytes).toString("base64"),
          format,
        },
      }),
    },
    runtime,
  )
  if (!response) return { ok: false, status: 502, error: "OpenRouter transcription request failed" }
  const payload = await readJson(response)
  if (!response.ok) return { ok: false, status: 502, error: payloadError(payload, "OpenRouter transcription failed") }
  const text = transcriptText(payload)
  if (!text) return { ok: false, status: 422, error: "No speech detected" }
  return { ok: true, text, backend: "openrouter", model: config.openrouterModel }
}

function audioBlob(input: TranscribeInput) {
  return new Blob([Buffer.from(input.bytes)], { type: input.mime || "application/octet-stream" })
}

async function localHealth(url: string, fetchImpl: VoiceFetch) {
  const response = await fetchImpl(`${url}/health`, { method: "GET" }).catch(() => undefined)
  if (!response?.ok) return false
  const payload = await readJson(response)
  if (!payload || typeof payload !== "object") return true
  const loaded = (payload as { loaded?: unknown }).loaded
  return loaded !== false
}

async function send(url: string, init: RequestInit, runtime: VoiceRuntime) {
  const fetchImpl = runtime.fetch ?? fetch
  return fetchImpl(url, init).catch(() => undefined)
}

async function readJson(response: Response) {
  return response.json().catch(() => undefined)
}

async function apiKey(env: Record<string, string | undefined>, authFile?: string) {
  const fromEnv = env.OPENROUTER_API_KEY
  if (fromEnv?.trim()) return fromEnv.trim()
  const file = authFile ?? path.join(Global.Path.data, "auth.json")
  const data = await readAuthFile(file)
  const entry = data.openrouter
  if (entry && typeof entry === "object" && (entry as { type?: string }).type === "api") {
    const key = (entry as { key?: unknown }).key
    if (typeof key === "string" && key.trim()) return key.trim()
  }
  return
}

async function readAuthFile(file: string) {
  const body = await Bun.file(file)
    .text()
    .catch(() => "")
  if (!body) return {}
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}
