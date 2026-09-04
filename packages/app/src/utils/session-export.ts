import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"

// Matches the exact `{ info, messages: [{ info, parts }] }` structure produced by `opencode export` CLI
export type SessionExportData = {
  info: Session
  messages: {
    info: Message
    parts: Part[]
  }[]
}

export type SessionExportClient = {
  session: {
    get: (input: { sessionID: string }) => Promise<{ data?: Session | null }>
    messages: (input: { sessionID: string }) => Promise<{ data?: SessionExportData["messages"] | null }>
  }
}

export async function fetchSessionExport(input: {
  sessionID: string
  client: SessionExportClient
}): Promise<SessionExportData> {
  const [sessionRes, messagesRes] = await Promise.all([
    input.client.session.get({ sessionID: input.sessionID }),
    input.client.session.messages({ sessionID: input.sessionID }),
  ])

  if (!sessionRes?.data) {
    throw new Error(`Session not found: ${input.sessionID}`)
  }
  if (!messagesRes?.data) {
    throw new Error(`Failed to load messages for session: ${input.sessionID}`)
  }

  return {
    info: sessionRes.data,
    messages: messagesRes.data,
  }
}

export type SessionExportFormat = "json" | "markdown" | "html" | "pdf"

export const SESSION_EXPORT_FORMATS = ["pdf", "json", "markdown", "html"] as const satisfies readonly SessionExportFormat[]

export function sessionExportFilename(
  session: { id: string; title?: string; slug?: string },
  format: SessionExportFormat = "json",
) {
  const name = session.title || session.slug || session.id
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
  const ext = format === "markdown" ? "md" : format === "pdf" ? "pdf" : format
  return `${clean || session.id}.${ext}`
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadSessionExport(filename: string, data: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
}

function partText(part: Part) {
  if (part.type === "text" && "text" in part && typeof part.text === "string") {
    if ("synthetic" in part && part.synthetic) return ""
    return part.text
  }
  if (part.type === "reasoning" && "text" in part && typeof part.text === "string") return part.text
  if (part.type === "tool" && "tool" in part) {
    const name = String(part.tool)
    const state = "state" in part ? part.state : undefined
    const output =
      state && typeof state === "object" && "output" in state && typeof state.output === "string" ? state.output : ""
    if (output) return `### ${name}\n\n${output}`
    return `### ${name}`
  }
  return ""
}

export function sessionToMarkdown(data: SessionExportData) {
  const title = data.info.title || data.info.slug || data.info.id
  const blocks = [`# ${title}`, "", `\`${data.info.id}\``, ""]
  for (const message of data.messages) {
    blocks.push(`## ${message.info.role}`, "")
    for (const part of message.parts) {
      const text = partText(part)
      if (text) blocks.push(text, "")
    }
  }
  return blocks.join("\n")
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function sessionToHtml(data: SessionExportData) {
  const title = escapeHtml(data.info.title || data.info.slug || data.info.id)
  const messages = data.messages
    .map((message) => {
      const body = message.parts
        .map((part) => partText(part))
        .filter(Boolean)
        .map((text) => `<pre>${escapeHtml(text)}</pre>`)
        .join("")
      if (!body) return ""
      return `<section><h2>${escapeHtml(message.info.role)}</h2>${body}</section>`
    })
    .join("")
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1.25rem; color: #111; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; margin: 1.75rem 0 0.5rem; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f4f4f5; padding: 12px; border-radius: 8px; }
</style>
</head>
<body>
<h1>${title}</h1>
<p><code>${escapeHtml(data.info.id)}</code></p>
${messages}
</body>
</html>`
}

function openHtmlWindow(html: string, print: boolean) {
  const popup = window.open("", "_blank")
  if (!popup) throw new Error("Popup blocked")
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  if (print) popup.print()
}

export function saveSessionExport(data: SessionExportData, format: SessionExportFormat) {
  const filename = sessionExportFilename(data.info, format)
  if (format === "json") {
    downloadSessionExport(filename, data)
    return filename
  }
  if (format === "markdown") {
    downloadBlob(filename, new Blob([sessionToMarkdown(data)], { type: "text/markdown;charset=utf-8" }))
    return filename
  }
  const html = sessionToHtml(data)
  if (format === "html") {
    downloadBlob(filename, new Blob([html], { type: "text/html;charset=utf-8" }))
    return filename
  }
  openHtmlWindow(html, true)
  return filename
}
