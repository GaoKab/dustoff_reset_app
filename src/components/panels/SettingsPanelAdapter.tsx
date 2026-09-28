// src/components/panels/SettingsPanelAdapter.tsx
// Wraps SettingsPanel with PanelContainer, matching the other panel adapters.

import { PanelContainer } from '@/components/PanelContainer'
import { SettingsPanel } from '@/features/desktop/panels/SettingsPanel'
import type { Preferences } from '@/lib/preferences/types'

interface SettingsPanelAdapterProps {
  isOpen: boolean
  preferences: Preferences
  onChange: (patch: Partial<Preferences>) => void
  onClose: () => void
}

export function SettingsPanelAdapter({ isOpen, preferences, onChange, onClose }: SettingsPanelAdapterProps) {
  return (
    <PanelContainer isOpen={isOpen}>
      <SettingsPanel preferences={preferences} onChange={onChange} onClose={onClose} />
    </PanelContainer>
  )
}

export type { SettingsPanelAdapterProps }
