import { createStore, produce } from "solid-js/store"
import { persisted } from "@/utils/persist"

export type HomeSessionPinMap = Record<string, number>

export function createHomeSessionPins() {
  const [store, setStore] = persisted(
    "home.session.pins.v1",
    createStore({ byServer: {} as Record<string, HomeSessionPinMap> }),
  )

  const map = (server: string): HomeSessionPinMap => store.byServer[server] ?? {}

  return {
    map,
    isPinned: (server: string, sessionID: string) => !!map(server)[sessionID],
    toggle: (server: string, sessionID: string) => {
      setStore(
        produce((draft) => {
          const bucket = (draft.byServer[server] ??= {})
          if (bucket[sessionID]) delete bucket[sessionID]
          else bucket[sessionID] = Date.now()
        }),
      )
    },
  }
}
