import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Effect } from "effect"
import path from "node:path"
import fs from "node:fs/promises"
import { Global } from "@opencode-ai/core/global"

export type HomeNamedGroup = {
  id: string
  name: string
  created: number
}

export type HomeNamedGroupsBucket = {
  groups: HomeNamedGroup[]
  members: Record<string, string>
}

export type HomeSessionPinMap = Record<string, number>

export type SessionMetaPayload = {
  namedGroups?: HomeNamedGroupsBucket
  pins?: HomeSessionPinMap
}

const META_FILE = path.join(Global.Path.config, "session-meta.json")

export async function readSessionMeta(): Promise<{ namedGroups: HomeNamedGroupsBucket; pins: HomeSessionPinMap }> {
  try {
    const raw = await fs.readFile(META_FILE, "utf-8")
    const parsed = JSON.parse(raw)
    const groups: HomeNamedGroup[] = Array.isArray(parsed?.namedGroups?.groups)
      ? parsed.namedGroups.groups.filter(
          (item: any) =>
            item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.created === "number",
        )
      : []
    const members: Record<string, string> =
      typeof parsed?.namedGroups?.members === "object" && parsed.namedGroups.members !== null
        ? Object.fromEntries(
            Object.entries(parsed.namedGroups.members).filter(
              ([k, v]) => typeof k === "string" && typeof v === "string",
            ),
          )
        : {}
    const pins: HomeSessionPinMap =
      typeof parsed?.pins === "object" && parsed.pins !== null
        ? Object.fromEntries(
            Object.entries(parsed.pins).filter(([k, v]) => typeof k === "string" && typeof v === "number"),
          )
        : {}
    return {
      namedGroups: { groups, members },
      pins,
    }
  } catch {
    return {
      namedGroups: { groups: [], members: {} },
      pins: {},
    }
  }
}

export async function writeSessionMeta(payload: SessionMetaPayload): Promise<{
  namedGroups: HomeNamedGroupsBucket
  pins: HomeSessionPinMap
}> {
  const current = await readSessionMeta()
  const updated = {
    namedGroups:
      payload.namedGroups !== undefined
        ? {
            groups: Array.isArray(payload.namedGroups.groups) ? payload.namedGroups.groups : current.namedGroups.groups,
            members:
              payload.namedGroups.members && typeof payload.namedGroups.members === "object"
                ? payload.namedGroups.members
                : current.namedGroups.members,
          }
        : current.namedGroups,
    pins:
      payload.pins !== undefined && typeof payload.pins === "object"
        ? payload.pins
        : current.pins,
  }

  await fs.mkdir(path.dirname(META_FILE), { recursive: true })
  const tmpFile = `${META_FILE}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
  await fs.writeFile(tmpFile, JSON.stringify(updated, null, 2), "utf-8")
  await fs.rename(tmpFile, META_FILE)
  return updated
}

export const sessionMetaRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/api/session-meta", () =>
      Effect.promise(() => readSessionMeta()).pipe(
        Effect.map((meta) =>
          HttpServerResponse.jsonUnsafe(meta, {
            headers: {
              "cache-control": "no-store",
            },
          }),
        ),
      ),
    )
    yield* router.add("PUT", "/api/session-meta", (request: HttpServerRequest.HttpServerRequest) =>
      request.json.pipe(
        Effect.flatMap((body) => Effect.promise(() => writeSessionMeta(body as SessionMetaPayload))),
        Effect.map((updated) =>
          HttpServerResponse.jsonUnsafe(
            { ok: true, meta: updated },
            {
              headers: {
                "cache-control": "no-store",
              },
            },
          ),
        ),
        Effect.catch(() =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ error: "invalid payload" }, { status: 400 })),
        ),
      ),
    )
    yield* router.add("POST", "/api/session-meta", (request: HttpServerRequest.HttpServerRequest) =>
      request.json.pipe(
        Effect.flatMap((body) => Effect.promise(() => writeSessionMeta(body as SessionMetaPayload))),
        Effect.map((updated) =>
          HttpServerResponse.jsonUnsafe(
            { ok: true, meta: updated },
            {
              headers: {
                "cache-control": "no-store",
              },
            },
          ),
        ),
        Effect.catch(() =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ error: "invalid payload" }, { status: 400 })),
        ),
      ),
    )
  }),
)
