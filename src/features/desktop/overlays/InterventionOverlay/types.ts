export type InterventionType = "friction" | "focus-slipping" | "non-whitelisted-app" | "tab-switch"

export type SessionMode = "Zen" | "Flow" | "Legend"

export interface InterventionOverlayProps {
  isOpen: boolean
  type: InterventionType
  mode: SessionMode
  details?: {
    appName?: string
    tabCount?: number
    duration?: number
  }
  /** Copy from the tone/prompt-style table; falls back to the built-in text */
  copy?: {
    title: string
    message: string
    action: string
  }
  onDismiss: () => void
  onAction?: () => void
}
