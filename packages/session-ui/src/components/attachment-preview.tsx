import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { createMemo, For, onCleanup, Show, type JSX } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { getFilename } from "@opencode-ai/core/util/path"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Markdown } from "./markdown"
import type { NotebookPreview } from "./attachment-preview-parse"

export function AttachmentPreviewCard(props: { name: string; type: "pdf" | "notebook"; onClick: () => void }) {
  return (
    <button
      type="button"
      data-slot="tool-preview-attachment"
      data-type={props.type}
      onClick={props.onClick}
      aria-label={props.name}
      title={props.name}
    >
      <FileIcon node={{ path: props.name, type: "file" }} />
      <span data-slot="tool-preview-attachment-name">{getFilename(props.name)}</span>
    </button>
  )
}

export function PdfAttachmentPreview(props: { name: string; bytes: Uint8Array }) {
  const url = URL.createObjectURL(new Blob([arrayBufferFromBytes(props.bytes)], { type: "application/pdf" }))
  onCleanup(() => URL.revokeObjectURL(url))
  return (
    <AttachmentPreviewDialog name={props.name}>
      <iframe data-slot="attachment-preview-pdf" src={url} title={props.name} sandbox="" referrerpolicy="no-referrer" />
    </AttachmentPreviewDialog>
  )
}

export function NotebookAttachmentPreview(props: { name: string; notebook: NotebookPreview }) {
  const cells = createMemo(() => props.notebook.cells)
  return (
    <AttachmentPreviewDialog name={props.name}>
      <div data-slot="attachment-preview-notebook">
        <For each={cells()}>
          {(cell) => (
            <section data-slot="attachment-preview-notebook-cell" data-kind={cell.kind}>
              <Show when={cell.kind === "markdown"} fallback={<pre>{cell.source}</pre>}>
                <Markdown text={cell.source} />
              </Show>
              <Show when={cell.kind === "code" ? cell.outputs.length > 0 : false}>
                <div data-slot="attachment-preview-notebook-outputs">
                  <For each={cell.kind === "code" ? cell.outputs.filter((output) => output.length > 0) : []}>
                    {(output) => <pre>{output}</pre>}
                  </For>
                </div>
              </Show>
            </section>
          )}
        </For>
      </div>
    </AttachmentPreviewDialog>
  )
}

function AttachmentPreviewDialog(props: { name: string; children: JSX.Element }) {
  const i18n = useI18n()
  return (
    <div data-component="attachment-preview-dialog">
      <Kobalte.Content data-slot="attachment-preview-content" aria-label={props.name}>
        <div data-slot="attachment-preview-header">
          <Kobalte.CloseButton
            data-slot="attachment-preview-close"
            as={IconButton}
            icon="close"
            variant="ghost"
            aria-label={i18n.t("ui.common.close")}
          />
        </div>
        <div data-slot="attachment-preview-body">{props.children}</div>
      </Kobalte.Content>
    </div>
  )
}

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
