import { describe, expect, test } from "bun:test"
import { TimelineRow } from "./timeline-row"
import { parseTimelineTimestampFlag, timelineTimestampMessageID } from "./timestamp"

describe("parseTimelineTimestampFlag", () => {
  test("recognizes explicit URL flags", () => {
    expect(parseTimelineTimestampFlag("?timestamps=1")).toBe(true)
    expect(parseTimelineTimestampFlag("?timestamps=0")).toBe(false)
    expect(parseTimelineTimestampFlag("?other=1")).toBeUndefined()
  })
})

describe("timelineTimestampMessageID", () => {
  test("uses the assistant message for tool rows", () => {
    const row = new TimelineRow.AssistantPart({
      userMessageID: "user",
      group: { key: "part:assistant:tool", type: "part", ref: { messageID: "assistant", partID: "tool" } },
      previousAssistantPart: false,
    })

    expect(timelineTimestampMessageID(row)).toBe("assistant")
  })

  test("uses the first assistant message for grouped context tools", () => {
    const row = new TimelineRow.AssistantPart({
      userMessageID: "user",
      group: {
        key: "context:tool-one",
        type: "context",
        refs: [
          { messageID: "assistant-one", partID: "tool-one" },
          { messageID: "assistant-two", partID: "tool-two" },
        ],
      },
      previousAssistantPart: false,
    })

    expect(timelineTimestampMessageID(row)).toBe("assistant-one")
  })

  test("uses the request message for every framed non-assistant row", () => {
    const rows = [
      new TimelineRow.CommentStrip({ userMessageID: "user" }),
      new TimelineRow.UserMessage({ userMessageID: "user", anchor: true }),
      new TimelineRow.TurnDivider({ userMessageID: "user", label: "compaction" }),
      new TimelineRow.Thinking({ userMessageID: "user" }),
      new TimelineRow.DiffSummary({ userMessageID: "user", diffs: [] }),
      new TimelineRow.Error({ userMessageID: "user", text: "error" }),
      new TimelineRow.Retry({ userMessageID: "user" }),
    ]

    rows.forEach((row) => expect(timelineTimestampMessageID(row)).toBe("user"))
  })
})
