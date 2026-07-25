import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"
import { installSseTransport } from "../utils/sse-transport"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const root = "C:/OpenCode/WorkspaceProject"
const workspace = "C:/OpenCode/worktree/project/feature"
const createdWorkspace = "C:/OpenCode/worktree/project/quick-contrast-fix"
const project = {
  id: "proj_workspaces",
  worktree: root,
  vcs: "git" as const,
  name: "workspace-project",
  time: { created: 1, updated: 1 },
  sandboxes: [workspace],
}
const provider = {
  all: [
    {
      id: "opencode",
      name: "OpenCode",
      models: { test: { id: "test", name: "Test model", limit: { context: 200_000 } } },
    },
  ],
  connected: ["opencode"],
  default: { providerID: "opencode", modelID: "test" },
}
const diff = {
  file: "src/workspace.ts",
  additions: 3,
  deletions: 1,
  patch: "@@ -1 +1 @@\n-export const workspace = false\n+export const workspace = true",
}

function userMessage(sessionID: string, id: string, text: string, withDiff = false) {
  return {
    info: {
      id,
      sessionID,
      role: "user",
      time: { created: 1 },
      agent: "build",
      model: { providerID: "opencode", modelID: "test" },
      ...(withDiff ? { summary: { diffs: [diff] } } : {}),
    },
    parts: [{ id: `prt_${id}`, sessionID, messageID: id, type: "text", text }],
  }
}

async function init(page: Page, tab: Record<string, unknown>) {
  await page.addInitScript(
    ({ root, server, tab }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({ projects: { local: [{ worktree: root, expanded: true }] }, lastProject: { local: root } }),
      )
      localStorage.setItem("opencode.window.browser.dat:tabs", JSON.stringify([{ server, ...tab }]))
    },
    { root, server, tab },
  )
}

test("selects local, new, and existing workspaces from the ready-ish start menu", async ({ page }) => {
  const draftID = "draft_workspaces"
  await mockOpenCodeServer(page, {
    directory: root,
    project,
    provider,
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await init(page, { type: "draft", draftID, directory: root })

  await page.goto(`/new-session?draftId=${draftID}`)
  await expectAppVisible(page.locator('[data-component="prompt-input"]'))

  const trigger = page.getByRole("button", { name: /^local$/i })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole("menuitem", { name: "Local repository" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "New workspace" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Workspace", exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "View all" })).toHaveCount(0)

  await page.getByRole("menuitem", { name: "New workspace" }).click()
  await expect(page.getByRole("button", { name: /New workspace/ })).toBeVisible()
  await expect(page.getByText("main", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: /New workspace/ }).click()
  await page.getByRole("menuitem", { name: "Workspace", exact: true }).hover()
  await page.getByRole("menuitem", { name: "feature" }).click()
  await expect(page.getByRole("button", { name: /feature/ })).toBeVisible()
})

test("submits the owning prompt after a new workspace becomes ready", async ({ page }) => {
  const draftID = "draft_workspace_submit"
  const sessionID = "ses_workspace_submit"
  const session = {
    id: sessionID,
    slug: "workspace-submit",
    projectID: project.id,
    directory: createdWorkspace,
    title: "New session",
    version: "dev",
    time: { created: 1, updated: 2 },
  }
  let prompt: unknown
  const transport = await installSseTransport<{ directory: string; payload: Record<string, unknown> }>(page, { server })
  await mockOpenCodeServer(page, {
    directory: root,
    project,
    provider,
    sessions: [session],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/experimental/worktree**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
      })
      return
    }
    if (route.request().method() !== "POST") return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ name: "quick-contrast-fix", directory: createdWorkspace, branch: "quick-contrast-fix" }),
    })
  })
  await page.route("**/session**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== "/session") return route.fallback()
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
      })
      return
    }
    if (route.request().method() !== "POST") return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(session),
    })
  })
  await page.route(`**/session/${sessionID}/prompt_async**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
      })
      return
    }
    prompt = route.request().postDataJSON()
    await route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  })
  await init(page, { type: "draft", draftID, directory: root })

  await page.goto(`/new-session?draftId=${draftID}`)
  await transport.waitForConnection()
  await page.getByRole("button", { name: /^local$/i }).click()
  await page.getByRole("menuitem", { name: "New workspace" }).click()
  const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  await editor.fill("Build workspace support")
  await page.locator('[data-action="prompt-submit"]').click()

  const lifecycle = page.locator('[data-timeline-row="WorkspaceLifecycle"]')
  await expect(lifecycle).toContainText("Creating workspace")
  for (const attempt of [1, 2, 3, 4, 5]) {
    await transport.send({
      directory: createdWorkspace,
      payload: {
        id: `evt_submit_ready_${attempt}`,
        type: "worktree.ready",
        properties: { name: "quick-contrast-fix" },
      },
    })
    await page.waitForTimeout(100)
    if (prompt) break
  }
  await expect.poll(() => prompt).not.toBeUndefined()
  await expect(lifecycle).toContainText("Workspace created")
})

test("shows neutral workspace identity and the ready-ish session summary panel", async ({ page }) => {
  const sessionID = "ses_workspace_summary"
  const messageID = "msg_workspace_summary"
  const session = {
    id: sessionID,
    slug: "workspace-summary",
    projectID: project.id,
    directory: workspace,
    title: "Workspace summary session",
    version: "dev",
    time: { created: 1, updated: 2 },
  }
  const vcsRequests: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/vcs/diff") vcsRequests.push(request.url())
  })
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory: workspace,
    project,
    provider,
    sessions: [session],
    pageMessages: () => ({ items: [userMessage(sessionID, messageID, "Implement workspace support", true)] }),
    vcsDiff: [diff],
  })
  await init(page, { type: "session", sessionId: sessionID })

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  const timeline = page.locator("[data-workspace-session]")
  await expect(timeline).toBeVisible()
  await expect(timeline.locator(`[aria-label="${workspace}"]`)).toHaveAttribute("tabindex", "0")
  await expect(timeline.locator('[data-slot="session-title-child"]')).toHaveClass(/text-v2-text-text-base/)
  await expect(timeline.locator('[data-slot="user-message-text"]')).not.toHaveCSS(
    "background-color",
    "rgb(59, 92, 246)",
  )

  const title = page.locator("[data-session-title]")
  await title.getByRole("button", { name: "Session details" }).click()
  const panel = page.locator('[data-component="session-summary-panel"]')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText("workspace-project")
  await expect(panel).toContainText("feature")
  await expect(panel).toContainText("1 Changed file")
  await expect.poll(() => vcsRequests.length).toBeGreaterThan(0)
  const request = new URL(vcsRequests.at(-1)!)
  expect(request.searchParams.get("mode")).toBe("working")
  expect(request.searchParams.get("location[directory]")).toBe(workspace)
})

test("moves a changed local session to an existing workspace with an end-of-turn divider", async ({ page }) => {
  const sessionID = "ses_workspace_move_existing"
  const messageID = "msg_workspace_move_existing"
  const session = {
    id: sessionID,
    slug: "workspace-move-existing",
    projectID: project.id,
    directory: root,
    title: "Move this session",
    version: "dev",
    time: { created: 1, updated: 2 },
  }
  let move: unknown
  let releaseMove = () => {}
  const moveGate = new Promise<void>((resolve) => {
    releaseMove = resolve
  })
  const transport = await installSseTransport<{ directory: string; payload: Record<string, unknown> }>(page, { server })
  await mockOpenCodeServer(page, {
    directory: root,
    project,
    provider,
    sessions: [session],
    pageMessages: () => ({ items: [userMessage(sessionID, messageID, "Move this work", true)] }),
    vcsDiff: [diff],
  })
  await page.route("**/experimental/control-plane/move-session", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
      })
      return
    }
    move = route.request().postDataJSON()
    await moveGate
    session.directory = workspace
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: "null",
    })
  })
  await init(page, { type: "session", sessionId: sessionID })

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await transport.waitForConnection()
  const inlineMove = page
    .locator('[data-component="session-turn-diffs-group"]')
    .getByRole("button", { name: "Move to workspace" })
  await expect(inlineMove).toBeVisible()
  await inlineMove.click()
  await page.getByRole("menuitem", { name: "Workspace", exact: true }).hover()
  await page.getByRole("menuitem", { name: "feature" }).click()

  await expect
    .poll(() => move)
    .toEqual({
      sessionID,
      destination: { directory: workspace },
      moveChanges: true,
    })
  await page.locator("[data-session-title]").getByRole("button", { name: "More options" }).click()
  await expect(page.getByRole("menuitem", { name: "Archive" })).toBeDisabled()
  await expect(page.getByRole("menuitem", { name: /Delete/ })).toBeDisabled()
  await page.keyboard.press("Escape")
  releaseMove()
  const lifecycle = page.locator('[data-timeline-row="WorkspaceLifecycle"]')
  await expect(lifecycle).toContainText("Workspace set")
})

test("moves a changed local session through workspace creation without changing lifecycle semantics", async ({
  page,
}) => {
  const sessionID = "ses_workspace_move_new"
  const messageID = "msg_workspace_move_new"
  const session = {
    id: sessionID,
    slug: "workspace-move-new",
    projectID: project.id,
    directory: root,
    title: "Create a workspace",
    version: "dev",
    time: { created: 1, updated: 2 },
  }
  let move: unknown
  const transport = await installSseTransport<{ directory: string; payload: Record<string, unknown> }>(page, { server })
  await mockOpenCodeServer(page, {
    directory: root,
    project,
    provider,
    sessions: [session],
    pageMessages: () => ({ items: [userMessage(sessionID, messageID, "Create isolated workspace", true)] }),
    vcsDiff: [diff],
  })
  await page.route("**/experimental/worktree**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
      })
      return
    }
    if (route.request().method() !== "POST") return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ name: "quick-contrast-fix", directory: createdWorkspace, branch: "quick-contrast-fix" }),
    })
  })
  await page.route("**/experimental/control-plane/move-session", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
      })
      return
    }
    move = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: "null",
    })
  })
  await init(page, { type: "session", sessionId: sessionID })

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await transport.waitForConnection()
  await page.locator("[data-session-title]").getByRole("button", { name: "Session details" }).click()
  await page
    .locator('[data-component="session-summary-panel"]')
    .getByRole("button", { name: "Move to workspace" })
    .click()
  await page.getByRole("menuitem", { name: "New workspace" }).click()

  const lifecycle = page.locator('[data-timeline-row="WorkspaceLifecycle"]')
  await expect(lifecycle).toContainText("Creating workspace")
  for (const attempt of [1, 2, 3, 4, 5]) {
    await transport.send({
      directory: createdWorkspace,
      payload: {
        id: `evt_worktree_ready_${attempt}`,
        type: "worktree.ready",
        properties: { name: "quick-contrast-fix" },
      },
    })
    await page.waitForTimeout(100)
    if (move) break
  }
  await expect
    .poll(() => move)
    .toEqual({
      sessionID,
      destination: { directory: createdWorkspace },
      moveChanges: true,
    })
  await transport.send({
    directory: createdWorkspace,
    payload: {
      id: "evt_workspace_created",
      type: "session.next.moved",
      properties: {
        timestamp: Date.now(),
        sessionID,
        location: { directory: createdWorkspace },
        subdirectory: "",
      },
    },
  })
  await expect(lifecycle).toContainText("Workspace created")
})
