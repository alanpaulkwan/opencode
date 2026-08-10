import { TerminalProvider } from "@/context/terminal"
import { WorkspaceTerminalPanelV2 } from "@/pages/session/terminal-panel-v2"
import type { Accessor } from "solid-js"

export function WorkspaceTerminalPage(props: { active?: Accessor<boolean> } = {}) {
  let root: HTMLDivElement | undefined

  return (
    <TerminalProvider legacySessionID={() => undefined} focusRoot={() => root}>
      <div ref={root} class="size-full min-h-0 min-w-0 overflow-hidden p-2">
        <WorkspaceTerminalPanelV2 active={props.active} />
      </div>
    </TerminalProvider>
  )
}
