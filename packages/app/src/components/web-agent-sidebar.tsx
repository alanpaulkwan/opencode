import { For, Show, createMemo } from "solid-js"
import { useLocation } from "@solidjs/router"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { ServerConnection } from "@/context/server"
import { tabHref, tabKey, useTabs, type DraftTab, type SessionTab } from "@/context/tabs"

type AgentTab = SessionTab | DraftTab

function WebAgentSidebarRow(props: {
  tab: AgentTab
  mobile?: boolean
}) {
  const global = useGlobal()
  const language = useLanguage()
  const layout = useLayout()
  const location = useLocation()
  const tabs = useTabs()
  const key = createMemo(() => tabKey(props.tab))
  const info = createMemo(() => tabs.info[key()])
  const title = createMemo(
    () =>
      info()?.title ??
      (props.tab.type === "draft" ? language.t("command.session.new") : props.tab.sessionId),
  )
  const directory = createMemo(() => info()?.directory ?? (props.tab.type === "draft" ? props.tab.directory : ""))
  const status = createMemo(() => {
    if (props.tab.type !== "session") return "idle"
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === props.tab.server)
    if (!conn) return "idle"
    return global.ensureServerCtx(conn).sync.session.data.session_status[props.tab.sessionId]?.type ?? "idle"
  })
  const active = createMemo(() => location.pathname === tabHref(props.tab))

  return (
    <div
      data-component="web-agent-sidebar-row"
      data-status={status()}
      classList={{
        "group flex min-w-0 items-center gap-1 rounded-lg": true,
        "bg-v2-overlay-simple-overlay-hover": active(),
      }}
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-2 py-2 text-left"
        onClick={() => {
          tabs.select(props.tab)
          if (props.mobile) layout.mobileSidebar.hide()
        }}
      >
        <span
          classList={{
            "size-2 shrink-0 rounded-full": true,
            "bg-v2-icon-icon-success": status() === "busy",
            "bg-v2-icon-icon-warning": status() === "retry",
            "bg-v2-icon-icon-muted": status() !== "busy" && status() !== "retry",
          }}
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">
          <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[14px] text-v2-text-text-base [font-weight:530]">
            {title()}
          </span>
          <Show when={directory()}>
            <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-v2-text-text-muted">
              {directory()}
            </span>
          </Show>
        </span>
      </button>
      <IconButtonV2
        type="button"
        variant="ghost-muted"
        size="small"
        class="mr-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        icon={<IconV2 name="close" />}
        aria-label={language.t("command.tab.close")}
        onClick={() => {
          const index = tabs.store.findIndex((tab) => tabKey(tab) === key())
          if (index !== -1) tabs.closeTab(index)
        }}
      />
    </div>
  )
}

export function WebAgentSidebar(props: { mobile?: boolean }) {
  const language = useLanguage()
  const layout = useLayout()
  const tabs = useTabs()
  const agents = createMemo(() => tabs.store.filter((tab): tab is AgentTab => tab.type !== "terminal"))

  return (
    <aside
      data-component="web-agent-sidebar"
      class="flex h-full w-[300px] min-w-0 shrink-0 flex-col border-r border-v2-border-border-weak bg-v2-background-bg-base"
      aria-label={language.t("settings.agents.title")}
    >
      <div class="flex h-12 shrink-0 items-center justify-between px-3">
        <h2 class="text-[14px] text-v2-text-text-base [font-weight:600]">{language.t("settings.agents.title")}</h2>
        <Show when={props.mobile}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="small"
            icon={<IconV2 name="close" />}
            aria-label={language.t("common.close")}
            onClick={layout.mobileSidebar.hide}
          />
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Show
          when={agents().length > 0}
          fallback={
            <p class="px-2 py-3 text-[13px] text-v2-text-text-muted">
              {language.t("home.sessions.empty")}
            </p>
          }
        >
          <For each={agents()}>{(tab) => <WebAgentSidebarRow tab={tab} mobile={props.mobile} />}</For>
        </Show>
      </div>
    </aside>
  )
}
