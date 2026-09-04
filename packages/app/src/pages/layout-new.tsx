import { createEffect, Show, Suspense, type ParentProps } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createStore } from "solid-js/store"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { WebAgentSidebar } from "@/components/web-agent-sidebar"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const language = useLanguage()
  const layout = useLayout()
  const platform = usePlatform()
  const wide = createMediaQuery("(min-width: 1280px)")
  const [state, setState] = createStore({ debugTools: true })

  createEffect(() => setV2Toast(true))

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (state?.status !== "ready") return
      return state.version
    },
    installing: () => platform.updater?.state().status === "installing",
    install: () => void platform.updater?.install(),
  }

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar
        update={update}
        debugTools={
          import.meta.env.DEV
            ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
            : undefined
        }
      />
      <div class="relative flex min-h-0 min-w-0 flex-1">
        <Show when={platform.platform === "web" && wide() && layout.sidebar.opened()}>
          <WebAgentSidebar />
        </Show>
        <main class="relative flex min-h-0 min-w-0 flex-1 flex-col items-start overflow-x-hidden contain-strict">
          <Suspense>{props.children}</Suspense>
        </main>
        <Show when={platform.platform === "web" && !wide() && layout.mobileSidebar.opened()}>
          <button
            type="button"
            class="absolute inset-0 z-40 border-0 bg-black/20"
            aria-label={language.t("common.close")}
            onClick={layout.mobileSidebar.hide}
          />
          <div class="absolute inset-y-0 start-0 z-50 max-w-full shadow-xl">
            <WebAgentSidebar mobile />
          </div>
        </Show>
      </div>
      {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
    </div>
  )
}
