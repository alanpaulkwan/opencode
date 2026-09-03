import type { Session } from "@opencode-ai/sdk/v2/client"
import { preloadMarkdown } from "@opencode-ai/session-ui/markdown-cache"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { useQuery } from "@tanstack/solid-query"
import { type Accessor, createEffect, createMemo, createRoot, type JSX, startTransition } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useCommand } from "@/context/command"
import {
  loadHomeSessionIndex,
  retainHomeSessions,
  type HomeSessionEvents,
} from "@/context/global-sync/home-session-index"
import type { LocalProject } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { ServerConnection } from "@/context/server"
import { sessionHasOpenTab, useTabs } from "@/context/tabs"
import { compareSessionTime, displayName, errorMessage, projectForSession } from "@/pages/layout/helpers"
import { useSessionTabAvatarState } from "@/pages/layout/project-avatar-state"
import { pathKey } from "@/utils/path-key"
import { sessionTitle } from "@/utils/session-title"
import { showToast } from "@/utils/toast"
import { Binary } from "@opencode-ai/core/util/binary"
import { archiveHomeSession } from "../home-session-archive"
import { deleteHomeSession, removedHomeSessionIDs } from "../home-session-delete"
import type { HomeController } from "./home-controller"
import { homeSessionNeedsAttention } from "./home-session-attention"
import {
  groupHomeSessions,
  clusterHomeSessions,
  takeHomeClusterRecords,
  type HomeSessionGroup as GroupedHomeSessions,
} from "./home-session-groups"
import {
  HomeNamedGroupDeleteDialog,
  HomeNamedGroupMoveDialog,
  HomeNamedGroupNameDialog,
} from "./home-session-named-group-dialogs"
import { createHomeSessionNamedGroups } from "./home-session-named-groups"
import { createHomeSessionPins } from "./home-session-pins"
import { createHomeSessionClusterCollapse } from "./home-session-cluster-collapse"
import { lastSessionSnippet } from "./home-session-snippet"

const HOME_SESSION_LIMIT = 64
const HOME_CLUSTER_LIMIT = 16
const HOME_CLUSTER_PER_DIRECTORY = 3
export type HomeSessionRecord = {
  session: Session
  project: LocalProject
  projectName: string
}

export type HomeSessionGroup = GroupedHomeSessions<HomeSessionRecord>

export type OpenSessionOptions = { background?: boolean }

export function createHomeSessionsController(home: HomeController) {
  const tabs = useTabs()
  const command = useCommand()
  const dialog = useDialog()
  const language = useLanguage()
  const notification = useNotification()
  const permission = usePermission()
  const pins = createHomeSessionPins()
  const named = createHomeSessionNamedGroups()
  const collapse = createHomeSessionClusterCollapse()
  const serverKey = () => home.selection.value().server
  const allProjectDirectories = createMemo(() => home.project.list().flatMap(directories))
  const projectDirectories = createMemo(() => {
    const project = home.project.selected()
    if (!project) return allProjectDirectories()
    return directories(project)
  })
  const projectByID = createMemo(
    () => new Map(home.project.list().flatMap((project) => (project.id ? [[project.id, project] as const] : []))),
  )
  const homeSessions = () => home.server.focusedSync().homeSessions
  const sessionEventLoad = useQuery(() => ({
    queryKey: homeSessions().eventsKey,
    queryFn: async (): Promise<HomeSessionEvents> => ({ sequence: 0, entries: [] }),
    initialData: { sequence: 0, entries: [] } satisfies HomeSessionEvents,
    enabled: false,
  }))
  const sessionLoad = useQuery(() => ({
    queryKey: homeSessions().indexKey,
    enabled: !!home.server.focusedContext(),
    queryFn: async ({ signal }) => {
      const ctx = home.server.focusedContext()
      if (!ctx) return { sessions: [], eventSequence: 0 }
      const cache = homeSessions()
      const eventSequence = cache.eventSequence()
      const index = await loadHomeSessionIndex(
        (input, options) => ctx.sdk.client.v2.session.list(input, options),
        eventSequence,
        signal,
      )
      cache.complete(eventSequence)
      return index
    },
    retry: false,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
  }))
  const indexedSessions = createMemo(() =>
    retainHomeSessions(
      homeSessions().sessions(sessionLoad.data, sessionEventLoad.data),
      HOME_SESSION_LIMIT,
      Date.now(),
    ),
  )
  const allRecords = createMemo(() =>
    buildHomeSessionRecords({
      sessions: indexedSessions,
      projectDirectories,
      projects: home.project.list,
      projectByID,
    }),
  )
  const records = createMemo(() => allRecords().slice(0, HOME_SESSION_LIMIT))
  const clusterRecords = createMemo(() =>
    takeHomeClusterRecords({
      records: buildClusterSessionRecords({
        sessions: indexedSessions,
        projects: home.project.list,
        projectByID,
      }),
      id: (record) => record.session.id,
      projectKey: (record) => record.session.projectID || pathKey(record.project.worktree),
      pinnedAt: pins.map(serverKey()),
      limit: HOME_CLUSTER_LIMIT,
      perDirectory: HOME_CLUSTER_PER_DIRECTORY,
    }),
  )
  const attentionIDs = createMemo(() => {
    const ids = new Set<string>()
    const conn = home.server.focused()
    const ctx = home.server.focusedContext()
    if (!conn || !ctx) return ids
    const server = ServerConnection.key(conn)
    const notif = notification.ensureServerState(server)
    const perm = permission.ensureServerState(server)
    for (const record of clusterRecords()) {
      const [store] = ctx.sync.child(record.session.directory, { bootstrap: false })
      if (
        homeSessionNeedsAttention({
          sessionID: record.session.id,
          sessions: store.session ?? [],
          permissions: ctx.sync.session.data.permission,
          questions: ctx.sync.session.data.question,
          autoResponds: (item) => perm.autoResponds(item, record.session.directory),
          unseenCount: notif.session.unseenCount(record.session.id),
        })
      ) {
        ids.add(record.session.id)
      }
    }
    return ids
  })
  const groups = createMemo(() =>
    groupHomeSessions({
      records: records(),
      id: (record) => record.session.id,
      pinnedAt: pins.map(home.selection.value().server),
      attention: attentionIDs(),
      titles: {
        pinned: language.t("home.sessions.group.pinned"),
        attention: language.t("home.sessions.group.attention"),
        older: language.t("home.sessions.group.older"),
      },
    }),
  )
  const clusters = createMemo(() =>
    clusterHomeSessions({
      records: clusterRecords(),
      id: (record) => record.session.id,
      namedGroup: (record) => named.groupOf(serverKey(), record.session.id),
      namedGroups: named.list(serverKey()),
      ungroupedTitle: language.t("home.sessions.namedGroup.ungrouped"),
      pinnedAt: pins.map(serverKey()),
      pinnedTitle: language.t("home.sessions.group.pinned"),
    }),
  )

  const promptNamedGroupName = (input: {
    title: string
    description: string
    initial: string
    onSave: (name: string) => void
  }) => {
    void dialog.show(() => (
      <HomeNamedGroupNameDialog
        language={language}
        title={input.title}
        description={input.description}
        initial={input.initial}
        onSave={(name) => {
          input.onSave(name)
          dialog.close()
        }}
        onClose={() => dialog.close()}
      />
    ))
  }
  const prefetched = new Set<string>()

  createEffect(() => {
    const ctx = home.server.focusedContext()
    const conn = home.server.focused()
    if (!ctx || !conn) return
    records()
      .slice(0, 2)
      .forEach((record) => {
        const key = `${ServerConnection.key(conn)}\0${record.session.id}`
        if (prefetched.has(key)) return
        prefetched.add(key)
        createRoot((dispose) => {
          try {
            void ctx.sync.session
              .sync(record.session.id)
              .then(() =>
                Promise.all(
                  (ctx.sync.session.data.message[record.session.id] ?? []).flatMap((message) =>
                    (ctx.sync.session.data.part[message.id] ?? []).flatMap((part) => {
                      if (part.type !== "text" || !part.text) return []
                      return preloadMarkdown(part.text, part.id)
                    }),
                  ),
                ),
              )
              .catch(() => {})
              .finally(dispose)
          } catch {
            dispose()
          }
        })
      })
  })

  command.register("home.palette", () => [
    {
      id: "command.palette",
      title: language.t("command.palette"),
      hidden: true,
      onSelect: async () => {
        const conn = home.server.focused()
        if (!conn) return
        const ctx = home.server.focusedContext()
        if (!ctx) return
        const { DialogHomeCommandPaletteV2 } = await import("@/components/dialog-command-palette-v2")
        void dialog.show(() => (
          <DialogHomeCommandPaletteV2
            server={conn}
            onSelectSession={(entry) => {
              if (!entry.sessionID || !entry.directory || !entry.server) return
              const sessionID = entry.sessionID
              const server = entry.server
              const directory = entry.project?.worktree ?? entry.directory
              ctx.projects.open(directory)
              ctx.projects.touch(directory)
              void startTransition(() => {
                const tab = tabs.addSessionTab({ server, sessionId: sessionID })
                tabs.select(tab)
              })
            }}
          />
        ))
      },
    },
  ])

  return {
    copy: {
      language,
    },
    data: {
      records,
      groups,
      clusters,
      loading: () => sessionLoad.isLoading,
      searchRecords: allRecords,
    },
    session: {
      showProjectName: () => !home.project.selected(),
      server: () => home.selection.value().server,
      canCreate: () => !!home.project.newSession() || clusterRecords().length > 0,
      canArchive: () => !!home.server.focusedContext(),
      isPinned: (session: Session) => pins.isPinned(serverKey(), session.id),
      pin: (session: Session) => pins.toggle(serverKey(), session.id),
      isCollapsed: collapse.isCollapsed,
      toggleCollapsed: collapse.toggle,
      sessionNamedGroup: (session: Session) => named.groupOf(serverKey(), session.id),
      nameUngroupedCluster: (group: HomeSessionGroup) => {
        const sessionIDs = group.sessions.map((record) => record.session.id)
        promptNamedGroupName({
          title: language.t("home.sessions.namedGroup.nameThis"),
          description: language.t("home.sessions.namedGroup.create.description"),
          initial: "",
          onSave: (name) => {
            const created = named.create(serverKey(), name)
            if (!created) return
            named.assignMany(serverKey(), sessionIDs, created.id)
          },
        })
      },
      renameNamedGroup: (groupID: string, currentName: string) => {
        promptNamedGroupName({
          title: language.t("home.sessions.namedGroup.rename"),
          description: language.t("home.sessions.namedGroup.rename.description"),
          initial: currentName,
          onSave: (name) => named.rename(serverKey(), groupID, name),
        })
      },
      deleteNamedGroup: (groupID: string, name: string) => {
        void dialog.show(() => (
          <HomeNamedGroupDeleteDialog
            language={language}
            name={name}
            onConfirm={() => {
              named.remove(serverKey(), groupID)
              dialog.close()
            }}
            onClose={() => dialog.close()}
          />
        ))
      },
      moveSession: (session: Session) => {
        void dialog.show(() => (
          <HomeNamedGroupMoveDialog
            language={language}
            groups={named.list(serverKey())}
            currentID={named.groupOf(serverKey(), session.id)?.id}
            onSelect={(groupID) => {
              named.assign(serverKey(), session.id, groupID)
              dialog.close()
            }}
            onCreate={() => {
              promptNamedGroupName({
                title: language.t("home.sessions.namedGroup.new"),
                description: language.t("home.sessions.namedGroup.create.description"),
                initial: "",
                onSave: (name) => {
                  const created = named.create(serverKey(), name)
                  if (created) named.assign(serverKey(), session.id, created.id)
                },
              })
            }}
            onClose={() => dialog.close()}
          />
        ))
      },
      removeSessionFromGroup: (session: Session) => named.unassign(serverKey(), session.id),
      snippet: (record: HomeSessionRecord) => {
        const ctx = home.server.focusedContext()
        if (!ctx) return ""
        const fromMessages = lastSessionSnippet(
          ctx.sync.session.data.message[record.session.id],
          ctx.sync.session.data.part,
        )
        if (fromMessages) return fromMessages
        return lastSessionSnippet(
          ctx.sync.session.data.session_message[record.session.id],
          ctx.sync.session.data.part,
        )
      },
      needsAttention: (session: Session) => attentionIDs().has(session.id),
      create: () => {
        if (home.project.newSession()) {
          home.project.openNewSession()
          return
        }
        const record = clusterRecords()[0]
        const conn = home.server.focused()
        if (!record || !conn) return
        home.project.openProjectNewSession(conn, record.project.worktree)
      },
      open: (session: Session, options?: OpenSessionOptions) => {
        const directoryKey = pathKey(session.directory)
        const project =
          home.project
            .list()
            .find(
              (item) =>
                pathKey(item.worktree) === directoryKey ||
                item.sandboxes?.some((sandbox) => pathKey(sandbox) === directoryKey),
            ) ?? projectForSession(session, home.project.list(), projectByID())
        const conn = home.server.focused()
        if (!conn) return
        const directory = project?.worktree ?? session.directory
        const ctx = home.server.focusedContext()
        if (!ctx) return
        ctx.projects.open(directory)
        if (options?.background) {
          tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
          return
        }
        ctx.projects.touch(directory)
        void startTransition(() => {
          const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
          tabs.select(tab)
        })
      },
      archive: async (session: Session) => {
        const conn = home.server.focused()
        const ctx = home.server.focusedContext()
        if (!conn || !ctx) return
        const [, setStore] = ctx.sync.child(session.directory)
        const archivedAt = Date.now()
        await archiveHomeSession({
          server: ServerConnection.key(conn),
          session,
          archive: (sessionID) =>
            ctx.sdk.client.session.update({
              sessionID,
              directory: session.directory,
              time: { archived: archivedAt },
            }),
          remove: () => {
            setStore(
              produce((draft) => {
                const match = Binary.search(draft.session, session.id, (item) => item.id)
                if (match.found) draft.session.splice(match.index, 1)
              }),
            )
            homeSessions().apply({
              type: "session.updated",
              properties: {
                sessionID: session.id,
                info: { ...session, time: { ...session.time, archived: archivedAt } },
              },
            })
          },
          onError: (cause) =>
            showToast({
              title: language.t("common.requestFailed"),
              description: errorMessage(cause, language.t("common.requestFailed")),
            }),
        })
      },
      delete: (session: Session) => {
        void dialog.show(() => {
          const [state, setState] = createStore({ deleting: false })
          const name = createMemo(() => sessionTitle(session.title) ?? language.t("command.session.new"))
          const handleDelete = async () => {
            if (state.deleting) return
            const conn = home.server.focused()
            const ctx = home.server.focusedContext()
            if (!conn || !ctx) return
            const [store, setStore] = ctx.sync.child(session.directory)
            setState("deleting", true)
            const deleted = await deleteHomeSession({
              server: ServerConnection.key(conn),
              session,
              delete: (sessionID) => ctx.sdk.api.session.remove({ sessionID }),
              remove: () => {
                const removed = removedHomeSessionIDs(store.session, session.id)
                const removedSet = new Set(removed)
                setStore(
                  produce((draft) => {
                    draft.session = draft.session.filter((item) => !removedSet.has(item.id))
                  }),
                )
                removed.forEach((sessionID) => ctx.sync.session.evict(sessionID))
                return removed
              },
              onError: (cause) =>
                showToast({
                  title: language.t("session.delete.failed.title"),
                  description: errorMessage(cause, language.t("session.delete.failed.title")),
                }),
            })
            if (deleted) {
              dialog.close()
              return
            }
            setState("deleting", false)
          }

          return (
            <DialogV2 fit>
              <DialogHeader hideClose>
                <DialogTitleGroup
                  title={language.t("session.delete.title")}
                  description={language.t("session.delete.confirm", { name: name() })}
                />
              </DialogHeader>
              <DialogFooter>
                <ButtonV2 variant="ghost" disabled={state.deleting} onClick={() => dialog.close()}>
                  {language.t("common.cancel")}
                </ButtonV2>
                <ButtonV2 variant="danger" disabled={state.deleting} onClick={handleDelete}>
                  {language.t("session.delete.button")}
                </ButtonV2>
              </DialogFooter>
            </DialogV2>
          )
        })
      },
    },
    tab: {
      isOpen: (record: HomeSessionRecord) =>
        sessionHasOpenTab(tabs.store, home.selection.value().server, record.session),
    },
  }
}

function buildClusterSessionRecords(input: {
  sessions: () => Session[]
  projects: () => LocalProject[]
  projectByID: () => Map<string, LocalProject>
}) {
  return [...new Map(input.sessions().map((session) => [session.id, session] as const)).values()]
    .sort(compareSessionTime)
    .map((session) => {
      const directory = pathKey(session.directory)
      const project =
        input
          .projects()
          .find(
            (item) =>
              pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
          ) ??
        projectForSession(session, input.projects(), input.projectByID()) ?? {
          worktree: session.directory,
          expanded: false,
        }
      return { session, project, projectName: displayName(project) }
    })
}

function directories(project: LocalProject) {
  return [project.worktree, ...(project.sandboxes ?? [])]
}

function buildHomeSessionRecords(input: {
  sessions: () => Session[]
  projectDirectories: () => string[]
  projects: () => LocalProject[]
  projectByID: () => Map<string, LocalProject>
}) {
  const directories = new Set(input.projectDirectories().map(pathKey))
  const sessions = input.sessions().filter((session) => directories.has(pathKey(session.directory)))
  return [...new Map(sessions.map((session) => [session.id, session] as const)).values()]
    .sort(compareSessionTime)
    .flatMap((session) => {
      const directory = pathKey(session.directory)
      const project =
        input
          .projects()
          .find(
            (item) =>
              pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
          ) ?? projectForSession(session, input.projects(), input.projectByID())
      if (!project) return []
      return { session, project, projectName: displayName(project) }
    })
}

export function homeSessionSearchKey(record: HomeSessionRecord) {
  return `${pathKey(record.session.directory)}:${record.session.id}`
}

export type HomeSessionsController = ReturnType<typeof createHomeSessionsController>

export function HomeSessionStatusController(props: {
  server: Accessor<ServerConnection.Key>
  record: HomeSessionRecord
  isOpenTab: (record: HomeSessionRecord) => boolean
  render: (state: { unread: Accessor<boolean>; loading: Accessor<boolean>; open: Accessor<boolean> }) => JSX.Element
}) {
  const avatar = useSessionTabAvatarState(
    props.server,
    () => props.record.session.directory,
    () => props.record.session.id,
  )
  return props.render({
    unread: avatar.unread,
    loading: avatar.loading,
    open: () => props.isOpenTab(props.record),
  })
}
