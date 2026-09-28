// src/lib/preferences/types.ts
// User preferences absorbed from the retired Chrome extension.
// Mirrors src-tauri/src/storage/preferences.rs (camelCase over IPC).

export type Tone = 'gentle' | 'standard' | 'firm'
export type PromptStyle = 'mindfulness' | 'scientific' | 'spiritual'

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
  emergencyOverrideEnabled: true,
  tone: 'standard',
  promptStyle: 'mindfulness',
  aiPauseEnabled: true,
}

export const TONES: Tone[] = ['gentle', 'standard', 'firm']
export const PROMPT_STYLES: PromptStyle[] = ['mindfulness', 'scientific', 'spiritual']
