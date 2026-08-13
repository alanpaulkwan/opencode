import type { TimelineRow } from "./timeline-row"

export function parseTimelineTimestampFlag(search: string) {
  const value = new URLSearchParams(search).get("timestamps")
  if (value === "1") return true
  if (value === "0") return false
}

export function timelineTimestampMessageID(row: TimelineRow.TimelineRow) {
  if (row._tag === "AssistantPart") {
    const ref = row.group.type === "part" ? row.group.ref : row.group.refs[0]
    if (ref) return ref.messageID
  }
  if ("userMessageID" in row) return row.userMessageID
}
