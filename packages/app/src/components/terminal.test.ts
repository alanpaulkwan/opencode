import { describe, expect, test } from "bun:test"
import { isTerminalCopyShortcut } from "./terminal"

const event = (input: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "key">>) =>
  ({ ctrlKey: false, metaKey: false, shiftKey: false, key: "", ...input })

describe("isTerminalCopyShortcut", () => {
  test("copies selected Ctrl+C", () => {
    expect(isTerminalCopyShortcut(event({ ctrlKey: true, key: "c" }), true)).toBe(true)
  })

  test("keeps unselected Ctrl+C available as terminal input", () => {
    expect(isTerminalCopyShortcut(event({ ctrlKey: true, key: "c" }), false)).toBe(false)
  })

  test("keeps Ctrl+Shift+C as an explicit copy shortcut", () => {
    expect(isTerminalCopyShortcut(event({ ctrlKey: true, shiftKey: true, key: "c" }), false)).toBe(true)
  })

  test("does not intercept Meta+C", () => {
    expect(isTerminalCopyShortcut(event({ metaKey: true, key: "c" }), true)).toBe(false)
  })
})
