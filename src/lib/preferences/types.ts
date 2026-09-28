// src/lib/preferences/types.ts
// User preferences absorbed from the retired Chrome extension.
// Mirrors src-tauri/src/storage/preferences.rs (camelCase over IPC).

export type Tone = 'gentle' | 'standard' | 'firm'
export type PromptStyle = 'mindfulness' | 'scientific' | 'spiritual'

export interface Preferences {
  nightModeEnabled: boolean
  /** "HH:MM" local time */
  nightModeStart: string
  /** "HH:MM" local time */
  nightModeEnd: string
  tone: Tone
  promptStyle: PromptStyle
  aiPauseEnabled: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  nightModeEnabled: true,
  nightModeStart: '20:00',
  nightModeEnd: '06:00',
  tone: 'standard',
  promptStyle: 'mindfulness',
  aiPauseEnabled: true,
}

export const TONES: Tone[] = ['gentle', 'standard', 'firm']
export const PROMPT_STYLES: PromptStyle[] = ['mindfulness', 'scientific', 'spiritual']
