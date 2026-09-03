import { describe, expect, test } from "bun:test"
import { homeProjectForSessionDirectory, homeSessionMatchesProject } from "./home-session-project"

describe("homeSessionMatchesProject", () => {
  test("does not treat the shared global project id as directory membership", () => {
    expect(
      homeSessionMatchesProject(
        { projectID: "global", directory: "/tmp/replication-plan-review" },
        { id: "global", worktree: "/home/alan/opencode_web_workspace" },
      ),
    ).toBe(false)
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

  test("keeps a session in a descendant of the project worktree", () => {
    expect(
      homeSessionMatchesProject(
        { directory: "/repo/packages/app" },
        { worktree: "/repo" },
      ),
    ).toBe(true)
  })

  test("assigns overlapping paths to the most specific project", () => {
    const projects = [{ worktree: "/repo" }, { worktree: "/repo/packages/app" }]

    expect(homeProjectForSessionDirectory("/repo/packages/app/src", projects)).toBe(projects[1])
    expect(homeSessionMatchesProject({ directory: "/repo/packages/app/src" }, projects[0], projects)).toBe(false)
    expect(homeSessionMatchesProject({ directory: "/repo/packages/app/src" }, projects[1], projects)).toBe(true)
  })
})
