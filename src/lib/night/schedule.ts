// src/lib/night/schedule.ts
// "When do you usually work?" Night mode follows the person's day, not the
// clock, so a night-shift nurse gets her wind-down after the shift ends,
// not at 20:00 while she is at work.
//
// This file is the ONE place the four phase bounds come from:
//   derivePhaseBounds(schedule)  pure, mirrored by derive_phase_bounds in
//                                src-tauri/src/storage/preferences.rs
//   resolveNight(now, prefs)     the accessor everything else reads: the
//                                derived bounds plus the days-off and
//                                at-work rules, as NightSettings
//
// Parking lot, not built: habit-learned suggestions. The app could notice
// from night_events and session ends that "your last two weeks suggest you
// stop around 11pm" and offer to move Shutdown. If that is ever built it
// is suggest-only: a line in Settings with an Apply button, never a silent
// change to the schedule. Nothing here learns or adapts on its own.

import type { Preferences } from '@/lib/preferences/types'
import {
  parseClock,
  minutesToClock,
  validatePhaseBounds,
  getNightPhase,
  nightKey,
  type PhaseBounds,
  type NightSettings,
  type NightPhase,
} from './index'

/** The slice of preferences the schedule logic needs. */
export type SchedulePrefs = Pick<
  Preferences,
  | 'scheduleMode'
  | 'workDays'
  | 'workStart'
  | 'workEnd'
  | 'phaseOverride'
  | 'keepShiftRhythmOnDaysOff'
  | 'nightModeStart'
  | 'shutdownStart'
  | 'protectionStart'
  | 'nightModeEnd'
>

/** The usual evening clock. `standard` mode, and the fallback. */
export const STANDARD_BOUNDS: PhaseBounds = {
  nightModeStart: '20:00',
  shutdownStart: '22:00',
  protectionStart: '00:00',
  nightModeEnd: '06:00',
}

/** Hours after work ends: wind-down, shutdown, night protection. */
export const WIND_DOWN_AFTER_WORK_MINUTES = 60
export const SHUTDOWN_AFTER_WORK_MINUTES = 180
export const PROTECTION_AFTER_WORK_MINUTES = 300
/** The night ends this long before work starts. */
export const NIGHT_END_BEFORE_WORK_MINUTES = 60

export type BoundsSource = 'standard' | 'schedule' | 'override'

export interface DerivedBounds {
  bounds: PhaseBounds
  source: BoundsSource
  /** Why the schedule (or override) could not be used and standard applies */
  problem: string | null
}

const standard = (problem: string | null = null): DerivedBounds => ({
  bounds: { ...STANDARD_BOUNDS },
  source: 'standard',
  problem,
})

/**
 * Derive the four phase bounds from the schedule. Pure. Twin of
 * `derive_phase_bounds` in storage/preferences.rs; keep the two in step.
 *
 * - `phaseOverride`: the explicit fields win, if they are in order.
 * - `standard`: the standard clock.
 * - `night_shift` / `custom`: wind-down 1h after work end, shutdown 3h
 *   after, protection 5h after, night ends 1h before work start, all
 *   modulo 24h. The gap between shifts has to fit those phases (at least
 *   six hours), or the standard clock is used and `problem` says why.
 */
export function derivePhaseBounds(schedule: SchedulePrefs): DerivedBounds {
  if (schedule.phaseOverride) {
    const explicit: PhaseBounds = {
      nightModeStart: schedule.nightModeStart,
      shutdownStart: schedule.shutdownStart,
      protectionStart: schedule.protectionStart,
      nightModeEnd: schedule.nightModeEnd,
    }
    if (validatePhaseBounds(explicit) === null) return { bounds: explicit, source: 'override', problem: null }
    return standard('The phase times are out of order, so the standard clock applies.')
  }
  if (schedule.scheduleMode === 'standard') return standard()

  const ws = parseClock(schedule.workStart)
  const we = parseClock(schedule.workEnd)
  if (ws === null || we === null) return standard('Work hours need the form HH:MM, so the standard clock applies.')
  if (ws === we) return standard('Work start and end are the same time, so the standard clock applies.')

  const derived: PhaseBounds = {
    nightModeStart: minutesToClock(we + WIND_DOWN_AFTER_WORK_MINUTES),
    shutdownStart: minutesToClock(we + SHUTDOWN_AFTER_WORK_MINUTES),
    protectionStart: minutesToClock(we + PROTECTION_AFTER_WORK_MINUTES),
    nightModeEnd: minutesToClock(ws - NIGHT_END_BEFORE_WORK_MINUTES),
  }
  if (validatePhaseBounds(derived) !== null) {
    return standard('Those hours leave less than six hours between shifts, so night mode cannot fit and the standard clock applies.')
  }
  return { bounds: derived, source: 'schedule', problem: null }
}

// ============================================
// DAYS OFF AND SHIFTS
// ============================================

/** 0 = Monday … 6 = Sunday, matching `workDays`. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** Does the shift starting on `date` fall on a work day? */
function isWorkDay(date: Date, workDays: boolean[]): boolean {
  return workDays[weekdayIndex(date)] === true
}

/**
 * Which shift explains this moment: the one in progress if the person is
 * at work, otherwise the one that ended most recently. Returns the date the
 * shift started and whether `now` is inside it. A shift crosses midnight
 * when work ends earlier on the clock than it starts.
 */
export function shiftFor(now: Date, workStart: string, workEnd: string): { startDate: Date; atWork: boolean } | null {
  const ws = parseClock(workStart)
  const we = parseClock(workEnd)
  if (ws === null || we === null || ws === we) return null
  const minutes = now.getHours() * 60 + now.getMinutes()
  const crosses = ws > we
  const day = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    d.setDate(d.getDate() + offset)
    return d
  }
  if (crosses) {
    if (minutes >= ws) return { startDate: day(0), atWork: true }
    if (minutes < we) return { startDate: day(-1), atWork: true }
    // Between the end and the next start: the shift that ended this morning
    return { startDate: day(-1), atWork: false }
  }
  if (minutes >= ws && minutes < we) return { startDate: day(0), atWork: true }
  // Before the start: yesterday's shift is the last one; after the end: today's
  return { startDate: minutes < ws ? day(-1) : day(0), atWork: false }
}

export type NightReason =
  /** Night mode is switched off */
  | 'off'
  /** The standard clock (standard mode, or a fallback) */
  | 'standard'
  /** The schedule-derived bounds */
  | 'schedule'
  /** The explicit phase fields */
  | 'override'
  /** A day off: the standard clock applies for a normal night */
  | 'day-off'
  /** The person is on shift, so there is no night right now */
  | 'at-work'

export interface ResolvedNight {
  /** What getNightPhase and nightKey read. Disabled when off or at work. */
  settings: NightSettings
  reason: NightReason
  /** Carried over from derivePhaseBounds, for Settings to show */
  problem: string | null
}

export type NightPrefs = SchedulePrefs & Pick<Preferences, 'nightModeEnabled'>

/**
 * The one accessor for the effective night settings at a moment. Applies,
 * in order: the on/off switch; the explicit override; standard mode; then,
 * for a schedule-derived night, whether the person is at work (no night
 * while on shift) and whether the relevant shift was on a work day. On a
 * day off the standard clock applies, unless the mode is night_shift and
 * "keep my shift rhythm on days off" is ticked.
 */
export function resolveNight(now: Date, prefs: NightPrefs): ResolvedNight {
  const derived = derivePhaseBounds(prefs)
  const settings = (bounds: PhaseBounds, enabled: boolean): NightSettings => ({ ...bounds, nightModeEnabled: enabled })

  if (!prefs.nightModeEnabled) return { settings: settings(derived.bounds, false), reason: 'off', problem: derived.problem }
  if (derived.source !== 'schedule') {
    return { settings: settings(derived.bounds, true), reason: derived.source, problem: derived.problem }
  }

  const shift = shiftFor(now, prefs.workStart, prefs.workEnd)
  const workDay = shift !== null && isWorkDay(shift.startDate, prefs.workDays)
  if (shift?.atWork && workDay) return { settings: settings(derived.bounds, false), reason: 'at-work', problem: null }
  if (workDay) return { settings: settings(derived.bounds, true), reason: 'schedule', problem: null }
  if (prefs.scheduleMode === 'night_shift' && prefs.keepShiftRhythmOnDaysOff) {
    return { settings: settings(derived.bounds, true), reason: 'schedule', problem: null }
  }
  return { settings: settings(STANDARD_BOUNDS, true), reason: 'day-off', problem: null }
}

/** The phase right now, through the schedule. */
export function nightPhaseFor(now: Date, prefs: NightPrefs): NightPhase {
  return getNightPhase(now, resolveNight(now, prefs).settings)
}

/** The once-per-night key right now, through the schedule. */
export function nightKeyFor(now: Date, prefs: NightPrefs): string {
  return nightKey(now, resolveNight(now, prefs).settings)
}

// ============================================
// PLAIN WORDS
// ============================================

/** "HH:MM" in plain words: midnight, noon, 8:00 pm, 6:30 am. */
export function clockWords(value: string): string {
  const minutes = parseClock(value)
  if (minutes === null) return value
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0 && h === 0) return 'midnight'
  if (m === 0 && h === 12) return 'noon'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/**
 * The derived phases read back in one line, for the Settings preview:
 * "Wind-down from 8:00 pm, shutdown from 10:00 pm, night protection from
 * midnight to 6:00 am."
 */
export function describeNightBounds(bounds: PhaseBounds): string {
  return (
    `Wind-down from ${clockWords(bounds.nightModeStart)}, ` +
    `shutdown from ${clockWords(bounds.shutdownStart)}, ` +
    `night protection from ${clockWords(bounds.protectionStart)} to ${clockWords(bounds.nightModeEnd)}.`
  )
}

/** One line on what happens on days off, for the Settings preview. */
export function describeDaysOff(prefs: Pick<SchedulePrefs, 'scheduleMode' | 'keepShiftRhythmOnDaysOff' | 'phaseOverride'>): string | null {
  if (prefs.phaseOverride || prefs.scheduleMode === 'standard') return null
  if (prefs.scheduleMode === 'night_shift' && prefs.keepShiftRhythmOnDaysOff) return 'The same rhythm on days off.'
  return 'On days off, the usual evening clock applies: wind-down from 8:00 pm, night protection from midnight to 6:00 am.'
}
