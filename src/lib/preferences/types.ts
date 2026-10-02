// src/lib/preferences/types.ts
// User preferences absorbed from the retired Chrome extension.
// Mirrors src-tauri/src/storage/preferences.rs (camelCase over IPC).

export type Tone = 'gentle' | 'standard' | 'firm'
export type PromptStyle = 'mindfulness' | 'scientific' | 'spiritual'
/**
 * When the person usually works. `standard` keeps the usual evening clock;
 * `night_shift` and `custom` derive the night phases from the work hours
 * (see src/lib/night/schedule.ts). The two derive identically; the mode
 * changes the copy and unlocks "keep my shift rhythm on days off".
 */
export type ScheduleMode = 'standard' | 'night_shift' | 'custom'

export interface Preferences {
  nightModeEnabled: boolean
  /** Wind-down starts here, "HH:MM" local time. Start of the night window. */
  nightModeStart: string
  /** Shutdown protocol phase starts here, "HH:MM" */
  shutdownStart: string
  /** Night protection starts here, "HH:MM" */
  protectionStart: string
  /** Night protection ends here, "HH:MM". End of the night window. */
  nightModeEnd: string
  /** Advanced: the four explicit phase fields win over the schedule */
  phaseOverride: boolean
  scheduleMode: ScheduleMode
  /** Work days, Monday first */
  workDays: boolean[]
  /** Work starts here, "HH:MM"; may be later than workEnd (a night shift) */
  workStart: string
  /** Work ends here, "HH:MM" */
  workEnd: string
  /** night_shift only: keep the shifted night on days off (default off) */
  keepShiftRhythmOnDaysOff: boolean
  /** The first-run "When do you usually work?" card has been answered */
  scheduleSetupDone: boolean
  /** Allow the 30-minute emergency override during night protection */
  emergencyOverrideEnabled: boolean
  tone: Tone
  promptStyle: PromptStyle
  aiPauseEnabled: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  nightModeEnabled: true,
  nightModeStart: '20:00',
  shutdownStart: '22:00',
  protectionStart: '00:00',
  nightModeEnd: '06:00',
  phaseOverride: false,
  scheduleMode: 'standard',
  workDays: [true, true, true, true, true, false, false],
  workStart: '09:00',
  workEnd: '17:00',
  keepShiftRhythmOnDaysOff: false,
  scheduleSetupDone: false,
  emergencyOverrideEnabled: true,
  tone: 'standard',
  promptStyle: 'mindfulness',
  aiPauseEnabled: true,
}

export const TONES: Tone[] = ['gentle', 'standard', 'firm']
export const PROMPT_STYLES: PromptStyle[] = ['mindfulness', 'scientific', 'spiritual']
export const SCHEDULE_MODES: ScheduleMode[] = ['standard', 'night_shift', 'custom']
/** Short day labels, Monday first, matching `workDays` */
export const WORK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
