import { describe, expect, test } from "bun:test"
import { groupHomeSessions } from "./home-session-groups"

const titles = { pinned: "Pinned", attention: "Needs attention", older: "Older" }
const id = (record: { id: string }) => record.id

describe("groupHomeSessions", () => {
  test("orders pinned, needs attention, then older", () => {
    const groups = groupHomeSessions({
      records: [{ id: "old" }, { id: "wait" }, { id: "pin" }],
      id,
      pinnedAt: { pin: 2 },
      attention: new Set(["wait", "pin"]),
      titles,
    })
    expect(groups.map((group) => [group.id, group.sessions.map((item) => item.id)])).toEqual([
      ["pinned", ["pin"]],
      ["attention", ["wait"]],
      ["older", ["old"]],
    ])
  })

  test("keeps a pinned session out of needs attention", () => {
    const groups = groupHomeSessions({
      records: [{ id: "a" }],
      id,
      pinnedAt: { a: 1 },
      attention: new Set(["a"]),
      titles,
    })
    expect(groups).toEqual([{ id: "pinned", title: "Pinned", sessions: [{ id: "a" }] }])
  })

  test("sorts pinned by most recently pinned first", () => {
    const groups = groupHomeSessions({
      records: [{ id: "first" }, { id: "second" }],
      id,
      pinnedAt: { first: 10, second: 20 },
      attention: new Set(),
      titles,
    })
    expect(groups[0]?.sessions.map((item) => item.id)).toEqual(["second", "first"])
  })

  test("hides empty groups", () => {
    const groups = groupHomeSessions({
      records: [{ id: "a" }, { id: "b" }],
      id,
      pinnedAt: {},
      attention: new Set(),
      titles,
    })
    expect(groups.map((group) => group.id)).toEqual(["older"])
  })
})
