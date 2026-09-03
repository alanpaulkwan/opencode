import { describe, expect, test } from "bun:test"
import { trimNamedGroupName } from "./home-session-named-groups"

describe("trimNamedGroupName", () => {
  test("keeps a typed name", () => {
    expect(trimNamedGroupName("  research  ")).toBe("research")
  })

  test("rejects a blank name", () => {
    expect(trimNamedGroupName("   ")).toBeUndefined()
  })
})
