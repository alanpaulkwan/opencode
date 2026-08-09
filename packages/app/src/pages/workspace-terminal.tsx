import { TerminalProvider } from "@/context/terminal"
import { WorkspaceTerminalPanelV2 } from "@/pages/session/terminal-panel-v2"

export function WorkspaceTerminalPage() {
  return (
    <TerminalProvider>
      <div class="size-full min-h-0 min-w-0 overflow-hidden p-2">
        <WorkspaceTerminalPanelV2 />
      </div>
    </TerminalProvider>
  )
}
