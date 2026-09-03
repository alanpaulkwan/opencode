import { describe, expect, test } from "bun:test"
import { lastSessionSnippet } from "./home-session-snippet"

describe("lastSessionSnippet", () => {
  test("returns the latest user or assistant text part", () => {
    expect(
      lastSessionSnippet(
        [
          { id: "m1", role: "user" },
          { id: "m2", role: "assistant" },
          { id: "m3", type: "agent-switched" },
        ],
        {
          m1: [{ type: "text", text: "first prompt" }],
          m2: [{ type: "text", text: "  Locked that in.\nNext issue.  " }],
        },
      ),
    ).toBe("Locked that in. Next issue.")
  })

  test("falls back to message.text when parts are empty", () => {
    expect(lastSessionSnippet([{ id: "m1", type: "user", text: "inspect the file" }], {})).toBe("inspect the file")
  })

  test("returns an empty string when there is no chat text", () => {
    expect(lastSessionSnippet([{ id: "m1", type: "agent-switched" }], { m1: [] })).toBe("")
    expect(lastSessionSnippet(undefined, undefined)).toBe("")
  })
})
