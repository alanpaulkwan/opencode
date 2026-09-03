import { describe, expect, test } from "bun:test"
import { clusterHomeSessions, groupHomeSessions, takeHomeClusterRecords } from "./home-session-groups"

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
      active: new Set(),
      namedGroup,
      namedGroups: groups,
      activeTitle: "Active",
      recentTitle: "Recent",
      pinnedAt: {},
      pinnedTitle: "Pinned",
    })
    expect(clustered.map((group) => [group.id, group.title, group.sessions.map((item) => item.id)])).toEqual([
      ["active", "Active", []],
      ["named:research", "research", ["research-new", "research-old"]],
      ["named:ops", "active management", ["ops-old"]],
      ["ungrouped", "Recent", []],
    ])
  })

  test("keeps unassigned sessions in one ungrouped cluster instead of git folder names", () => {
    const clustered = clusterHomeSessions({
      records: [
        { id: "a", project: "residual_momentum_grok" },
        { id: "b", project: "fintent_mna" },
      ],
      id,
      active: new Set(),
      namedGroup,
      namedGroups: groups,
      activeTitle: "Active",
      recentTitle: "Recent",
      pinnedAt: {},
      pinnedTitle: "Pinned",
    })
    expect(clustered.map((group) => [group.id, group.title, group.sessions.map((item) => item.id)])).toEqual([
      ["active", "Active", []],
      ["named:research", "research", []],
      ["named:ops", "active management", []],
      ["ungrouped", "Recent", ["a", "b"]],
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
      active: new Set(),
      namedGroup,
      namedGroups: groups,
      activeTitle: "Active",
      recentTitle: "Recent",
      pinnedAt: { pin: 5 },
      pinnedTitle: "Pinned",
    })
    expect(clustered.map((group) => [group.id, group.sessions.map((item) => item.id)])).toEqual([
      ["pinned", ["pin"]],
      ["active", []],
      ["named:ops", ["ops-new"]],
      ["named:research", ["research-old"]],
      ["ungrouped", []],
    ])
  })

  test("puts active sessions ahead of named groups and recent sessions", () => {
    const clustered = clusterHomeSessions({
      records: [
        { id: "running", group: "research" },
        { id: "named", group: "research" },
        { id: "recent" },
      ],
      id,
      active: new Set(["running"]),
      namedGroup,
      namedGroups: groups,
      activeTitle: "Active",
      recentTitle: "Recent",
      pinnedAt: {},
      pinnedTitle: "Pinned",
    })
    expect(clustered.map((group) => [group.id, group.sessions.map((item) => item.id)])).toEqual([
      ["active", ["running"]],
      ["named:research", ["named"]],
      ["named:ops", []],
      ["ungrouped", ["recent"]],
    ])
  })
})

describe("takeHomeClusterRecords", () => {
  const id = (record: { id: string }) => record.id
  const projectKey = (record: { project: string }) => record.project

  test("round-robins projects so one busy folder cannot fill the list", () => {
    const records = [
      { id: "hot-1", project: "pipeline" },
      { id: "hot-2", project: "pipeline" },
      { id: "hot-3", project: "pipeline" },
      { id: "hot-4", project: "pipeline" },
      { id: "other-1", project: "research" },
      { id: "other-2", project: "research" },
    ]
    expect(
      takeHomeClusterRecords({
        records,
        id,
        projectKey,
        pinnedAt: {},
        limit: 16,
        perDirectory: 3,
      }).map((item) => item.id),
    ).toEqual(["hot-1", "other-1", "hot-2", "other-2", "hot-3"])
  })

  test("keeps pinned sessions even when their project is already full", () => {
    const records = [
      { id: "hot-1", project: "pipeline" },
      { id: "pin", project: "pipeline" },
      { id: "hot-2", project: "pipeline" },
      { id: "hot-3", project: "pipeline" },
      { id: "other-1", project: "research" },
    ]
    expect(
      takeHomeClusterRecords({
        records,
        id,
        projectKey,
        pinnedAt: { pin: 9 },
        limit: 4,
        perDirectory: 1,
      }).map((item) => item.id),
    ).toEqual(["pin", "hot-1", "other-1"])
  })
})
