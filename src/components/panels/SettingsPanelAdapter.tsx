// src/components/panels/SettingsPanelAdapter.tsx
// Wraps SettingsPanel with PanelContainer, matching the other panel adapters.

import { PanelContainer } from '@/components/PanelContainer'
import { SettingsPanel } from '@/features/desktop/panels/SettingsPanel'
import type { Preferences } from '@/lib/preferences/types'

interface SettingsPanelAdapterProps {
  isOpen: boolean
  preferences: Preferences
  /** Fields to preselect in the draft (the first-run card's choice) */
  initialPatch?: Partial<Preferences> | null
  /** One save, on Save, with only the fields that changed */
  onSave: (patch: Partial<Preferences>) => void
  /** Cancel: the draft is dropped */
  onClose: () => void
}

export function SettingsPanelAdapter({ isOpen, preferences, initialPatch, onSave, onClose }: SettingsPanelAdapterProps) {
  return (
    <PanelContainer isOpen={isOpen}>
      <SettingsPanel preferences={preferences} initialPatch={initialPatch} onSave={onSave} onClose={onClose} />
    </PanelContainer>
  )
}

export type { SettingsPanelAdapterProps }
