export type HomeSessionGroupId = string

export type HomeSessionGroup<T> = {
  id: HomeSessionGroupId
  title: string
  sessions: T[]
}

export function groupHomeSessions<T>(input: {
  records: T[]
  id: (record: T) => string
  pinnedAt: Readonly<Record<string, number>>
  attention: ReadonlySet<string>
  titles: { pinned: string; attention: string; older: string }
}): HomeSessionGroup<T>[] {
  const pinned: T[] = []
  const attention: T[] = []
  const older: T[] = []

  for (const record of input.records) {
    const id = input.id(record)
    if (input.pinnedAt[id]) {
      pinned.push(record)
      continue
    }
    if (input.attention.has(id)) {
      attention.push(record)
      continue
    }
    older.push(record)
  }

  pinned.sort((a, b) => (input.pinnedAt[input.id(b)] ?? 0) - (input.pinnedAt[input.id(a)] ?? 0))

  return [
    { id: "pinned" as const, title: input.titles.pinned, sessions: pinned },
    { id: "attention" as const, title: input.titles.attention, sessions: attention },
    { id: "older" as const, title: input.titles.older, sessions: older },
  ].filter((group) => group.sessions.length > 0)
}

export function clusterHomeSessions<T>(input: {
  records: T[]
  id: (record: T) => string
  projectKey: (record: T) => string
  projectTitle: (record: T) => string
  pinnedAt: Readonly<Record<string, number>>
  pinnedTitle: string
}): HomeSessionGroup<T>[] {
  const pinned: T[] = []
  const rest: T[] = []

  for (const record of input.records) {
    if (input.pinnedAt[input.id(record)]) pinned.push(record)
    else rest.push(record)
  }

  pinned.sort((a, b) => (input.pinnedAt[input.id(b)] ?? 0) - (input.pinnedAt[input.id(a)] ?? 0))

  const clusters = new Map<string, { title: string; sessions: T[] }>()
  for (const record of rest) {
    const key = input.projectKey(record)
    const current = clusters.get(key)
    if (current) {
      current.sessions.push(record)
      continue
    }
    clusters.set(key, { title: input.projectTitle(record), sessions: [record] })
  }

  return [
    ...(pinned.length > 0 ? [{ id: "pinned", title: input.pinnedTitle, sessions: pinned }] : []),
    ...[...clusters.entries()].map(([key, cluster]) => ({
      id: `project:${key}`,
      title: cluster.title,
      sessions: cluster.sessions,
    })),
  ]
}
