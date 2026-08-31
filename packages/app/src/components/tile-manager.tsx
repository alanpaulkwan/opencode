import { For, Show, createContext, createSignal, useContext, type JSX, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { TILE_ARCHIVE_REPLY, TILE_ARCHIVE_REQUEST, TILE_MESSAGE_SOURCE } from "@/pages/session/session-archive"

type Side = "left" | "right" | "top" | "bottom"
type TileLeaf = { type: "leaf"; id: string; url: string }
type TileSplit = { type: "split"; id: string; dir: "row" | "col"; children: { flex: number; node: TileNode }[] }
type TileNode = TileLeaf | TileSplit
type DropTarget = { id: string; side: Side }
type DragState = { id: string; x: number; y: number; over: DropTarget | null }

const KEY = "opencode.tile-layout.v2"
const KEY_V1 = "opencode.tile-layout.v1"
const ACCENT = "var(--v2-accent-accent-base,#7aa2f7)"
const LINE = "var(--v2-border-border-weak-base,#25252b)"
const DEEP = "var(--v2-background-bg-deep,#131316)"
const BASE = "var(--v2-background-bg-base,#1a1a1f)"
const TEXT = "var(--v2-text-text-base,#ccc)"
const MUTED = "var(--v2-text-text-faint,#666)"

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function embedUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set("embed", "1")
  return url.toString()
}

function defaultRoot(): TileLeaf {
  return { type: "leaf", id: "main", url: "" }
}

function leafCount(node: TileNode): number {
  if (node.type === "leaf") return 1
  return node.children.reduce((sum, child) => sum + leafCount(child.node), 0)
}

function findLeaf(node: TileNode, id: string): TileLeaf | undefined {
  if (node.type === "leaf") return node.id === id ? node : undefined
  for (const child of node.children) {
    const found = findLeaf(child.node, id)
    if (found) return found
  }
}

function sideDir(side: Side): "row" | "col" {
  return side === "left" || side === "right" ? "row" : "col"
}

function insertBefore(side: Side) {
  return side === "left" || side === "top"
}

function equalize(children: TileSplit["children"]): TileSplit["children"] {
  const sum = children.reduce((total, child) => total + child.flex, 0) || children.length
  return children.map((child) => ({ ...child, flex: child.flex / sum }))
}

function makeSplit(side: Side, existing: TileLeaf, incoming: TileLeaf): TileSplit {
  const first = insertBefore(side) ? incoming : existing
  const second = insertBefore(side) ? existing : incoming
  return {
    type: "split",
    id: uid(),
    dir: sideDir(side),
    children: [
      { flex: 0.5, node: first },
      { flex: 0.5, node: second },
    ],
  }
}

function setLeafUrl(node: TileNode, id: string, url: string): TileNode {
  if (node.type === "leaf") return node.id === id ? { ...node, url } : node
  return {
    ...node,
    children: node.children.map((child) => ({ ...child, node: setLeafUrl(child.node, id, url) })),
  }
}

function insertLeaf(node: TileNode, targetId: string, side: Side, incoming: TileLeaf): TileNode {
  if (node.type === "leaf") {
    if (node.id !== targetId) return node
    return makeSplit(side, node, incoming)
  }

  const index = node.children.findIndex((child) => child.node.type === "leaf" && child.node.id === targetId)
  if (index >= 0 && node.dir === sideDir(side)) {
    const children = node.children.map((child) => ({ flex: child.flex, node: child.node }))
    children.splice(insertBefore(side) ? index : index + 1, 0, { flex: 1 / (children.length + 1), node: incoming })
    return { ...node, children: equalize(children) }
  }

  return {
    ...node,
    children: node.children.map((child) => ({
      ...child,
      node: insertLeaf(child.node, targetId, side, incoming),
    })),
  }
}

function removeLeaf(node: TileNode, id: string): TileNode | undefined {
  if (node.type === "leaf") return node.id === id ? undefined : node
  const children = node.children.flatMap((child) => {
    const next = removeLeaf(child.node, id)
    return next ? [{ flex: child.flex, node: next }] : []
  })
  if (children.length === 0) return
  if (children.length === 1) return children[0].node
  return { ...node, children: equalize(children) }
}

function mutateResize(node: TileNode, splitId: string, index: number, ratio: number): void {
  if (node.type === "leaf") return
  if (node.id === splitId) {
    const left = node.children[index]
    const right = node.children[index + 1]
    if (!left || !right) return
    const pair = left.flex + right.flex
    const clamped = Math.max(0.15, Math.min(0.85, ratio))
    left.flex = clamped * pair
    right.flex = (1 - clamped) * pair
    return
  }
  for (const child of node.children) mutateResize(child.node, splitId, index, ratio)
}

function dock(root: TileNode, sourceId: string, target: DropTarget): TileNode {
  const source = findLeaf(root, sourceId)
  if (!source) return root
  const url = source.url || embedUrl()

  if (sourceId === target.id) {
    const next = source.url ? root : setLeafUrl(root, sourceId, url)
    return insertLeaf(next, target.id, target.side, { type: "leaf", id: uid(), url })
  }

  const stripped = removeLeaf(root, sourceId)
  if (!stripped) return root
  return insertLeaf(stripped, target.id, target.side, { ...source, url })
}

function sideFromPoint(rect: DOMRect, x: number, y: number): Side {
  const relX = (x - rect.left) / Math.max(1, rect.width)
  const relY = (y - rect.top) / Math.max(1, rect.height)
  const left = relX
  const right = 1 - relX
  const top = relY
  const bottom = 1 - relY
  const nearest = Math.min(left, right, top, bottom)
  if (nearest === left) return "left"
  if (nearest === right) return "right"
  if (nearest === top) return "top"
  return "bottom"
}

function previewStyle(side: Side): JSX.CSSProperties {
  if (side === "left") return { left: "0", top: "0", width: "50%", height: "100%" }
  if (side === "right") return { right: "0", top: "0", width: "50%", height: "100%" }
  if (side === "top") return { left: "0", top: "0", width: "100%", height: "50%" }
  return { left: "0", bottom: "0", width: "100%", height: "50%" }
}

function migrateV1(raw: unknown): TileNode | undefined {
  if (!raw || typeof raw !== "object" || !("panes" in raw)) return
  const old = raw as { dir?: string; panes: { id?: string; url?: string; flex?: number }[] }
  if (!old.panes?.length) return
  if (old.panes.length === 1) return { type: "leaf", id: old.panes[0].id || "main", url: old.panes[0].url || "" }
  return {
    type: "split",
    id: uid(),
    dir: old.dir === "col" ? "col" : "row",
    children: old.panes.map((pane) => ({
      flex: pane.flex && pane.flex > 0 ? pane.flex : 1 / old.panes.length,
      node: { type: "leaf" as const, id: pane.id || uid(), url: pane.url || "" },
    })),
  }
}

function loadRoot(): TileNode {
  try {
    const v2 = JSON.parse(localStorage.getItem(KEY) || "null")
    if (v2?.root?.type) return v2.root as TileNode
    if (v2?.type) return v2 as TileNode
    const v1 = migrateV1(JSON.parse(localStorage.getItem(KEY_V1) || "null"))
    if (v1) return v1
  } catch {}
  return defaultRoot()
}

type TileContextValue = {
  host: () => JSX.Element
  tiled: () => boolean
  drag: () => DragState | null
  leafEls: Map<string, HTMLElement>
  startDrag: (event: PointerEvent, id: string) => void
  startResize: (event: PointerEvent, split: TileSplit, index: number, el: HTMLElement) => void
  close: (id: string) => void
  archive: (id: string) => void
}

const TileContext = createContext<TileContextValue>()

function useTile() {
  const value = useContext(TileContext)
  if (!value) throw new Error("TileContext missing")
  return value
}

function TreeView(props: { node: TileNode }) {
  return (
    <Show when={props.node.type === "split"} fallback={<LeafView node={props.node as TileLeaf} />}>
      <SplitView node={props.node as TileSplit} />
    </Show>
  )
}

function SplitView(props: { node: TileSplit }) {
  const tile = useTile()
  let ref: HTMLDivElement | undefined
  return (
    <div
      ref={ref}
      class="flex min-h-0 min-w-0 w-full h-full"
      classList={{ "flex-col": props.node.dir === "col" }}
    >
      <For each={props.node.children}>
        {(child, index) => (
          <>
            <Show when={index() > 0}>
              <div
                data-sash
                class="shrink-0 z-[6]"
                classList={{
                  "w-[6px] cursor-col-resize": props.node.dir === "row",
                  "h-[6px] cursor-row-resize": props.node.dir === "col",
                }}
                style={{ background: LINE }}
                onPointerDown={(event) => tile.startResize(event, props.node, index() - 1, ref!)}
                onMouseEnter={(event) => (event.currentTarget.style.background = ACCENT)}
                onMouseLeave={(event) => (event.currentTarget.style.background = LINE)}
              />
            </Show>
            <div data-tile-slot class="min-h-0 min-w-0 overflow-hidden" style={{ flex: `${child.flex} 1 0%` }}>
              <TreeView node={child.node} />
            </div>
          </>
        )}
      </For>
    </div>
  )
}

function LeafView(props: { node: TileLeaf }) {
  const tile = useTile()
  const language = useLanguage()
  const over = () => tile.drag()?.over?.id === props.node.id

  return (
    <div
      class="relative min-h-0 min-w-0 w-full h-full flex flex-col overflow-hidden"
      ref={(el) => {
        tile.leafEls.set(props.node.id, el)
        return () => tile.leafEls.delete(props.node.id)
      }}
    >
      <div
        class="shrink-0 h-[22px] flex items-center gap-1 px-1 cursor-grab active:cursor-grabbing select-none"
        style={{ background: DEEP, "border-bottom": `1px solid ${LINE}`, color: MUTED }}
        title="Drag to an edge to split or move"
        onPointerDown={(event) => tile.startDrag(event, props.node.id)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" class="opacity-70">
          <circle cx="3" cy="3" r="1.1" />
          <circle cx="9" cy="3" r="1.1" />
          <circle cx="3" cy="6" r="1.1" />
          <circle cx="9" cy="6" r="1.1" />
          <circle cx="3" cy="9" r="1.1" />
          <circle cx="9" cy="9" r="1.1" />
        </svg>
        <span class="text-[10px] tracking-wide">pane</span>
        <Show when={tile.tiled()}>
          <button
            class="ml-auto w-5 h-5 flex items-center justify-center rounded-[4px] border-0 cursor-pointer opacity-60 hover:opacity-100"
            style={{ background: "transparent", color: TEXT }}
            title={language.t("command.session.archive")}
            aria-label={language.t("command.session.archive")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              tile.archive(props.node.id)
            }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M1.5 2h13v3.5h-13z" />
              <path d="M2.5 5.5v8a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-8" />
              <path d="M6.5 8.5h3" />
            </svg>
          </button>
          <button
            class="w-5 h-5 flex items-center justify-center rounded-[4px] border-0 cursor-pointer opacity-60 hover:opacity-100"
            style={{ background: "transparent", color: TEXT }}
            title="Close pane"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              tile.close(props.node.id)
            }}
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </Show>
      </div>
      <div class="relative flex-1 min-h-0 min-w-0 overflow-hidden">
        <Show
          when={props.node.url === ""}
          fallback={
            <iframe
              src={props.node.url}
              class="absolute inset-0 w-full h-full border-0 block"
              classList={{ "pointer-events-none": !!tile.drag() }}
              title="tile"
            />
          }
        >
          <div class="absolute inset-0 min-h-0 min-w-0 overflow-hidden flex flex-col">{tile.host()}</div>
        </Show>
        <Show when={over()}>
          <div
            class="absolute z-[8] pointer-events-none"
            style={{
              ...previewStyle(tile.drag()!.over!.side),
              background: "color-mix(in srgb, var(--v2-accent-accent-base, #7aa2f7) 38%, transparent)",
              outline: `1px solid ${ACCENT}`,
            }}
          />
        </Show>
      </div>
    </div>
  )
}

export function TileManager(props: ParentProps) {
  const [state, setState] = createStore({ root: loadRoot() })
  const [drag, setDrag] = createSignal<DragState | null>(null)
  const leafEls = new Map<string, HTMLElement>()
  const tiled = () => leafCount(state.root) > 1

  const save = (root: TileNode) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ root }))
    } catch {}
  }

  const commit = (root: TileNode) => {
    setState("root", root)
    save(root)
  }

  const hitTest = (x: number, y: number): DropTarget | null => {
    let hit: DropTarget | null = null
    for (const [id, el] of leafEls) {
      const rect = el.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
      hit = { id, side: sideFromPoint(rect, x, y) }
    }
    return hit
  }

  const startResize = (event: PointerEvent, split: TileSplit, index: number, el: HTMLElement) => {
    event.preventDefault()
    event.stopPropagation()
    const sash = event.currentTarget as HTMLElement
    sash.setPointerCapture(event.pointerId)
    const vertical = split.dir === "col"
    const panes = [...el.children].filter((child) => child instanceof HTMLElement && child.dataset.tileSlot)
    const prev = panes[index]
    const next = panes[index + 1]
    if (!(prev instanceof HTMLElement) || !(next instanceof HTMLElement)) return
    const prevSize = vertical ? prev.getBoundingClientRect().height : prev.getBoundingClientRect().width
    const nextSize = vertical ? next.getBoundingClientRect().height : next.getBoundingClientRect().width
    const pair = Math.max(1, prevSize + nextSize)
    const origin = vertical ? event.clientY : event.clientX
    const splitId = split.id

    const move = (ev: PointerEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - origin
      const ratio = Math.max(0.15, Math.min(0.85, (prevSize + delta) / pair))
      setState(
        produce((draft) => {
          mutateResize(draft.root, splitId, index, ratio)
        }),
      )
    }
    const up = () => {
      sash.removeEventListener("pointermove", move)
      sash.removeEventListener("pointerup", up)
      save(state.root)
    }
    sash.addEventListener("pointermove", move)
    sash.addEventListener("pointerup", up)
  }

  const startDrag = (event: PointerEvent, id: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    const originX = event.clientX
    const originY = event.clientY
    let active = false
    const current = { over: null as DropTarget | null }

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < 5) return
        active = true
      }
      current.over = hitTest(ev.clientX, ev.clientY)
      setDrag({ id, x: ev.clientX, y: ev.clientY, over: current.over })
    }
    const up = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", up)
      if (active && current.over) commit(dock(state.root, id, current.over))
      setDrag(null)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
  }

  const close = (id: string) => {
    const next = removeLeaf(state.root, id)
    commit(next && leafCount(next) > 0 ? next : defaultRoot())
  }

  // Ask the session view inside the pane to archive its current conversation,
  // then close the pane. Panes showing something else simply close.
  const archive = (id: string) => {
    const el = leafEls.get(id)
    const frame = el?.querySelector("iframe")
    const target = frame?.contentWindow ?? window
    const reply = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== target) return
      const data = event.data as { source?: unknown; type?: unknown; ok?: unknown } | null
      if (!data || data.source !== TILE_MESSAGE_SOURCE || data.type !== TILE_ARCHIVE_REPLY) return
      window.removeEventListener("message", reply)
      window.clearTimeout(timer)
      if (data.ok === true) close(id)
    }
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", reply)
      close(id)
    }, 600)
    window.addEventListener("message", reply)
    target.postMessage({ source: TILE_MESSAGE_SOURCE, type: TILE_ARCHIVE_REQUEST }, window.location.origin)
  }

  const value: TileContextValue = {
    host: () => props.children,
    tiled,
    drag,
    leafEls,
    startDrag,
    startResize,
    close,
    archive,
  }

  return (
    <TileContext.Provider value={value}>
      <div class="relative flex-1 min-h-0 min-w-0 flex flex-col w-full h-full">
        <TreeView node={state.root} />
        <Show when={drag()}>
          {(active) => (
            <>
              <div class="fixed inset-0 z-[70] cursor-grabbing" />
              <div
                class="fixed z-[80] pointer-events-none px-2 h-6 flex items-center rounded-[4px] text-[11px]"
                style={{
                  left: `${active().x + 12}px`,
                  top: `${active().y + 12}px`,
                  background: BASE,
                  color: TEXT,
                  border: `1px solid ${ACCENT}`,
                }}
              >
                {active().over ? `Dock ${active().over!.side}` : "Drop on a pane edge"}
              </div>
            </>
          )}
        </Show>
      </div>
    </TileContext.Provider>
  )
}
