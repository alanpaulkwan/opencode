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
  const id = (record: { id: string }) => record.id
  const projectKey = (record: { project: string }) => record.project
  const projectTitle = (record: { project: string }) => record.project

  test("moves the newest session's project cluster to the top", () => {
    const groups = clusterHomeSessions({
      records: [
        { id: "research-new", project: "research" },
        { id: "ops-old", project: "ops" },
        { id: "research-old", project: "research" },
      ],
      id,
      projectKey,
      projectTitle,
      pinnedAt: {},
      pinnedTitle: "Pinned",
    })
    expect(groups.map((group) => [group.id, group.sessions.map((item) => item.id)])).toEqual([
      ["project:research", ["research-new", "research-old"]],
      ["project:ops", ["ops-old"]],
    ])
  })

  test("keeps pinned sessions in a top cluster and out of their project", () => {
    const groups = clusterHomeSessions({
      records: [
        { id: "ops-new", project: "ops" },
        { id: "pin", project: "research" },
        { id: "research-old", project: "research" },
      ],
      id,
      projectKey,
      projectTitle,
      pinnedAt: { pin: 5 },
      pinnedTitle: "Pinned",
    })
    expect(groups.map((group) => [group.id, group.sessions.map((item) => item.id)])).toEqual([
      ["pinned", ["pin"]],
      ["project:ops", ["ops-new"]],
      ["project:research", ["research-old"]],
    ])
  })
})
