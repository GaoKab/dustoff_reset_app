// src/features/desktop/panels/SettingsPanel/index.tsx
// Settings absorbed from the retired Chrome extension: night mode window,
// tone, prompt style and the AI-site pause. Everything is stored locally.

import { X, Moon, MessageCircle, Sparkles, Hourglass } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  TONES,
  PROMPT_STYLES,
  type Preferences,
  type Tone,
  type PromptStyle,
} from '@/lib/preferences/types'

interface SettingsPanelProps {
  preferences: Preferences
  onChange: (patch: Partial<Preferences>) => void
  onClose: () => void
}

const TONE_LABELS: Record<Tone, { label: string; hint: string }> = {
  gentle: { label: 'Gentle', hint: 'Softer wording, no countdown gates' },
  standard: { label: 'Standard', hint: 'The default balance' },
  firm: { label: 'Firm', hint: 'Direct wording, full escalation' },
}

const STYLE_LABELS: Record<PromptStyle, { label: string; hint: string }> = {
  mindfulness: { label: 'Mindfulness', hint: 'Breath, body, present moment' },
  scientific: { label: 'Scientific', hint: 'What rest does and why' },
  spiritual: { label: 'Spiritual', hint: 'Short lines from several traditions' },
}

function isMacOS(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
}

function SegmentedChoice<T extends string>({
  options,
  value,
  labels,
  onSelect,
}: {
  options: T[]
  value: T
  labels: Record<T, { label: string; hint: string }>
  onSelect: (v: T) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(option => {
        const active = option === value
        return (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`p-3 rounded-lg border text-left transition-all ${
              active
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 bg-[#0a0f0d]/80 hover:bg-zinc-800/50 hover:border-zinc-500'
            }`}
          >
            <div className={`text-sm font-light ${active ? 'text-emerald-400' : 'text-white'}`}>
              {labels[option].label}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1 leading-snug">{labels[option].hint}</div>
          </button>
        )
      })}
    </div>
  )
}

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-1.5 bg-emerald-500/15 rounded-lg text-emerald-400 shrink-0">{icon}</div>
      <div>
        <div className="text-sm text-white font-light">{title}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{hint}</div>
      </div>
    </div>
  )
}

export function SettingsPanel({ preferences, onChange, onClose }: SettingsPanelProps) {
  const aiPauseAvailable = isMacOS()

  return (
    <div className="w-[475px] rounded-3xl bg-[#0a0f0d]/55 backdrop-blur-xl border border-emerald-500/30 shadow-2xl overflow-hidden">
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-light text-emerald-400">Settings</h2>
            <p className="text-sm text-zinc-400 mt-1">How the app talks to you, and when it goes quiet.</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mt-1 -mr-1"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Night mode */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <SectionTitle
              icon={<Moon className="w-4 h-4" />}
              title="Night mode"
              hint="The HUD softens and nudges shift to winding down."
            />
            <Switch
              checked={preferences.nightModeEnabled}
              onCheckedChange={checked => onChange({ nightModeEnabled: checked })}
              className="data-[state=checked]:bg-emerald-500"
              aria-label="Night mode"
            />
          </div>
          <div className={`flex items-center gap-3 pl-10 ${preferences.nightModeEnabled ? '' : 'opacity-50'}`}>
            <label className="text-xs text-zinc-400">From</label>
            <input
              type="time"
              value={preferences.nightModeStart}
              disabled={!preferences.nightModeEnabled}
              onChange={e => e.target.value && onChange({ nightModeStart: e.target.value })}
              className="bg-[#0a0f0d]/80 border border-zinc-700 rounded-md px-2 py-1 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <label className="text-xs text-zinc-400">to</label>
            <input
              type="time"
              value={preferences.nightModeEnd}
              disabled={!preferences.nightModeEnabled}
              onChange={e => e.target.value && onChange({ nightModeEnd: e.target.value })}
              className="bg-[#0a0f0d]/80 border border-zinc-700 rounded-md px-2 py-1 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Tone */}
        <div className="space-y-3">
          <SectionTitle
            icon={<MessageCircle className="w-4 h-4" />}
            title="Tone"
            hint="How nudges are worded and how far they escalate."
          />
          <SegmentedChoice
            options={TONES}
            value={preferences.tone}
            labels={TONE_LABELS}
            onSelect={tone => onChange({ tone })}
          />
        </div>

        {/* Prompt style */}
        <div className="space-y-3">
          <SectionTitle
            icon={<Sparkles className="w-4 h-4" />}
            title="Prompt style"
            hint="The flavour of reset prompts and nudge copy."
          />
          <SegmentedChoice
            options={PROMPT_STYLES}
            value={preferences.promptStyle}
            labels={STYLE_LABELS}
            onSelect={promptStyle => onChange({ promptStyle })}
          />
        </div>

        {/* AI-site pause */}
        <div className="flex items-center justify-between gap-4">
          <SectionTitle
            icon={<Hourglass className="w-4 h-4" />}
            title="AI-site pause"
            hint={
              aiPauseAvailable
                ? 'A short Hold. Stay here. when you tab away from an AI chat mid-answer.'
                : 'Needs browser tab detection, which is macOS only for now.'
            }
          />
          <Switch
            checked={preferences.aiPauseEnabled}
            disabled={!aiPauseAvailable}
            onCheckedChange={checked => onChange({ aiPauseEnabled: checked })}
            className="data-[state=checked]:bg-emerald-500"
            aria-label="AI-site pause"
          />
        </div>

        <p className="text-[11px] text-zinc-600 text-center">Saved locally. Nothing leaves this machine.</p>
      </div>
    </div>
  )
}
