import type { Accessor } from "solid-js"
import { ServerConnection } from "@/context/server"
import type { HomeProjectsController } from "./home-projects-controller"
import type { HomeScrollController } from "./home-scroll-controller"
import type { HomeSessionSearchController } from "./home-session-search-controller"
import type { HomeSessionGroup, HomeSessionsController } from "./home-sessions-controller"
import { HomeSessionsView } from "./home-sessions-view"

export function HomeSessions(props: {
  sessions: HomeSessionsController
  search: HomeSessionSearchController
  scroll: HomeScrollController
  groups: Accessor<HomeSessionGroup[]>
  compact: Accessor<boolean>
  projects: HomeProjectsController
}) {
  const focusedServer = () =>
    props.projects.server.list().find((conn) => ServerConnection.key(conn) === props.sessions.session.server())

  return (
    <HomeSessionsView
      language={props.sessions.copy.language}
      groups={props.groups}
      showProjectName={props.sessions.session.showProjectName}
      server={props.sessions.session.server}
      canCreateSession={props.sessions.session.canCreate}
      canArchiveSession={props.sessions.session.canArchive}
      searchValue={props.search.query.value}
      searchPlaceholder={props.search.query.placeholder}
      searchOpen={props.search.query.open}
      searchFocused={props.search.query.focused}
      searchLoading={props.search.result.loading}
      searchResults={props.search.result.list}
      searchActive={props.search.result.active}
      searchNoResultsLabel={props.search.result.noResultsLabel}
      titleOpacity={props.scroll.header.titleOpacity}
      isOpenTab={props.sessions.tab.isOpen}
      onCreateSession={() => {
        if (props.sessions.session.canCreate() && props.projects.project.list().length > 0) {
          props.sessions.session.create()
          return
        }
        const conn = focusedServer()
        if (conn) props.projects.project.choose(conn)
      }}
      onOpenSession={props.sessions.session.open}
      isPinned={props.sessions.session.isPinned}
      onPinSession={props.sessions.session.pin}
      onArchiveSession={props.sessions.session.archive}
      onDeleteSession={props.sessions.session.delete}
      onSetHoverTarget={props.scroll.viewport.setHoverTarget}
      onSetThumbTrack={props.scroll.viewport.setThumbTrack}
      onSetContent={props.scroll.header.setContent}
      onSetHeader={props.scroll.header.setHeader}
      onWheel={props.scroll.viewport.containWheel}
      onSetSearchRoot={props.search.element.setRoot}
      onSetSearchInput={props.search.element.setInput}
      onSetSearchList={props.search.element.setList}
      onSearchFocus={props.search.query.focus}
      onSearchInput={props.search.query.input}
      onSearchClose={props.search.query.close}
      onSearchMove={props.search.result.move}
      onSearchSelectActive={props.search.result.selectActive}
      onSearchHighlight={props.search.result.highlight}
      onSearchSelect={props.search.result.select}
      compact={props.compact}
      snippet={props.sessions.session.snippet}
      needsAttention={(record) => props.sessions.session.needsAttention(record.session)}
      isCollapsed={props.sessions.session.isCollapsed}
      onToggleCollapsed={props.sessions.session.toggleCollapsed}
      sessionNamedGroup={props.sessions.session.sessionNamedGroup}
      onNameUngroupedCluster={props.sessions.session.nameUngroupedCluster}
      onRenameNamedGroup={props.sessions.session.renameNamedGroup}
      onDeleteNamedGroup={props.sessions.session.deleteNamedGroup}
      onMoveSession={props.sessions.session.moveSession}
      onRemoveSessionFromGroup={props.sessions.session.removeSessionFromGroup}
      project={() => {
        const directory = props.projects.selection.value().directory
        if (!directory) return
        return props.projects.project.catalog().find((item) => item.worktree === directory)
      }}
      projects={props.projects.project.catalog}
      onPickProject={(directory) => {
        const conn = focusedServer()
        if (conn) props.projects.project.pick(conn, directory)
      }}
      onAddProject={() => {
        const conn = focusedServer()
        if (conn) props.projects.project.choose(conn)
      }}
      onCreateNamedGroup={props.sessions.session.createNamedGroup}
      isWorking={props.sessions.session.isWorking}
      onAbortSession={props.sessions.session.abort}
    />
  )
}
