import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { KeybindV2 } from "@opencode-ai/ui/v2/keybind-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { showToast } from "@/utils/toast"
import { transcribeVoice } from "@/utils/voice-client"
import {
  padInsertedText,
  PROMPT_VOICE_TOGGLE_EVENT,
  recorderFilename,
  recorderMime,
} from "@/utils/voice-recorder"

type VoiceState = "idle" | "recording" | "transcribing"

function elapsedClock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

export function PromptVoiceButton(props: {
  variant: "v1" | "v2"
  disabled?: boolean
  currentText: () => string
  insertText: (text: string) => void
  keybind?: string
  keybindParts?: string[]
}) {
  const language = useLanguage()
  const server = useServer()
  const [state, setState] = createSignal<VoiceState>("idle")
  const [elapsed, setElapsed] = createSignal(0)
  let recorder: MediaRecorder | undefined
  let chunks: Blob[] = []
  let holdTimer: number | undefined
  let held = false
  let stream: MediaStream | undefined

  const label = () => {
    if (state() === "recording") return language.t("prompt.action.voice.stop")
    if (state() === "transcribing") return language.t("prompt.action.voice.transcribing")
    return language.t("prompt.action.voice")
  }

  const statusText = () => {
    if (state() === "recording") return `${language.t("prompt.action.voice.recording")} ${elapsedClock(elapsed())}`
    if (state() === "transcribing") return language.t("prompt.action.voice.transcribing")
    return ""
  }

  createEffect(() => {
    if (state() !== "recording") {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250)
    onCleanup(() => window.clearInterval(id))
  })

  const stopTracks = () => {
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
  }

  const finish = (next: MediaRecorder) => {
    if (state() !== "recording") return
    setState("transcribing")
    if (next.state !== "inactive") next.stop()
  }

  const unavailable = () =>
    showToast({
      title: language.t("prompt.toast.voice.unavailable.title"),
      description: language.t("prompt.toast.voice.unavailable.description"),
    })

  const transcribe = async (blob: Blob, mime: string) => {
    const http = server.current?.http
    const result = await transcribeVoice({
      url: http?.url || (typeof window !== "undefined" ? window.location.origin : ""),
      username: http?.username,
      password: http?.password,
      blob,
      filename: recorderFilename(mime || blob.type),
    })
    setState("idle")
    if (result.ok) {
      props.insertText(padInsertedText(props.currentText(), result.text))
      return
    }
    showToast({
      title: result.empty ? language.t("prompt.toast.voice.empty.title") : language.t("prompt.toast.voice.failed.title"),
      description: result.empty ? undefined : result.error,
    })
  }

  const start = async () => {
    if (props.disabled || state() !== "idle") return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      unavailable()
      return
    }
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => undefined)
    if (!nextStream) {
      unavailable()
      return
    }
    stream = nextStream
    const mime = recorderMime()
    const next = mime ? new MediaRecorder(nextStream, { mimeType: mime }) : new MediaRecorder(nextStream)
    chunks = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    next.onstop = () => {
      stopTracks()
      const blob = new Blob(chunks, { type: next.mimeType || mime || "audio/webm" })
      chunks = []
      void transcribe(blob, next.mimeType || mime)
    }
    recorder = next
    setState("recording")
    next.start()
  }

  const stop = () => {
    const next = recorder
    recorder = undefined
    if (!next) {
      stopTracks()
      setState("idle")
      return
    }
    finish(next)
  }

  const toggle = () => {
    if (state() === "recording") {
      stop()
      return
    }
    void start()
  }

  const onToggleEvent = () => {
    if (props.disabled) return
    toggle()
  }

  window.addEventListener(PROMPT_VOICE_TOGGLE_EVENT, onToggleEvent)
  onCleanup(() => {
    window.removeEventListener(PROMPT_VOICE_TOGGLE_EVENT, onToggleEvent)
    if (holdTimer) window.clearTimeout(holdTimer)
    recorder?.stop()
    stopTracks()
  })

  const onPointerDown = (event: PointerEvent) => {
    if (props.disabled || event.button !== 0 || state() !== "idle") return
    held = false
    holdTimer = window.setTimeout(() => {
      held = true
      void start()
    }, 220)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (holdTimer) window.clearTimeout(holdTimer)
    holdTimer = undefined
    if (held) {
      event.preventDefault()
      stop()
    }
  }

  const recording = () => state() === "recording"
  const busy = () => state() === "transcribing"

  return (
    <div class="flex min-w-0 items-center gap-1.5" data-voice-state={state()}>
      <Show
        when={props.variant === "v2"}
        fallback={
          <TooltipKeybind placement="top" title={label()} keybind={props.keybind ?? ""}>
            <IconButton
              data-action="prompt-voice"
              type="button"
              icon="microphone"
              variant={recording() ? "primary" : "ghost"}
              class="size-8"
              classList={{
                "text-icon-critical-base ring-2 ring-icon-critical-base/70 ring-offset-1": recording(),
                "opacity-60": busy(),
              }}
              disabled={props.disabled || busy()}
              aria-label={label()}
              aria-pressed={recording()}
              onClick={(event) => {
                if (held) {
                  held = false
                  event.preventDefault()
                  return
                }
                toggle()
              }}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </TooltipKeybind>
        }
      >
        <TooltipV2
          placement="top"
          value={
            <>
              {label()}
              <Show when={(props.keybindParts ?? []).length > 0}>
                <KeybindV2 keys={props.keybindParts ?? []} variant="neutral" />
              </Show>
            </>
          }
        >
          <IconButtonV2
            data-action="prompt-voice"
            type="button"
            icon={<IconV2 name="microphone" />}
            variant={recording() ? "ghost" : "ghost-muted"}
            size="large"
            disabled={props.disabled || busy()}
            aria-label={label()}
            aria-pressed={recording()}
            classList={{
              "text-v2-icon-icon-critical ring-2 ring-current ring-offset-1 ring-offset-transparent": recording(),
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (held) {
                held = false
                return
              }
              toggle()
            }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </TooltipV2>
      </Show>
      <Show when={state() !== "idle"}>
        <span
          class="flex min-w-0 items-center gap-1 text-xs font-medium whitespace-nowrap"
          classList={{
            "text-icon-critical-base text-v2-icon-icon-critical": recording(),
            "text-text-weak text-v2-text-text-muted": busy(),
          }}
          aria-live="polite"
        >
          <Show when={busy()}>
            <span
              class="inline-block size-3 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden="true"
            />
          </Show>
          <Show when={recording()}>
            <span class="inline-block size-2 shrink-0 rounded-full bg-current animate-pulse" aria-hidden="true" />
          </Show>
          {statusText()}
        </span>
      </Show>
    </div>
  )
}

export function PromptVoiceIcon(props: { class?: string }) {
  return <Icon name="microphone" class={props.class} />
}
