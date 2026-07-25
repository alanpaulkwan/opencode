import { pathKey } from "@/utils/path-key"

type WorkspaceProject = { worktree: string; sandboxes?: readonly string[] }

export function isWorkspaceDirectory(project: WorkspaceProject | undefined, directory: string) {
  if (!project || containsDirectory(project.worktree, directory)) return false
  return project.sandboxes?.some((workspace) => containsDirectory(workspace, directory)) ?? false
}

export function containsDirectory(parent: string, child: string) {
  const normalize = (value: string) => {
    const key = pathKey(value)
    return /^[a-z]:\//i.test(key) || key.startsWith("//") ? key.toLowerCase() : key
  }
  const root = normalize(parent)
  const target = normalize(child)
  return target === root || target.startsWith(root.endsWith("/") ? root : `${root}/`)
}

export function isWorkspaceSelection(project: WorkspaceProject | undefined, selection: string) {
  if (selection === "main" || selection === "create") return true
  if (!project) return false
  if (pathKey(project.worktree) === pathKey(selection)) return true
  return isWorkspaceDirectory(project, selection)
}
