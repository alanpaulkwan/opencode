export const HOME_SESSION_SWIPE_THRESHOLD = 72
export const HOME_SESSION_SWIPE_LOCK = 10
export const HOME_SESSION_SWIPE_MAX = 96

export function homeSessionSwipeLock(dx: number, dy: number, slop = HOME_SESSION_SWIPE_LOCK) {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return
  return Math.abs(dx) >= Math.abs(dy) ? ("x" as const) : ("y" as const)
}

export function homeSessionSwipeAction(dx: number, threshold = HOME_SESSION_SWIPE_THRESHOLD) {
  if (dx >= threshold) return "open" as const
  if (dx <= -threshold) return "archive" as const
}

export function clampHomeSessionSwipe(dx: number, canArchive: boolean, max = HOME_SESSION_SWIPE_MAX) {
  const min = canArchive ? -max : 0
  if (dx < min) return min
  if (dx > max) return max
  return dx
}
