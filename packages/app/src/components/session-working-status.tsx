import { Spinner } from "@opencode-ai/ui/spinner"
import { Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { useSessionKey } from "@/pages/session/session-layout"

const idle = { type: "idle" as const }

export function SessionWorkingStatus() {
  const language = useLanguage()
  const sync = useSync()
  const { params } = useSessionKey()
  const status = createMemo(() => {
    const id = params.id
    if (!id) return idle
    return sync().data.session_status[id] ?? idle
  })
  const active = () => status().type !== "idle"
  const label = () =>
    status().type === "retry" ? language.t("session.status.retrying") : language.t("session.status.working")

  return (
    <Show when={active()}>
      <span
        data-session-working
        class="flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap text-text-weak text-v2-text-text-muted"
        aria-live="polite"
      >
        <Spinner class="size-3.5" />
        {label()}
      </span>
    </Show>
  )
}
