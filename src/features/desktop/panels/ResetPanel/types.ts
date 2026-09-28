export type RitualType = "breath" | "walk" | "dump" | "personal"

export interface RitualOption {
  id: RitualType
  label: string
  duration: number
  description: string
}

export interface RitualCompletionData {
  ritualType: RitualType
  plannedDuration: number   // How long they selected (seconds)
  actualDuration: number    // How long they actually spent (seconds)
  wasSkipped: boolean       // Did they skip early?
}

export interface ResetPanelProps {
  isOpen: boolean
  onClose: () => void
  onSelectRitual: (ritualType: RitualType) => void
  onRitualComplete?: (data: RitualCompletionData) => void  // Called when ritual actually finishes
  sessionMode?: "Zen" | "Flow" | "Legend"
  /** Wording from the tone/prompt-style table; falls back to the built-in text */
  copy?: {
    heading: string
    subheading: string
    prompt: string
  }
}
