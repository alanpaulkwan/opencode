import { describe, expect, test } from "bun:test"
import { clusterHomeSessions, groupHomeSessions } from "./home-session-groups"

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

describe("clusterHomeSessions", () => {
  type Record = { id: string; group?: string; project?: string }
  const id = (record: Record) => record.id
  const groups = [
    { id: "research", name: "research" },
    { id: "ops", name: "active management" },
  ]
  const namedGroup = (record: Record) => groups.find((group) => group.id === record.group)

  test("puts named groups with the newest session first, not project folders", () => {
    const clustered = clusterHomeSessions({
      records: [
        { id: "research-new", group: "research", project: "residual_momentum_grok" },
        { id: "ops-old", group: "ops", project: "fintent_mna" },
        { id: "research-old", group: "research", project: "residual_momentum_grok" },
      ],
      id,
      namedGroup,
      namedGroups: groups,
      ungroupedTitle: "Ungrouped",
      pinnedAt: {},
      pinnedTitle: "Pinned",
    })
    expect(clustered.map((group) => [group.id, group.title, group.sessions.map((item) => item.id)])).toEqual([
      ["named:research", "research", ["research-new", "research-old"]],
      ["named:ops", "active management", ["ops-old"]],
    ])
  })

  test("keeps unassigned sessions in one ungrouped cluster instead of git folder names", () => {
    const clustered = clusterHomeSessions({
      records: [
        { id: "a", project: "residual_momentum_grok" },
        { id: "b", project: "fintent_mna" },
      ],
      id,
      namedGroup,
      namedGroups: groups,
      ungroupedTitle: "Ungrouped",
      pinnedAt: {},
      pinnedTitle: "Pinned",
    })
    expect(clustered.map((group) => [group.id, group.title, group.sessions.map((item) => item.id)])).toEqual([
      ["ungrouped", "Ungrouped", ["a", "b"]],
      ["named:research", "research", []],
      ["named:ops", "active management", []],
    ])
  })

  test("keeps pinned sessions in a top cluster and out of their named group", () => {
    const clustered = clusterHomeSessions({
      records: [
        { id: "ops-new", group: "ops" },
        { id: "pin", group: "research" },
        { id: "research-old", group: "research" },
      ],
      id,
      namedGroup,
      namedGroups: groups,
      ungroupedTitle: "Ungrouped",
      pinnedAt: { pin: 5 },
      pinnedTitle: "Pinned",
    })
    expect(clustered.map((group) => [group.id, group.sessions.map((item) => item.id)])).toEqual([
      ["pinned", ["pin"]],
      ["named:ops", ["ops-new"]],
      ["named:research", ["research-old"]],
    ])
  })
})
