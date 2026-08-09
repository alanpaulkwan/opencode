import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import type { ServerConnection } from "@/context/server"

type HomeSession = {
  id: string
  directory: string
}

type HomeSessionTree = {
  id: string
  parentID?: string
}

export async function deleteHomeSession(input: {
  server: ServerConnection.Key
  session: HomeSession
  delete: (sessionID: string) => Promise<unknown>
  remove: () => string[]
  onError?: (error: unknown) => void
}) {
  return input
    .delete(input.session.id)
    .then(() => {
      const sessionIDs = input.remove()
      notifySessionTabsRemoved({
        server: input.server,
        directory: input.session.directory,
        sessionIDs,
      })
      return true
    })
    .catch((error) => {
      input.onError?.(error)
      return false
    })
}

export function removedHomeSessionIDs(sessions: readonly HomeSessionTree[], sessionID: string) {
  const removed = new Set<string>([sessionID])
  const byParent = new Map<string, string[]>()
  sessions.forEach((session) => {
    if (!session.parentID) return
    const children = byParent.get(session.parentID)
    if (children) {
      children.push(session.id)
      return
    }
    byParent.set(session.parentID, [session.id])
  })

  const stack = [sessionID]
  while (stack.length) {
    const parentID = stack.pop()
    if (!parentID) continue
    const children = byParent.get(parentID) ?? []
    children.forEach((childID) => {
      if (removed.has(childID)) return
      removed.add(childID)
      stack.push(childID)
    })
  }

  return [...removed]
}
