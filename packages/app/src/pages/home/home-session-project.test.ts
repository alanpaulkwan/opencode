import { describe, expect, test } from "bun:test"
import { homeSessionMatchesProject } from "./home-session-project"

describe("homeSessionMatchesProject", () => {
  test("keeps a session whose project id matches even when the working directory is elsewhere", () => {
    expect(
      homeSessionMatchesProject(
        { projectID: "global", directory: "/tmp/replication-plan-review" },
        { id: "global", worktree: "/home/alan/opencode_web_workspace" },
      ),
    ).toBe(true)
  })

  test("keeps a session in the project worktree", () => {
    expect(
      homeSessionMatchesProject(
        { projectID: "other", directory: "/repo" },
        { id: "repo", worktree: "/repo" },
      ),
    ).toBe(true)
  })

  test("rejects a session from a different project", () => {
    expect(
      homeSessionMatchesProject(
        { projectID: "a", directory: "/tmp/a" },
        { id: "b", worktree: "/repo/b" },
      ),
    ).toBe(false)
  })
})
