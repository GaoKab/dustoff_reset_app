// src/hooks/useNightMode.ts
// Runtime state for the three-phase night mode. Owns the phase tick, the
// once-per-night gating (wind-down card, shutdown offer, STOP screen), the
// emergency override countdown and the night event recording. App.tsx
// composes this with session state and rendering.
//
// Gating flags live in localStorage keyed by the night key; events that
// should survive and be counted (overrides, choices, shutdown completion,
// session-end bandwidth) go to SQLite through the night event bridge.
//
// The phase and the night key come from one accessor, resolveNight in
// src/lib/night/schedule.ts, which derives the bounds from the person's
// work schedule (or the explicit override). Nothing here reads the four
// phase fields directly, so there is no second source of truth.

import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react'
import { tauriBridge } from '@/lib/tauri-bridge'
import type { Preferences } from '@/lib/preferences/types'
import type { NightEventKind } from '@/lib/tauri-types'
import {
  getNightMultiplier,
  getNightMultiplierNote,
  localDateKey,
  estimateWindDownMinutes,
  canStartOverride,
  overrideSecondsLeft,
  OVERRIDE_MINUTES,
  type NightPhase,
} from '@/lib/night'
import { nightPhaseFor, nightKeyFor } from '@/lib/night/schedule'

export type ProtectionTrigger = 'app_open' | 'session_start' | 'activity' | 'override_ended'

const KEYS = {
  windDownShown: 'dustoff.night.windDownShownOn',
  shutdownOffered: 'dustoff.night.shutdownOfferedOn',
  protectionOpenShown: 'dustoff.night.protectionOpenShownOn',
  protectionActivityShown: 'dustoff.night.protectionActivityShownOn',
  closedForTonight: 'dustoff.night.closedForTonightOn',
  override: 'dustoff.night.override',
} as const

function readKey(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeKey(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode etc. */ }
}
function removeKey(key: string) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

interface StoredOverride { until: number; nightKey: string }

function readOverride(nightKey: string): number | null {
  const raw = readKey(KEYS.override)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredOverride
    if (parsed.nightKey !== nightKey || parsed.until <= Date.now()) return null
    return parsed.until
  } catch {
    return null
  }
}

interface UseNightModeArgs {
  preferences: Preferences
  preferencesRef: MutableRefObject<Preferences>
  /** App has finished loading (idle, session or paused) */
  ready: boolean
  /** A session is running or paused */
  sessionActive: boolean
  /** Today's calibration score, if any, for the STOP screen line */
  calibrationScore: number | null
}

export function useNightMode({ preferences, preferencesRef, ready, sessionActive, calibrationScore }: UseNightModeArgs) {
  // ---------- phase tick ----------
  const [nightPhase, setNightPhase] = useState<NightPhase>('day')
  const [nightKey, setNightKey] = useState(() => nightKeyFor(new Date(), preferencesRef.current))
  useEffect(() => {
    const compute = () => {
      const now = new Date()
      setNightPhase(nightPhaseFor(now, preferences))
      setNightKey(nightKeyFor(now, preferences))
    }
    compute()
    const tick = setInterval(compute, 30 * 1000)
    return () => clearInterval(tick)
    // Any preference change may move the bounds (mode, hours, days, override)
  }, [preferences])

  /** Current multiplier from the live preferences and clock (for long-lived callbacks) */
  const multiplierNow = useCallback(() => {
    const p = preferencesRef.current
    return getNightMultiplier(nightPhaseFor(new Date(), p), p.tone)
  }, [preferencesRef])

  const nightNote = getNightMultiplierNote(nightPhase, preferences.tone)

  // ---------- event helpers ----------
  const record = useCallback((kind: NightEventKind, detail?: string) => {
    const key = nightKeyFor(new Date(), preferencesRef.current)
    tauriBridge.recordNightEvent(key, kind, detail).catch(err =>
      console.log('[Night] Could not record event', kind, err)
    )
  }, [preferencesRef])

  const closedForTonight = readKey(KEYS.closedForTonight) === nightKey

  // ---------- wind-down card (once per evening) ----------
  const [windDownShownOn, setWindDownShownOn] = useState<string | null>(() => readKey(KEYS.windDownShown))
  const [windDownEstimate, setWindDownEstimate] = useState<number>(estimateWindDownMinutes(0))
  const windDownCandidate = ready && !sessionActive && nightPhase === 'wind-down' && windDownShownOn !== nightKey
  useEffect(() => {
    if (!windDownCandidate) return
    let cancelled = false
    const today = localDateKey(new Date())
    tauriBridge.getAllSessions(today, today)
      .then(sessions => {
        if (cancelled) return
        const minutes = sessions.reduce((sum, s) => sum + (s.actualDurationMinutes ?? 0), 0)
        setWindDownEstimate(estimateWindDownMinutes(minutes))
      })
      .catch(() => { /* keep the floor estimate */ })
    return () => { cancelled = true }
  }, [windDownCandidate])
  const windDownVisible = windDownCandidate
  const dismissWindDown = useCallback(() => {
    setWindDownShownOn(nightKey)
    writeKey(KEYS.windDownShown, nightKey)
    record('wind_down_shown')
  }, [nightKey, record])

  // ---------- shutdown offer (once per evening, not after completion) ----------
  const [shutdownOfferedOn, setShutdownOfferedOn] = useState<string | null>(() => readKey(KEYS.shutdownOffered))
  const [shutdownDoneOn, setShutdownDoneOn] = useState<string | null>(null)
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    tauriBridge.countNightEvents(nightKey, 'shutdown_completed')
      .then(n => { if (!cancelled && n > 0) setShutdownDoneOn(nightKey) })
      .catch(() => { /* treat as not done */ })
    return () => { cancelled = true }
  }, [ready, nightKey])
  const shutdownNudgeVisible =
    ready && !sessionActive && nightPhase === 'shutdown' && shutdownOfferedOn !== nightKey && shutdownDoneOn !== nightKey
  const dismissShutdownNudge = useCallback(() => {
    setShutdownOfferedOn(nightKey)
    writeKey(KEYS.shutdownOffered, nightKey)
  }, [nightKey])
  const markShutdownCompleted = useCallback(() => {
    setShutdownDoneOn(nightKey)
    dismissShutdownNudge()
    record('shutdown_completed')
  }, [nightKey, dismissShutdownNudge, record])

  // ---------- emergency override ----------
  const [overrideUntil, setOverrideUntil] = useState<number | null>(() => readOverride(nightKeyFor(new Date(), preferencesRef.current)))
  const [overrideSeconds, setOverrideSeconds] = useState(0)
  // Preferences load after the first render, and the schedule can move the
  // night key, so a stored override is looked up again once the key settles.
  useEffect(() => {
    setOverrideUntil(current => current ?? readOverride(nightKey))
  }, [nightKey])
  const [overrideUsedTonight, setOverrideUsedTonight] = useState(0)
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    tauriBridge.countNightEvents(nightKey, 'override')
      .then(n => { if (!cancelled) setOverrideUsedTonight(n) })
      .catch(() => { /* keep 0 */ })
    return () => { cancelled = true }
  }, [ready, nightKey])

  // ---------- STOP screen ----------
  const [protectionVisible, setProtectionVisible] = useState(false)
  const [protectionView, setProtectionView] = useState<'stop' | 'override-ended'>('stop')
  const [protectionTrigger, setProtectionTrigger] = useState<ProtectionTrigger | null>(null)
  const [lastSessionEndScore, setLastSessionEndScore] = useState<number | null>(null)

  const showProtection = useCallback((trigger: ProtectionTrigger) => {
    setProtectionTrigger(trigger)
    setProtectionView(trigger === 'override_ended' ? 'override-ended' : 'stop')
    setProtectionVisible(true)
    record('protection_stop', trigger)
    tauriBridge.getLatestNightEvent('session_end')
      .then(ev => {
        const score = ev?.detail ? Number(ev.detail) : NaN
        setLastSessionEndScore(Number.isFinite(score) ? score : null)
      })
      .catch(() => setLastSessionEndScore(null))
  }, [record])

  const hideProtection = useCallback(() => {
    setProtectionVisible(false)
    setProtectionTrigger(null)
  }, [])

  const overrideActive = overrideUntil !== null && overrideUntil > Date.now()

  // Override countdown: tick every second, end with the "override ended" screen
  useEffect(() => {
    if (overrideUntil === null) return
    const tick = () => {
      const left = overrideSecondsLeft(overrideUntil, Date.now())
      setOverrideSeconds(left)
      if (left <= 0) {
        setOverrideUntil(null)
        removeKey(KEYS.override)
        showProtection('override_ended')
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [overrideUntil, showProtection])

  const startOverride = useCallback((): boolean => {
    const check = canStartOverride(overrideUsedTonight, preferencesRef.current.emergencyOverrideEnabled)
    if (!check.ok) return false
    const until = Date.now() + OVERRIDE_MINUTES * 60 * 1000
    const stored: StoredOverride = { until, nightKey }
    writeKey(KEYS.override, JSON.stringify(stored))
    setOverrideUntil(until)
    setOverrideUsedTonight(n => n + 1)
    record('override')
    hideProtection()
    return true
  }, [overrideUsedTonight, preferencesRef, nightKey, record, hideProtection])

  const endOverride = useCallback(() => {
    setOverrideUntil(null)
    removeKey(KEYS.override)
    showProtection('override_ended')
  }, [showProtection])

  // Trigger 1: the app is open (or reaches) night protection. Once per night.
  useEffect(() => {
    if (!ready || nightPhase !== 'night-protection' || overrideActive || closedForTonight) return
    if (readKey(KEYS.protectionOpenShown) === nightKey) return
    writeKey(KEYS.protectionOpenShown, nightKey)
    showProtection('app_open')
  }, [ready, nightPhase, nightKey, overrideActive, closedForTonight, showProtection])

  // Trigger 2: a session start is requested. Returns true when the start
  // may proceed now. Dismissing the STOP screen also lets it proceed (the
  // caller checks `protectionTrigger` on dismiss), so this is never a block.
  const requestSessionStart = useCallback((): boolean => {
    if (nightPhase !== 'night-protection' || overrideActive) return true
    showProtection('session_start')
    return false
  }, [nightPhase, overrideActive, showProtection])

  // Trigger 3: first telemetry activity inside the window during a session
  const activityShownRef = useRef<string | null>(readKey(KEYS.protectionActivityShown))
  const noteActivity = useCallback(() => {
    const p = preferencesRef.current
    const now = new Date()
    if (nightPhaseFor(now, p) !== 'night-protection') return
    const key = nightKeyFor(now, p)
    if (activityShownRef.current === key) return
    if (readOverride(key) !== null) return
    if (readKey(KEYS.closedForTonight) === key) return
    activityShownRef.current = key
    writeKey(KEYS.protectionActivityShown, key)
    showProtection('activity')
  }, [preferencesRef, showProtection])

  const recordChoice = useCallback((kind: 'cant_sleep' | 'habit') => record(kind), [record])

  const markClosedForTonight = useCallback(() => {
    writeKey(KEYS.closedForTonight, nightKey)
    setOverrideUntil(null)
    removeKey(KEYS.override)
    hideProtection()
  }, [nightKey, hideProtection])

  const recordSessionEnd = useCallback((score: number) => {
    record('session_end', String(Math.round(score)))
  }, [record])

  // Bandwidth shown on the STOP screen: the last session end tonight if
  // there was one, otherwise today's calibration.
  const bandwidthScore = lastSessionEndScore ?? calibrationScore

  return {
    nightPhase,
    nightKey,
    multiplierNow,
    nightNote,
    windDown: { visible: windDownVisible, estimateMinutes: windDownEstimate, dismiss: dismissWindDown },
    shutdown: { nudgeVisible: shutdownNudgeVisible, dismissNudge: dismissShutdownNudge, markCompleted: markShutdownCompleted },
    protection: {
      visible: protectionVisible,
      view: protectionView,
      trigger: protectionTrigger,
      bandwidthScore,
      show: showProtection,
      hide: hideProtection,
      requestSessionStart,
      noteActivity,
      recordChoice,
      markClosedForTonight,
    },
    override: {
      active: overrideActive,
      secondsLeft: overrideSeconds,
      totalSeconds: OVERRIDE_MINUTES * 60,
      usedTonight: overrideUsedTonight,
      start: startOverride,
      end: endOverride,
    },
    recordSessionEnd,
  }
}
