import { useNavigate } from "@solidjs/router"
import { onCleanup } from "solid-js"
import { produce } from "solid-js/store"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { errorMessage } from "@/pages/layout/helpers"
import { useSessionKey } from "@/pages/session/session-layout"
import { legacySessionHref, requireServerKey, sessionHref } from "@/utils/session-route"
import { showToast } from "@/utils/toast"

export const TILE_MESSAGE_SOURCE = "opencode-tile"
export const TILE_ARCHIVE_REQUEST = "archive"
export const TILE_ARCHIVE_REPLY = "archived"

export function useSessionArchive() {
  const language = useLanguage()
  const navigate = useNavigate()
  const sdk = useSDK()
  const sync = useSync()
  const tabs = useTabs()
  const { params } = useSessionKey()

  const navigateAfterRemoval = (sessionID: string, parentID?: string, nextSessionID?: string) => {
    if (params.id !== sessionID) return
    const href = (id: string) =>
      params.serverKey ? sessionHref(requireServerKey(params.serverKey), id) : legacySessionHref(sdk().directory, id)
    if (parentID) {
      navigate(href(parentID))
      return
    }
    if (nextSessionID) {
      navigate(href(nextSessionID))
      return
    }
    if (params.serverKey) {
      tabs.newDraft({ server: requireServerKey(params.serverKey), directory: sdk().directory })
      return
    }
    navigate(`/${params.dir}/session`)
  }

  const archive = async (sessionID: string): Promise<boolean> => {
    const session = sync().session.get(sessionID)
    if (!session) return false
    if ((await sdk().protocol) !== "v1") return false

    const sessions = sync().data.session ?? []
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    return sdk()
      .client.session.update({ sessionID, directory: sdk().directory, time: { archived: Date.now() } })
      .then(() => {
        sync().set(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === sessionID)
            if (index !== -1) draft.session.splice(index, 1)
          }),
        )
        sync().session.evict(sessionID)
        navigateAfterRemoval(sessionID, session.parentID, nextSession?.id)
        notifySessionTabsRemoved({ directory: sdk().directory, sessionIDs: [sessionID] })
        return true
      })
      .catch((err) => {
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })
  }

  return { archive, navigateAfterRemoval }
}

// Lets a host window (for example the tile manager) ask this session view to
// archive the conversation it is showing, and reports the outcome back.
export function useSessionTileBridge(sessionID: () => string | undefined) {
  const { archive } = useSessionArchive()

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    const data = event.data as { source?: unknown; type?: unknown } | null
    if (!data || data.source !== TILE_MESSAGE_SOURCE || data.type !== TILE_ARCHIVE_REQUEST) return
    const id = sessionID()
    if (!id) return
    const source = event.source
    if (!source) return
    void archive(id).then((ok) => {
      ;(source as Window).postMessage({ source: TILE_MESSAGE_SOURCE, type: TILE_ARCHIVE_REPLY, ok }, event.origin)
    })
  }

  window.addEventListener("message", onMessage)
  onCleanup(() => window.removeEventListener("message", onMessage))
}
