import { ServerAuth } from "../auth"
import { UnauthorizedError } from "@opencode-ai/protocol/errors"
import { Authorization } from "@opencode-ai/protocol/middleware/authorization"
export { Authorization } from "@opencode-ai/protocol/middleware/authorization"
import { hasPtyConnectTicketURL } from "@opencode-ai/protocol/groups/pty"
import { Effect, Encoding, Layer, Redacted } from "effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

const AUTH_TOKEN_QUERY = "auth_token"
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'

function isRequestSecure(request: HttpServerRequest.HttpServerRequest): boolean {
  try {
    const url = new URL(request.url, "http://localhost")
    if (url.protocol === "https:") return true
  } catch {}
  const proto = request.headers["x-forwarded-proto"]
  if (typeof proto === "string" && proto.split(",")[0].trim().toLowerCase() === "https") return true
  const ssl = request.headers["x-forwarded-ssl"]
  if (typeof ssl === "string" && ssl.toLowerCase() === "on") return true
  const host = (request.headers["x-forwarded-host"] || request.headers.host || "").toLowerCase()
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) return true
  return false
}

function rawTokenFromRequest(url: URL, request: HttpServerRequest.HttpServerRequest): string | undefined {
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return token
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return match[1]
  const clientCookie = request.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${ServerAuth.CLIENT_COOKIE_NAME}=`))
    ?.slice(ServerAuth.CLIENT_COOKIE_NAME.length + 1)
  if (clientCookie) return clientCookie
  return undefined
}

function remember<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  config: ServerAuth.Info,
  options?: { secure?: boolean; token?: string },
) {
  const token = ServerAuth.rememberedToken(config)
  if (!token) return effect
  const secure = options?.secure !== false
  return HttpEffect.appendPreResponseHandler((_request, response) => {
    let next = response
    if (options?.token) {
      next = HttpServerResponse.setCookieUnsafe(next, ServerAuth.CLIENT_COOKIE_NAME, options.token, {
        path: "/",
        maxAge: ServerAuth.COOKIE_MAX_AGE_DURATION,
        httpOnly: false,
        secure,
        sameSite: "lax",
      })
    }
    next = HttpServerResponse.setCookieUnsafe(next, ServerAuth.COOKIE_NAME, token, {
      path: "/",
      maxAge: ServerAuth.COOKIE_MAX_AGE_DURATION,
      httpOnly: true,
      secure,
      sameSite: "lax",
    })
    return Effect.succeed(next)
  }).pipe(Effect.flatMap(() => effect))
}

function emptyCredential() {
  return { username: "", password: Redacted.make("") }
}

function decodeCredential(input: string) {
  return Effect.fromResult(Encoding.decodeBase64String(input)).pipe(
    Effect.match({
      onFailure: emptyCredential,
      onSuccess: (header) => {
        const separator = header.indexOf(":")
        if (separator === -1) return emptyCredential()
        return { username: header.slice(0, separator), password: Redacted.make(header.slice(separator + 1)) }
      },
    }),
  )
}

function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
  const url = new URL(request.url, "http://localhost")
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        // Browsers cannot set headers on WebSocket upgrades, so a ticketed PTY connect skips
        // credential checks here; the connect handler consumes and validates the ticket.
        if (hasPtyConnectTicketURL(url)) return yield* effect
        const options = {
          secure: isRequestSecure(request),
          token: rawTokenFromRequest(url, request),
        }
        if (ServerAuth.remembered(request.headers.cookie, config)) return yield* remember(effect, config, options)
        const credential = yield* credentialFromRequest(request)
        if (ServerAuth.authorized(credential, config)) return yield* remember(effect, config, options)
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
        )
        return yield* new UnauthorizedError({ message: "Authentication required" })
      }),
    )
  }),
)
