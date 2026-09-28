// src/lib/night/index.ts
// Night mode: pure time and rule logic, ported from the original extension
// and the night-mode web client. No React, no Tauri, so it is easy to test.
//
// Three phases inside the night window, each with a user-editable start:
//   wind-down         default 20:00 to 22:00  HUD softens, wind-down card once
//   shutdown          default 22:00 to 00:00  15-minute shutdown protocol offered once
//   night-protection  default 00:00 to 06:00  STOP screen with a real escape hatch
//
// Everything here is a strong default with an override, never a hard block.

import type { Tone } from '@/lib/preferences/types'

export type NightPhase = 'day' | 'wind-down' | 'shutdown' | 'night-protection'

const MINUTES_PER_DAY = 24 * 60

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
  /** Wind-down starts here. Also the start of the whole night window. */
  nightModeStart: string
  /** Shutdown protocol phase starts here. */
  shutdownStart: string
  /** Night protection starts here. */
  protectionStart: string
  /** Night protection ends here. Also the end of the night window. */
  nightModeEnd: string
}

export const DEFAULT_NIGHT_SETTINGS: NightSettings = {
  nightModeEnabled: true,
  nightModeStart: '20:00',
  shutdownStart: '22:00',
  protectionStart: '00:00',
  nightModeEnd: '06:00',
}

/** Minutes from `start` forward around the clock to `clock`, in [0, 1440). */
function offsetFrom(start: number, clock: number): number {
  return (((clock - start) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/**
 * Check that the four bounds run in order around the clock: wind-down,
 * then shutdown, then night protection, then the end. Mirrors the Rust
 * validation in storage/preferences.rs. Returns a reason or null when fine.
 */
export function validatePhaseBounds(settings: Pick<NightSettings, 'nightModeStart' | 'shutdownStart' | 'protectionStart' | 'nightModeEnd'>): string | null {
  const s = parseClock(settings.nightModeStart)
  const sd = parseClock(settings.shutdownStart)
  const p = parseClock(settings.protectionStart)
  const e = parseClock(settings.nightModeEnd)
  if (s === null || sd === null || p === null || e === null) return 'Each time needs the form HH:MM.'
  const shutdownOff = offsetFrom(s, sd)
  const protectionOff = offsetFrom(s, p)
  const endOff = offsetFrom(s, e)
  if (shutdownOff === 0) return 'Shutdown needs to start after wind-down.'
  if (protectionOff <= shutdownOff) return 'Night protection needs to start after shutdown.'
  if (endOff <= protectionOff) return 'The night needs to end after night protection starts.'
  return null
}

/** Which night phase applies right now, or 'day' when night mode is off. */
export function getNightPhase(now: Date, settings: NightSettings): NightPhase {
  if (!settings.nightModeEnabled) return 'day'
  if (validatePhaseBounds(settings) !== null) return 'day'

  const start = parseClock(settings.nightModeStart)!
  const minutes = now.getHours() * 60 + now.getMinutes()
  const offset = offsetFrom(start, minutes)
  const endOff = offsetFrom(start, parseClock(settings.nightModeEnd)!)
  if (offset >= endOff) return 'day'

  const protectionOff = offsetFrom(start, parseClock(settings.protectionStart)!)
  if (offset >= protectionOff) return 'night-protection'
  const shutdownOff = offsetFrom(start, parseClock(settings.shutdownStart)!)
  if (offset >= shutdownOff) return 'shutdown'
  return 'wind-down'
}

/** Human labels for the phases, used by settings and the HUD note. */
export const NIGHT_PHASE_LABEL: Record<NightPhase, string> = {
  day: 'Day',
  'wind-down': 'Wind-down',
  shutdown: 'Shutdown',
  'night-protection': 'Night protection',
}

// ============================================
// DATE KEYS
// ============================================

/** Local calendar date key (YYYY-MM-DD). */
export function localDateKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The evening a moment belongs to. Anything before noon counts as the
 * previous evening, so 01:30 on the 16th and 23:00 on the 15th share the
 * key "…-15". Used to gate "once per night" behaviour and to key night
 * events in SQLite.
 */
export function nightDateKey(now: Date): string {
  const d = new Date(now)
  if (d.getHours() < 12) d.setDate(d.getDate() - 1)
  return localDateKey(d)
}

/** Date key `days` days before `now` (local), for rolling windows. */
export function dateKeyDaysAgo(now: Date, days: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return localDateKey(d)
}

// ============================================
// DRIFT MULTIPLIER (ported from the desktop agent)
// ============================================

/**
 * Penalty multipliers by phase, from the original desktop agent:
 * wind-down 1.2, shutdown 1.5, night protection 2.0. Applied to drift
 * penalties during an active session so late-night switching costs more.
 */
export const NIGHT_MULTIPLIER: Record<NightPhase, number> = {
  day: 1,
  'wind-down': 1.2,
  shutdown: 1.5,
  'night-protection': 2.0,
}

/** Gentle tone never multiplies beyond the wind-down level. */
export const GENTLE_MULTIPLIER_CAP = 1.2

export function getNightMultiplier(phase: NightPhase, tone: Tone): number {
  const raw = NIGHT_MULTIPLIER[phase]
  if (tone === 'gentle') return Math.min(raw, GENTLE_MULTIPLIER_CAP)
  return raw
}

/** One-line note for the HUD tooltip so the multiplier is not a hidden rule. */
export function getNightMultiplierNote(phase: NightPhase, tone: Tone): string | null {
  const m = getNightMultiplier(phase, tone)
  if (m <= 1) return null
  return `Night multiplier active: drift costs x${m.toFixed(1)} during ${NIGHT_PHASE_LABEL[phase].toLowerCase()}.`
}

// ============================================
// EMERGENCY OVERRIDE
// ============================================

export const OVERRIDE_MINUTES = 30
export const MAX_OVERRIDES_PER_NIGHT = 2

export type OverrideRefusal = 'disabled' | 'limit-reached'

/**
 * Can a new override start tonight? `usedTonight` is the number of
 * overrides already recorded for this night date.
 */
export function canStartOverride(usedTonight: number, overrideEnabled: boolean): { ok: true } | { ok: false; reason: OverrideRefusal } {
  if (!overrideEnabled) return { ok: false, reason: 'disabled' }
  if (usedTonight >= MAX_OVERRIDES_PER_NIGHT) return { ok: false, reason: 'limit-reached' }
  return { ok: true }
}

export function overridesRemaining(usedTonight: number): number {
  return Math.max(0, MAX_OVERRIDES_PER_NIGHT - usedTonight)
}

/** Seconds left on an override that ends at `until` (ms epoch). Never negative. */
export function overrideSecondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000))
}

export function formatCountdown(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

// ============================================
// INSOMNIA LINE (rolling seven days)
// ============================================

/**
 * The original tracker's graded line, keyed by how many distinct nights in
 * the last seven had an "I can't sleep" choice. No advice, no medical
 * language; the Progress panel shows this and nothing more.
 */
export function insomniaLine(nightsWithTrouble: number): string {
  if (nightsWithTrouble <= 0) return "You haven't reported sleep trouble this week."
  if (nightsWithTrouble === 1) return "You've had one night of sleep trouble this week."
  if (nightsWithTrouble === 2) return "You've had trouble sleeping 2 nights this week."
  return "You've had trouble sleeping multiple nights this week."
}

// ============================================
// WIND-DOWN ESTIMATE
// ============================================

/**
 * A rough "about N minutes" to wind down, from the day's session load.
 *
 * Heuristic, deliberately simple: 15 minutes as a floor, plus 5 minutes
 * for every full hour of focus sessions today, capped at 60. A day with no
 * sessions still gets the floor; a nine-hour day hits the cap. The result
 * is rounded to the nearest 5 so the UI never suggests false precision.
 * The original derived this from a "night activation" score that the app
 * does not have; session minutes are the honest local stand-in.
 */
export function estimateWindDownMinutes(sessionMinutesToday: number): number {
  const hours = Math.floor(Math.max(0, sessionMinutesToday) / 60)
  const raw = Math.min(60, 15 + hours * 5)
  return Math.round(raw / 5) * 5
}
