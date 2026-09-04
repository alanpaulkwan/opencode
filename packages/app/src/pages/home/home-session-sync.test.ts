import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { fetchSessionMeta, saveSessionMeta, createHomeSessionSync } from "./home-session-sync"
import type { ServerConnection } from "@/context/server"
import type { HomeNamedGroupsBucket } from "./home-session-named-groups"
import type { HomeSessionPinMap } from "./home-session-pins"

describe("home-session-sync", () => {
  const serverHttp = {
    url: "http://localhost:4010",
    username: "alan",
    password: "secretpassword",
  }

  test("fetchSessionMeta constructs basic auth headers and parses response", async () => {
    const mockData = {
      namedGroups: {
        groups: [{ id: "g-1", name: "Paper Replications", created: 1000 }],
        members: { "sess-1": "g-1" },
      },
      pins: { "sess-1": 1000 },
    }

    let requestedUrl = ""
    let authHeader = ""

    const mockFetch = (async (url: any, init: any) => {
      requestedUrl = String(url)
      authHeader = init?.headers?.Authorization ?? ""
      return {
        ok: true,
        json: async () => mockData,
      } as Response
    }) as unknown as typeof fetch

    const result = await fetchSessionMeta(serverHttp, mockFetch)
    expect(requestedUrl).toBe("http://localhost:4010/api/session-meta")
    expect(authHeader).toContain("Basic ")
    expect(result?.namedGroups?.groups).toHaveLength(1)
    expect(result?.namedGroups?.groups[0]!.name).toBe("Paper Replications")
    expect(result?.pins?.["sess-1"]).toBe(1000)
  })

  test("saveSessionMeta sends PUT with json payload", async () => {
    let method = ""
    let body = ""

    const mockFetch = (async (url: any, init: any) => {
      method = init?.method
      body = init?.body
      return { ok: true } as Response
    }) as unknown as typeof fetch

    const payload = {
      namedGroups: {
        groups: [{ id: "g-2", name: "Alpha Research", created: 2000 }],
        members: {},
      },
      pins: { "sess-2": 2000 },
    }

    const success = await saveSessionMeta(serverHttp, payload, mockFetch)
    expect(success).toBe(true)
    expect(method).toBe("PUT")
    expect(body).toContain("Alpha Research")
    expect(body).toContain("sess-2")
  })

  test("createHomeSessionSync pulls and hydrates groups and pins", async () => {
    createRoot((dispose) => {
      let hydratedBucket: HomeNamedGroupsBucket | undefined
      let hydratedPins: HomeSessionPinMap | undefined

      const mockData = {
        namedGroups: {
          groups: [{ id: "g-sync", name: "Synced Group", created: 3000 }],
          members: { "sess-sync": "g-sync" },
        },
        pins: { "sess-sync": 3000 },
      }

      const mockFetch = (async () => {
        return {
          ok: true,
          json: async () => mockData,
        } as Response
      }) as unknown as typeof fetch

      const mockConn: ServerConnection.Any = {
        type: "http",
        http: serverHttp,
      }

      const sync = createHomeSessionSync({
        server: () => mockConn,
        named: {
          bucket: () => ({ groups: [], members: {} }),
          hydrate: (_server, bucket) => {
            hydratedBucket = bucket
            return true
          },
        },
        pins: {
          map: () => ({}),
          hydrate: (_server, map) => {
            hydratedPins = map
            return true
          },
        },
        fetchFn: mockFetch,
      })

      // Trigger pull manually
      sync.pull().then(() => {
        expect(hydratedBucket?.groups[0]?.name).toBe("Synced Group")
        expect(hydratedPins?.["sess-sync"]).toBe(3000)
        dispose()
      })
    })
  })
})
