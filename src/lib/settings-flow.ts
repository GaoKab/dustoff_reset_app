// src/lib/settings-flow.ts
// Pure rules for the Settings panel and the first-run schedule card: the
// draft is validated as a whole before one save, the confirmation line
// after that save, where the person lands afterwards, and when the STOP
// screen may take the panel slot. No React, no Tauri.
//
// Why a draft: saving on every keystroke re-derived the night phases mid
// edit (useNightMode recomputes on any preferences change), and a phase
// flip into night protection let the STOP screen replace the open Settings
// panel while the person was still typing a time.

import type { Preferences } from '@/lib/preferences/types'
import type { PanelType } from '@/hooks/useTauriWindow'
import { normalizeClockInput, validatePhaseBounds, parseClock } from '@/lib/night'
import { derivePhaseBounds, describeNightBounds } from '@/lib/night/schedule'

/** The six "HH:MM" fields a time input can edit. */
export const CLOCK_FIELDS = [
  'nightModeStart',
  'shutdownStart',
  'protectionStart',
  'nightModeEnd',
  'workStart',
  'workEnd',
] as const
export type ClockField = (typeof CLOCK_FIELDS)[number]

/**
 * Normalise every clock field of a draft. Returns null when one of them
 * is not a time, so the caller can show one line and keep the draft.
 */
export function normalizeDraftClocks(draft: Preferences): Preferences | null {
  const next = { ...draft }
  for (const field of CLOCK_FIELDS) {
    const clock = normalizeClockInput(draft[field])
    if (clock === null) return null
    next[field] = clock
  }
  return next
}

/**
 * The frontend twin of `Preferences::validate` in storage/preferences.rs
 * for the fields the person can type: every time well formed, the explicit
 * phases in order, and work start different from work end. Returns the
 * message to show, or null when the draft can be saved.
 */
export function validatePreferencesDraft(draft: Preferences): string | null {
  const normalized = normalizeDraftClocks(draft)
  if (normalized === null) return 'Each time needs the form HH:MM.'
  if (normalized.phaseOverride) {
    const problem = validatePhaseBounds(normalized)
    if (problem) return problem
  }
  if (parseClock(normalized.workStart) === parseClock(normalized.workEnd)) {
    return 'Work start and work end need to be different times.'
  }
  return null
}

/** The keys whose value differs between two preference objects. */
export function preferencesPatch(base: Preferences, draft: Preferences): Partial<Preferences> {
  const patch: Partial<Preferences> = {}
  for (const key of Object.keys(draft) as (keyof Preferences)[]) {
    const a = base[key]
    const b = draft[key]
    const same = Array.isArray(a) && Array.isArray(b)
      ? a.length === b.length && a.every((v, i) => v === b[i])
      : a === b
    if (!same) (patch as Record<string, unknown>)[key] = b
  }
  return patch
}

/** "Saved. Wind-down from 8:00 pm, …" or "Saved. Night mode is off." */
export function settingsSavedLine(prefs: Preferences): string {
  if (!prefs.nightModeEnabled) return 'Saved. Night mode is off.'
  const derived = derivePhaseBounds(prefs)
  const bounds = describeNightBounds(derived.bounds)
  return derived.problem ? `Saved. ${derived.problem} ${bounds}` : `Saved. ${bounds}`
}

/** Where Settings was opened from. */
export type SettingsOrigin =
  /** The gear on the HUD, with the panel that was open at the time (usually none) */
  | { from: 'hud'; returnTo: PanelType | null }
  /** The first-run "When do you usually work?" card */
  | { from: 'setup' }

/**
 * After Save, the person goes back to where they were. From the first-run
 * card that is the entry point ("How do you want to start?"), never the
 * bare HUD; from the HUD gear it is whatever was open before.
 */
export function panelAfterSettingsSave(origin: SettingsOrigin | null): PanelType | null {
  if (origin === null) return null
  if (origin.from === 'setup') return 'entryPoint'
  return origin.returnTo === 'settings' ? null : origin.returnTo
}

/**
 * The STOP screen takes the panel slot only when nothing else is open (or
 * it already holds it). Settings, the setup card's Settings, a wizard or a
 * summary are never replaced mid-use; the screen waits until they close.
 */
export function nightProtectionMayTakeOver(currentPanel: PanelType | null): boolean {
  return currentPanel === null || currentPanel === 'nightProtection'
}
