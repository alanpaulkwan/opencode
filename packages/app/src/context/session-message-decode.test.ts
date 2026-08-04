import { expect, test } from "bun:test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"
import { decodeLegacyMessagePage, decodeLegacySessionList } from "./session-message-decode"

test("decodes and projects a legacy message page", () => {
  const info = {
    id: "message",
    sessionID: "session",
    role: "user",
    time: { created: 1 },
    agent: "build",
    model: { providerID: "provider", modelID: "model" },
  } as Message
  const part = {
    id: "part",
    sessionID: "session",
    messageID: info.id,
    type: "text",
    text: "hello",
  } as Part
  const result = decodeLegacyMessagePage(new TextEncoder().encode(JSON.stringify([{ info, parts: [part] }])).buffer)

  expect(result.session).toEqual([info])
  expect(result.part).toEqual([{ id: info.id, part: [part] }])
  expect(result.source).toEqual([{ id: info.id, type: "user", text: "hello", time: info.time }])
})

test("decodes and projects a legacy session list", () => {
  const session = {
    id: "session",
    projectID: "project",
    directory: "/repo",
    title: "Session",
    version: "1",
    time: { created: 1, updated: 1 },
  } as Session
  const result = decodeLegacySessionList(new TextEncoder().encode(JSON.stringify([session])).buffer)

  expect(result).toEqual([
    expect.objectContaining({ id: session.id, title: session.title, location: { directory: "/repo" } }),
  ])
})
