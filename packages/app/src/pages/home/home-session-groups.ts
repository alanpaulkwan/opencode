export type HomeSessionGroupId = string

export type HomeSessionGroup<T> = {
  id: HomeSessionGroupId
  title: string
  sessions: T[]
}

export type HomeNamedGroupRef = {
  id: string
  name: string
}

export const HOME_SESSION_PINNED_CLUSTER = "pinned"
export const HOME_SESSION_UNGROUPED_CLUSTER = "ungrouped"
export const HOME_SESSION_NAMED_CLUSTER_PREFIX = "named:"

export function namedGroupClusterId(id: string) {
  return `${HOME_SESSION_NAMED_CLUSTER_PREFIX}${id}`
}

export function namedGroupIdFromCluster(id: string) {
  if (!id.startsWith(HOME_SESSION_NAMED_CLUSTER_PREFIX)) return
  return id.slice(HOME_SESSION_NAMED_CLUSTER_PREFIX.length)
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
  namedGroup: (record: T) => HomeNamedGroupRef | undefined
  namedGroups: ReadonlyArray<HomeNamedGroupRef>
  ungroupedTitle: string
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

  const named = new Map<string, { title: string; sessions: T[] }>()
  const namedOrder: string[] = []
  const ungrouped: T[] = []

  for (const record of rest) {
    const group = input.namedGroup(record)
    if (!group) {
      ungrouped.push(record)
      continue
    }
    const current = named.get(group.id)
    if (current) {
      current.sessions.push(record)
      continue
    }
    named.set(group.id, { title: group.name, sessions: [record] })
    namedOrder.push(group.id)
  }

  const seen = new Set(namedOrder)
  const empty = input.namedGroups.filter((group) => !seen.has(group.id))

  return [
    ...(pinned.length > 0
      ? [{ id: HOME_SESSION_PINNED_CLUSTER, title: input.pinnedTitle, sessions: pinned }]
      : []),
    ...namedOrder.map((id) => {
      const cluster = named.get(id)!
      return { id: namedGroupClusterId(id), title: cluster.title, sessions: cluster.sessions }
    }),
    ...(ungrouped.length > 0
      ? [{ id: HOME_SESSION_UNGROUPED_CLUSTER, title: input.ungroupedTitle, sessions: ungrouped }]
      : []),
    ...empty.map((group) => ({
      id: namedGroupClusterId(group.id),
      title: group.name,
      sessions: [] as T[],
    })),
  ]
}
