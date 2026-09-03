import { createEffect, createMemo } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { createHomeController } from "./home/home-controller"
import { createHomeProjectsController } from "./home/home-projects-controller"
import { HomeUtilityNav } from "./home/home-projects-view"
import { HomeProjects } from "./home/home-projects"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"
import { HomeSessions } from "./home/home-sessions"

export function NewHome() {
  const home = createHomeController()
  const projects = createHomeProjectsController(home)
  const sessions = createHomeSessionsController(home)
  const search = createHomeSessionSearchController(home, sessions)
  const compact = createMediaQuery("(max-width: 1023px)")
  const groups = createMemo(() => (compact() ? sessions.data.clusters() : sessions.data.groups()))
  const scroll = createHomeScrollController(groups)

  createEffect(() => {
    if (!compact()) return
    if (home.selection.value().directory) return
    const project = home.project.newSession()
    const conn = home.server.focused()
    if (!project || !conn) return
    home.project.pick(conn, project.worktree)
  })
  return (
    <div
      class={`
        min-h-0 flex-1 self-stretch overflow-hidden bg-v2-background-bg-base
        max-lg:m-0 max-lg:rounded-none
        lg:m-2 lg:rounded-[10px] lg:shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ScrollView
        class="h-full [container-type:size]"
        thumbContainer={scroll.viewport.thumbTrack}
        thumbHoverTarget={scroll.viewport.hoverTarget}
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
        onWheel={scroll.viewport.containOuterWheel}
      >
        <div
          class={`
            mx-auto grid min-h-full w-full max-w-[1080px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-3
            lg:grid-cols-[280px_minmax(0,720px)] lg:grid-rows-1 lg:gap-8 lg:px-6
          `}
          classList={{ "max-lg:grid-rows-[minmax(0,1fr)_auto]": compact() }}
        >
          <div class="hidden lg:contents">
            <HomeProjects projects={projects} scroll={scroll} />
          </div>
          <HomeSessions
            sessions={sessions}
            search={search}
            scroll={scroll}
            groups={groups}
            compact={compact}
            projects={projects}
          />
          <HomeUtilityNav
            class="flex lg:hidden"
            onOpenSettings={projects.utility.settings}
            onOpenHelp={projects.utility.help}
            language={projects.copy.language}
          />
        </div>
      </ScrollView>
    </div>
  )
}
