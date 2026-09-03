import { createStore, produce } from "solid-js/store"
import { uuid } from "@/utils/uuid"
import { persisted } from "@/utils/persist"

export type HomeNamedGroup = {
  id: string
  name: string
  created: number
}

export type HomeNamedGroupsBucket = {
  groups: HomeNamedGroup[]
  members: Record<string, string>
}

export function trimNamedGroupName(name: string) {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function createHomeSessionNamedGroups() {
  const [store, setStore] = persisted(
    "home.session.named-groups.v1",
    createStore({ byServer: {} as Record<string, HomeNamedGroupsBucket> }),
  )

  const bucket = (server: string): HomeNamedGroupsBucket => store.byServer[server] ?? { groups: [], members: {} }

  const groupOf = (server: string, sessionID: string) => {
    const current = bucket(server)
    const id = current.members[sessionID]
    if (!id) return
    return current.groups.find((group) => group.id === id)
  }

  return {
    list: (server: string) => bucket(server).groups,
    groupOf,
    create: (server: string, name: string) => {
      const trimmed = trimNamedGroupName(name)
      if (!trimmed) return
      const group: HomeNamedGroup = { id: uuid(), name: trimmed, created: Date.now() }
      setStore(
        produce((draft) => {
          const current = (draft.byServer[server] ??= { groups: [], members: {} })
          current.groups.push(group)
        }),
      )
      return group
    },
    rename: (server: string, groupID: string, name: string) => {
      const trimmed = trimNamedGroupName(name)
      if (!trimmed) return
      setStore(
        produce((draft) => {
          const current = draft.byServer[server]
          const group = current?.groups.find((item) => item.id === groupID)
          if (group) group.name = trimmed
        }),
      )
    },
    remove: (server: string, groupID: string) => {
      setStore(
        produce((draft) => {
          const current = draft.byServer[server]
          if (!current) return
          current.groups = current.groups.filter((group) => group.id !== groupID)
          for (const [sessionID, id] of Object.entries(current.members)) {
            if (id === groupID) delete current.members[sessionID]
          }
        }),
      )
    },
    assign: (server: string, sessionID: string, groupID: string) => {
      setStore(
        produce((draft) => {
          const current = draft.byServer[server]
          if (!current?.groups.some((group) => group.id === groupID)) return
          current.members[sessionID] = groupID
        }),
      )
    },
    assignMany: (server: string, sessionIDs: string[], groupID: string) => {
      setStore(
        produce((draft) => {
          const current = draft.byServer[server]
          if (!current?.groups.some((group) => group.id === groupID)) return
          for (const sessionID of sessionIDs) current.members[sessionID] = groupID
        }),
      )
    },
    unassign: (server: string, sessionID: string) => {
      setStore(
        produce((draft) => {
          const current = draft.byServer[server]
          if (current) delete current.members[sessionID]
        }),
      )
    },
  }
}
