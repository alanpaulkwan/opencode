import { pathKey } from "@/utils/path-key"

type HomeProjectLocation = {
  id?: string
  worktree: string
  sandboxes?: string[]
}

function contains(root: string, directory: string) {
  return directory === root || directory.startsWith(root === "/" ? root : `${root}/`)
}

export function homeProjectForSessionDirectory<T extends HomeProjectLocation>(directory: string, projects: T[]) {
  const target = pathKey(directory)
  return projects
    .flatMap((project) => [project.worktree, ...(project.sandboxes ?? [])].map((root) => ({ project, root: pathKey(root) })))
    .filter((candidate) => contains(candidate.root, target))
    .sort((a, b) => b.root.length - a.root.length)[0]?.project
}

export function homeSessionMatchesProject(
  session: { projectID?: string; directory: string },
  project: HomeProjectLocation,
  projects: HomeProjectLocation[] = [project],
) {
  return homeProjectForSessionDirectory(session.directory, projects)?.worktree === project.worktree
}
