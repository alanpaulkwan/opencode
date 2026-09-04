import { afterEach, describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ServerAuth } from "../../src/server/auth"

const original = {
  OPENCODE_SERVER_PASSWORD: Flag.OPENCODE_SERVER_PASSWORD,
  OPENCODE_SERVER_USERNAME: Flag.OPENCODE_SERVER_USERNAME,
}

afterEach(() => {
  Flag.OPENCODE_SERVER_PASSWORD = original.OPENCODE_SERVER_PASSWORD
  Flag.OPENCODE_SERVER_USERNAME = original.OPENCODE_SERVER_USERNAME
})

describe("ServerAuth", () => {
  test("does not emit auth headers without a password", () => {
    Flag.OPENCODE_SERVER_PASSWORD = undefined
    Flag.OPENCODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.header()).toBeUndefined()
    expect(ServerAuth.headers()).toBeUndefined()
  })

  test("defaults to the opencode username", () => {
    Flag.OPENCODE_SERVER_PASSWORD = "secret"
    Flag.OPENCODE_SERVER_USERNAME = undefined

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("opencode:secret").toString("base64")}`,
    })
  })

  test("uses the configured username", () => {
    Flag.OPENCODE_SERVER_PASSWORD = "secret"
    Flag.OPENCODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    })
  })

  test("prefers explicit credentials", () => {
    Flag.OPENCODE_SERVER_PASSWORD = "secret"
    Flag.OPENCODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers({ password: "cli-secret", username: "bob" })).toEqual({
      Authorization: `Basic ${Buffer.from("bob:cli-secret").toString("base64")}`,
    })
  })

  test("validates decoded credentials against effect config", () => {
    const config = { password: Option.some("secret"), username: "alice" }

    expect(ServerAuth.required(config)).toBe(true)
    expect(ServerAuth.authorized({ username: "alice", password: Redacted.make("secret") }, config)).toBe(true)
    expect(ServerAuth.authorized({ username: "opencode", password: Redacted.make("secret") }, config)).toBe(false)
  })

  test("recognizes its secure remembered-login cookie", () => {
    const config = { password: Option.some("secret"), username: "alice" }
    const cookie = ServerAuth.rememberCookie(config)

    expect(cookie).toContain(`${ServerAuth.COOKIE_NAME}=`)
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("SameSite=Lax")
    expect(ServerAuth.remembered(cookie?.split(";")[0], config)).toBe(true)
    expect(ServerAuth.remembered(cookie?.split(";")[0], { ...config, password: Option.some("changed") })).toBe(false)
  })

  test("recognizes client token cookie", () => {
    const config = { password: Option.some("secret"), username: "alice" }
    const token = Buffer.from("alice:secret").toString("base64")
    const cookie = ServerAuth.rememberClientCookie(token)

    expect(cookie).toContain(`${ServerAuth.CLIENT_COOKIE_NAME}=`)
    expect(cookie).not.toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(ServerAuth.remembered(cookie?.split(";")[0], config)).toBe(true)
    expect(ServerAuth.remembered(cookie?.split(";")[0], { ...config, password: Option.some("changed") })).toBe(false)
  })

  test("allows insecure cookies when requested", () => {
    const config = { password: Option.some("secret"), username: "alice" }
    const cookie = ServerAuth.rememberCookie(config, { secure: false })
    expect(cookie).not.toContain("Secure")
    expect(cookie).toContain("SameSite=Lax")

    const clientCookie = ServerAuth.rememberClientCookie("token", { secure: false })
    expect(clientCookie).not.toContain("Secure")
    expect(clientCookie).toContain("SameSite=Lax")
  })
})
