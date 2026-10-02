// src/hooks/usePreferences.ts
// Loads user preferences (night mode, tone, prompt style, AI pause) from
// SQLite on mount and saves changes back. Falls back to defaults if the
// backend is unavailable so the UI always has something to work with.

import { useState, useEffect, useCallback, useRef } from 'react'
import { tauriBridge } from '@/lib/tauri-bridge'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/preferences/types'

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [isLoaded, setIsLoaded] = useState(false)
  // Ref so long-lived telemetry callbacks read the current value
  const preferencesRef = useRef<Preferences>(DEFAULT_PREFERENCES)

  useEffect(() => {
    let cancelled = false
    tauriBridge.getPreferences()
      .then(prefs => {
        if (cancelled) return
        preferencesRef.current = prefs
        setPreferences(prefs)
      })
      .catch(err => console.log('[Preferences] Load failed, using defaults:', err))
      .finally(() => { if (!cancelled) setIsLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const updatePreferences = useCallback(async (patch: Partial<Preferences>) => {
    const next = { ...preferencesRef.current, ...patch }
    preferencesRef.current = next
    setPreferences(next)
    try {
      await tauriBridge.savePreferences(next)
    } catch (err) {
      console.error('[Preferences] Save failed:', err)
    }
  }, [])

  return { preferences, preferencesRef, isLoaded, updatePreferences }
}
