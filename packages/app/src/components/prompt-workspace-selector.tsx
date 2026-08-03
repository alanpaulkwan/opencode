import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { getFilename } from "@opencode-ai/core/util/path"
import { useLanguage } from "@/context/language"

export function PromptWorkspaceSelector(props: {
  value: string
  projectRoot: string
  workspaces: string[]
  branch?: string
  onChange: (value: string) => void
  onDone: () => void
  onViewAll: () => void
}) {
  const language = useLanguage()
  const [search, setSearch] = createSignal("")
  const [explanation, setExplanation] = createSignal<"local" | "new">()
  let explanationTimer: ReturnType<typeof setTimeout> | undefined
  let searchInput: HTMLInputElement | undefined
  let focusSearch = false
  let pending: { type: "select"; value: string } | { type: "viewAll" } | undefined
  const selected = () => (props.value === props.projectRoot ? "main" : props.value)
  const workspaces = createMemo(() => {
    const query = search().trim().toLowerCase()
    if (!query) return props.workspaces
    return props.workspaces.filter((workspace) => getFilename(workspace).toLowerCase().includes(query))
  })
  const icon = () => {
    if (selected() === "main") return "monitor"
    if (selected() === "create") return "workspace-new"
    return "workspace-isolated"
  }
  const select = (value: string) => {
    pending = { type: "select", value }
  }
  const hideExplanation = () => {
    if (explanationTimer) clearTimeout(explanationTimer)
    explanationTimer = undefined
    setExplanation()
  }
  const showExplanation = (value: "local" | "new") => {
    hideExplanation()
    explanationTimer = setTimeout(() => {
      explanationTimer = undefined
      setExplanation(value)
    }, 800)
  }
  onCleanup(hideExplanation)
  const onOpenChange = (open: boolean) => {
    hideExplanation()
    if (open) {
      setSearch("")
      return
    }
    const action = pending
    pending = undefined
    if (action?.type === "select") props.onChange(action.value)
    if (action?.type === "viewAll") {
      props.onViewAll()
      return
    }
    props.onDone()
  }
  const label = () => {
    if (selected() === "main") return language.t("workspace.type.local")
    if (props.value === "create") return language.t("workspace.new")
    return getFilename(props.value)
  }

  return (
    <>
      <span class="hidden select-none opacity-50 sm:inline mx-1">/</span>
      <TooltipV2
        placement="top"
        openDelay={800}
        value={language.t("session.new.workspace.trigger.tooltip")}
        class="min-w-0"
      >
        <MenuV2 placement="bottom" gutter={4} onOpenChange={onOpenChange}>
          <MenuV2.Trigger
            aria-description={language.t("session.new.workspace.trigger.tooltip")}
            class="flex h-6 min-w-0 max-w-[203px] items-center gap-1.5 rounded-sm px-1.5 hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none data-[expanded]:bg-v2-overlay-simple-overlay-pressed data-[expanded]:text-v2-text-text-muted"
          >
            <Icon name={icon()} class="shrink-0 text-v2-icon-icon-muted" />
            <span class="min-w-0 truncate">{label()}</span>
            <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          </MenuV2.Trigger>
          <MenuV2.Portal>
            <MenuV2.Content class="w-[220px]">
              <MenuV2.Group>
                <MenuV2.GroupLabel>{language.t("session.new.workspace.runIn")}</MenuV2.GroupLabel>
                <MenuV2.Item
                  class="!h-11"
                  aria-description={language.t("session.new.workspace.local.tooltip")}
                  onPointerEnter={() => showExplanation("local")}
                  onPointerLeave={hideExplanation}
                  onFocusIn={() => showExplanation("local")}
                  onFocusOut={hideExplanation}
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key === "Escape") hideExplanation()
                  }}
                  onSelect={() => select("main")}
                >
                  <Icon name="monitor" />
                  <TooltipV2
                    placement="right"
                    forceOpen={explanation() === "local"}
                    value={language.t("session.new.workspace.local.tooltip")}
                    class="min-w-0 flex-1"
                    contentClass="max-w-[min(240px,calc(100vw-16px))] whitespace-normal break-words"
                  >
                    <WorkspaceMenuCopy
                      label={language.t("session.new.workspace.local")}
                      description={language.t("session.new.workspace.local.description")}
                    />
                  </TooltipV2>
                  <Show when={selected() === "main"}>
                    <Icon name="check" size="small" class="shrink-0" />
                  </Show>
                </MenuV2.Item>
                <MenuV2.Item
                  class="!h-11"
                  aria-description={language.t("session.new.workspace.new.tooltip")}
                  onPointerEnter={() => showExplanation("new")}
                  onPointerLeave={hideExplanation}
                  onFocusIn={() => showExplanation("new")}
                  onFocusOut={hideExplanation}
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key === "Escape") hideExplanation()
                  }}
                  onSelect={() => select("create")}
                >
                  <Icon name="workspace-new" />
                  <TooltipV2
                    placement="right"
                    forceOpen={explanation() === "new"}
                    value={language.t("session.new.workspace.new.tooltip")}
                    class="min-w-0 flex-1"
                    contentClass="max-w-[min(240px,calc(100vw-16px))] whitespace-normal break-words"
                  >
                    <WorkspaceMenuCopy
                      label={language.t("workspace.new")}
                      description={language.t("session.new.workspace.new.description")}
                    />
                  </TooltipV2>
                  <Show when={selected() === "create"}>
                    <Icon name="check" size="small" class="shrink-0" />
                  </Show>
                </MenuV2.Item>
              </MenuV2.Group>
              <Show when={props.workspaces.length > 0}>
                <MenuV2.Separator class="h-[0.5px]" />
                <MenuV2.Sub
                  gutter={0}
                  overlap
                  overflowPadding={8}
                  onOpenChange={(open) => {
                    if (!open) {
                      focusSearch = false
                      return
                    }
                    if (!focusSearch || props.workspaces.length < 10) return
                    focusSearch = false
                    requestAnimationFrame(() => searchInput?.focus())
                  }}
                >
                  <MenuV2.SubTrigger
                    class="!h-11"
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowRight" ||
                        event.key === "ArrowLeft" ||
                        event.key === "Enter" ||
                        event.key === " "
                      )
                        focusSearch = true
                    }}
                  >
                    <Icon name="workspace-isolated" />
                    <WorkspaceMenuCopy
                      label={language.t("session.new.workspace.existing").replace(/…$/, "")}
                      description={language.t("session.new.workspace.existing.description")}
                    />
                  </MenuV2.SubTrigger>
                  <MenuV2.Portal>
                    <MenuV2.SubContent class="max-h-[calc(100dvh-16px)] w-[220px] overflow-y-auto">
                      <div class="flex min-h-11 items-center px-3 py-2 text-[13px] font-[440] leading-4 tracking-[-0.04px] text-v2-text-text-faint">
                        {language.t("session.new.workspace.existing.tooltip")}
                      </div>
                      <Show when={props.workspaces.length >= 10}>
                        <div class="flex h-7 items-center gap-2 rounded-sm pl-3 pr-2 text-v2-icon-icon-muted">
                          <Icon name="magnifying-glass" size="small" class="shrink-0" />
                          <input
                            ref={(element) => {
                              searchInput = element
                            }}
                            value={search()}
                            placeholder={language.t("session.new.workspace.search.placeholder")}
                            aria-label={language.t("session.new.workspace.search.placeholder")}
                            class="h-7 min-w-0 flex-1 border-0 bg-transparent text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
                            onInput={(event) => setSearch(event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Escape" ||
                                event.key === "ArrowDown" ||
                                event.key === "ArrowUp" ||
                                event.key === "Enter"
                              )
                                return
                              event.stopPropagation()
                            }}
                          />
                        </div>
                      </Show>
                      <For each={workspaces()}>
                        {(workspace) => (
                          <MenuV2.Item onSelect={() => select(workspace)}>
                            <Icon name="workspace-isolated" />
                            <span class="min-w-0 flex-1 truncate">{getFilename(workspace)}</span>
                            <Show when={selected() === workspace}>
                              <Icon name="check" size="small" class="shrink-0" />
                            </Show>
                          </MenuV2.Item>
                        )}
                      </For>
                    </MenuV2.SubContent>
                  </MenuV2.Portal>
                </MenuV2.Sub>
              </Show>
              <MenuV2.Separator class="h-[0.5px]" />
              <MenuV2.Item onSelect={() => (pending = { type: "viewAll" })}>
                <span class="min-w-0 flex-1 truncate">{language.t("common.viewAll")}</span>
              </MenuV2.Item>
            </MenuV2.Content>
          </MenuV2.Portal>
        </MenuV2>
      </TooltipV2>
      <PromptGitStatus branch={props.branch} from={selected() === "create"} connected={selected() === "create"} />
    </>
  )
}

export function PromptGitStatus(props: { branch?: string; noGit?: boolean; from?: boolean; connected?: boolean }) {
  const language = useLanguage()
  const label = () => {
    if (props.noGit) return language.t("session.new.git.none")
    if (!props.branch) return undefined
    if (props.from) return language.t("session.new.workspace.fromBranch", { branch: props.branch })
    return props.branch
  }

  return (
    <Show when={label()}>
      {(value) => (
        <>
          <Show when={!props.connected}>
            <span class="hidden select-none opacity-50 sm:inline mx-1">/</span>
          </Show>
          <TooltipV2
            placement="top"
            value={value()}
            class="min-w-0 max-w-[220px]"
            contentClass="max-w-[calc(100vw-32px)] break-all"
          >
            <div
              class="flex h-6 min-w-0 max-w-[220px] items-center gap-1.5 px-1.5 text-[13px] font-[440] leading-5 tracking-[-0.04px]"
              classList={{ "ml-0.5": props.connected }}
            >
              <Icon
                name={props.noGit ? "monitor" : "branch"}
                size="small"
                class="shrink-0 text-v2-icon-icon-muted"
              />
              <span class="min-w-0 truncate">{value()}</span>
            </div>
          </TooltipV2>
        </>
      )}
    </Show>
  )
}

function WorkspaceMenuCopy(props: { label: string; description: string }) {
  return (
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate">{props.label}</span>
      <span class="truncate text-v2-text-text-muted">{props.description}</span>
    </span>
  )
}
