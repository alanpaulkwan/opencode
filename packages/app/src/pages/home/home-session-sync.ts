import { createEffect, onCleanup, type Accessor } from "solid-js"
import { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { HomeNamedGroupsBucket } from "./home-session-named-groups"
import type { HomeSessionPinMap } from "./home-session-pins"

export type SessionMetaResponse = {
  namedGroups?: HomeNamedGroupsBucket
  pins?: HomeSessionPinMap
}

function authHeaders(server: ServerConnection.HttpBase): Record<string, string> {
  if (!server.password) return {}
  return {
    Authorization: `Basic ${authTokenFromCredentials({
      username: server.username,
      password: server.password,
    })}`,
  }
}

export async function fetchSessionMeta(
  server: ServerConnection.HttpBase,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<SessionMetaResponse | undefined> {
  try {
    const url = new URL("/api/session-meta", server.url)
    const response = await fetchFn(url, {
      method: "GET",
      headers: authHeaders(server),
      credentials: "include",
    })
    if (!response.ok) return
    return (await response.json()) as SessionMetaResponse
  } catch {
    return
  }
}

export async function saveSessionMeta(
  server: ServerConnection.HttpBase,
  data: SessionMetaResponse,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const url = new URL("/api/session-meta", server.url)
    const response = await fetchFn(url, {
      method: "PUT",
      headers: {
        ...authHeaders(server),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    })
    return response.ok
  } catch {
    return false
  }
}

export function createHomeSessionSync(input: {
  server: Accessor<ServerConnection.Any | undefined>
  named: {
    bucket: (server: string) => HomeNamedGroupsBucket
    hydrate: (server: string, bucket: HomeNamedGroupsBucket) => boolean
  }
  pins: {
    map: (server: string) => HomeSessionPinMap
    hydrate: (server: string, map: HomeSessionPinMap) => boolean
  }
  fetchFn?: typeof globalThis.fetch
}) {
  const fetchFn = input.fetchFn ?? globalThis.fetch
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let isHydrating = false

  const serverKey = () => {
    const conn = input.server()
    return conn ? ServerConnection.key(conn) : undefined
  }

  const pull = async () => {
    const conn = input.server()
    const key = serverKey()
    if (!conn || !key) return

    const data = await fetchSessionMeta(conn.http, fetchFn)
    if (!data) return

    isHydrating = true
    try {
      const localBucket = input.named.bucket(key)
      const localPins = input.pins.map(key)

      const serverGroups = data.namedGroups?.groups ?? []
      const serverMembers = data.namedGroups?.members ?? {}
      const serverPins = data.pins ?? {}

      const localHasGroups = localBucket.groups.length > 0
      const serverHasGroups = serverGroups.length > 0
      const localHasPins = Object.keys(localPins).length > 0
      const serverHasPins = Object.keys(serverPins).length > 0

      // Initial migration: If server is completely empty but local has existing data,
      // seed the server with the local data
      if ((!serverHasGroups && localHasGroups) || (!serverHasPins && localHasPins)) {
        void saveSessionMeta(
          conn.http,
          {
            namedGroups: localBucket,
            pins: localPins,
          },
          fetchFn,
        )
        return
      }

      // Normal case: hydrate from server
      if (data.namedGroups) {
        input.named.hydrate(key, {
          groups: serverGroups,
          members: serverMembers,
        })
      }
      if (data.pins) {
        input.pins.hydrate(key, serverPins)
      }
    } finally {
      isHydrating = false
    }
  }

  const push = () => {
    if (isHydrating) return
    const conn = input.server()
    const key = serverKey()
    if (!conn || !key) return

    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      const currentConn = input.server()
      const currentKey = serverKey()
      if (!currentConn || !currentKey) return
      void saveSessionMeta(
        currentConn.http,
        {
          namedGroups: input.named.bucket(currentKey),
          pins: input.pins.map(currentKey),
        },
        fetchFn,
      )
    }, 150)
  }

  // Pull on mount and whenever server changes
  createEffect(() => {
    const conn = input.server()
    if (conn) {
      void pull()
    }
  })

  // Pull on window focus or visibility change
  if (typeof window !== "undefined") {
    const onFocus = () => void pull()
    const onVisibility = () => {
      if (document.visibilityState === "visible") void pull()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    // Gentle periodic poll (every 15s) while page is open
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") void pull()
    }, 15_000)

    onCleanup(() => {
      if (pushTimer) clearTimeout(pushTimer)
      clearInterval(pollInterval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    })
  }

  return {
    pull,
    push,
  }
}
