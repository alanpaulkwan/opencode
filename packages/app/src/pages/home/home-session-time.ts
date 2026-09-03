function startOfDay(ms: number) {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function formatHomeSessionTime(updated: number, now: number, locale: string) {
  const date = new Date(updated)
  if (startOfDay(updated) === startOfDay(now)) {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date)
  }
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date)
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(date)
}
