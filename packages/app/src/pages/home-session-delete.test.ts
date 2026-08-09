import { expect, test } from "bun:test"
import { SESSION_TABS_REMOVED_EVENT, readSessionTabsRemovedDetail } from "@/components/titlebar-session-events"
import type { ServerConnection } from "@/context/server"
import { deleteHomeSession, removedHomeSessionIDs } from "./home-session-delete"

const remote = "remote" as ServerConnection.Key

test("deleting a Home session removes its open titlebar tabs", async () => {
  let detail: ReturnType<typeof readSessionTabsRemovedDetail>
  let removed = false
  window.addEventListener(
    SESSION_TABS_REMOVED_EVENT,
    (event) => {
      detail = readSessionTabsRemovedDetail(event)
    },
    { once: true },
  )

  await deleteHomeSession({
    server: remote,
    session: { id: "ses_1", directory: "/workspace" },
    delete: async () => undefined,
    remove: () => {
      removed = true
      return ["ses_1", "ses_2"]
    },
  })

  expect(removed).toBe(true)
  expect(detail).toEqual({ server: remote, directory: "/workspace", sessionIDs: ["ses_1", "ses_2"] })
})

test("reports delete failures without removing the session", async () => {
  const failure = new Error("offline")
  let error: unknown
  let removed = false

  const result = await deleteHomeSession({
    server: remote,
    session: { id: "ses_1", directory: "/workspace" },
    delete: async () => Promise.reject(failure),
    remove: () => {
      removed = true
      return ["ses_1"]
    },
    onError: (value) => {
      error = value
    },
  })

  expect(result).toBe(false)
  expect(error).toBe(failure)
  expect(removed).toBe(false)
})

test("includes nested child sessions when deleting a Home session", () => {
  expect(
    removedHomeSessionIDs(
      [
        { id: "ses_1" },
        { id: "ses_2", parentID: "ses_1" },
        { id: "ses_3", parentID: "ses_2" },
      ],
      "ses_1",
    ),
  ).toEqual(["ses_1", "ses_2", "ses_3"])
})
