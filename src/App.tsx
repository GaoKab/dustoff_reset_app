import { useState, useEffect, useCallback, useRef } from 'react'
import { tauriBridge, CalibrationData, RecoveryData, ReflectionObject } from '@/lib/tauri-bridge'
import { resizeForPanel, PanelType } from '@/hooks/useTauriWindow'
import { HUDAdapter } from '@/components/HUDAdapter'
import type { SessionMode } from '@/features/desktop/hud/FloatingHUD/types'

// Hooks
import { useSessionManager, SessionConfig } from '@/hooks/useSessionManager'
import { usePermissions } from '@/hooks/usePermissions'

// Permission Setup
import { PermissionSetup } from '@/components/permissions/PermissionSetup'
import { useSessionTimer } from '@/hooks/useSessionTimer'
import { useBandwidthEngine } from '@/hooks/useBandwidthEngine'
import { useSessionTelemetryStats } from '@/hooks/useSessionTelemetryStats'
import { useBadges } from '@/hooks/useBadges'

// Badge components
import { BadgeUnlockQueue } from '@/components/badges/BadgeUnlockToast'
import { BadgeShareModal } from '@/components/badges/BadgeShareModal'
import { collectSessionStats } from '@/lib/badges/session-stats-collector'
import { getBadgeById } from '@/lib/badges/badge-definitions'
import type { BadgeDefinition } from '@/lib/badges/types'

// Telemetry
import { 
  setupTelemetryListeners, 
  cleanupTelemetryListeners,
  calculateAppSwitchPenalty as calculateAppSwitchPenaltyBase,
  calculateDomainPenalty as calculateDomainPenaltyBase,
  calculateBonus,
  getAppCategory,
  getDomainCategory,
  isAppWhitelisted,
  isDomainWhitelisted,
  isDistraction,
  getInterventionConfig,
  AppCategory,
  type TelemetryEvent,
} from '@/lib/telemetry'

// Panel Adapters
import { CalibrationPanelAdapter } from '@/components/panels/CalibrationPanelAdapter'
import { PreSessionPanelAdapter, PreSessionConfig } from '@/components/panels/PreSessionPanelAdapter'
import { ResetPanelAdapter, RitualType, RitualCompletionData } from '@/components/panels/ResetPanelAdapter'
import { ParkingLotPanelAdapter } from '@/components/panels/ParkingLotPanelAdapter'
import { ParkingLotHarvestAdapter } from '@/components/panels/ParkingLotHarvestAdapter'
import { PostSessionSummaryAdapter } from '@/components/panels/PostSessionSummaryAdapter'
import { SessionReflectionAdapter } from '@/components/panels/SessionReflectionAdapter'
import { getNextSessionItems, getActiveParkingLotItems, type ParkingLotItemFull } from '@/lib/parking-lot-storage'
import { PanelContainer } from '@/components/PanelContainer'

// Preset panels
import { EntryPointPanel } from '@/components/presets/EntryPointPanel'
import { QuickStartPanel } from '@/components/presets/QuickStartPanel'
import { PresetPickerPanel } from '@/components/presets/PresetPickerPanel'
import { SavePresetPrompt } from '@/components/presets/SavePresetPrompt'
import type { QuickStartConfig, SessionPreset, SessionMode as PresetSessionMode } from '@/lib/presets/types'
import { useSavePreset } from '@/hooks/useSavePreset'

// Overlays
import { InterventionOverlayAdapter } from '@/components/overlays/InterventionOverlayAdapter'
import { FlowCelebrationOverlay } from '@/features/desktop/overlays/FlowCelebrationOverlay'
import { DelayGateAdapter, createInitialDelayGateState, type DelayGateState } from '@/components/overlays/DelayGateAdapter'
import { BlockScreenAdapter, createInitialBlockScreenState, type BlockScreenState } from '@/components/overlays/BlockScreenAdapter'

// Modals
import { EndSessionModalAdapter } from '@/components/modals/EndSessionModalAdapter'
import { InterruptedSessionModalAdapter } from '@/components/modals/InterruptedSessionModalAdapter'
import { TimeUpModalAdapter } from '@/components/modals/TimeUpModalAdapter'
import type { ExtensionMinutes } from '@/features/desktop/modals/TimeUpModal'
import { useCalendar } from '@/hooks/useCalendar'
import { PreMeetingNudge } from '@/components/PreMeetingNudge'
import { ProgressPanelAdapter } from '@/components/panels/ProgressPanelAdapter'

// Absorbed from the Chrome extension: preferences, night mode, tone/style copy, AI-site pause
import { usePreferences } from '@/hooks/usePreferences'
import { useAiSitePause } from '@/hooks/useAiSitePause'
import { useNightMode } from '@/hooks/useNightMode'
import { applyToneToIntervention, getAiPauseCopy, type CopyContext } from '@/lib/copy'
import { SettingsPanelAdapter } from '@/components/panels/SettingsPanelAdapter'
import { AiPauseOverlay } from '@/features/desktop/overlays/AiPauseOverlay'
import { WindDownCard, ShutdownNudge, OverrideCountdownCard, LateStartLine } from '@/components/NightNudges'
import { ShutdownPanel } from '@/features/desktop/panels/ShutdownPanel'
import { NightProtectionPanel } from '@/features/desktop/panels/NightProtectionPanel'

// DEV ONLY - Badge Test Panel (remove before production)
import { BadgeTestPanel } from '@/components/dev/BadgeTestPanel'

import { getCurrentWindow } from '@tauri-apps/api/window'

// Dev utilities - exposes helpers to browser console
import '@/lib/dev-utils'

type AppMode = 'loading' | 'recovery' | 'not-calibrated' | 'idle' | 'pre-session' | 'session' | 'paused' | 'post-session'
type InterventionType = 'friction' | 'focus-slipping'

function App() {
  // ============================================
  // PERMISSION STATE
  // ============================================
  const { isGranted, isLoading: permissionsLoading } = usePermissions()
  const [permissionsComplete, setPermissionsComplete] = useState(false)
  // Skip permission setup pane - let OS handle permission requests naturally
  const [skippedPermissions, setSkippedPermissions] = useState(true)

  // Note: showPermissionSetup is derived after mode state is defined (see DERIVED section)

  // If permissions are already granted, mark as complete
  useEffect(() => {
    if (isGranted) {
      setPermissionsComplete(true)
    }
  }, [isGranted])

  // ============================================
  // BADGE STATE
  // ============================================
  const [newlyUnlockedBadges, setNewlyUnlockedBadges] = useState<BadgeDefinition[]>([])
  const [shareModalBadge, setShareModalBadge] = useState<BadgeDefinition | null>(null)
  
  // ============================================
  // DEV ONLY - Badge Test Panel
  // ============================================
  const [showBadgeTestPanel, setShowBadgeTestPanel] = useState(false)
  
  // Keyboard shortcut: Cmd/Ctrl + Shift + B to toggle test panel
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setShowBadgeTestPanel(prev => {
          const newState = !prev
          console.log('[DEV] Badge test panel toggled:', newState)
          
          // Resize window for test panel
          if (newState) {
            tauriBridge.resizeWindow(650, 700)
          } else {
            // Restore to HUD size (will be resized again by other effects if panel is open)
            tauriBridge.resizeWindow(320, 80)
          }
          
          return newState
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  // Handler for triggering badge unlock from test panel
  const handleTestBadgeUnlock = async (badge: BadgeDefinition) => {
    console.log('[DEV] Triggering badge unlock:', badge.name)
    setNewlyUnlockedBadges(prev => [...prev, badge])
    setShowBadgeTestPanel(false)
    // Resize for badge notification
    await tauriBridge.resizeWindow(440, 280)
  }
  
  // ============================================
  // WINDOW SETUP - Always on top
  // ============================================
  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(true)
  }, [])
  // ============================================
  // CORE STATE
  // ============================================
  const [mode, setMode] = useState<AppMode>('loading')
  const [currentPanel, setCurrentPanel] = useState<PanelType | null>(null)

  // Data state
  const [calibration, setCalibration] = useState<CalibrationData | null>(null)
  const [recoveryData, setRecoveryData] = useState<RecoveryData | null>(null)
  const [nextSessionItems, setNextSessionItems] = useState<ParkingLotItemFull[]>([])
  
  // Current session whitelist (for recovery data saving)
  const [currentWhitelistedApps, setCurrentWhitelistedApps] = useState<string[]>([])
  const [currentWhitelistedTabs, setCurrentWhitelistedTabs] = useState<string[]>([])
  const [initialElapsedSeconds, setInitialElapsedSeconds] = useState(0)

  // Overlay state
  const [showInterventionOverlay, setShowInterventionOverlay] = useState(false)
  const [interventionType, setInterventionType] = useState<InterventionType>('friction')
  const [showFlowCelebration, setShowFlowCelebration] = useState(false)
  
  // Delay Gate state (Flow mode intervention)
  const [delayGateState, setDelayGateState] = useState<DelayGateState>(createInitialDelayGateState())
  
  // Legend Mode Intervention state (strict penalty, no countdown)
  const [blockScreenState, setBlockScreenState] = useState<BlockScreenState>(createInitialBlockScreenState())

  // ============================================
  // DERIVED: SHOW PERMISSION SETUP
  // ============================================
  // Don't show permission setup during recovery mode or loading
  const showPermissionSetup = !permissionsLoading && 
                               !isGranted && 
                               !permissionsComplete && 
                               !skippedPermissions &&
                               mode !== 'recovery' &&
                               mode !== 'loading'

  // Modal state
  const [showEndSessionModal, setShowEndSessionModal] = useState(false)
  const [showTimeUpModal, setShowTimeUpModal] = useState(false)

  // Reset framing: why the reset panel was opened ('critical' hard stop,
  // 'landing' after a rough session ending, 'pre-meeting' before a calendar
  // event, or null for a plain reset)
  const [resetContext, setResetContext] = useState<'critical' | 'landing' | 'pre-meeting' | 'night' | null>(null)
  // Set when a session ends unfinished; offers a landing reset after the post-session flow
  const pendingLandingResetRef = useRef(false)
  // Pre-meeting nudge dismissal (keyed per event so each meeting nudges once)
  const [dismissedNudgeKey, setDismissedNudgeKey] = useState<string | null>(null)

  // Telemetry cleanup function ref
  const telemetryCleanupRef = useRef<(() => void) | null>(null)
  
  // Telemetry offense tracking for escalation
  const offenseCountRef = useRef(0)
  
  // Track last whitelisted app for "Return to Work" feature
  const lastWhitelistedAppRef = useRef<string | null>(null)

  // ============================================
  // SAVE PRESET STATE
  // ============================================
  const [skippedMentalPrep, setSkippedMentalPrep] = useState(false)
  const [pendingSessionConfig, setPendingSessionConfig] = useState<PreSessionConfig | null>(null)
  const { 
    isSaving, 
    canSave, 
    presetCount, 
    checkCanSave, 
    savePreset 
  } = useSavePreset()

  // ============================================
  // SESSION MANAGER HOOK
  // ============================================
  const sessionManager = useSessionManager()

  // ============================================
  // BANDWIDTH ENGINE HOOK
  // ============================================
  const bandwidthEngine = useBandwidthEngine({
    initialBandwidth: calibration?.calibrationScore ?? 75,
    isSessionActive: mode === 'session',
    isPaused: mode === 'paused',
    mode: (sessionManager.currentSession?.mode || 'Flow') as SessionMode,
    onFrictionTrigger: () => {
      console.log('[App] Friction trigger!')
      setInterventionType('friction')
      setShowInterventionOverlay(true)
    },
    onFocusSlippingTrigger: () => {
      console.log('[App] Focus slipping trigger!')
      setInterventionType('focus-slipping')
      setShowInterventionOverlay(true)
    },
    onCriticalTrigger: () => {
      // Capacity critical (< 30): hard stop per the DustOff methodology —
      // pause the session and route through a reset instead of another nudge.
      console.log('[App] Capacity critical! Pausing session and opening reset.')
      sessionManager.recordIntervention('critical-hard-stop')
      setShowInterventionOverlay(false)
      setMode('paused')
      setResetContext('critical')
      setCurrentPanel('reset')
    },
    onFlowAchieved: () => {
      console.log('[App] 🎉 Flow achieved!')
      setShowFlowCelebration(true)
      // Track flow state
      sessionManager.setInFlowState(true)
      telemetryStats.recordFlowAchieved()
      // Auto-dismiss after 8 seconds
      setTimeout(() => setShowFlowCelebration(false), 8000)
    },
    onFlowLost: () => {
      console.log('[App] Flow lost')
      // Track flow state
      sessionManager.setInFlowState(false)
      telemetryStats.recordFlowLost()
    },
  })

  // ============================================
  // SESSION TIMER HOOK
  // ============================================
  const timer = useSessionTimer({
    isActive: mode === 'session',
    isPaused: mode === 'paused',
    plannedDurationMinutes: sessionManager.currentSession?.plannedDurationMinutes || 0,
    sessionId: sessionManager.sessionId || '',
    sessionStartedAt: sessionManager.currentSession?.startedAt || '',
    mode: (sessionManager.currentSession?.mode || 'Flow') as SessionMode,
    intention: sessionManager.currentSession?.intention || null,
    currentBandwidth: bandwidthEngine.current,
    whitelistedApps: currentWhitelistedApps,
    whitelistedTabs: currentWhitelistedTabs,
    initialElapsedSeconds,
    onTimeUp: handleTimeUp,
    onOvertime: handleOvertime,
  })

  // ============================================
  // TELEMETRY STATS HOOK
  // ============================================
  const telemetryStats = useSessionTelemetryStats({
    sessionId: sessionManager.sessionId,
    isActive: mode === 'session' || mode === 'paused',
  })

  // ============================================
  // CALENDAR AWARENESS (read-only, local)
  // ============================================
  const calendar = useCalendar({
    enabled: mode === 'idle' || mode === 'session' || mode === 'paused',
  })

  // Pre-meeting nudge: event within 15 min while idle → offer a reset first
  const nudgeKey = calendar.nextEvent
    ? `${calendar.nextEvent.title}@${calendar.nextEvent.startsAt.getTime()}`
    : null
  const preMeetingNudgeVisible =
    mode === 'idle' &&
    !currentPanel &&
    !showEndSessionModal &&
    !showTimeUpModal &&
    calendar.nextEvent !== null &&
    calendar.nextEvent.minutesUntil <= 15 &&
    calendar.nextEvent.minutesUntil >= 1 &&
    nudgeKey !== dismissedNudgeKey

  const handleNudgeReset = () => {
    if (nudgeKey) setDismissedNudgeKey(nudgeKey)
    setResetContext('pre-meeting')
    setCurrentPanel('reset')
  }

  const handleNudgeDismiss = () => {
    if (nudgeKey) setDismissedNudgeKey(nudgeKey)
  }

  // ============================================
  // PREFERENCES, NIGHT MODE, COPY CONTEXT, AI-SITE PAUSE
  // (absorbed from the retired Chrome extension)
  // ============================================
  const { preferences, preferencesRef, updatePreferences } = usePreferences()

  // Three-phase night mode: phase tick, once-per-night cards, STOP screen,
  // emergency override and event recording live in src/hooks/useNightMode
  const night = useNightMode({
    preferences,
    preferencesRef,
    ready: mode === 'idle' || mode === 'session' || mode === 'paused',
    sessionActive: mode === 'session' || mode === 'paused',
    calibrationScore: calibration?.calibrationScore ?? null,
  })
  const nightPhase = night.nightPhase

  // Night drift multiplier (wind-down 1.2, shutdown 1.5, night protection
  // 2.0, gentle capped at 1.2). Wrapping the calculators here means every
  // telemetry call site (recovery and the three start paths) applies it.
  const calculateAppSwitchPenalty: typeof calculateAppSwitchPenaltyBase = (toApp, sessionMode, offense, whitelisted) =>
    calculateAppSwitchPenaltyBase(toApp, sessionMode, offense, whitelisted, night.multiplierNow())
  const calculateDomainPenalty: typeof calculateDomainPenaltyBase = (domain, sessionMode, offense, whitelisted) =>
    calculateDomainPenaltyBase(domain, sessionMode, offense, whitelisted, night.multiplierNow())

  const copyContext: CopyContext = {
    tone: preferences.tone,
    promptStyle: preferences.promptStyle,
    nightPhase,
  }

  // Tone gating for telemetry escalation: gentle never opens a delay gate
  const getTonedInterventionConfig: typeof getInterventionConfig = (...args) =>
    applyToneToIntervention(getInterventionConfig(...args), preferencesRef.current.tone)

  // "Hold. Stay here." when tabbing away from an AI chat mid-answer (macOS only)
  const aiPause = useAiSitePause({
    enabled: preferences.aiPauseEnabled,
    isSessionActive: mode === 'session',
    tone: preferences.tone,
  })
  const aiPauseVisible =
    aiPause.isVisible &&
    !currentPanel &&
    !delayGateState.isOpen &&
    !blockScreenState.isOpen &&
    !showInterventionOverlay

  // Cards under the HUD: wind-down once per evening, the shutdown offer
  // once per evening, the override countdown while one runs. Never forced.
  const cardsAllowed = !currentPanel && !showEndSessionModal && !showTimeUpModal && !preMeetingNudgeVisible
  const windDownCardVisible = cardsAllowed && night.windDown.visible
  const shutdownNudgeVisible = cardsAllowed && !windDownCardVisible && night.shutdown.nudgeVisible
  const overrideCardVisible = !currentPanel && night.override.active

  // Show the STOP screen as a full panel whenever night protection asks for it
  useEffect(() => {
    if (night.protection.visible) setCurrentPanel('nightProtection')
  }, [night.protection.visible])

  // Shutdown protocol: offered once per evening, also a reset type
  const handleShutdownStart = () => {
    night.shutdown.dismissNudge()
    setResetContext(null)
    setCurrentPanel('shutdown')
  }

  const handleShutdownClose = () => {
    setCurrentPanel(null)
  }

  // Night protection: dismissing never blocks. If the STOP screen came from
  // a session start request, dismissing lets that start proceed.
  const handleProtectionDismiss = () => {
    const trigger = night.protection.trigger
    night.protection.hide()
    setCurrentPanel(trigger === 'session_start' ? 'entryPoint' : null)
  }

  const handleProtectionOverride = () => {
    const trigger = night.protection.trigger
    if (night.override.start()) {
      setCurrentPanel(trigger === 'session_start' ? 'entryPoint' : null)
    }
  }

  const handleOpenSettings = () => {
    setCurrentPanel('settings')
  }

  // ============================================
  // BADGES HOOK
  // ============================================
  const { evaluateSession, dailyStreak, totalBadges, unlockedCount, isStreakAtRisk: checkStreakAtRisk } = useBadges()
  const [isStreakAtRisk, setIsStreakAtRisk] = useState(false)

  // Check if streak is at risk (needs a session today)
  useEffect(() => {
    const checkRisk = async () => {
      try {
        const atRisk = await checkStreakAtRisk()
        setIsStreakAtRisk(atRisk)
      } catch (err) {
        console.error('[Badges] Failed to check streak risk:', err)
      }
    }
    checkRisk()
    // Recheck every 5 minutes
    const interval = setInterval(checkRisk, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [checkStreakAtRisk])

  // ============================================
  // INITIALIZATION
  // ============================================
  useEffect(() => {
    initializeApp()
  }, [])

  // Resize window when panel changes
  useEffect(() => {
    if (!showPermissionSetup) {
      resizeForPanel(currentPanel)
    }
  }, [currentPanel, showPermissionSetup])

  // Resize window for permission setup
  useEffect(() => {
    if (showPermissionSetup) {
      resizeForPanel('permissionSetup')
    }
  }, [showPermissionSetup])

  // Resize window when end session / time-up modal opens (or one of the
  // cards under the HUD needs room: pre-meeting nudge, night cards,
  // AI-site pause)
  const cardBelowHudVisible =
    preMeetingNudgeVisible || windDownCardVisible || shutdownNudgeVisible || overrideCardVisible || aiPauseVisible
  useEffect(() => {
    if (showEndSessionModal || showTimeUpModal) {
      resizeForPanel('endSession')
    } else if (!currentPanel) {
      if (cardBelowHudVisible) {
        tauriBridge.resizeWindow(320, windDownCardVisible ? 440 : 240)
      } else {
        resizeForPanel(null) // Back to HUD only
      }
    }
  }, [showEndSessionModal, showTimeUpModal, currentPanel, cardBelowHudVisible, windDownCardVisible])

  // Resize window for badge panels AND resize back when badges close
  useEffect(() => {
    if (shareModalBadge) {
      resizeForPanel('badgeShareModal')
    } else if (newlyUnlockedBadges.length > 0) {
      resizeForPanel('badgeNotification')
    } else if (currentPanel) {
      // Badges closed - resize to the current panel
      resizeForPanel(currentPanel)
    } else {
      // Badges closed and no panel open - resize to HUD only
      resizeForPanel(null)
    }
  }, [newlyUnlockedBadges.length, shareModalBadge, currentPanel])

  // Auto-enable always-on-top during active sessions
  useEffect(() => {
    const updateWindowFloat = async () => {
      try {
        const isSessionActive = mode === 'session' || mode === 'paused'
        if (isSessionActive) {
          await tauriBridge.setAlwaysOnTop(true)
          console.log('[Window] Always on top: enabled (session active)')
        }
        // Note: We don't disable when session ends to maintain user preference
        // User can manually toggle via settings if needed
      } catch (error) {
        console.error('[Window] Failed to set always on top:', error)
      }
    }
    
    updateWindowFloat()
  }, [mode])

  const initializeApp = useCallback(async () => {
    try {
      // Initialize badge system
      try {
        await tauriBridge.initBadges()
        console.log('[App] Badge system initialized')
        
        // Check if streak is at risk on startup
        const atRisk = await tauriBridge.checkStreakAtRisk()
        if (atRisk) {
          console.log('[App] Daily streak is at risk! Complete a session today.')
          setIsStreakAtRisk(true)
        }
      } catch (badgeErr) {
        console.error('[App] Failed to initialize badges:', badgeErr)
        // Non-fatal - continue with app initialization
      }

      // Initialize preset system
      try {
        await tauriBridge.initPresets()
        console.log('[App] Preset system initialized')
      } catch (presetErr) {
        console.error('[App] Failed to initialize presets:', presetErr)
        // Non-fatal - continue with app initialization
      }

      // Check for crashed session
      const recovery = await tauriBridge.getRecoveryData()
      if (recovery) {
        setRecoveryData(recovery)
        setMode('recovery')
        return
      }

      // Check for today's calibration
      const cal = await tauriBridge.loadCalibration()
      if (cal) {
        setCalibration(cal)
        setMode('idle')
      } else {
        setMode('not-calibrated')
        setCurrentPanel('calibration')
      }

      // Load next session items
      loadNextSessionItems()
    } catch (error) {
      console.error('Failed to initialize:', error)
      setMode('not-calibrated')
      setCurrentPanel('calibration')
    }
  }, [])

  const loadNextSessionItems = async () => {
    try {
      const items = await getNextSessionItems()
      setNextSessionItems(items)
    } catch (error) {
      console.error('Failed to load next session items:', error)
    }
  }

  // ============================================
  // SESSION ENDING HANDLERS
  // ============================================
  
  // Shared function to end session and transition to post-session flow
  // Used for both natural completions (handleTimeUp) and manual endings (handleEndSessionConfirm)
  const handleEndSessionDirectly = async (
    reason: 'completed' | 'mission_complete' | 'stopping_early' | 'pulled_away',
    subReason?: string
  ) => {
    console.log('[App] Ending session directly:', reason, subReason)

    // A session that ended unfinished deserves a landing, not just a summary.
    // Offer a short reset once the post-session flow completes.
    pendingLandingResetRef.current = reason === 'stopping_early' || reason === 'pulled_away'

    // === TELEMETRY: Stop monitoring ===
    try {
      telemetryStats.deactivate()
      await tauriBridge.stopTelemetryMonitor()
      if (telemetryCleanupRef.current) {
        telemetryCleanupRef.current()
        telemetryCleanupRef.current = null
      }
      console.log('[Telemetry] Monitor stopped')
    } catch (telemetryError) {
      console.error('[Telemetry] Failed to stop monitor:', telemetryError)
    }
    
    // === TELEMETRY: Save stats ===
    try {
      await telemetryStats.saveStats()
      console.log('[Telemetry] Stats saved')
    } catch (statsError) {
      console.error('[Telemetry] Failed to save stats:', statsError)
    }

    const finalSession = await sessionManager.endSession(reason, subReason)
    night.recordSessionEnd(bandwidthEngine.current)

    if (finalSession) {
      console.log('[App] Session ended:', {
        victoryLevel: finalSession.victoryLevel,
        flowEfficiency: finalSession.flowEfficiency,
        duration: finalSession.actualDurationMinutes,
        reason,
        subReason,
      })
      
      // === BADGES: Evaluate session for badge unlocks ===
      const isCompleted = reason === 'completed' || reason === 'mission_complete'
      const quitEarly = reason === 'stopping_early' || reason === 'pulled_away'
      
      console.log('[Badges] Session end reason:', reason, '| Completed:', isCompleted, '| QuitEarly:', quitEarly)
      
      try {
        const stats = collectSessionStats(
          {
            sessionId: sessionManager.sessionId || `session_${Date.now()}`,
            mode: sessionManager.currentSession?.mode || 'Zen',
            durationMinutes: finalSession.actualDurationMinutes || 0,
            finalBandwidth: Math.round(bandwidthEngine.current),
            completed: isCompleted,
            quitEarly,
          },
          {
            distractionCount: telemetryStats.stats.offenseCount || 0,
            delayGatesShown: telemetryStats.stats.interventionCount || 0,
            delayGatesReturned: telemetryStats.stats.interventionReturnedCount || 0,
            blocksShown: telemetryStats.stats.interventionCount || 0,
            extensionsSurvived: 0, // TODO: Track extensions survived
            totalPenalties: Math.abs(telemetryStats.stats.totalPenaltyPoints || 0),
            totalBonuses: telemetryStats.stats.totalBonusPoints || 0,
          }
        )
        
        console.log('[Badges] Evaluating session with stats:', JSON.stringify(stats, null, 2))
        
        const badgeResult = await evaluateSession(stats)
        
        console.log('[Badges] Evaluation result:', {
          unlockedCount: badgeResult.unlocked.length,
          unlocked: badgeResult.unlocked.map(b => b.badgeId),
          streakUpdates: badgeResult.streakUpdates.length,
        })
        
        if (badgeResult.unlocked.length > 0) {
          // Convert user badges to badge definitions for display
          const unlockedDefs = badgeResult.unlocked
            .map(ub => {
              const def = getBadgeById(ub.badgeId)
              console.log(`[Badges] Getting definition for ${ub.badgeId}:`, def ? def.name : 'NOT FOUND')
              return def
            })
            .filter((b): b is BadgeDefinition => b !== null)
          
          console.log('🏆 [Badges] Setting newly unlocked badges:', unlockedDefs.map(b => b.name))
          console.log('🏆 [Badges] Badge definitions:', unlockedDefs)
          setNewlyUnlockedBadges(unlockedDefs)
          console.log('🏆 [Badges] State update triggered!')
        } else {
          console.log('[Badges] No badges unlocked this session')
        }
        
        if (badgeResult.streakUpdates.length > 0) {
          console.log('[Badges] Streak updates:', badgeResult.streakUpdates)
        }
      } catch (badgeError) {
        console.error('[Badges] Evaluation failed:', badgeError)
      }
    }

    setMode('post-session')
    setCurrentPanel('postSessionSummary')
  }

  // ============================================
  // TIMER CALLBACKS
  // ============================================
  function handleTimeUp() {
    console.log('[App] Time is up! Asking the user how the session landed.')
    // Don't assume the intention was met just because the clock ran out.
    // Pause the session (freezes timer + bandwidth decay) and ask:
    // finished / need more time / stopping without finishing.
    if (showEndSessionModal) return // user is already in the manual end flow
    setMode('paused')
    setShowTimeUpModal(true)
  }

  function handleOvertime() {
    console.log('[App] Session is 5 minutes overtime!')
    // Show end session modal again if user hasn't ended yet
    if (!showEndSessionModal) {
      setMode('paused')
      setShowEndSessionModal(true)
    }
  }

  // ============================================
  // CALIBRATION HANDLERS
  // ============================================

  const handleCalibrationComplete = async (data: CalibrationData) => {
    try {
      await tauriBridge.saveCalibration(data)
      setCalibration(data)
      setCurrentPanel(null)
      setMode('idle')
    } catch (error) {
      console.error('Failed to save calibration:', error)
    }
  }

  const handleCalibrate = () => {
    setCurrentPanel('calibration')
  }

  // ============================================
  // RECOVERY HANDLERS
  // ============================================

  const handleRecoveryResume = async () => {
    if (!recoveryData) return
    
    console.log('[Recovery] Resuming session from:', recoveryData)
    console.log('[Recovery] Elapsed seconds:', recoveryData.elapsedSeconds)
    console.log('[Recovery] Whitelisted apps:', recoveryData.whitelistedApps)
    console.log('[Recovery] Whitelisted tabs:', recoveryData.whitelistedTabs)

    // Resume session with FULL recovered config including whitelists
    const config: SessionConfig = {
      mode: recoveryData.mode,
      durationMinutes: recoveryData.plannedDurationMinutes,
      intention: recoveryData.intention || '',
      whitelistedApps: recoveryData.whitelistedApps || [],
      whitelistedTabs: recoveryData.whitelistedTabs || [],
    }

    await sessionManager.startSession(config)
    
    // Restore the whitelist state for the timer
    setCurrentWhitelistedApps(recoveryData.whitelistedApps || [])
    setCurrentWhitelistedTabs(recoveryData.whitelistedTabs || [])
    
    // CRITICAL: Set the initial elapsed seconds so timer continues from where it was
    setInitialElapsedSeconds(recoveryData.elapsedSeconds)
    
    // Restore bandwidth if it was saved
    if (recoveryData.bandwidthAtPause !== null && recoveryData.bandwidthAtPause !== undefined) {
      bandwidthEngine.restoreBandwidth(recoveryData.bandwidthAtPause)
      console.log('[Recovery] Restored bandwidth to:', recoveryData.bandwidthAtPause)
    }
    
    // Reset telemetry stats (we don't persist these across crashes)
    telemetryStats.resetStats()

    await tauriBridge.clearRecoveryData()
    setRecoveryData(null)
    setMode('session')
    
    // Restart telemetry monitoring with recovered whitelist
    if (sessionManager.sessionId) {
      telemetryStats.activate()
      
      const sessionMode = recoveryData.mode as 'Zen' | 'Flow' | 'Legend'
      const whitelistedApps = recoveryData.whitelistedApps || []
      const whitelistedTabs = recoveryData.whitelistedTabs || []
      
      // Setup telemetry listeners (same as handleSessionStart)
      const cleanup = await setupTelemetryListeners({
        onAppSwitch: (event) => {
          night.protection.noteActivity()
          if (!event.appInfo) return
          
          const appName = event.appInfo.appName
          const category = getAppCategory(event.appInfo)
          const isWhitelisted = isAppWhitelisted(event.appInfo, whitelistedApps)
          
          console.log(`[Recovery Telemetry] 📱 App switch: ${appName}`)
          
          // Track last whitelisted app
          if (isWhitelisted && !appName.toLowerCase().includes('dustoff')) {
            lastWhitelistedAppRef.current = appName
          }
          
          if (isWhitelisted || !isDistraction(category)) return
          
          // Apply penalties (same logic as handleSessionStart)
          const penaltyResult = calculateAppSwitchPenalty(
            event.appInfo,
            sessionMode,
            offenseCountRef.current + 1,
            false
          )
          
          if (penaltyResult.finalPenalty < 0) {
            offenseCountRef.current++
            bandwidthEngine.applyTelemetryPenalty(penaltyResult.finalPenalty, `${appName} (${penaltyResult.categoryName})`)
            telemetryStats.recordPenalty(penaltyResult.finalPenalty, penaltyResult.categoryName, appName)
            sessionManager.recordDistraction(penaltyResult.categoryName)
            sessionManager.addTimelineBlock('distracted')
          }
        },
        onTabSwitch: (event) => {
          night.protection.noteActivity()
          if (!event.browserTab?.domain) return
          
          const domain = event.browserTab.domain
          const category = getDomainCategory(domain)
          const isWhitelisted = isDomainWhitelisted(domain, whitelistedTabs)
          
          console.log(`[Recovery Telemetry] 🌐 Tab switch: ${domain}`)
          
          if (isWhitelisted || !isDistraction(category)) return
          
          const penaltyResult = calculateDomainPenalty(domain, sessionMode, offenseCountRef.current + 1, false)
          
          if (penaltyResult.finalPenalty < 0) {
            offenseCountRef.current++
            bandwidthEngine.applyTelemetryPenalty(penaltyResult.finalPenalty, `${domain} (${penaltyResult.categoryName})`)
            telemetryStats.recordPenalty(penaltyResult.finalPenalty, penaltyResult.categoryName, domain)
            sessionManager.recordDistraction(penaltyResult.categoryName)
            sessionManager.addTimelineBlock('distracted')
          }
        },
        onReturnToWhitelisted: (event) => {
          if (event.appInfo?.appName && !event.appInfo.appName.toLowerCase().includes('dustoff')) {
            lastWhitelistedAppRef.current = event.appInfo.appName
          }
        },
        onNonWhitelistedDomain: () => {},
      })
      
      telemetryCleanupRef.current = cleanup
      
      // Start Rust telemetry monitor
      await tauriBridge.startTelemetryMonitor(
        sessionManager.sessionId,
        whitelistedApps,
        whitelistedTabs
      )
      
      console.log('[Recovery] ✅ Telemetry monitoring restarted')
    }
    
    console.log('[Recovery] ✅ Session resumed from', Math.floor(recoveryData.elapsedSeconds / 60), 'minutes')
  }

  const handleRecoveryDiscard = async () => {
    await tauriBridge.clearRecoveryData()
    setRecoveryData(null)
    await initializeApp()
  }

  // ============================================
  // SESSION LIFECYCLE HANDLERS
  // ============================================

  const handleStartSession = () => {
    // Night protection asks first (STOP screen); dismissing it still proceeds
    if (!night.protection.requestSessionStart()) return
    setCurrentPanel('entryPoint')
  }

  // Entry Point navigation handlers
  const handleSelectQuickStart = () => {
    setCurrentPanel('quickStart')
  }

  const handleSelectPreset = () => {
    setCurrentPanel('presetPicker')
  }

  // Handle preset selection from PresetPickerPanel
  const handlePresetSelected = async (preset: SessionPreset) => {
    try {
      // Convert preset to session config
      const sessionConfig: SessionConfig = {
        mode: preset.mode,
        durationMinutes: preset.durationMinutes,
        intention: '', // Presets don't require intention
        whitelistedApps: preset.whitelistedApps,
        whitelistedTabs: preset.whitelistedDomains,
      }

      await sessionManager.startSession(sessionConfig)

      // Reset bandwidth engine for new session
      bandwidthEngine.resetEngine()
      
      // Reset telemetry stats for new session
      telemetryStats.resetStats()

      setCurrentPanel(null)
      setMode('session')
      
      // Store whitelist for recovery data saving
      setCurrentWhitelistedApps(preset.whitelistedApps)
      setCurrentWhitelistedTabs(preset.whitelistedDomains)
      setInitialElapsedSeconds(0)  // Fresh session starts at 0

      console.log('[App] Preset session started:', sessionManager.sessionId)
      console.log('[App] Preset:', preset.name)
      console.log('[App] Whitelisted apps:', preset.whitelistedApps)
      console.log('[App] Whitelisted domains:', preset.whitelistedDomains)

      // === TELEMETRY: Start monitoring ===
      if (sessionManager.sessionId) {
        console.log('[Telemetry] About to start monitor...')
        try {
          telemetryStats.activate()
          offenseCountRef.current = 0
          
          const sessionMode = preset.mode as 'Zen' | 'Flow' | 'Legend'
          const whitelistedApps = preset.whitelistedApps
          const whitelistedTabs = preset.whitelistedDomains
          
          console.log('[Telemetry] Setting up listeners first...')
          const cleanup = await setupTelemetryListeners({
            onAppSwitch: (event) => {
          night.protection.noteActivity()
              if (!event.appInfo) return
              
              const appName = event.appInfo.appName
              const category = getAppCategory(event.appInfo)
              const isWhitelisted = isAppWhitelisted(event.appInfo, whitelistedApps)
              
              console.log(`[Telemetry] 📱 App switch: ${appName} | Category: ${category} | Whitelisted: ${isWhitelisted}`)
              
              if (isWhitelisted && appName !== 'dustoff_reset') {
                lastWhitelistedAppRef.current = appName
                console.log(`[Telemetry] 📌 Saved last whitelisted app: ${appName}`)
              }
              
              const penaltyResult = calculateAppSwitchPenalty(
                event.appInfo,
                sessionMode,
                offenseCountRef.current + 1,
                isWhitelisted
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${appName} (${penaltyResult.categoryName})`
                )
              }
            },
            onNonWhitelistedApp: (event) => {
              if (!event.appInfo) return
              
              const appName = event.appInfo.appName
              const category = getAppCategory(event.appInfo)
              
              console.log(`[Telemetry] ⚠️ Non-whitelisted app: ${appName} | Category: ${category}`)
              
              const penaltyResult = calculateAppSwitchPenalty(
                event.appInfo,
                sessionMode,
                offenseCountRef.current + 1,
                false
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${appName} (${penaltyResult.categoryName}) - not whitelisted`
                )
                
                telemetryStats.recordPenalty(
                  penaltyResult.finalPenalty,
                  penaltyResult.categoryName,
                  appName
                )
                telemetryStats.recordAppSwitch(appName, false)
                
                sessionManager.recordDistraction(penaltyResult.categoryName)
                sessionManager.addTimelineBlock('distracted')
                
                const intervention = getTonedInterventionConfig(
                  event.appInfo,
                  sessionMode,
                  offenseCountRef.current,
                  false
                )
                
                if (sessionMode === 'Flow' && intervention.type === 'delay_gate') {
                  console.log(`[DelayGate] Triggering for ${appName} (${intervention.delaySeconds}s)`)
                  sessionManager.recordIntervention('delay_gate')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setDelayGateState({
                    isOpen: true,
                    triggerName: appName,
                    triggerApp: appName,
                    category: category,
                    delaySeconds: intervention.delaySeconds || 10,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || 'Wait to continue, or return to work.',
                  })
                }
                
                if (sessionMode === 'Legend' && intervention.type === 'block_screen') {
                  console.log(`[LegendIntervention] Triggering for ${appName}`)
                  sessionManager.recordIntervention('block_screen')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setBlockScreenState({
                    isOpen: true,
                    triggerName: appName,
                    triggerApp: appName,
                    category: category,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || `${appName} is blocked.`,
                    triggeredExtension: intervention.triggerExtension,
                    extensionMinutes: intervention.extensionMinutes,
                  })
                }
              }
            },
            onTabSwitch: (event) => {
          night.protection.noteActivity()
              if (!event.browserTab?.domain) return
              
              const domain = event.browserTab.domain
              const category = getDomainCategory(domain)
              const isWhitelisted = isDomainWhitelisted(domain, whitelistedTabs)
              
              console.log(`[Telemetry] 🌐 Tab switch: ${domain} | Category: ${category} | Whitelisted: ${isWhitelisted}`)
              
              if (isWhitelisted) return
              
              if (!isDistraction(category)) return
              
              const penaltyResult = calculateDomainPenalty(
                domain,
                sessionMode,
                offenseCountRef.current + 1,
                false
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${domain} (${penaltyResult.categoryName})`
                )
                
                telemetryStats.recordPenalty(
                  penaltyResult.finalPenalty,
                  penaltyResult.categoryName,
                  domain
                )
                telemetryStats.recordDomainVisit(domain, false)
                
                sessionManager.recordDistraction(penaltyResult.categoryName)
                sessionManager.addTimelineBlock('distracted')
                
                const mockAppInfo = {
                  appName: domain,
                  bundleId: null,
                  windowTitle: null,
                  activeSince: Date.now(),
                }
                
                const intervention = getTonedInterventionConfig(
                  mockAppInfo,
                  sessionMode,
                  offenseCountRef.current,
                  false
                )
                
                const browserName = event.browserTab.browser || 'Chrome'
                
                if (sessionMode === 'Flow' && intervention.type === 'delay_gate') {
                  console.log(`[DelayGate] Triggering for ${domain} in ${browserName} (${intervention.delaySeconds}s)`)
                  sessionManager.recordIntervention('delay_gate')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setDelayGateState({
                    isOpen: true,
                    triggerName: domain,
                    triggerApp: browserName,
                    category: category,
                    delaySeconds: intervention.delaySeconds || 10,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || 'Wait to continue, or return to work.',
                  })
                }
                
                if (sessionMode === 'Legend' && intervention.type === 'block_screen') {
                  console.log(`[LegendIntervention] Triggering for ${domain} in ${browserName}`)
                  sessionManager.recordIntervention('block_screen')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setBlockScreenState({
                    isOpen: true,
                    triggerName: domain,
                    triggerBrowser: browserName,
                    category: category,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || `${domain} is blocked.`,
                    triggeredExtension: intervention.triggerExtension,
                    extensionMinutes: intervention.extensionMinutes,
                  })
                }
              }
            },
            onNonWhitelistedDomain: (event) => {
              if (!event.browserTab?.domain) return
              const domain = event.browserTab.domain
              console.log(`[Telemetry] ⚠️ Non-whitelisted domain event: ${domain}`)
            },
            onReturnToWhitelisted: (event) => {
              const appName = event.appInfo?.appName || 'app'
              console.log(`[Telemetry] ✅ Returned to whitelisted: ${appName}`)
              
              if (appName && appName !== 'dustoff_reset') {
                lastWhitelistedAppRef.current = appName
                console.log(`[Telemetry] 📌 Saved last whitelisted app: ${appName}`)
              }
              
              const bonusResult = calculateBonus('quick_return', sessionMode)
              bandwidthEngine.applyTelemetryBonus(
                bonusResult.finalBonus,
                `Returned to ${appName}`
              )
            },
            onAnyEvent: (event) => {
              console.log('[Telemetry] Event:', event.eventType)
            },
          })
          telemetryCleanupRef.current = cleanup
          console.log('[Telemetry] ✅ Listeners set up')
          
          console.log('[Telemetry] Starting Rust monitor...')
          await tauriBridge.startTelemetryMonitor(
            sessionManager.sessionId,
            whitelistedApps,
            whitelistedTabs
          )
          console.log('[Telemetry] ✅ Monitor started for session:', sessionManager.sessionId)
        } catch (telemetryError) {
          console.error('[Telemetry] Failed to start monitor:', telemetryError)
        }
      }
    } catch (error) {
      console.error('Failed to start preset session:', error)
    }
  }

  const handleSelectCreateNew = () => {
    setCurrentPanel('preSession')
  }

  // Quick Start session handler
  const handleQuickStartSession = async (config: QuickStartConfig) => {
    try {
      const sessionConfig: SessionConfig = {
        mode: config.mode,
        durationMinutes: config.durationMinutes,
        intention: '', // Quick Start doesn't require intention
        whitelistedApps: config.whitelistedApps,
        whitelistedTabs: config.whitelistedDomains, // Note: QuickStartConfig uses whitelistedDomains
      }

      await sessionManager.startSession(sessionConfig)

      // Reset bandwidth engine for new session
      bandwidthEngine.resetEngine()
      
      // Reset telemetry stats for new session
      telemetryStats.resetStats()

      setCurrentPanel(null)
      setMode('session')
      
      // Store whitelist for recovery data saving
      setCurrentWhitelistedApps(config.whitelistedApps)
      setCurrentWhitelistedTabs(config.whitelistedDomains)
      setInitialElapsedSeconds(0)  // Fresh session starts at 0

      console.log('[App] Quick Start session started:', sessionManager.sessionId)
      console.log('[App] Whitelisted apps:', config.whitelistedApps)
      console.log('[App] Whitelisted domains:', config.whitelistedDomains)

      // === TELEMETRY: Start monitoring ===
      if (sessionManager.sessionId) {
        console.log('[Telemetry] About to start monitor...')
        try {
          telemetryStats.activate()
          offenseCountRef.current = 0
          
          const sessionMode = config.mode as 'Zen' | 'Flow' | 'Legend'
          const whitelistedApps = config.whitelistedApps
          const whitelistedTabs = config.whitelistedDomains
          
          console.log('[Telemetry] Setting up listeners first...')
          const cleanup = await setupTelemetryListeners({
            onAppSwitch: (event) => {
          night.protection.noteActivity()
              if (!event.appInfo) return
              
              const appName = event.appInfo.appName
              const category = getAppCategory(event.appInfo)
              const isWhitelisted = isAppWhitelisted(event.appInfo, whitelistedApps)
              
              console.log(`[Telemetry] 📱 App switch: ${appName} | Category: ${category} | Whitelisted: ${isWhitelisted}`)
              
              if (isWhitelisted && appName !== 'dustoff_reset') {
                lastWhitelistedAppRef.current = appName
                console.log(`[Telemetry] 📌 Saved last whitelisted app: ${appName}`)
              }
              
              const penaltyResult = calculateAppSwitchPenalty(
                event.appInfo,
                sessionMode,
                offenseCountRef.current + 1,
                isWhitelisted
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${appName} (${penaltyResult.categoryName})`
                )
              }
            },
            onNonWhitelistedApp: (event) => {
              if (!event.appInfo) return
              
              const appName = event.appInfo.appName
              const category = getAppCategory(event.appInfo)
              
              console.log(`[Telemetry] ⚠️ Non-whitelisted app: ${appName} | Category: ${category}`)
              
              const penaltyResult = calculateAppSwitchPenalty(
                event.appInfo,
                sessionMode,
                offenseCountRef.current + 1,
                false
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${appName} (${penaltyResult.categoryName}) - not whitelisted`
                )
                
                telemetryStats.recordPenalty(
                  penaltyResult.finalPenalty,
                  penaltyResult.categoryName,
                  appName
                )
                telemetryStats.recordAppSwitch(appName, false)
                
                sessionManager.recordDistraction(penaltyResult.categoryName)
                sessionManager.addTimelineBlock('distracted')
                
                const intervention = getTonedInterventionConfig(
                  event.appInfo,
                  sessionMode,
                  offenseCountRef.current,
                  false
                )
                
                if (sessionMode === 'Flow' && intervention.type === 'delay_gate') {
                  console.log(`[DelayGate] Triggering for ${appName} (${intervention.delaySeconds}s)`)
                  sessionManager.recordIntervention('delay_gate')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setDelayGateState({
                    isOpen: true,
                    triggerName: appName,
                    triggerApp: appName,
                    category: category,
                    delaySeconds: intervention.delaySeconds || 10,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || 'Wait to continue, or return to work.',
                  })
                }
                
                if (sessionMode === 'Legend' && intervention.type === 'block_screen') {
                  console.log(`[LegendIntervention] Triggering for ${appName}`)
                  sessionManager.recordIntervention('block_screen')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setBlockScreenState({
                    isOpen: true,
                    triggerName: appName,
                    triggerApp: appName,
                    category: category,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || `${appName} is blocked.`,
                    triggeredExtension: intervention.triggerExtension,
                    extensionMinutes: intervention.extensionMinutes,
                  })
                }
              }
            },
            onTabSwitch: (event) => {
          night.protection.noteActivity()
              if (!event.browserTab?.domain) return
              
              const domain = event.browserTab.domain
              const category = getDomainCategory(domain)
              const isWhitelisted = isDomainWhitelisted(domain, whitelistedTabs)
              
              console.log(`[Telemetry] 🌐 Tab switch: ${domain} | Category: ${category} | Whitelisted: ${isWhitelisted}`)
              
              if (isWhitelisted) return
              
              if (!isDistraction(category)) return
              
              const penaltyResult = calculateDomainPenalty(
                domain,
                sessionMode,
                offenseCountRef.current + 1,
                false
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${domain} (${penaltyResult.categoryName})`
                )
                
                telemetryStats.recordPenalty(
                  penaltyResult.finalPenalty,
                  penaltyResult.categoryName,
                  domain
                )
                telemetryStats.recordDomainVisit(domain, false)
                
                sessionManager.recordDistraction(penaltyResult.categoryName)
                sessionManager.addTimelineBlock('distracted')
                
                const mockAppInfo = {
                  appName: domain,
                  bundleId: null,
                  windowTitle: null,
                  activeSince: Date.now(),
                }
                
                const intervention = getTonedInterventionConfig(
                  mockAppInfo,
                  sessionMode,
                  offenseCountRef.current,
                  false
                )
                
                const browserName = event.browserTab.browser || 'Chrome'
                
                if (sessionMode === 'Flow' && intervention.type === 'delay_gate') {
                  console.log(`[DelayGate] Triggering for ${domain} in ${browserName} (${intervention.delaySeconds}s)`)
                  sessionManager.recordIntervention('delay_gate')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setDelayGateState({
                    isOpen: true,
                    triggerName: domain,
                    triggerApp: browserName,
                    category: category,
                    delaySeconds: intervention.delaySeconds || 10,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || 'Wait to continue, or return to work.',
                  })
                }
                
                if (sessionMode === 'Legend' && intervention.type === 'block_screen') {
                  console.log(`[LegendIntervention] Triggering for ${domain} in ${browserName}`)
                  sessionManager.recordIntervention('block_screen')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setBlockScreenState({
                    isOpen: true,
                    triggerName: domain,
                    triggerBrowser: browserName,
                    category: category,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || `${domain} is blocked.`,
                    triggeredExtension: intervention.triggerExtension,
                    extensionMinutes: intervention.extensionMinutes,
                  })
                }
              }
            },
            onNonWhitelistedDomain: (event) => {
              if (!event.browserTab?.domain) return
              const domain = event.browserTab.domain
              console.log(`[Telemetry] ⚠️ Non-whitelisted domain event: ${domain}`)
            },
            onReturnToWhitelisted: (event) => {
              const appName = event.appInfo?.appName || 'app'
              console.log(`[Telemetry] ✅ Returned to whitelisted: ${appName}`)
              
              if (appName && appName !== 'dustoff_reset') {
                lastWhitelistedAppRef.current = appName
                console.log(`[Telemetry] 📌 Saved last whitelisted app: ${appName}`)
              }
              
              const bonusResult = calculateBonus('quick_return', sessionMode)
              bandwidthEngine.applyTelemetryBonus(
                bonusResult.finalBonus,
                `Returned to ${appName}`
              )
            },
            onAnyEvent: (event) => {
              console.log('[Telemetry] Event:', event.eventType)
            },
          })
          telemetryCleanupRef.current = cleanup
          console.log('[Telemetry] ✅ Listeners set up')
          
          console.log('[Telemetry] Starting Rust monitor...')
          await tauriBridge.startTelemetryMonitor(
            sessionManager.sessionId,
            whitelistedApps,
            whitelistedTabs
          )
          console.log('[Telemetry] ✅ Monitor started for session:', sessionManager.sessionId)
        } catch (telemetryError) {
          console.error('[Telemetry] Failed to start monitor:', telemetryError)
        }
      }
    } catch (error) {
      console.error('Failed to start Quick Start session:', error)
    }
  }

  // Internal function to actually start the session
  const startSessionInternal = async (config: PreSessionConfig) => {
    try {
      const sessionConfig: SessionConfig = {
        mode: config.mode,
        durationMinutes: config.durationMinutes,
        intention: config.intention,
        whitelistedApps: config.whitelistedApps,
        whitelistedTabs: config.whitelistedTabs,
      }

      await sessionManager.startSession(sessionConfig)

      // Reset bandwidth engine for new session
      bandwidthEngine.resetEngine()
      
      // Reset telemetry stats for new session
      telemetryStats.resetStats()

      setCurrentPanel(null)
      setMode('session')
      
      // Store whitelist for recovery data saving
      setCurrentWhitelistedApps(config.whitelistedApps)
      setCurrentWhitelistedTabs(config.whitelistedTabs)
      setInitialElapsedSeconds(0)  // Fresh session starts at 0

      console.log('[App] Session started:', sessionManager.sessionId)
      console.log('[App] Whitelisted apps:', config.whitelistedApps)
      console.log('[App] Whitelisted tabs:', config.whitelistedTabs)

      // === TELEMETRY: Start monitoring ===
      if (sessionManager.sessionId) {
        console.log('[Telemetry] About to start monitor...')
        try {
          // IMPORTANT: Activate telemetry stats BEFORE setting up listeners
          // This fixes the race condition where listeners fire before React re-renders
          telemetryStats.activate()

          // Reset offense count for new session
          offenseCountRef.current = 0
          
          // Store session config for penalty calculation
          const sessionMode = config.mode as 'Zen' | 'Flow' | 'Legend'
          const whitelistedApps = config.whitelistedApps
          const whitelistedTabs = config.whitelistedTabs
          
          // IMPORTANT: Setup event listeners BEFORE starting the Rust monitor
          // This ensures JS is ready to receive events when Rust starts emitting
          console.log('[Telemetry] Setting up listeners first...')
          const cleanup = await setupTelemetryListeners({
            onAppSwitch: (event) => {
          night.protection.noteActivity()
              if (!event.appInfo) return
              
              const appName = event.appInfo.appName
              const category = getAppCategory(event.appInfo)
              const isWhitelisted = isAppWhitelisted(event.appInfo, whitelistedApps)
              
              console.log(`[Telemetry] 📱 App switch: ${appName} | Category: ${category} | Whitelisted: ${isWhitelisted}`)
              
              // Track last whitelisted app for "Return to Work" feature
              if (isWhitelisted && appName !== 'dustoff_reset') {
                lastWhitelistedAppRef.current = appName
                console.log(`[Telemetry] 📌 Saved last whitelisted app: ${appName}`)
              }
              
              // Calculate penalty (even for whitelisted, to get category info)
              const penaltyResult = calculateAppSwitchPenalty(
                event.appInfo,
                sessionMode,
                offenseCountRef.current + 1,
                isWhitelisted
              )
              
              // Apply penalty if there is one
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${appName} (${penaltyResult.categoryName})`
                )
              }
            },
            onNonWhitelistedApp: (event) => {
              if (!event.appInfo) return
              
              const appName = event.appInfo.appName
              const category = getAppCategory(event.appInfo)
              
              console.log(`[Telemetry] ⚠️ Non-whitelisted app: ${appName} | Category: ${category}`)
              
              // Calculate and apply penalty
              const penaltyResult = calculateAppSwitchPenalty(
                event.appInfo,
                sessionMode,
                offenseCountRef.current + 1,
                false // Not whitelisted
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${appName} (${penaltyResult.categoryName}) - not whitelisted`
                )
                
                // Record stats
                telemetryStats.recordPenalty(
                  penaltyResult.finalPenalty,
                  penaltyResult.categoryName,
                  appName
                )
                telemetryStats.recordAppSwitch(appName, false)
                
                // Record distraction in session manager
                sessionManager.recordDistraction(penaltyResult.categoryName)
                sessionManager.addTimelineBlock('distracted')
                
                // Get intervention config based on mode
                const intervention = getTonedInterventionConfig(
                  event.appInfo,
                  sessionMode,
                  offenseCountRef.current,
                  false
                )
                
                // Flow mode: Delay Gate
                if (sessionMode === 'Flow' && intervention.type === 'delay_gate') {
                  console.log(`[DelayGate] Triggering for ${appName} (${intervention.delaySeconds}s)`)
                  sessionManager.recordIntervention('delay_gate')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setDelayGateState({
                    isOpen: true,
                    triggerName: appName,
                    triggerApp: appName,  // Track the app to minimize on return
                    category: category,
                    delaySeconds: intervention.delaySeconds || 10,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || 'Wait to continue, or return to work.',
                  })
                }
                
                // Legend mode: Intervention Screen (no countdown)
                if (sessionMode === 'Legend' && intervention.type === 'block_screen') {
                  console.log(`[LegendIntervention] Triggering for ${appName}`)
                  sessionManager.recordIntervention('block_screen')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setBlockScreenState({
                    isOpen: true,
                    triggerName: appName,
                    triggerApp: appName,  // Track the app
                    category: category,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || `${appName} is blocked.`,
                    triggeredExtension: intervention.triggerExtension,
                    extensionMinutes: intervention.extensionMinutes,
                  })
                }
              }
            },
            onTabSwitch: (event) => {
          night.protection.noteActivity()
              if (!event.browserTab?.domain) return
              
              const domain = event.browserTab.domain
              const category = getDomainCategory(domain)
              const isWhitelisted = isDomainWhitelisted(domain, whitelistedTabs)
              
              console.log(`[Telemetry] 🌐 Tab switch: ${domain} | Category: ${category} | Whitelisted: ${isWhitelisted}`)
              
              // Skip if whitelisted
              if (isWhitelisted) return
              
              // Only penalize distracting domains (not neutral/productive)
              if (!isDistraction(category)) return
              
              // Calculate and apply penalty for distracting domain
              const penaltyResult = calculateDomainPenalty(
                domain,
                sessionMode,
                offenseCountRef.current + 1,
                false
              )
              
              if (penaltyResult.finalPenalty < 0) {
                offenseCountRef.current++
                bandwidthEngine.applyTelemetryPenalty(
                  penaltyResult.finalPenalty,
                  `${domain} (${penaltyResult.categoryName})`
                )
                
                // Record stats
                telemetryStats.recordPenalty(
                  penaltyResult.finalPenalty,
                  penaltyResult.categoryName,
                  domain
                )
                telemetryStats.recordDomainVisit(domain, false)
                
                // Record distraction in session manager
                sessionManager.recordDistraction(penaltyResult.categoryName)
                sessionManager.addTimelineBlock('distracted')
                
                // Get intervention config
                const mockAppInfo = {
                  appName: domain,
                  bundleId: null,
                  windowTitle: null,
                  activeSince: Date.now(),
                }
                
                const intervention = getTonedInterventionConfig(
                  mockAppInfo,
                  sessionMode,
                  offenseCountRef.current,
                  false
                )
                
                // Get the browser name for tab closing
                const browserName = event.browserTab.browser || 'Chrome'
                
                // Flow mode: Delay Gate
                if (sessionMode === 'Flow' && intervention.type === 'delay_gate') {
                  console.log(`[DelayGate] Triggering for ${domain} in ${browserName} (${intervention.delaySeconds}s)`)
                  sessionManager.recordIntervention('delay_gate')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setDelayGateState({
                    isOpen: true,
                    triggerName: domain,
                    triggerApp: browserName,  // Track the browser to minimize on return
                    category: category,
                    delaySeconds: intervention.delaySeconds || 10,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || 'Wait to continue, or return to work.',
                  })
                }
                
                // Legend mode: Intervention Screen (no countdown)
                if (sessionMode === 'Legend' && intervention.type === 'block_screen') {
                  console.log(`[LegendIntervention] Triggering for ${domain} in ${browserName}`)
                  sessionManager.recordIntervention('block_screen')
                  setCurrentPanel(null)
                  resizeForPanel('intervention')
                  setBlockScreenState({
                    isOpen: true,
                    triggerName: domain,
                    triggerBrowser: browserName,  // Track browser for tab closing
                    category: category,
                    offenseNumber: offenseCountRef.current,
                    message: intervention.message || `${domain} is blocked.`,
                    triggeredExtension: intervention.triggerExtension,
                    extensionMinutes: intervention.extensionMinutes,
                  })
                }
              }
            },
            onNonWhitelistedDomain: (event) => {
              // This event only fires when whitelisted_domains is non-empty
              // Penalties and delay gate are now handled in onTabSwitch
              // This handler is just for additional logging
              if (!event.browserTab?.domain) return
              const domain = event.browserTab.domain
              console.log(`[Telemetry] ⚠️ Non-whitelisted domain event: ${domain}`)
            },
            onReturnToWhitelisted: (event) => {
              const appName = event.appInfo?.appName || 'app'
              console.log(`[Telemetry] ✅ Returned to whitelisted: ${appName}`)
              
              // Track last whitelisted app for "Return to Work" feature
              if (appName && appName !== 'dustoff_reset') {
                lastWhitelistedAppRef.current = appName
                console.log(`[Telemetry] 📌 Saved last whitelisted app: ${appName}`)
              }
              
              // Apply quick return bonus
              const bonusResult = calculateBonus('quick_return', sessionMode)
              bandwidthEngine.applyTelemetryBonus(
                bonusResult.finalBonus,
                `Returned to ${appName}`
              )
            },
            onAnyEvent: (event) => {
              console.log('[Telemetry] Event:', event.eventType)
            },
          })
          telemetryCleanupRef.current = cleanup
          console.log('[Telemetry] ✅ Listeners set up')
          
          // NOW start the Rust telemetry monitor (after JS listeners are ready)
          console.log('[Telemetry] Starting Rust monitor...')
          await tauriBridge.startTelemetryMonitor(
            sessionManager.sessionId,
            config.whitelistedApps,
            config.whitelistedTabs
          )
          console.log('[Telemetry] ✅ Monitor started for session:', sessionManager.sessionId)
        } catch (telemetryError) {
          console.error('[Telemetry] Failed to start monitor:', telemetryError)
          // Continue without telemetry - app still works
        }
      }
    } catch (error) {
      console.error('Failed to start session:', error)
    }
  }

  // Handle session start - show save prompt if coming from Create New
  const handleSessionStart = async (config: PreSessionConfig) => {
    // Check if we're coming from Create New (preSession panel)
    // If so, show save prompt instead of starting directly
    if (currentPanel === 'preSession') {
      setPendingSessionConfig(config)
      setSkippedMentalPrep(false) // PreSessionPanel doesn't track skip yet, default to false
      await checkCanSave()
      setCurrentPanel('savePrompt')
      await resizeForPanel('savePrompt')
    } else {
      // Direct start (from preset or quick start)
      await startSessionInternal(config)
    }
  }

  // Handle save and start
  const handleSaveAndStart = async (name: string, icon: string, includeMentalPrep: boolean) => {
    if (!pendingSessionConfig) return

    const success = await savePreset(name, icon, {
      mode: pendingSessionConfig.mode as PresetSessionMode,
      durationMinutes: pendingSessionConfig.durationMinutes,
      whitelistedApps: pendingSessionConfig.whitelistedApps,
      whitelistedDomains: pendingSessionConfig.whitelistedTabs,
      useDefaultBlocklist: true, // Default for Create New flow
    }, includeMentalPrep)

    if (success) {
      await startSessionInternal(pendingSessionConfig)
      setPendingSessionConfig(null)
    }
  }

  // Handle just start (no save)
  const handleJustStart = async () => {
    if (!pendingSessionConfig) return
    await startSessionInternal(pendingSessionConfig)
    setPendingSessionConfig(null)
  }

  // Handle back from save prompt
  const handleBackFromSave = () => {
    setPendingSessionConfig(null)
    setCurrentPanel('preSession')
    resizeForPanel('preSession')
  }

  const handlePauseSession = async () => {
    await sessionManager.pauseSession()
    setMode('paused')
  }

  const handleResumeSession = async () => {
    await sessionManager.resumeSession()
    setMode('session')
    // Close any open panel (like reset ritual) when resuming
    if (currentPanel === 'reset') {
      setCurrentPanel(null)
      sessionManager.addTimelineBlock('working')
    }
  }

  const handleStopSession = () => {
    // Show end session modal instead of directly ending
    setShowEndSessionModal(true)
  }

  const handleEndSessionConfirm = async (
    reason: 'completed' | 'mission_complete' | 'stopping_early' | 'pulled_away',
    subReason?: string
  ) => {
    console.log('🚀 [EndSession] handleEndSessionConfirm called!')
    console.log('🚀 [EndSession] Reason:', reason)
    console.log('🚀 [EndSession] SubReason:', subReason)
    setShowEndSessionModal(false)
    
    // Use the shared function to end session and transition to post-session flow
    await handleEndSessionDirectly(reason, subReason)
  }

  const handleEndSessionQuickExit = async () => {
    setShowEndSessionModal(false)
    
    // === TELEMETRY: Stop monitoring ===
    try {
      telemetryStats.deactivate()
      await tauriBridge.stopTelemetryMonitor()
      if (telemetryCleanupRef.current) {
        telemetryCleanupRef.current()
        telemetryCleanupRef.current = null
      }
      console.log('[Telemetry] Monitor stopped (quick exit)')
    } catch (telemetryError) {
      console.error('[Telemetry] Failed to stop monitor:', telemetryError)
    }

    // Quick exit - end session without going through reflection flow
    await sessionManager.endSession('stopping_early', 'Quick exit')
    night.recordSessionEnd(bandwidthEngine.current)
    
    setMode('idle')
    setCurrentPanel(null)
  }

  // Night protection "Close for tonight": end any session quietly and return
  // to the dimmed idle HUD. No reflection flow at this hour.
  const handleCloseForTonight = async () => {
    night.protection.markClosedForTonight()
    if (mode === 'session' || mode === 'paused') {
      try {
        telemetryStats.deactivate()
        await tauriBridge.stopTelemetryMonitor()
        if (telemetryCleanupRef.current) {
          telemetryCleanupRef.current()
          telemetryCleanupRef.current = null
        }
      } catch (telemetryError) {
        console.error('[Telemetry] Failed to stop monitor:', telemetryError)
      }
      await sessionManager.endSession('stopping_early', 'Closed for the night')
      night.recordSessionEnd(bandwidthEngine.current)
    }
    setShowEndSessionModal(false)
    setShowTimeUpModal(false)
    setMode('idle')
    setCurrentPanel(null)
  }

  const handleEndSessionCancel = () => {
    setShowEndSessionModal(false)
    // Return to session
  }

  // ============================================
  // TIME-UP MODAL HANDLERS
  // ============================================

  const handleTimeUpFinished = async () => {
    setShowTimeUpModal(false)
    await handleEndSessionDirectly('mission_complete', 'Perfect timing')
  }

  const handleTimeUpExtend = (minutes: ExtensionMinutes) => {
    // "I need more time" is a planning signal, not a failure — no penalty.
    sessionManager.recordIntervention(`needed-more-time-${minutes}min`)
    timer.extendSession(minutes)
    setShowTimeUpModal(false)
    setMode('session')
  }

  const handleTimeUpStop = async () => {
    setShowTimeUpModal(false)
    await handleEndSessionDirectly('stopping_early', 'Ran out of time')
  }

  // ============================================
  // RESET HANDLERS
  // ============================================

  const handleReset = () => {
    // Works with or without a running session — a DustOff reset is not
    // session-bound. Only record an intervention when a session exists.
    if (mode === 'session' || mode === 'paused') {
      sessionManager.recordIntervention('reset-panel-opened')
    }
    setResetContext(null)
    setCurrentPanel('reset')
  }

  const handleOpenProgress = () => {
    setCurrentPanel('progress')
  }

  const handleResetComplete = (ritualType: RitualType) => {
    // The Shutdown Protocol is a guided flow, not a timed ritual
    if (ritualType === 'shutdown') {
      handleShutdownStart()
      return
    }
    // Called when ritual is SELECTED (not completed)
    // NO bonus awarded here - wait for actual completion
    console.log('Reset ritual started:', ritualType)
    sessionManager.recordIntervention(`reset-${ritualType}`)
    sessionManager.addTimelineBlock('reset')
  }
  
  const handleRitualComplete = (data: RitualCompletionData) => {
    // Called when ritual ACTUALLY completes (or is skipped)
    // Award points based on ACTUAL time spent (anti-cheat)
    const actualMinutes = Math.floor(data.actualDuration / 60)
    const plannedMinutes = Math.floor(data.plannedDuration / 60)
    
    console.log(`[Reset] Ritual complete:`, {
      type: data.ritualType,
      planned: `${plannedMinutes}min`,
      actual: `${actualMinutes}min (${data.actualDuration}s)`,
      skipped: data.wasSkipped,
    })
    
    // Only award points for time actually spent — and only when a session
    // is running (standalone/landing resets have no bandwidth to credit)
    const sessionRunning = mode === 'session' || mode === 'paused'
    if (!sessionRunning) {
      console.log(`[Reset] Standalone ritual complete (${data.actualDuration}s) - no session, no points`)
    } else if (actualMinutes > 0) {
      const bonusPoints = actualMinutes * 2
      bandwidthEngine.applyResetBonus(actualMinutes)
      telemetryStats.recordResetRitual(bonusPoints)
      console.log(`[Reset] Awarded ${bonusPoints} points for ${actualMinutes} minutes`)
    } else if (data.actualDuration >= 30) {
      // At least 30 seconds = 1 point
      bandwidthEngine.applyTelemetryBonus(1, `${data.ritualType} (partial)`)
      telemetryStats.recordResetRitual(1)
      console.log(`[Reset] Awarded 1 point for ${data.actualDuration}s`)
    } else {
      console.log(`[Reset] No points awarded - only ${data.actualDuration}s spent`)
    }
  }

  const handleResetClose = () => {
    setResetContext(null)
    // Resume session if it was paused for the reset ritual
    if (mode === 'paused') {
      sessionManager.resumeSession()
      setMode('session')
      sessionManager.addTimelineBlock('working')
    } else if (mode === 'session') {
      sessionManager.addTimelineBlock('working')
    }
    setCurrentPanel(null)
  }

  // ============================================
  // INTERVENTION HANDLERS
  // ============================================

  const handleInterventionDismiss = () => {
    setShowInterventionOverlay(false)
  }

  const handleInterventionAction = () => {
    setShowInterventionOverlay(false)
    // Open reset panel for deeper intervention
    setCurrentPanel('reset')
  }

  // ============================================
  // DELAY GATE HANDLERS (Flow Mode)
  // ============================================

  const handleDelayGateReturnToWork = async () => {
    console.log('[DelayGate] User chose to return to work')
    
    // Capture the triggering app before clearing state
    const triggerApp = delayGateState.triggerApp
    
    // Award bonus for returning to work
    const bonusResult = calculateBonus('delay_gate_returned', 
      (sessionManager.currentSession?.mode || 'Flow') as 'Zen' | 'Flow' | 'Legend'
    )
    bandwidthEngine.applyTelemetryBonus(
      bonusResult.finalBonus,
      'Returned from delay gate'
    )
    // Record intervention response
    telemetryStats.recordIntervention('returned')
    telemetryStats.recordBonus(bonusResult.finalBonus, 'Returned from delay gate')
    // Return to working state
    sessionManager.addTimelineBlock('working')
    // Close the delay gate and resize back to HUD
    setDelayGateState(createInitialDelayGateState())
    resizeForPanel(null)
    
    // FLOW MODE FEATURE: Minimize the distracting app
    if (triggerApp) {
      console.log(`[DelayGate] 🔽 Minimizing distracting app: ${triggerApp}`)
      try {
        await tauriBridge.minimizeApp(triggerApp)
        console.log(`[DelayGate] ✅ Minimized ${triggerApp}`)
      } catch (err) {
        console.error('[DelayGate] Failed to minimize app:', err)
      }
    }
    
    // Focus the last whitelisted app (alt-tab back to work!)
    if (lastWhitelistedAppRef.current) {
      console.log(`[DelayGate] 🎯 Focusing last whitelisted app: ${lastWhitelistedAppRef.current}`)
      try {
        const success = await tauriBridge.focusApp(lastWhitelistedAppRef.current)
        if (success) {
          console.log(`[DelayGate] ✅ Successfully switched to ${lastWhitelistedAppRef.current}`)
        }
      } catch (err) {
        console.error('[DelayGate] Failed to focus app:', err)
      }
    }
  }

  const handleDelayGateProceed = () => {
    console.log('[DelayGate] Countdown complete - user proceeding to distraction')
    // Record intervention response (proceeded through)
    telemetryStats.recordIntervention('proceeded')
    // Stay in distracted state (already set)
    // Penalty already applied when delay gate was triggered
    // Close the gate and resize back to HUD
    setDelayGateState(createInitialDelayGateState())
    resizeForPanel(null)
  }

  const handleDelayGateDismiss = () => {
    console.log('[DelayGate] Delay gate dismissed')
    setDelayGateState(createInitialDelayGateState())
    resizeForPanel(null)
  }

  // ============================================
  // LEGEND MODE INTERVENTION HANDLERS
  // ============================================

  // Handle session extension when block screen triggers it (fires once per block event)
  const handleBlockScreenExtension = useCallback((extensionMinutes: number) => {
    if (extensionMinutes > 0) {
      timer.extendSession(extensionMinutes)
      console.log(`[Legend] Session extended by ${extensionMinutes} minutes`)
    }
  }, [timer])

  const handleBlockScreenAccept = async () => {
    console.log('[LegendIntervention] User accepted and returned to work')
    
    // Capture the triggering browser/app before clearing state
    const triggerBrowser = blockScreenState.triggerBrowser
    const triggerApp = blockScreenState.triggerApp
    
    // Award small bonus for accepting the block gracefully
    const bonusResult = calculateBonus('block_accepted', 
      (sessionManager.currentSession?.mode || 'Legend') as 'Zen' | 'Flow' | 'Legend'
    )
    bandwidthEngine.applyTelemetryBonus(
      bonusResult.finalBonus,
      'Accepted block'
    )
    // Record intervention response (returned to work)
    telemetryStats.recordIntervention('returned')
    telemetryStats.recordBonus(bonusResult.finalBonus, 'Accepted block')
    // Return to working state
    sessionManager.addTimelineBlock('working')
    // Close the block screen and resize back to HUD
    setBlockScreenState(createInitialBlockScreenState())
    resizeForPanel(null)
    
    // LEGEND MODE FEATURE: Close the distracting browser tab
    if (triggerBrowser) {
      console.log(`[LegendIntervention] 🔥 Closing tab in browser: ${triggerBrowser}`)
      try {
        const success = await tauriBridge.closeBrowserTab(triggerBrowser)
        if (success) {
          console.log(`[LegendIntervention] ✅ Closed tab in ${triggerBrowser}`)
        }
      } catch (err) {
        console.error('[LegendIntervention] Failed to close tab:', err)
      }
    } else if (triggerApp) {
      // If it was an app (not browser), just minimize it
      console.log(`[LegendIntervention] 🔽 Minimizing distracting app: ${triggerApp}`)
      try {
        await tauriBridge.minimizeApp(triggerApp)
        console.log(`[LegendIntervention] ✅ Minimized ${triggerApp}`)
      } catch (err) {
        console.error('[LegendIntervention] Failed to minimize app:', err)
      }
    }
    
    // Focus the last whitelisted app (alt-tab back to work!)
    if (lastWhitelistedAppRef.current) {
      console.log(`[LegendIntervention] 🎯 Focusing last whitelisted app: ${lastWhitelistedAppRef.current}`)
      try {
        const success = await tauriBridge.focusApp(lastWhitelistedAppRef.current)
        if (success) {
          console.log(`[LegendIntervention] ✅ Successfully switched to ${lastWhitelistedAppRef.current}`)
        }
      } catch (err) {
        console.error('[LegendIntervention] Failed to focus app:', err)
      }
    }
  }

  // ============================================
  // PARKING LOT HANDLERS
  // ============================================

  const handleOpenParkingLot = () => {
    // Toggle parking lot panel
    if (currentPanel === 'parkingLot') {
      setCurrentPanel(null)
    } else {
      setCurrentPanel('parkingLot')
    }
  }

  const handleParkingLotItemsChange = () => {
    loadNextSessionItems()
  }

  const handleHarvestComplete = () => {
    setMode('idle')
    if (pendingLandingResetRef.current) {
      pendingLandingResetRef.current = false
      setResetContext('landing')
      setCurrentPanel('reset')
    } else {
      setCurrentPanel(null)
    }
  }

  // ============================================
  // POST-SESSION FLOW HANDLERS
  // ============================================

  const handleContinueToReflection = () => {
    setCurrentPanel('sessionReflection')
  }

  const handleReflectionComplete = async (reflection: ReflectionObject) => {
    console.log('Reflection saved:', reflection)

    const activeItems = getActiveParkingLotItems()
    if (activeItems.length > 0) {
      setCurrentPanel('parkingLotHarvest')
    } else {
      handleHarvestComplete()
    }
  }

  const handleClosePanel = () => {
    if (mode === 'post-session') {
      setMode('idle')
      if (pendingLandingResetRef.current) {
        pendingLandingResetRef.current = false
        setResetContext('landing')
        setCurrentPanel('reset')
        return
      }
    }
    setCurrentPanel(null)
  }

  // ============================================
  // RESIZE FOR RECOVERY MODAL
  // ============================================
  useEffect(() => {
    if (mode === 'recovery' && recoveryData) {
      resizeForPanel('recovery')
    }
  }, [mode, recoveryData])

  // ============================================
  // RENDER: LOADING STATE
  // ============================================
  if (mode === 'loading') {
    return (
      <div className="w-full h-full bg-transparent flex items-center justify-center">
        <div className="w-[320px] h-[60px] rounded-full bg-[#0a0f0d]/90 backdrop-blur-xl border border-[#2f4a42]/40 shadow-2xl flex items-center justify-center">
          <div className="text-cyan-400 animate-pulse">Initializing...</div>
        </div>
      </div>
    )
  }

  // ============================================
  // DERIVED VALUES FOR HUD
  // ============================================
  const totalTimeSeconds = (sessionManager.currentSession?.plannedDurationMinutes || 0) * 60
  const sessionModeForHUD = (sessionManager.currentSession?.mode || 'Flow') as SessionMode

  // ============================================
  // RENDER: MAIN APP
  // ============================================

  return (
    <div className="w-full min-h-full bg-transparent">
      {/* Main container - flex column, centered */}
      <div className="flex flex-col items-center">

        {/* FloatingHUD via Adapter - uses bandwidth engine values */}
        <HUDAdapter
          bandwidth={bandwidthEngine.current}
          mode={mode}
          isCalibrated={calibration !== null}
          sessionMode={sessionModeForHUD}
          sessionTime={timer.elapsedSeconds}
          timeRemaining={timer.timeRemaining}
          totalTime={totalTimeSeconds}
          isInFlow={bandwidthEngine.isInFlow}
          streakCount={dailyStreak?.currentCount || 0}
          isStreakAtRisk={isStreakAtRisk}
          onStartSession={handleStartSession}
          onPauseSession={handlePauseSession}
          onResumeSession={handleResumeSession}
          onStopSession={handleStopSession}
          onOpenParkingLot={handleOpenParkingLot}
          onCalibrate={handleCalibrate}
          onReset={handleReset}
          onOpenHistory={handleOpenProgress}
          onOpenSettings={handleOpenSettings}
          dimmed={nightPhase !== 'day'}
          nightNote={night.nightNote}
        />

        {/* Pre-meeting nudge - arrive at the next event with capacity */}
        {preMeetingNudgeVisible && calendar.nextEvent && (
          <PreMeetingNudge
            eventTitle={calendar.nextEvent.title}
            minutesUntil={calendar.nextEvent.minutesUntil}
            onReset={handleNudgeReset}
            onDismiss={handleNudgeDismiss}
          />
        )}

        {/* Night mode cards: wind-down once per evening, shutdown offer once
            per evening, override countdown while one runs. Never forced. */}
        {windDownCardVisible && (
          <WindDownCard estimateMinutes={night.windDown.estimateMinutes} onDismiss={night.windDown.dismiss} />
        )}
        {shutdownNudgeVisible && (
          <ShutdownNudge onStart={handleShutdownStart} onDismiss={night.shutdown.dismissNudge} />
        )}
        {overrideCardVisible && (
          <OverrideCountdownCard
            secondsLeft={night.override.secondsLeft}
            totalSeconds={night.override.totalSeconds}
            onEnd={night.override.end}
          />
        )}

        {/* AI-site pause: Hold. Stay here. (non-blocking, fades on its own) */}
        <AiPauseOverlay isOpen={aiPauseVisible} copy={getAiPauseCopy(copyContext)} />

        {/* Recovery Modal - shows when session was interrupted */}
        {mode === 'recovery' && recoveryData && (
          <div className="mt-3">
            <InterruptedSessionModalAdapter
              isOpen={true}
              recoveryData={recoveryData}
              onResume={handleRecoveryResume}
              onDiscard={handleRecoveryDiscard}
            />
          </div>
        )}

        {/* Intervention Overlay */}
        {showInterventionOverlay && (
          <InterventionOverlayAdapter
            isOpen={true}
            type={interventionType}
            mode={sessionModeForHUD}
            currentBandwidth={bandwidthEngine.current}
            copyContext={copyContext}
            onDismiss={handleInterventionDismiss}
            onReset={handleInterventionAction}
          />
        )}

        {/* Flow Celebration Overlay */}
        {showFlowCelebration && (
          <FlowCelebrationOverlay
            isOpen={true}
            mode={sessionModeForHUD}
            onDismiss={() => setShowFlowCelebration(false)}
          />
        )}

        {/* End Session Modal */}
        {showEndSessionModal && (
          <EndSessionModalAdapter
            isOpen={true}
            onCancel={handleEndSessionCancel}
            onEndSession={handleEndSessionConfirm}
            onQuickExit={handleEndSessionQuickExit}
          />
        )}

        {/* Time-Up Modal - session timer completed naturally */}
        {showTimeUpModal && (
          <TimeUpModalAdapter
            isOpen={true}
            intention={sessionManager.currentSession?.intention}
            nextEventTitle={calendar.nextEvent?.title ?? null}
            nextEventMinutes={calendar.nextEvent?.minutesUntil ?? null}
            onFinished={handleTimeUpFinished}
            onExtend={handleTimeUpExtend}
            onStop={handleTimeUpStop}
          />
        )}

        {/* Permission Setup Panel - shows when permissions needed */}
        {showPermissionSetup && (
          <PermissionSetup
            onComplete={() => setPermissionsComplete(true)}
            onSkip={() => setSkippedPermissions(true)}
          />
        )}

        {/* Panels render below HUD */}
        {currentPanel === 'calibration' && !showPermissionSetup && (
          <CalibrationPanelAdapter
            isOpen={true}
            onClose={handleClosePanel}
            onComplete={handleCalibrationComplete}
          />
        )}

        {/* Entry Point Panel */}
        {currentPanel === 'entryPoint' && (
          <PanelContainer isOpen={true}>
            {(nightPhase === 'shutdown' || nightPhase === 'night-protection') && <LateStartLine />}
            <EntryPointPanel
              onSelectQuickStart={handleSelectQuickStart}
              onSelectPreset={handleSelectPreset}
              onSelectCreateNew={handleSelectCreateNew}
              onClose={handleClosePanel}
            />
          </PanelContainer>
        )}

        {/* Quick Start Panel */}
        {currentPanel === 'quickStart' && (
          <PanelContainer isOpen={true}>
            <QuickStartPanel
              onBack={() => setCurrentPanel('entryPoint')}
              onSessionStart={handleQuickStartSession}
            />
          </PanelContainer>
        )}

        {/* Preset Picker Panel */}
        {currentPanel === 'presetPicker' && (
          <PanelContainer isOpen={true}>
            <PresetPickerPanel
              onBack={() => setCurrentPanel('entryPoint')}
              onSelectPreset={handlePresetSelected}
            />
          </PanelContainer>
        )}

        {/* Save Preset Prompt Panel */}
        {currentPanel === 'savePrompt' && pendingSessionConfig && (
          <PanelContainer isOpen={true}>
            <SavePresetPrompt
              config={{
                mode: pendingSessionConfig.mode as PresetSessionMode,
                durationMinutes: pendingSessionConfig.durationMinutes,
                whitelistedApps: pendingSessionConfig.whitelistedApps,
                whitelistedDomains: pendingSessionConfig.whitelistedTabs,
                useDefaultBlocklist: true,
              }}
              skippedMentalPrep={skippedMentalPrep}
              onSaveAndStart={handleSaveAndStart}
              onJustStart={handleJustStart}
              onBack={handleBackFromSave}
              canSave={canSave}
              presetCount={presetCount}
              isSaving={isSaving}
            />
          </PanelContainer>
        )}

        {currentPanel === 'preSession' && (
          <PreSessionPanelAdapter
            isOpen={true}
            onClose={handleClosePanel}
            onStartSession={handleSessionStart}
          />
        )}

        {currentPanel === 'progress' && (
          <ProgressPanelAdapter
            isOpen={true}
            onClose={handleClosePanel}
          />
        )}

        {currentPanel === 'settings' && (
          <SettingsPanelAdapter
            isOpen={true}
            preferences={preferences}
            onChange={updatePreferences}
            onClose={handleClosePanel}
          />
        )}

        {/* Night mode: Shutdown Protocol (three steps, about 15 minutes) */}
        {currentPanel === 'shutdown' && (
          <PanelContainer isOpen={true}>
            <ShutdownPanel onComplete={night.shutdown.markCompleted} onClose={handleShutdownClose} />
          </PanelContainer>
        )}

        {/* Night mode: STOP screen. Dismissible, never locks the machine. */}
        {currentPanel === 'nightProtection' && night.protection.visible && (
          <PanelContainer isOpen={true}>
            <NightProtectionPanel
              key={`${night.protection.view}-${night.protection.trigger ?? ''}`}
              bandwidthScore={night.protection.bandwidthScore}
              overrideUsedTonight={night.override.usedTonight}
              overrideEnabled={preferences.emergencyOverrideEnabled}
              initialView={night.protection.view}
              onStartOverride={handleProtectionOverride}
              onCantSleep={() => night.protection.recordChoice('cant_sleep')}
              onHabit={() => night.protection.recordChoice('habit')}
              onCloseForTonight={handleCloseForTonight}
              onDismiss={handleProtectionDismiss}
            />
          </PanelContainer>
        )}

        {currentPanel === 'reset' && (
          <ResetPanelAdapter
            isOpen={true}
            onClose={handleResetClose}
            onSelectRitual={handleResetComplete}
            onRitualComplete={handleRitualComplete}
            sessionMode={sessionModeForHUD}
            context={resetContext}
            copyContext={copyContext}
          />
        )}

        {/* Delay Gate Panel (Flow Mode) - renders below HUD when triggered */}
        <DelayGateAdapter
          state={delayGateState}
          onReturnToWork={handleDelayGateReturnToWork}
          onProceed={handleDelayGateProceed}
          onDismiss={handleDelayGateDismiss}
        />

        {/* Legend Mode Intervention - strict penalty with no countdown */}
        <BlockScreenAdapter
          state={blockScreenState}
          onAccept={handleBlockScreenAccept}
          onExtension={handleBlockScreenExtension}
        />

        {currentPanel === 'parkingLot' && (
          <ParkingLotPanelAdapter
            isOpen={true}
            onClose={handleClosePanel}
            onItemsChange={handleParkingLotItemsChange}
          />
        )}

        {/* Badge Unlock Queue - PRIORITY: shows above post-session panels */}
        {newlyUnlockedBadges.length > 0 && (
          <BadgeUnlockQueue
            badges={newlyUnlockedBadges}
            onShare={(badge) => setShareModalBadge(badge)}
            onAllClosed={() => setNewlyUnlockedBadges([])}
          />
        )}

        {/* Badge Share Modal - for sharing badge achievements */}
        {shareModalBadge && (
          <BadgeShareModal
            badge={shareModalBadge}
            isOpen={true}
            stats={{
              streak: dailyStreak?.currentCount,
              totalSessions: unlockedCount,
            }}
            onClose={() => setShareModalBadge(null)}
          />
        )}

        {/* Post-session panels - show AFTER badge toast is dismissed */}
        {currentPanel === 'postSessionSummary' && newlyUnlockedBadges.length === 0 && !shareModalBadge && (
          <PostSessionSummaryAdapter
            isOpen={true}
            session={sessionManager.currentSession}
            telemetryStats={telemetryStats.stats}
            onClose={handleClosePanel}
            onContinueToReflection={handleContinueToReflection}
          />
        )}

        {currentPanel === 'sessionReflection' && newlyUnlockedBadges.length === 0 && !shareModalBadge && (
          <SessionReflectionAdapter
            isOpen={true}
            session={sessionManager.currentSession}
            onClose={handleClosePanel}
            onComplete={handleReflectionComplete}
          />
        )}

        {currentPanel === 'parkingLotHarvest' && newlyUnlockedBadges.length === 0 && !shareModalBadge && (
          <ParkingLotHarvestAdapter
            isOpen={true}
            onClose={handleHarvestComplete}
            sessionId={sessionManager.sessionId || undefined}
          />
        )}
       
      </div>
      
      {/* DEV ONLY - Badge Test Panel (Cmd/Ctrl + Shift + B to toggle) */}
      <BadgeTestPanel
        isOpen={showBadgeTestPanel}
        onClose={() => {
          setShowBadgeTestPanel(false)
          resizeForPanel(currentPanel)
        }}
        onTriggerBadge={handleTestBadgeUnlock}
      />
    </div>
  )
}

export default App
