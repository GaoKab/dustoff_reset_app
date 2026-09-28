// src/hooks/useAiSitePause.ts
// Feeds telemetry tab/app switches into the AiPauseTracker and exposes
// whether the "Hold. Stay here." card should be visible.
//
// Listens on its own (not through setupTelemetryListeners) so the session
// start code does not need to know about it. Tab URLs only arrive on macOS
// (AppleScript), so on other platforms the hook stays idle.

import { useState, useEffect, useRef, useCallback } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import {
  EVENT_TAB_SWITCH,
  EVENT_APP_SWITCH,
  type TelemetryEvent,
} from '@/lib/telemetry/telemetry-listener'
import {
  AiPauseTracker,
  AI_PAUSE_COOLDOWN_MS,
  AI_PAUSE_DISPLAY_MS,
} from '@/lib/telemetry/ai-sites'
import type { Tone } from '@/lib/preferences/types'

interface UseAiSitePauseProps {
  enabled: boolean
  isSessionActive: boolean
  tone: Tone
}

function isMacOS(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
}

export function useAiSitePause({ enabled, isSessionActive, tone }: UseAiSitePauseProps) {
  const [isVisible, setIsVisible] = useState(false)
  const trackerRef = useRef(new AiPauseTracker())
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    trackerRef.current.setCooldown(AI_PAUSE_COOLDOWN_MS[tone])
  }, [tone])

  const show = useCallback(() => {
    setIsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setIsVisible(false), AI_PAUSE_DISPLAY_MS)
  }, [])

  const dismiss = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setIsVisible(false)
  }, [])

  useEffect(() => {
    const tracker = trackerRef.current
    if (!enabled || !isSessionActive || !isMacOS()) {
      tracker.reset()
      return
    }

    let disposed = false
    const unlisteners: UnlistenFn[] = []
    const register = (promise: Promise<UnlistenFn>) => {
      promise
        .then(unlisten => {
          if (disposed) unlisten()
          else unlisteners.push(unlisten)
        })
        .catch(err => console.log('[AiPause] Listener setup failed:', err))
    }

    register(listen<TelemetryEvent>(EVENT_TAB_SWITCH, event => {
      if (tracker.onTabSwitch(event.payload.browserTab?.domain, Date.now())) {
        console.log('[AiPause] Left an AI tab early. Hold. Stay here.')
        show()
      }
    }))
    register(listen<TelemetryEvent>(EVENT_APP_SWITCH, event => {
      const name = event.payload.appInfo?.appName?.toLowerCase() ?? ''
      // Our own HUD taking focus is not the user leaving
      if (name.includes('dustoff')) return
      if (tracker.onAppSwitch(Date.now())) {
        console.log('[AiPause] Left the browser mid-answer. Hold. Stay here.')
        show()
      }
    }))

    return () => {
      disposed = true
      unlisteners.forEach(u => u())
      tracker.reset()
    }
  }, [enabled, isSessionActive, show])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  return { isVisible, dismiss }
}
