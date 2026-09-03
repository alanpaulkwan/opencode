import { describe, expect, test } from "bun:test"
import { formatHomeSessionTime } from "./home-session-time"

describe("formatHomeSessionTime", () => {
  test("uses a clock time on the same calendar day", () => {
    const now = new Date(2026, 8, 3, 23, 0).getTime()
    const updated = new Date(2026, 8, 3, 19, 44).getTime()
    expect(formatHomeSessionTime(updated, now, "en-US")).toMatch(/7:44|19:44/)
  })

  test("uses month and day later in the same year", () => {
    const now = new Date(2026, 8, 3, 12, 0).getTime()
    const updated = new Date(2026, 7, 24, 12, 0).getTime()
    expect(formatHomeSessionTime(updated, now, "en-US")).toBe("Aug 24")
  })

  test("includes the year for older timestamps", () => {
    const now = new Date(2026, 8, 3, 12, 0).getTime()
    const updated = new Date(2025, 7, 24, 12, 0).getTime()
    expect(formatHomeSessionTime(updated, now, "en-US")).toBe("Aug 24, 2025")
  })
})
