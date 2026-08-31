import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Effect } from "effect"
import { transcribeBody, voiceStatus } from "./voice"

export const voiceRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/voice/health", () =>
      Effect.promise(() => voiceStatus()).pipe(
        Effect.map((body) => HttpServerResponse.jsonUnsafe(body, { status: body.ok ? 200 : 503 })),
      ),
    )
    yield* router.add("POST", "/voice/transcribe", (request: HttpServerRequest.HttpServerRequest) =>
      request.arrayBuffer.pipe(
        Effect.flatMap((bytes) =>
          Effect.promise(() => transcribeBody(bytes, request.headers["content-type"] ?? "")),
        ),
        Effect.map((result) => HttpServerResponse.jsonUnsafe(result.body, { status: result.status })),
        Effect.catch(() =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ error: "invalid request" }, { status: 400 })),
        ),
      ),
    )
  }),
)
