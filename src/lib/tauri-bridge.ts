// src/lib/tauri-bridge.ts
// Type-safe wrappers for all Tauri commands
// This provides a clean API for React components to interact with the Rust backend

import type { Preferences } from '@/lib/preferences/types'
import { invoke } from '@tauri-apps/api/core'
import type {
  CalibrationData,
  SessionRecord,
  ReflectionObject,
  ParkingLotItem,
  ParkingLotItemUpdate,
  RecoveryData,
  UserData,
  NightEvent,
  NightEventKind,
} from './tauri-types'
import type { TelemetryEvent } from './telemetry'
import type { 
  UserBadge, 
  Streak, 
  BadgeEvaluationResult, 
  SessionStatsForBadges 
} from '@/lib/badges/types'

import type { PermissionState } from '@/lib/permissions/types'
import type { 
  AllPresetsResponse, 
  SessionPreset, 
  CreatePresetInput,
  QuickStartConfig 
} from '@/lib/presets/types'

// Calendar event type (matching Rust CalendarEvent)
export interface CalendarEvent {
  title: string
  startIso: string
  endIso: string
  calendar: string
}

// Telemetry stats type (matching Rust SessionTelemetryStats)
export interface SessionTelemetryStats {
  appSwitches: number
  nonWhitelistedSwitches: number
  tabSwitches: number
  nonWhitelistedDomains: number
  timeInWhitelisted: number
  timeInNonWhitelisted: number
  appUsage: Record<string, number>
  domainVisits: Record<string, number>
}

export const tauriBridge = {
  // ============================================
  // CALIBRATION
  // ============================================

  saveCalibration: (data: CalibrationData): Promise<void> =>
    invoke('save_calibration', { data }),

  loadCalibration: (): Promise<CalibrationData | null> =>
    invoke('load_calibration'),

  getCalibrationHistory: (limit?: number): Promise<CalibrationData[]> =>
    invoke('get_calibration_history', { limit }),

  clearCalibration: (): Promise<void> =>
    invoke('clear_calibration'),

  // ============================================
  // SESSION
  // ============================================

  saveSession: (session: SessionRecord): Promise<void> =>
    invoke('save_session', { session }),

  getSession: (sessionId: string): Promise<SessionRecord | null> =>
    invoke('get_session', { sessionId }),

  getAllSessions: (startDate?: string, endDate?: string): Promise<SessionRecord[]> =>
    invoke('get_all_sessions', { startDate, endDate }),

  // ============================================
  // REFLECTION
  // ============================================

  saveReflection: (reflection: ReflectionObject): Promise<void> =>
    invoke('save_reflection', { reflection }),

  getReflection: (sessionId: string): Promise<ReflectionObject | null> =>
    invoke('get_reflection', { sessionId }),

  // ============================================
  // RECOVERY
  // ============================================

  saveRecoveryData: (data: RecoveryData): Promise<void> =>
    invoke('save_recovery_data', { data }),

  getRecoveryData: (): Promise<RecoveryData | null> =>
    invoke('get_recovery_data'),

  clearRecoveryData: (): Promise<void> =>
    invoke('clear_recovery_data'),

  // ============================================
  // PARKING LOT
  // ============================================

  addParkingLotItem: (text: string): Promise<ParkingLotItem> =>
    invoke('add_parking_lot_item', { text }),

  updateParkingLotItem: (id: string, updates: ParkingLotItemUpdate): Promise<void> =>
    invoke('update_parking_lot_item', { id, updates }),

  getActiveParkingLotItems: (): Promise<ParkingLotItem[]> =>
    invoke('get_active_parking_lot_items'),

  getNextSessionItems: (): Promise<ParkingLotItem[]> =>
    invoke('get_next_session_items'),

  deleteParkingLotItem: (id: string): Promise<void> =>
    invoke('delete_parking_lot_item', { id }),

  // ============================================
  // USER
  // ============================================

  saveUser: (
    email?: string,
    firstName?: string,
    operatorName?: string,
    defaultMode?: string
  ): Promise<void> =>
    invoke('save_user', { email, firstName, operatorName, defaultMode }),

  getUser: (): Promise<UserData | null> =>
    invoke('get_user'),

  // ============================================
  // PREFERENCES (night mode, tone, prompt style, AI pause)
  // ============================================

  getPreferences: (): Promise<Preferences> =>
    invoke('get_preferences'),

  savePreferences: (prefs: Preferences): Promise<void> =>
    invoke('save_preferences', { prefs }),

  // ============================================
  // NIGHT MODE EVENTS
  // ============================================

  recordNightEvent: (nightDate: string, kind: NightEventKind, detail?: string): Promise<NightEvent> =>
    invoke('record_night_event', { nightDate, kind, detail: detail ?? null }),

  getNightEvents: (nightDate: string): Promise<NightEvent[]> =>
    invoke('get_night_events', { nightDate }),

  countNightEvents: (nightDate: string, kind: NightEventKind): Promise<number> =>
    invoke('count_night_events', { nightDate, kind }),

  countNightsWithEventSince: (sinceDate: string, kind: NightEventKind): Promise<number> =>
    invoke('count_nights_with_event_since', { sinceDate, kind }),

  getLatestNightEvent: (kind: NightEventKind): Promise<NightEvent | null> =>
    invoke('get_latest_night_event', { kind }),

  // ============================================
  // UTILITIES
  // ============================================

  getWorkdayDate: (): Promise<string> =>
    invoke('get_workday_date'),

  generateUuid: (): Promise<string> =>
    invoke('generate_uuid'),

  // ============================================
  // CALENDAR (read-only, local)
  // ============================================

  getUpcomingEvents: (hoursAhead?: number): Promise<CalendarEvent[]> =>
    invoke('get_upcoming_events', { hoursAhead }),

  // ============================================
  // WINDOW (from Day 1)
  // ============================================

  resizeWindow: (width: number, height: number): Promise<void> =>
    invoke('resize_window', { width, height }),

  getWindowSize: (): Promise<{ width: number; height: number }> =>
    invoke('get_window_size'),

  startDragging: (): Promise<void> =>
    invoke('start_dragging'),

  setWindowPosition: (x: number, y: number): Promise<void> =>
    invoke('set_window_position', { x, y }),

  getWindowPosition: (): Promise<{ x: number; y: number }> =>
    invoke('get_window_position'),

  setAlwaysOnTop: (onTop: boolean): Promise<void> =>
    invoke('set_always_on_top', { onTop }),

  isAlwaysOnTop: (): Promise<boolean> =>
    invoke('is_always_on_top'),

  // ============================================
  // DATA MANAGEMENT
  // ============================================

  resetAllData: (): Promise<void> =>
    invoke('reset_all_data'),

  // ============================================
  // TELEMETRY
  // ============================================

  /**
   * Start the telemetry monitor for a session
   * This begins polling for active app changes every 2 seconds
   */
  startTelemetryMonitor: (
    sessionId: string,
    whitelistedApps: string[] = [],
    whitelistedDomains: string[] = []
  ): Promise<void> =>
    invoke('start_telemetry_monitor', {
      sessionId,
      whitelistedApps,
      whitelistedDomains,
    }),

  /**
   * Stop the telemetry monitor
   */
  stopTelemetryMonitor: (): Promise<void> =>
    invoke('stop_telemetry_monitor'),

  /**
   * Check if the telemetry monitor is running
   */
  isTelemetryRunning: (): Promise<boolean> =>
    invoke('is_telemetry_running'),

  /**
   * Get telemetry events for a session
   */
  getTelemetryEvents: (sessionId: string): Promise<TelemetryEvent[]> =>
    invoke('get_telemetry_events', { sessionId }),

  /**
   * Get telemetry stats for a session
   */
  getTelemetryStats: (sessionId: string): Promise<SessionTelemetryStats | null> =>
    invoke('get_telemetry_stats', { sessionId }),

  /**
   * Save telemetry stats for a session
   */
  saveTelemetryStats: (sessionId: string, stats: SessionTelemetryStats): Promise<void> =>
    invoke('save_telemetry_stats', { sessionId, stats }),

  // ============================================
  // APP DISCOVERY
  // ============================================

  /**
   * Get list of installed applications on the system
   */
  getSystemApps: (): Promise<InstalledApp[]> =>
    invoke('get_system_apps'),

  /**
   * Get list of installed browsers
   */
  getSystemBrowsers: (): Promise<InstalledApp[]> =>
    invoke('get_system_browsers'),

  /**
   * Focus/activate an application by name (like Alt+Tab)
   * Brings the specified app to the foreground
   * Returns true if successful, false otherwise
   */
  focusApp: (appName: string): Promise<boolean> =>
    invoke('focus_app', { appName }),

  /**
   * Minimize an application's window (Flow Mode intervention)
   * Hides the distracting app without closing it
   */
  minimizeApp: (appName: string): Promise<boolean> =>
    invoke('minimize_app', { appName }),

  /**
   * Close the current tab in a browser (Legend Mode intervention)
   * A strict intervention that closes the distracting content
   */
  closeBrowserTab: (browserName: string): Promise<boolean> =>
    invoke('close_browser_tab', { browserName }),

  // ============================================
  // BADGES & STREAKS
  // ============================================

  /**
   * Initialize badge tables (call on app startup)
   */
  initBadges: (): Promise<void> =>
    invoke('init_badges'),

  /**
   * Get all unlocked badges
   */
  getBadges: (): Promise<UserBadge[]> =>
    invoke('get_badges'),

  /**
   * Get recently unlocked badges
   */
  getRecentBadges: (limit: number): Promise<UserBadge[]> =>
    invoke('get_recent_unlocked_badges', { limit }),

  /**
   * Check if a specific badge is unlocked
   */
  checkBadgeUnlocked: (badgeId: string): Promise<boolean> =>
    invoke('check_badge_unlocked', { badgeId }),

  /**
   * Get all streaks
   */
  getStreaks: (): Promise<Streak[]> =>
    invoke('get_streaks'),

  /**
   * Get a specific streak by type
   */
  getStreak: (streakType: string): Promise<Streak> =>
    invoke('get_streak', { streakType }),

  /**
   * Check if daily streak is at risk
   */
  checkStreakAtRisk: (): Promise<boolean> =>
    invoke('check_streak_at_risk'),

  /**
   * Get a lifetime stat value
   */
  getStat: (key: string): Promise<number> =>
    invoke('get_stat', { key }),

  /**
   * Evaluate badges after session completion
   * This is the main entry point called when a session ends
   */
  evaluateBadgesForSession: (stats: SessionStatsForBadges): Promise<BadgeEvaluationResult> =>
    invoke('evaluate_badges_for_session', { stats }),

  /**
   * Get total unlocked badge count
   */
  getBadgeCount: (): Promise<number> =>
    invoke('get_badge_count'),

  /**
   * Record a share action (for share badges)
   */
  recordBadgeShare: async (): Promise<number> => {
    return invoke('record_badge_share')
  },

  // ============================================
  // PERMISSIONS
  // ============================================

  checkPermissions: async (): Promise<PermissionState> => {
    return invoke('check_permissions')
  },

  areAllPermissionsGranted: async (): Promise<boolean> => {
    return invoke('are_all_permissions_granted')
  },

  openSystemPermissions: async (): Promise<void> => {
    return invoke('open_system_permissions')
  },

  getCurrentPlatform: async (): Promise<string> => {
    return invoke('get_current_platform')
  },

  requestPermission: async (permissionType: string): Promise<void> => {
    return invoke('request_permission', { permissionType })
  },

  // ============================================
  // PRESETS
  // ============================================

  initPresets: async (): Promise<void> => {
    return invoke('init_presets')
  },

  getAllPresets: async (): Promise<AllPresetsResponse> => {
    return invoke('get_all_presets')
  },

  getPreset: async (id: string): Promise<SessionPreset> => {
    return invoke('get_preset', { id })
  },

  createUserPreset: async (input: CreatePresetInput): Promise<SessionPreset> => {
    return invoke('create_user_preset', { input })
  },

  updateUserPreset: async (input: { 
    id: string; 
    name?: string; 
    icon?: string;
    mode?: string;
    durationMinutes?: number;
    whitelistedApps?: string[];
    whitelistedDomains?: string[];
    useDefaultBlocklist?: boolean;
    includeMentalPrep?: boolean;
  }): Promise<SessionPreset> => {
    return invoke('update_user_preset', { input })
  },

  deleteUserPreset: async (id: string): Promise<void> => {
    return invoke('delete_user_preset', { id })
  },

  saveAsLastSession: async (
    mode: string,
    durationMinutes: number,
    whitelistedApps: string[],
    whitelistedDomains: string[],
    useDefaultBlocklist: boolean,
    includeMentalPrep: boolean
  ): Promise<void> => {
    return invoke('save_as_last_session', {
      mode,
      durationMinutes,
      whitelistedApps,
      whitelistedDomains,
      useDefaultBlocklist,
      includeMentalPrep,
    })
  },

  usePreset: async (id: string): Promise<SessionPreset> => {
    return invoke('use_preset', { id })
  },

  getQuickStartConfig: async (
    mode: string, 
    durationMinutes: number
  ): Promise<QuickStartConfig> => {
    return invoke('get_quick_start_config', { mode, durationMinutes })
  },

  getUserPresetCount: async (): Promise<number> => {
    return invoke('get_user_preset_count')
  },

  getBlockedDomains: async (): Promise<string[]> => {
    return invoke('get_blocked_domains')
  },

  getWhitelistedDomains: async (): Promise<string[]> => {
    return invoke('get_whitelisted_domains')
  },

}

/**
 * Installed application info from the OS
 */
export interface InstalledApp {
  name: string
  identifier: string
  path: string
  category: string | null
  isBrowser: boolean
}

// Re-export types for convenience
export type {
  CalibrationData,
  SessionRecord,
  ReflectionObject,
  ParkingLotItem,
  ParkingLotItemUpdate,
  RecoveryData,
  UserData,
  TimelineBlock,
  TimelineState,
  DistractionEvent,
  InterventionEvent,
  WhitelistedApp,
  WhitelistedTab,
  SessionMode,
  VictoryLevel,
  EndReason,
  ParkingLotStatus,
  ItemStatus,
  ItemCategory,
  ItemAction,
} from './tauri-types'


