type DecoderRequest = { id: number; buffer: ArrayBuffer }

self.onmessage = (event: MessageEvent<DecoderRequest>) => {
  try {
    const text = new TextDecoder().decode(event.data.buffer)
    self.postMessage({ id: event.data.id, data: text ? JSON.parse(text) : {} })
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) })
  }
}

export {}
