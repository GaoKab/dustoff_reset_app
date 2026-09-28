// src/components/NightNudges.tsx
// Small cards that sit under the HUD during the night phases. Ported from
// the extension's evening behaviour. None of them force anything.
// - WindDownCard: once per evening in wind-down, activities and an estimate
// - ShutdownNudge: once per evening in shutdown, offers the 15-minute protocol
// - OverrideCountdownCard: visible countdown while an emergency override runs
// - LateStartLine: one line above the session start flow late at night
// - ScheduleSetupCard: the first-run "When do you usually work?" question

import { useState } from 'react'
import { Moon, Sunset, X, Clock, Check, Briefcase } from 'lucide-react'
import { NIGHT_COPY } from '@/lib/copy'
import { formatCountdown } from '@/lib/night'
import { SCHEDULE_MODES, type ScheduleMode } from '@/lib/preferences/types'
import { SCHEDULE_LABELS } from '@/features/desktop/panels/SettingsPanel'

// ============================================
// WIND-DOWN CARD
// ============================================

interface WindDownCardProps {
  /** "About N minutes" from estimateWindDownMinutes */
  estimateMinutes: number
  onDismiss: () => void
}

export function WindDownCard({ estimateMinutes, onDismiss }: WindDownCardProps) {
  const [checked, setChecked] = useState<boolean[]>(() => NIGHT_COPY.windDownActivities.map(() => false))

  const toggle = (i: number) => setChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)))

  return (
    <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-[320px] rounded-2xl bg-[#0a0f0d]/90 backdrop-blur-xl border border-amber-400/30 shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-amber-500/20 rounded-lg flex-shrink-0">
            <Sunset className="w-4 h-4 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-light">{NIGHT_COPY.windDownTitle}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{NIGHT_COPY.windDownBody}</p>
            <p className="text-xs text-amber-200/90 mt-1.5">{NIGHT_COPY.windDownEstimate(estimateMinutes)}</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
            title={NIGHT_COPY.windDownDismiss}
            aria-label={NIGHT_COPY.windDownDismiss}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {NIGHT_COPY.windDownActivities.map((activity, i) => (
            <li key={activity}>
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-2 text-left text-xs text-zinc-300 hover:text-white transition-colors"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    checked[i] ? 'bg-amber-400/30 border-amber-300' : 'border-zinc-600'
                  }`}
                >
                  {checked[i] && <Check className="w-3 h-3 text-amber-200" />}
                </span>
                <span className={checked[i] ? 'line-through text-zinc-500' : ''}>{activity}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={onDismiss}
          className="mt-3 w-full py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm font-light transition-colors"
        >
          {NIGHT_COPY.windDownDismiss}
        </button>
      </div>
    </div>
  )
}

// ============================================
// SHUTDOWN NUDGE
// ============================================

interface ShutdownNudgeProps {
  onStart: () => void
  onDismiss: () => void
}

export function ShutdownNudge({ onStart, onDismiss }: ShutdownNudgeProps) {
  return (
    <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-[320px] rounded-2xl bg-[#0a0f0d]/90 backdrop-blur-xl border border-indigo-400/30 shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-indigo-500/20 rounded-lg flex-shrink-0">
            <Moon className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-light">{NIGHT_COPY.shutdownNudgeTitle}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{NIGHT_COPY.shutdownNudgeBody}</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
            title={NIGHT_COPY.shutdownNudgeDismiss}
            aria-label={NIGHT_COPY.shutdownNudgeDismiss}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onStart}
            className="flex-1 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-sm font-light transition-colors"
          >
            {NIGHT_COPY.shutdownNudgeAction}
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-light transition-colors"
          >
            {NIGHT_COPY.shutdownNudgeDismiss}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// OVERRIDE COUNTDOWN
// ============================================

interface OverrideCountdownCardProps {
  secondsLeft: number
  totalSeconds: number
  onEnd: () => void
}

export function OverrideCountdownCard({ secondsLeft, totalSeconds, onEnd }: OverrideCountdownCardProps) {
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100)) : 0
  return (
    <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-[320px] rounded-2xl bg-[#0a0f0d]/90 backdrop-blur-xl border border-amber-400/40 shadow-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-500/20 rounded-lg flex-shrink-0">
            <Clock className="w-4 h-4 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-light">{NIGHT_COPY.overrideTitle}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{NIGHT_COPY.overrideBody}</p>
          </div>
          <div className="text-xl font-mono text-amber-200 tabular-nums">{formatCountdown(secondsLeft)}</div>
        </div>
        <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400/70 transition-all duration-1000" style={{ width: `${progress}%` }} />
        </div>
        <button
          onClick={onEnd}
          className="mt-3 w-full py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm font-light transition-colors"
        >
          {NIGHT_COPY.overrideEnd}
        </button>
      </div>
    </div>
  )
}

// ============================================
// LATE START LINE
// ============================================

export function LateStartLine() {
  return (
    <div className="mb-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0a0f0d]/80 border border-indigo-400/20 text-xs text-indigo-200/90">
      <Moon className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />
      <span>{NIGHT_COPY.lateStartLine}</span>
    </div>
  )
}

// ============================================
// SCHEDULE SETUP (first run, once)
// ============================================

interface ScheduleSetupCardProps {
  /** The person picked one of the three; the caller saves it and, for a
   *  shift or custom schedule, opens Settings to fill in the hours */
  onChoose: (mode: ScheduleMode) => void
  /** "Later" keeps the standard clock and does not ask again */
  onLater: () => void
}

export function ScheduleSetupCard({ onChoose, onLater }: ScheduleSetupCardProps) {
  return (
    <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-[320px] rounded-2xl bg-[#0a0f0d]/90 backdrop-blur-xl border border-emerald-400/30 shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-emerald-500/20 rounded-lg flex-shrink-0">
            <Briefcase className="w-4 h-4 text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-light">When do you usually work?</p>
            <p className="text-xs text-zinc-400 mt-0.5">Night mode fits around your day. You can change this any time in Settings.</p>
          </div>
          <button
            onClick={onLater}
            className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
            title="Later"
            aria-label="Later"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 space-y-1.5">
          {SCHEDULE_MODES.map(mode => (
            <button
              key={mode}
              onClick={() => onChoose(mode)}
              className="w-full p-2.5 rounded-lg border border-zinc-700 bg-zinc-900/60 hover:border-emerald-500/60 hover:bg-emerald-500/10 text-left transition-colors"
            >
              <div className="text-xs text-white font-light">{SCHEDULE_LABELS[mode].label}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{SCHEDULE_LABELS[mode].hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
