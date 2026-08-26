export const PROMPT_VOICE_TOGGLE_EVENT = "opencode-prompt-voice-toggle"

export function togglePromptVoice() {
  window.dispatchEvent(new Event(PROMPT_VOICE_TOGGLE_EVENT))
}

export function recorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? ""
}

export function recorderFilename(mime: string) {
  return mime.includes("mp4") ? "recording.m4a" : "recording.webm"
}

export function padInsertedText(current: string, incoming: string) {
  const text = incoming.trim()
  if (!text) return ""
  if (!current || /\s$/.test(current)) return text
  return ` ${text}`
}
