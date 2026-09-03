import { pathKey } from "@/utils/path-key"

export function homeSessionMatchesProject(
  session: { projectID?: string; directory: string },
  project: { id?: string; worktree: string; sandboxes?: string[] },
) {
  if (project.id && session.projectID && project.id === session.projectID) return true
  const directory = pathKey(session.directory)
  if (pathKey(project.worktree) === directory) return true
  return !!project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory)
}
