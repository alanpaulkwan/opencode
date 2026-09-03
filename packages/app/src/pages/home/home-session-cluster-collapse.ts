import { createStore, produce } from "solid-js/store"
import { persisted } from "@/utils/persist"

export function createHomeSessionClusterCollapse() {
  const [store, setStore] = persisted(
    "home.session.clusters.collapsed.v1",
    createStore({ ids: {} as Record<string, boolean> }),
  )

  return {
    isCollapsed: (id: string) => !!store.ids[id],
    toggle: (id: string) => {
      setStore(
        produce((draft) => {
          if (draft.ids[id]) delete draft.ids[id]
          else draft.ids[id] = true
        }),
      )
    },
  }
}
