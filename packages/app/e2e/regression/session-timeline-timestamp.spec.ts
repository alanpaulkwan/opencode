import { expect, test } from "@playwright/test"
import { assistantMessage, setupTimeline, toolPart, userMessage } from "../performance/timeline-stability/fixture"

test("shows persisted timestamps in a physical-left gutter", async ({ page }) => {
  const contextIDs = ["prt_timestamp_read", "prt_timestamp_glob"]
  await setupTimeline(page, {
    messages: [
      userMessage(undefined, { created: 0 }),
      assistantMessage(
        [
          toolPart(contextIDs[0]!, "read", "completed", { filePath: "src/timestamp.ts" }),
          toolPart(contextIDs[1]!, "glob", "completed", { path: "src", pattern: "**/*.ts" }),
        ],
        { created: 1_000 },
      ),
    ],
    settings: { showTimestamps: true },
    locale: "ar",
  })

  const userRow = page.locator('[data-timeline-row="UserMessage"]')
  const contextRow = page.locator('[data-timeline-row="AssistantPart"]')
  const userTimestamp = userRow.locator('[data-slot="session-turn-timestamp"]')
  const contextTimestamp = contextRow.locator('[data-slot="session-turn-timestamp"]')

  await expect(contextRow).toHaveCount(1)
  await expect(contextRow.locator('[data-component="context-tool-group-trigger"]')).toBeVisible()
  await expect(userTimestamp).toHaveAttribute("datetime", new Date(0).toISOString())
  await expect(contextTimestamp).toHaveAttribute("datetime", new Date(1_000).toISOString())
  await expect(contextRow).toHaveAttribute("dir", "ltr")
  await expect(contextRow.locator('[data-component="session-turn"]')).toHaveCSS("direction", "rtl")

  const timestampBox = await contextTimestamp.boundingBox()
  const contentBox = await contextRow.locator('[data-component="session-turn"]').boundingBox()
  if (!timestampBox || !contentBox) throw new Error("timestamp gutter is not visible")
  expect(timestampBox.x + timestampBox.width).toBeLessThanOrEqual(contentBox.x)
})

test("URL timestamp flags override and persist the display preference", async ({ page }) => {
  await setupTimeline(page, { settings: { showTimestamps: false } })

  const timestamp = page.locator('[data-timeline-row="UserMessage"] [data-slot="session-turn-timestamp"]')
  const setFlag = (value?: "0" | "1") =>
    page.evaluate((value) => {
      const url = new URL(window.location.href)
      if (value) url.searchParams.set("timestamps", value)
      else url.searchParams.delete("timestamps")
      window.history.pushState({}, "", url)
      window.dispatchEvent(new PopStateEvent("popstate"))
    }, value)
  const preference = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("settings.v3") ?? "{}").general?.showTimestamps)

  await expect(timestamp).toHaveCount(0)
  await setFlag("1")
  await expect(timestamp).toBeVisible()
  await expect.poll(preference).toBe(true)
  await setFlag()
  await expect(timestamp).toBeVisible()

  await setFlag("0")
  await expect(timestamp).toHaveCount(0)
  await expect.poll(preference).toBe(false)
  await setFlag()
  await expect(timestamp).toHaveCount(0)
})
