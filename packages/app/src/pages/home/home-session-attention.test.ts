import { describe, expect, test } from "bun:test"
import type { PermissionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { homeSessionNeedsAttention } from "./home-session-attention"

const session = (id: string, parentID?: string): Session =>
  ({
    id,
    parentID,
    projectID: "p",
    directory: "/p",
    title: id,
    version: "1",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }) as Session

describe("homeSessionNeedsAttention", () => {
  test("treats an unseen reply as needing attention", () => {
    expect(
      homeSessionNeedsAttention({
        sessionID: "ses",
        sessions: [session("ses")],
        permissions: {},
        questions: {},
        autoResponds: () => false,
        unseenCount: 1,
      }),
    ).toBe(true)
  })

  test("treats a pending permission as needing attention", () => {
    expect(
      homeSessionNeedsAttention({
        sessionID: "ses",
        sessions: [session("ses")],
        permissions: { ses: [{ id: "perm" } as PermissionRequest] },
        questions: {},
        autoResponds: () => false,
        unseenCount: 0,
      }),
    ).toBe(true)
  })

  test("ignores auto-accepted permissions", () => {
    expect(
      homeSessionNeedsAttention({
        sessionID: "ses",
        sessions: [session("ses")],
        permissions: { ses: [{ id: "perm" } as PermissionRequest] },
        questions: {},
        autoResponds: () => true,
        unseenCount: 0,
      }),
    ).toBe(false)
  })

  test("treats a child-session question as needing attention on the root", () => {
    expect(
      homeSessionNeedsAttention({
        sessionID: "root",
        sessions: [session("root"), session("child", "root")],
        permissions: {},
        questions: { child: [{ id: "q" } as never] },
        autoResponds: () => false,
        unseenCount: 0,
      }),
    ).toBe(true)
  })
})
