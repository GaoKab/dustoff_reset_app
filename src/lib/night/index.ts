// src/lib/night/index.ts
// Night mode: pure time-window logic, ported from the extension's
// 8pm-6am behaviour. No React, no Tauri, so it is easy to test.
//
// Phases inside the window:
//   wind-down      window start until 22:00 (or the whole window if it
//                  starts after 22:00): HUD softens, copy shifts
//   close-day      22:00 until midnight: offer a "close the day" reset once
//   after-midnight midnight until window end: one-line nudge before a session

export type NightPhase = 'day' | 'wind-down' | 'close-day' | 'after-midnight'

const CLOSE_DAY_HOUR = 22

/** Parse "HH:MM" to minutes since midnight. Returns null when malformed. */
export function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * Is `now` inside the [start, end) window? Handles windows that cross
 * midnight (20:00 to 06:00) as well as same-day windows (13:00 to 15:00).
 * A window whose start equals its end is treated as never active.
 */
export function isWithinNightWindow(now: Date, start: string, end: string): boolean {
  const s = parseClock(start)
  const e = parseClock(end)
  if (s === null || e === null || s === e) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (s < e) return minutes >= s && minutes < e
  return minutes >= s || minutes < e
}

export interface NightSettings {
  nightModeEnabled: boolean
  nightModeStart: string
  nightModeEnd: string
}

/** Which night phase applies right now, or 'day' when night mode is off. */
export function getNightPhase(now: Date, settings: NightSettings): NightPhase {
  if (!settings.nightModeEnabled) return 'day'
  if (!isWithinNightWindow(now, settings.nightModeStart, settings.nightModeEnd)) return 'day'

  const hour = now.getHours()
  const start = parseClock(settings.nightModeStart) ?? 0
  const end = parseClock(settings.nightModeEnd) ?? 0
  const crossesMidnight = start > end

  // After midnight only makes sense for a window that crosses it
  if (crossesMidnight && hour * 60 + now.getMinutes() < end) return 'after-midnight'
  if (hour >= CLOSE_DAY_HOUR) return 'close-day'
  return 'wind-down'
}

/** Local calendar date key, used to show the close-day nudge once per day. */
export function localDateKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
