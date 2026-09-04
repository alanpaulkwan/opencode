import { For } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import {
  SESSION_EXPORT_FORMATS,
  fetchSessionExport,
  saveSessionExport,
  type SessionExportFormat,
} from "@/utils/session-export"

const FORMAT_KEY = {
  pdf: "context.export.format.pdf",
  json: "context.export.format.json",
  markdown: "context.export.format.markdown",
  html: "context.export.format.html",
} as const

export function DialogExportSession(props: { sessionID: string }) {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useSDK()

  const pick = async (format: SessionExportFormat) => {
    try {
      const data = await fetchSessionExport({
        sessionID: props.sessionID,
        client: sdk().client,
      })
      const filename = saveSessionExport(data, format)
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("toast.session.export.success.title"),
        description: language.t("toast.session.export.success.description", { filename }),
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("toast.session.export.failed.title"),
        description: err instanceof Error ? err.message : language.t("toast.session.export.failed.description"),
      })
    }
  }

  return (
    <Dialog title={language.t("dialog.export.title")} description={language.t("dialog.export.description")} fit>
      <div class="flex flex-col gap-1 p-1">
        <For each={SESSION_EXPORT_FORMATS}>
          {(format) => (
            <Button variant="ghost" class="justify-start w-full" onClick={() => void pick(format)}>
              {language.t(FORMAT_KEY[format])}
            </Button>
          )}
        </For>
      </div>
    </Dialog>
  )
}
