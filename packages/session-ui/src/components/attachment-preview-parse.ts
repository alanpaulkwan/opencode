export const ATTACHMENT_PREVIEW_LIMITS = {
  dataUrlEncodedBytes: 14 * 1024 * 1024,
  notebookEncodedBytes: 3 * 1024 * 1024,
  notebookCells: 100,
  notebookCellSourceChars: 20_000,
  notebookOutputsPerCell: 20,
  notebookOutputChars: 20_000,
}

export type NotebookPreviewCell =
  | { kind: "markdown"; source: string }
  | { kind: "code"; source: string; outputs: string[] }

export type NotebookPreview = {
  cells: NotebookPreviewCell[]
}

export function parsePdfDataUrl(url: string) {
  const parsed = parseBase64DataUrl(url, ATTACHMENT_PREVIEW_LIMITS.dataUrlEncodedBytes)
  if (!parsed || parsed.mime !== "application/pdf") return
  if (parsed.bytes[0] !== 0x25 || parsed.bytes[1] !== 0x50 || parsed.bytes[2] !== 0x44 || parsed.bytes[3] !== 0x46) return
  return parsed.bytes
}

export function parseNotebookDataUrl(input: { url: string; mime?: string; filename?: string }) {
  if (input.mime !== "application/x-ipynb+json" && !input.filename?.toLowerCase().endsWith(".ipynb")) return

  const parsed = parseBase64DataUrl(input.url, ATTACHMENT_PREVIEW_LIMITS.notebookEncodedBytes)
  if (!parsed) return

  const text = decodeUtf8(parsed.bytes)
  if (!text) return

  const notebook = parseJsonRecord(text)
  if (!notebook || !Array.isArray(notebook.cells)) return

  return {
    cells: notebook.cells.slice(0, ATTACHMENT_PREVIEW_LIMITS.notebookCells).flatMap((cell): NotebookPreviewCell[] => {
      if (!isRecord(cell)) return []
      const source = notebookText(cell.source).slice(0, ATTACHMENT_PREVIEW_LIMITS.notebookCellSourceChars)
      if (cell.cell_type === "markdown") return [{ kind: "markdown", source }]
      if (cell.cell_type !== "code") return []
      return [
        {
          kind: "code",
          source,
          outputs: Array.isArray(cell.outputs)
            ? cell.outputs.slice(0, ATTACHMENT_PREVIEW_LIMITS.notebookOutputsPerCell).flatMap(notebookOutputText)
            : [],
        },
      ]
    }),
  }
}

function parseBase64DataUrl(url: string, maxEncodedBytes: number) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(url)
  if (!match) return
  if (match[2].length > maxEncodedBytes) return
  const normalized = match[2].replace(/[\r\n]/g, "")
  if (normalized.length % 4 !== 0) return
  const raw = decodeBase64(normalized)
  if (!raw) return
  return { mime: match[1].toLowerCase(), bytes: Uint8Array.from(raw, (value) => value.charCodeAt(0)) }
}

function decodeBase64(value: string) {
  try {
    return atob(value)
  } catch {
    return
  }
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return
  }
}

function parseJsonRecord(text: string) {
  try {
    const value: unknown = JSON.parse(text)
    if (isRecord(value)) return value
  } catch {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function notebookText(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join("")
  return ""
}

function notebookOutputText(output: unknown) {
  if (!isRecord(output)) return []
  if (output.output_type === "stream") return outputText(notebookText(output.text))
  if (output.output_type === "error") {
    return outputText(
      [notebookText(output.ename), notebookText(output.evalue), notebookText(output.traceback)]
        .filter((item) => item.length > 0)
        .join("\n"),
    )
  }
  if (output.output_type !== "execute_result" && output.output_type !== "display_data") return []
  if (!isRecord(output.data)) return []
  return outputText(notebookText(output.data["text/plain"]))
}

function outputText(value: string) {
  const text = value.slice(0, ATTACHMENT_PREVIEW_LIMITS.notebookOutputChars)
  return text ? [text] : []
}
