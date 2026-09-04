import { ServerAuth } from "@/server/auth"
import { Effect, Encoding, Layer, Redacted } from "effect"
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiError, HttpApiMiddleware } from "effect/unstable/httpapi"
import { hasPtyConnectTicketURL } from "@/server/shared/pty-ticket"
import { isPublicUIPath } from "@/server/shared/public-ui"
export {
  Authorization as ServerAuthorization,
  authorizationLayer as serverAuthorizationLayer,
} from "@opencode-ai/server/middleware/authorization"

const AUTH_TOKEN_QUERY = "auth_token"
const UNAUTHORIZED = 401
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'

// Avoid HttpApiSecurity alternatives here: Effect security middleware wraps the
// full handler, so a downstream failure can make the next auth alternative run
// and remap an authorized NotFound into Unauthorized.
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "@opencode/ExperimentalHttpApiAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

export class PtyConnectAuthorization extends HttpApiMiddleware.Service<PtyConnectAuthorization>()(
  "@opencode/ExperimentalHttpApiPtyConnectAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

function emptyCredential() {
  return {
    username: "",
    password: Redacted.make(""),
  }
}

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

function validateCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
  options?: { secure?: boolean; token?: string },
) {
  return Effect.gen(function* () {
    if (!ServerAuth.required(config)) return yield* effect
    if (!ServerAuth.authorized(credential, config)) {
      yield* HttpEffect.appendPreResponseHandler((_request, response) =>
        Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
      )
      return yield* new HttpApiError.Unauthorized({})
    }
    return yield* remember(effect, config, options)
  })
}

function decodeCredential(input: string) {
  return Effect.fromResult(Encoding.decodeBase64String(input)).pipe(
    Effect.match({
      onFailure: emptyCredential,
      onSuccess: (header) => {
        const separator = header.indexOf(":")
        if (separator === -1) return emptyCredential()
        return {
          username: header.slice(0, separator),
          password: Redacted.make(header.slice(separator + 1)),
        }
      },
    }),
  )
}

function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
  return credentialFromURL(new URL(request.url, "http://localhost"), request)
}

function credentialFromURL(url: URL, request: HttpServerRequest.HttpServerRequest) {
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

function validateRawCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
  options?: { secure?: boolean; token?: string },
) {
  if (!ServerAuth.required(config)) return effect
  if (!ServerAuth.authorized(credential, config))
    return Effect.succeed(
      HttpServerResponse.empty({
        status: UNAUTHORIZED,
        headers: { "www-authenticate": WWW_AUTHENTICATE },
      }),
    )
  return remember(effect, config, options)
}

export const authorizationRouterMiddleware = HttpRouter.middleware()(
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return (effect) => effect

    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        if (isPublicUIPath(request.method, url.pathname)) return yield* effect
        const options = {
          secure: isRequestSecure(request),
          token: rawTokenFromRequest(url, request),
        }
        if (ServerAuth.remembered(request.headers.cookie, config)) return yield* remember(effect, config, options)
        return yield* credentialFromURL(url, request).pipe(
          Effect.flatMap((credential) => validateRawCredential(effect, credential, config, options)),
        )
      })
  }),
)

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        const options = {
          secure: isRequestSecure(request),
          token: rawTokenFromRequest(url, request),
        }
        if (ServerAuth.remembered(request.headers.cookie, config)) return yield* remember(effect, config, options)
        return yield* credentialFromRequest(request).pipe(
          Effect.flatMap((credential) => validateCredential(effect, credential, config, options)),
        )
      }),
    )
  }),
)

export const ptyConnectAuthorizationLayer = Layer.effect(
  PtyConnectAuthorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return PtyConnectAuthorization.of((effect) => effect)
    return PtyConnectAuthorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        if (hasPtyConnectTicketURL(url)) return yield* effect
        const options = {
          secure: isRequestSecure(request),
          token: rawTokenFromRequest(url, request),
        }
        if (ServerAuth.remembered(request.headers.cookie, config)) return yield* remember(effect, config, options)
        return yield* credentialFromURL(url, request).pipe(
          Effect.flatMap((credential) => validateCredential(effect, credential, config, options)),
        )
      }),
    )
  }),
)
