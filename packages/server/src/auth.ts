export * as ServerAuth from "./auth"

import { createHash, timingSafeEqual } from "node:crypto"
import { Config as EffectConfig, Context, Effect, Layer, Option, Redacted } from "effect"

export const COOKIE_NAME = "opencode-auth"
export const CLIENT_COOKIE_NAME = "opencode-auth-token"
// 400 days is the standard maximum cookie lifetime enforced by RFC 6265bis and modern browsers (Chrome/Safari)
export const COOKIE_MAX_AGE = Number(process.env.OPENCODE_COOKIE_MAX_AGE) || 60 * 60 * 24 * 400
export const COOKIE_MAX_AGE_DURATION = `${COOKIE_MAX_AGE} seconds` as const

export type Credentials = {
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export type Info = {
  readonly password: Option.Option<string>
  readonly username: string
}

export class Config extends Context.Service<Config, Info>()("@opencode/ServerAuthConfig") {
  static configLayer(input: Info) {
    return Layer.succeed(this, this.of(input))
  }

  static get layer() {
    return Layer.effect(
      this,
      Effect.gen(function* () {
        return Config.of(
          yield* EffectConfig.all({
            password: EffectConfig.string("OPENCODE_SERVER_PASSWORD").pipe(EffectConfig.option),
            username: EffectConfig.string("OPENCODE_SERVER_USERNAME").pipe(EffectConfig.withDefault("opencode")),
          }),
        )
      }),
    )
  }
}

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    credentials.username === config.username &&
    Redacted.value(credentials.password) === config.password.value
  )
}

export function rememberedToken(config: Info) {
  const password = Option.getOrUndefined(config.password)
  if (!password) return
  return createHash("sha256")
    .update(`opencode-web-auth-v1\0${config.username}\0${password}`)
    .digest("base64url")
}

export function remembered(cookie: string | undefined, config: Info) {
  const expected = rememberedToken(config)
  const token = cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1)
  if (expected && token && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return true
  }

  const clientToken = cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${CLIENT_COOKIE_NAME}=`))
    ?.slice(CLIENT_COOKIE_NAME.length + 1)
  if (clientToken && Option.isSome(config.password)) {
    try {
      const decoded = Buffer.from(clientToken, "base64").toString("utf-8")
      const sep = decoded.indexOf(":")
      if (sep !== -1) {
        const u = decoded.slice(0, sep)
        const p = decoded.slice(sep + 1)
        if (u === config.username && p === config.password.value) {
          return true
        }
      }
    } catch {}
  }

  return false
}

export function rememberCookie(config: Info, options?: { secure?: boolean }) {
  const token = rememberedToken(config)
  if (!token) return
  const secure = options?.secure !== false ? "; Secure" : ""
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly${secure}; SameSite=Lax`
}

export function rememberClientCookie(token: string, options?: { secure?: boolean }) {
  if (!token) return
  const secure = options?.secure !== false ? "; Secure" : ""
  return `${CLIENT_COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}${secure}; SameSite=Lax`
}

export function header(credentials?: Credentials) {
  const password = credentials?.password ?? process.env.OPENCODE_SERVER_PASSWORD
  if (!password) return undefined

  return `Basic ${Buffer.from(`${credentials?.username ?? process.env.OPENCODE_SERVER_USERNAME ?? "opencode"}:${password}`).toString("base64")}`
}

export function headers(credentials?: Credentials) {
  const authorization = header(credentials)
  if (!authorization) return undefined
  return { Authorization: authorization }
}
