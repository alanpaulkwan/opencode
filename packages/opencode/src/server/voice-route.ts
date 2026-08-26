import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Effect } from "effect"
import { transcribeRequest, voiceStatus } from "./voice"

export const voiceRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/voice/health", () =>
      Effect.promise(() => voiceStatus()).pipe(
        Effect.map((body) => HttpServerResponse.jsonUnsafe(body, { status: body.ok ? 200 : 503 })),
      ),
    )
    yield* router.add("POST", "/voice/transcribe", (request: HttpServerRequest.HttpServerRequest) =>
      Effect.promise(() => {
        const web = request.source instanceof Request ? request.source : undefined
        if (!web) return Promise.resolve({ status: 400, body: { error: "invalid request" } })
        return transcribeRequest(web)
      }).pipe(Effect.map((result) => HttpServerResponse.jsonUnsafe(result.body, { status: result.status }))),
    )
  }),
)
