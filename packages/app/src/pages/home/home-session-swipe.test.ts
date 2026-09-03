import { describe, expect, test } from "bun:test"
import {
  clampHomeSessionSwipe,
  homeSessionSwipeAction,
  homeSessionSwipeLock,
} from "./home-session-swipe"

describe("homeSessionSwipeLock", () => {
  test("ignores small movement", () => {
    expect(homeSessionSwipeLock(4, 3)).toBeUndefined()
  })

  test("locks to x when the drag is mostly horizontal", () => {
    expect(homeSessionSwipeLock(20, 4)).toBe("x")
  })

  test("locks to y when the drag is mostly vertical", () => {
    expect(homeSessionSwipeLock(4, 20)).toBe("y")
  })
})

describe("homeSessionSwipeAction", () => {
  test("opens when dragged far enough to the right", () => {
    expect(homeSessionSwipeAction(80)).toBe("open")
  })

  test("archives when dragged far enough to the left", () => {
    expect(homeSessionSwipeAction(-80)).toBe("archive")
  })

  test("does nothing under the threshold", () => {
    expect(homeSessionSwipeAction(20)).toBeUndefined()
    expect(homeSessionSwipeAction(-20)).toBeUndefined()
  })
})

describe("clampHomeSessionSwipe", () => {
  test("blocks left swipe when archive is unavailable", () => {
    expect(clampHomeSessionSwipe(-40, false)).toBe(0)
  })

  test("still allows a right swipe to open when archive is unavailable", () => {
    expect(clampHomeSessionSwipe(80, false)).toBe(80)
  })
})
