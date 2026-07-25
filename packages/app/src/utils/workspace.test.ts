import { describe, expect, test } from "bun:test"
import { isWorkspaceDirectory, isWorkspaceSelection } from "./workspace"

describe("isWorkspaceDirectory", () => {
  const project = {
    worktree: "C:\\repo\\",
    sandboxes: ["C:\\repo-workspaces\\feature\\", "C:\\repo-workspaces\\other"],
  }

  test("distinguishes managed workspaces from the local repository", () => {
    expect(isWorkspaceDirectory(project, "C:\\repo")).toBe(false)
    expect(isWorkspaceDirectory(project, "C:\\repo-workspaces\\feature")).toBe(true)
    expect(isWorkspaceDirectory(project, "c:\\repo-workspaces\\feature\\packages\\app")).toBe(true)
  })

  test("does not classify unknown directories", () => {
    expect(isWorkspaceDirectory(project, "C:\\other")).toBe(false)
    expect(isWorkspaceDirectory(undefined, "C:\\repo-workspaces\\feature")).toBe(false)
  })
})

describe("isWorkspaceSelection", () => {
  const project = { worktree: "/repo", sandboxes: ["/workspaces/feature"] }

  test("accepts local, new, and managed workspace selections", () => {
    expect(isWorkspaceSelection(project, "main")).toBe(true)
    expect(isWorkspaceSelection(project, "create")).toBe(true)
    expect(isWorkspaceSelection(project, "/repo/")).toBe(true)
    expect(isWorkspaceSelection(project, "/workspaces/feature/")).toBe(true)
  })

  test("rejects selections from a different project", () => {
    expect(isWorkspaceSelection(project, "/other/workspace")).toBe(false)
  })
})
