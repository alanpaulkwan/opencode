import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/WorkspaceTerminalBackground"
const projectID = "proj_workspace_terminal_background"
const sessionID = "ses_workspace_terminal_background"
const sessionTitle = "Workspace terminal background"
const ptyID = "pty_workspace_terminal_background"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const PROBE = "connected"

test.use({ viewport: { width: 1440, height: 900 } })

test("keeps a background workspace terminal mounted and focused on return", async ({ page }) => {
  const connections = await setup(page)

  await page.goto(terminalHref())

  const terminal = page.locator('[data-workspace-terminal-host] [data-component="terminal"]')
  await expect(terminal).toBeVisible()
  await expect.poll(() => connections.length).toBe(1)
  await terminal.evaluate((element, probe) => {
    ;(element as HTMLElement & { __e2eProbe?: string }).__e2eProbe = probe
  }, PROBE)

  await page.locator("[data-titlebar-tab-slot]", { hasText: sessionTitle }).click()
  await expectSessionTitle(page, sessionTitle)
  await expect(terminal).toBeHidden()
  await expect(terminal).toHaveCount(1)
  await expect.poll(() => terminal.evaluate((element) => element.contains(document.activeElement))).toBe(false)
  expect(connections).toHaveLength(1)

  await page.locator("[data-titlebar-tab-slot]", { hasText: "Terminal" }).click()
  await expect(terminal).toBeVisible()
  expect(await terminal.evaluate((element) => (element as HTMLElement & { __e2eProbe?: string }).__e2eProbe)).toBe(
    PROBE,
  )
  expect(connections).toHaveLength(1)
  await expect.poll(() => terminal.evaluate((element) => element.contains(document.activeElement))).toBe(true)
})

async function setup(page: Page) {
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "workspace-terminal-background",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions: [
      {
        id: sessionID,
        slug: "workspace-terminal-background",
        projectID,
        directory,
        title: sessionTitle,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/api/pty*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: pty() }),
  )
  await page.route(`**/api/pty/${ptyID}*`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: pty() }),
  )
  const connections: string[] = []
  await page.routeWebSocket(new RegExp(`/api/pty/${ptyID}/connect`), (socket) => {
    connections.push(socket.url())
  })
  await page.addInitScript(
    ({ directory, server, sessionID }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([
          { type: "terminal", server, directory },
          { type: "session", server, sessionId },
        ]),
      )
    },
    { directory, server, sessionID },
  )
  return connections
}

function terminalHref() {
  return `/server/${base64Encode(server)}/terminal/${base64Encode(directory)}`
}

function pty() {
  return JSON.stringify({
    location: { directory, project: { id: projectID, directory } },
    data: { id: ptyID, title: "Terminal 1", command: "cmd.exe", args: [], cwd: directory, status: "running", pid: 1 },
  })
}
