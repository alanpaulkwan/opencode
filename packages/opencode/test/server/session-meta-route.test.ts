import { describe, expect, test } from "bun:test"
import { readSessionMeta, writeSessionMeta } from "../../src/server/session-meta-route"

describe("sessionMetaRoute persistence", () => {
  test("reads and writes session metadata correctly", async () => {
    const initial = await readSessionMeta()
    expect(initial).toBeDefined()
    expect(Array.isArray(initial.namedGroups.groups)).toBe(true)

    const updated = await writeSessionMeta({
      namedGroups: {
        groups: [{ id: "test-group-1", name: "Test Research", created: 123456789 }],
        members: { "session-1": "test-group-1" },
      },
      pins: {
        "session-1": 123456789,
      },
    })

    expect(updated.namedGroups.groups).toHaveLength(1)
    expect(updated.namedGroups.groups[0]!.name).toBe("Test Research")
    expect(updated.namedGroups.members["session-1"]).toBe("test-group-1")
    expect(updated.pins["session-1"]).toBe(123456789)

    const fetched = await readSessionMeta()
    expect(fetched.namedGroups.groups[0]!.id).toBe("test-group-1")
    expect(fetched.namedGroups.members["session-1"]).toBe("test-group-1")
    expect(fetched.pins["session-1"]).toBe(123456789)
  })
})
