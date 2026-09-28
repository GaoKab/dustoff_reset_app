// src/lib/tauri-types.ts
// TypeScript type definitions matching Rust models
// These types must match EXACTLY with the Rust structs (camelCase because we use serde rename_all)

// ============================================
// CALIBRATION
// ============================================

export interface CalibrationData {
  date: string                    // YYYY-MM-DD
  calibrationScore: number        // 0-100
  sleepHours: number              // 0-12
  sleepQuality: number            // 1-10
  emotionalResidue: number        // 1-10
  emotionalState: string          // Energized|Focused|Calm|Tired|Anxious|Scattered
  distractions: string[]          // Array of distraction types
  timestamp: number               // Unix timestamp ms
}

// ============================================
// SESSION
// ============================================

export type TimelineState = 'flow' | 'working' | 'distracted' | 'reset'

export interface TimelineBlock {
  start: number                   // Minutes from session start
  end: number
  state: TimelineState
}

export interface DistractionEvent {
  timestamp: number               // Milliseconds since session start
  type: string                    // Type of distraction
}

export interface InterventionEvent {
  timestamp: number               // Milliseconds since session start
  type: string                    // Type of intervention (breath, walk, dump, etc.)
}

export interface WhitelistedApp {
  appName: string
  purpose: string | null
}

export interface WhitelistedTab {
  url: string
  title: string
  purpose: string | null
}

export type SessionMode = 'Zen' | 'Flow' | 'Legend'
export type VictoryLevel = 'Minimum' | 'Good' | 'Legend' | 'Missed'
export type EndReason = 'completed' | 'mission_complete' | 'stopping_early' | 'pulled_away'

export interface SessionRecord {
  sessionId: string
  startedAt: string               // ISO 8601
  endedAt: string | null
  plannedDurationMinutes: number
  actualDurationMinutes: number | null
  mode: SessionMode
  intention: string | null
  victoryLevel: VictoryLevel | null
  flowEfficiency: number | null   // 0-100
  longestStreakMinutes: number
  distractionAttempts: number
  interventionsUsed: number
  endReason: EndReason | null
  endSubReason: string | null
  timelineBlocks: TimelineBlock[]
  distractionEvents: DistractionEvent[]
  interventionEvents: InterventionEvent[]
  whitelistedApps: WhitelistedApp[]
  whitelistedTabs: WhitelistedTab[]
}

// ============================================
// REFLECTION
// ============================================

export interface ReflectionObject {
  sessionId: string
  whatWentWell: string
  frictionNotes: string | null
  closingEnergy: number           // 1-5 emoji scale
  skipped: boolean
  createdAt: string               // ISO 8601
}

// ============================================
// PARKING LOT
// ============================================

export type ParkingLotStatus = 'OPEN' | 'COMPLETED' | 'DELETED'
export type ItemStatus = 'new' | 'in-progress' | 'done'
export type ItemCategory = 'task' | 'idea' | 'reminder' | 'distraction'
export type ItemAction = 'next-session' | 'keep' | 'delete'

export interface ParkingLotItem {
  id: string
  text: string
  timestamp: number               // Unix timestamp ms
  status: ParkingLotStatus
  itemStatus: ItemStatus | null
  category: ItemCategory | null
  tags: string[]
  action: ItemAction | null
  sessionId: string | null
  resolvedAt: string | null       // ISO 8601
}

// Partial update type for update_parking_lot_item command
export interface ParkingLotItemUpdate {
  text?: string
  status?: ParkingLotStatus
  itemStatus?: ItemStatus
  category?: ItemCategory
  tags?: string[]
  action?: ItemAction
  sessionId?: string
  resolvedAt?: string
}

// ============================================
// RECOVERY
// ============================================

export interface RecoveryData {
  sessionId: string
  startedAt: string               // ISO 8601
  plannedDurationMinutes: number
  mode: SessionMode
  intention: string | null
  elapsedSeconds: number
  bandwidthAtPause: number | null // 0-100
  whitelistedApps: string[]       // App names to whitelist
  whitelistedTabs: string[]       // Domains/tabs to whitelist
}

// ============================================
// USER
// ============================================

export interface UserData {
  email: string | null
  firstName: string | null
  operatorName: string | null
  defaultMode: string             // Zen, Flow, or Legend
}

// ============================================
// TAURI COMMAND TYPES
// ============================================

// Helper type for Tauri invoke results
export type TauriResult<T> = T | null

// Command parameter types
// ============================================
// NIGHT MODE EVENTS
// ============================================

export type NightEventKind =
  | 'wind_down_shown'
  | 'shutdown_completed'
  | 'protection_stop'
  | 'override'
  | 'cant_sleep'
  | 'habit'
  | 'session_end'

export interface NightEvent {
  id: number
  nightDate: string               // YYYY-MM-DD, the evening the night belongs to
  kind: NightEventKind | string
  detail: string | null
  createdAt: string               // ISO 8601
}

export interface GetAllSessionsParams {
  startDate?: string              // YYYY-MM-DD
  endDate?: string                // YYYY-MM-DD
}

export interface SaveUserParams {
  email?: string
  firstName?: string
  operatorName?: string
  defaultMode?: string
}
