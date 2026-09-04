import { describe, expect, test } from "bun:test"
import { fetchSessionExport, sessionExportFilename, sessionToMarkdown } from "./session-export"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"

describe("sessionExportFilename", () => {
  test("generates filename from title", () => {
    expect(sessionExportFilename({ id: "ses_123", title: "Clone PR in worktree from fork" })).toBe(
      "clone-pr-in-worktree-from-fork.json",
    )
  })

  test("generates filename from slug when title missing", () => {
    expect(sessionExportFilename({ id: "ses_123", slug: "my-session-slug" })).toBe("my-session-slug.json")
  })

  test("falls back to id when title and slug are empty", () => {
    expect(sessionExportFilename({ id: "ses_123" })).toBe("ses_123.json")
  })

  test("uses format extensions", () => {
    expect(sessionExportFilename({ id: "ses_123", title: "Demo" }, "markdown")).toBe("demo.md")
    expect(sessionExportFilename({ id: "ses_123", title: "Demo" }, "html")).toBe("demo.html")
    expect(sessionExportFilename({ id: "ses_123", title: "Demo" }, "pdf")).toBe("demo.pdf")
  })
})

describe("sessionToMarkdown", () => {
  test("renders roles and text parts", () => {
    const markdown = sessionToMarkdown({
      info: { id: "ses_1", title: "Demo" } as Session,
      messages: [
        {
          info: { id: "msg_1", role: "user" } as Message,
          parts: [{ id: "prt_1", type: "text", text: "hello" } as Part],
        },
      ],
    })
    expect(markdown).toContain("# Demo")
    expect(markdown).toContain("## user")
    expect(markdown).toContain("hello")
  })
})

describe("fetchSessionExport", () => {
  test("fetches full transcript from client", async () => {
    const session = { id: "ses_1", title: "Test Session" } as Session
    const msg = { id: "msg_1", role: "user" } as Message
    const part = { id: "prt_1", type: "text", text: "hello" } as Part
    const messages = [{ info: msg, parts: [part] }]

    const client = {
      session: {
        get: async () => ({ data: session }),
        messages: async () => ({ data: messages }),
      },
    }

    const result = await fetchSessionExport({
      sessionID: "ses_1",
      client,
    })

    expect(result).toEqual({
      info: session,
      messages,
    })
  })

  test("throws when session not found", async () => {
    const client = {
      session: {
        get: async () => ({ data: null }),
        messages: async () => ({ data: [] }),
      },
    }

    expect(
      fetchSessionExport({
        sessionID: "ses_missing",
        client,
      }),
    ).rejects.toThrow("Session not found: ses_missing")
  })
})
