import { decodeLegacyMessagePage, decodeLegacySessionList } from "./session-message-decode"

type DecoderRequest = { id: number; type: "messages" | "sessions"; buffer: ArrayBuffer }

self.onmessage = (event: MessageEvent<DecoderRequest>) => {
  try {
    self.postMessage({
      id: event.data.id,
      data:
        event.data.type === "messages"
          ? decodeLegacyMessagePage(event.data.buffer)
          : decodeLegacySessionList(event.data.buffer),
    })
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) })
  }
}

export {}
