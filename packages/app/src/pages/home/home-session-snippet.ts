export type HomeSessionSnippetMessage = {
  id: string
  role?: string
  type?: string
  text?: string
}

export type HomeSessionSnippetPart = {
  type?: string
  text?: string
}

function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function isChatMessage(message: HomeSessionSnippetMessage) {
  const kind = message.role ?? message.type
  return kind === "user" || kind === "assistant"
}

export function lastSessionSnippet(
  messages: HomeSessionSnippetMessage[] | undefined,
  parts: Record<string, HomeSessionSnippetPart[] | undefined> | undefined,
) {
  if (!messages?.length) return ""
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!isChatMessage(message)) continue
    const list = parts?.[message.id] ?? []
    for (let partIndex = list.length - 1; partIndex >= 0; partIndex--) {
      const part = list[partIndex]
      if (part.type === "text" && part.text) {
        const text = collapse(part.text)
        if (text) return text
      }
    }
    if (message.text) {
      const text = collapse(message.text)
      if (text) return text
    }
  }
  return ""
}
