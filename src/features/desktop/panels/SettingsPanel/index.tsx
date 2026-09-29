// src/features/desktop/panels/SettingsPanel/index.tsx
// Settings absorbed from the retired Chrome extension: night mode and the
// work schedule it follows ("When do you usually work?"), the emergency
// override, tone, prompt style and the AI-site pause. Everything is
// stored locally.
//
// Edits live in a local draft until Save. Nothing is written, and no
// night phase is re-derived, while the person is still typing a time:
// saving each keystroke used to move the phases mid-edit, and a flip into
// night protection let the STOP screen replace this panel.

import { useState } from 'react'
import { X, Moon, MessageCircle, Sparkles, Hourglass, Clock, Briefcase } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  TONES,
  PROMPT_STYLES,
  SCHEDULE_MODES,
  WORK_DAY_LABELS,
  type Preferences,
  type Tone,
  type PromptStyle,
  type ScheduleMode,
} from '@/lib/preferences/types'
import { derivePhaseBounds, describeNightBounds, describeDaysOff } from '@/lib/night/schedule'
import { normalizeDraftClocks, preferencesPatch, validatePreferencesDraft } from '@/lib/settings-flow'

interface SettingsPanelProps {
  preferences: Preferences
  /** Fields to start the draft with, e.g. the mode picked on the first-run card */
  initialPatch?: Partial<Preferences> | null
  /** One save, on Save, with only the fields that changed */
  onSave: (patch: Partial<Preferences>) => void
  /** Cancel: the draft is dropped */
  onClose: () => void
}

const TONE_LABELS: Record<Tone, { label: string; hint: string }> = {
  gentle: { label: 'Gentle', hint: 'Softer wording, no countdown gates' },
  standard: { label: 'Standard', hint: 'The default balance' },
  firm: { label: 'Firm', hint: 'Direct wording, full escalation' },
}

/** Plain copy for the three schedule choices; shared with the first-run card. */
export const SCHEDULE_LABELS: Record<ScheduleMode, { label: string; hint: string }> = {
  standard: { label: 'Regular daytime hours (default)', hint: 'Wind-down in the evening, night protection from midnight to 6:00 am.' },
  night_shift: { label: 'I work nights or rotating shifts', hint: 'Night mode follows your shift: it starts an hour after work ends.' },
  custom: { label: 'Custom', hint: 'Set your own days and hours; night mode fits around them.' },
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

type BoundKey = 'nightModeStart' | 'shutdownStart' | 'protectionStart' | 'nightModeEnd'

function PhaseRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-zinc-400">{label}</label>
      <input
        type="time"
        value={value}
        disabled={disabled}
        // Whatever the browser hands over mid-edit goes into the draft as
        // is; it is normalised and validated once, on Save.
        onChange={e => onChange(e.target.value ?? '')}
        className="bg-[#0a0f0d]/80 border border-zinc-700 rounded-md px-2 py-1 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
      />
    </div>
  )
}

export function SettingsPanel({ preferences, initialPatch, onSave, onClose }: SettingsPanelProps) {
  const aiPauseAvailable = isMacOS()
  // The draft: local until Save. Seeded once from the saved preferences
  // plus whatever the caller wants preselected.
  const [draft, setDraft] = useState<Preferences>(() => ({ ...preferences, ...(initialPatch ?? {}) }))
  const [error, setError] = useState<string | null>(null)
  const edit = (patch: Partial<Preferences>) => {
    setDraft(prev => ({ ...prev, ...patch }))
    setError(null)
  }
  const changeBound = (key: BoundKey, value: string) => edit({ [key]: value })

  const handleSave = () => {
    const problem = validatePreferencesDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    const normalized = normalizeDraftClocks(draft) ?? draft
    onSave(preferencesPatch(preferences, normalized))
  }

  const nightEnabled = draft.nightModeEnabled
  const scheduled = !draft.phaseOverride && draft.scheduleMode !== 'standard'
  const derived = derivePhaseBounds(draft)
  const daysOffLine = describeDaysOff(draft)
  const toggleDay = (i: number) => {
    const workDays = draft.workDays.map((d, idx) => (idx === i ? !d : d))
    edit({ workDays })
  }
  const dirty = Object.keys(preferencesPatch(preferences, draft)).length > 0

  return (
    <div className="w-[475px] rounded-3xl bg-[#0a0f0d]/55 backdrop-blur-xl border border-emerald-500/30 shadow-2xl overflow-hidden">
      <div className="p-6 space-y-6 max-h-[720px] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-light text-emerald-400">Settings</h2>
            <p className="text-sm text-zinc-400 mt-1">How the app talks to you, and when it goes quiet.</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mt-1 -mr-1"
            aria-label="Cancel"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Night mode */}
        <div className="flex items-center justify-between gap-4">
          <SectionTitle
            icon={<Moon className="w-4 h-4" />}
            title="Night mode"
            hint="Three phases: wind-down softens the HUD, shutdown offers a 15 minute close, night protection asks before you start."
          />
          <Switch
            checked={draft.nightModeEnabled}
            onCheckedChange={checked => edit({ nightModeEnabled: checked })}
            className="data-[state=checked]:bg-emerald-500"
            aria-label="Night mode"
          />
        </div>

        {/* Work schedule: night mode follows the person's day, not the clock */}
        <div className={`space-y-3 ${draft.nightModeEnabled ? '' : 'opacity-50'}`}>
          <SectionTitle
            icon={<Briefcase className="w-4 h-4" />}
            title="When do you usually work?"
            hint="Night mode fits around your working day, so it works for night shifts too."
          />
          <div className="space-y-2">
            {SCHEDULE_MODES.map(mode => {
              const active = mode === draft.scheduleMode
              return (
                <button
                  key={mode}
                  disabled={!nightEnabled}
                  onClick={() => edit({ scheduleMode: mode, scheduleSetupDone: true })}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-700 bg-[#0a0f0d]/80 hover:bg-zinc-800/50 hover:border-zinc-500'
                  }`}
                >
                  <div className={`text-sm font-light ${active ? 'text-emerald-400' : 'text-white'}`}>
                    {SCHEDULE_LABELS[mode].label}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{SCHEDULE_LABELS[mode].hint}</div>
                </button>
              )
            })}
          </div>

          {scheduled && (
            <div className="pl-1 space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs text-zinc-400">Work days</div>
                <div className="flex gap-1.5">
                  {WORK_DAY_LABELS.map((label, i) => {
                    const on = draft.workDays[i] === true
                    return (
                      <button
                        key={label}
                        disabled={!nightEnabled}
                        onClick={() => toggleDay(i)}
                        aria-pressed={on}
                        className={`flex-1 py-1.5 rounded-md border text-[11px] transition-colors ${
                          on
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                            : 'border-zinc-700 bg-[#0a0f0d]/80 text-zinc-500 hover:border-zinc-500'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <PhaseRow
                label="Work starts"
                value={draft.workStart}
                disabled={!nightEnabled}
                onChange={v => edit({ workStart: v })}
              />
              <PhaseRow
                label="Work ends"
                value={draft.workEnd}
                disabled={!nightEnabled}
                onChange={v => edit({ workEnd: v })}
              />
              {draft.scheduleMode === 'night_shift' && (
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-zinc-400">Keep my shift rhythm on days off</label>
                  <Switch
                    checked={draft.keepShiftRhythmOnDaysOff}
                    disabled={!nightEnabled}
                    onCheckedChange={checked => edit({ keepShiftRhythmOnDaysOff: checked })}
                    className="data-[state=checked]:bg-emerald-500"
                    aria-label="Keep my shift rhythm on days off"
                  />
                </div>
              )}
            </div>
          )}

          {/* Live preview of the derived phases, in plain words */}
          <div className="pl-1 space-y-1">
            <p className="text-xs text-emerald-200/90 leading-snug">{describeNightBounds(derived.bounds)}</p>
            {derived.problem && <p className="text-xs text-amber-300/90 leading-snug">{derived.problem}</p>}
            {daysOffLine && <p className="text-[11px] text-zinc-500 leading-snug">{daysOffLine}</p>}
          </div>

          {/* Advanced: the four explicit times win over the schedule */}
          <div className="pl-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-zinc-400">Set the phase times myself</label>
              <Switch
                checked={draft.phaseOverride}
                disabled={!nightEnabled}
                onCheckedChange={checked => edit({ phaseOverride: checked })}
                className="data-[state=checked]:bg-emerald-500"
                aria-label="Set the phase times myself"
              />
            </div>
            {draft.phaseOverride && (
              <div className="space-y-2">
                <PhaseRow
                  label="Wind-down from"
                  value={draft.nightModeStart}
                  disabled={!nightEnabled}
                  onChange={v => changeBound('nightModeStart', v)}
                />
                <PhaseRow
                  label="Shutdown from"
                  value={draft.shutdownStart}
                  disabled={!nightEnabled}
                  onChange={v => changeBound('shutdownStart', v)}
                />
                <PhaseRow
                  label="Night protection from"
                  value={draft.protectionStart}
                  disabled={!nightEnabled}
                  onChange={v => changeBound('protectionStart', v)}
                />
                <PhaseRow
                  label="Night ends at"
                  value={draft.nightModeEnd}
                  disabled={!nightEnabled}
                  onChange={v => changeBound('nightModeEnd', v)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Emergency override */}
        <div className={`flex items-center justify-between gap-4 ${draft.nightModeEnabled ? '' : 'opacity-50'}`}>
          <SectionTitle
            icon={<Clock className="w-4 h-4" />}
            title="Allow emergency override"
            hint="During night protection, a 30 minute override with a visible countdown, at most twice a night. Off means the STOP screen offers sleep and habit choices only."
          />
          <Switch
            checked={draft.emergencyOverrideEnabled}
            disabled={!draft.nightModeEnabled}
            onCheckedChange={checked => edit({ emergencyOverrideEnabled: checked })}
            className="data-[state=checked]:bg-emerald-500"
            aria-label="Allow emergency override"
          />
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
            value={draft.tone}
            labels={TONE_LABELS}
            onSelect={tone => edit({ tone })}
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
            value={draft.promptStyle}
            labels={STYLE_LABELS}
            onSelect={promptStyle => edit({ promptStyle })}
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
            checked={draft.aiPauseEnabled}
            disabled={!aiPauseAvailable}
            onCheckedChange={checked => edit({ aiPauseEnabled: checked })}
            className="data-[state=checked]:bg-emerald-500"
            aria-label="AI-site pause"
          />
        </div>

        <p className="text-[11px] text-zinc-600 text-center">Saved locally. Nothing leaves this machine.</p>
      </div>

      {/* One save, at the end. Cancel drops the draft. */}
      <div className="px-6 py-4 border-t border-zinc-800/80 space-y-2">
        {error && (
          <p className="text-xs text-amber-300/90 leading-snug" role="alert">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-sm font-light transition-colors"
          >
            {dirty ? 'Save' : 'Done'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-light transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
