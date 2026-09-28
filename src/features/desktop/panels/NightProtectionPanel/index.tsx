// src/features/desktop/panels/NightProtectionPanel/index.tsx
// Night Protection, ported from the extension's night-mode.js and the
// night-mode client's NightProtectionView plus its interventions
// (UrgentWorkChallenge, SleepTechniques, CalmingExercises). Full-panel STOP
// screen with three honest choices. Dismissible. Never locks the machine.

import { useState } from 'react'
import { AlertTriangle, Moon, X, ArrowLeft, Clock, BedDouble, Wind } from 'lucide-react'
import { NIGHT_COPY, SLEEP_TECHNIQUES, CALMING_EXERCISES, type TechniqueCopy } from '@/lib/copy'
import { canStartOverride, overridesRemaining, OVERRIDE_MINUTES } from '@/lib/night'

export type NightProtectionView = 'stop' | 'urgent' | 'cant-sleep' | 'habit' | 'override-ended'

interface NightProtectionPanelProps {
  /** Bandwidth at the last calibration or session end, or null if unknown */
  bandwidthScore: number | null
  /** Overrides already used tonight (from night events) */
  overrideUsedTonight: number
  /** The Settings toggle */
  overrideEnabled: boolean
  /** Start on the STOP screen (default) or on the "override ended" screen */
  initialView?: NightProtectionView
  onStartOverride: () => void
  /** Called once when the user picks "I can't sleep" (feeds the insomnia line) */
  onCantSleep: () => void
  /** Called once when the user picks "It is habit, not need" */
  onHabit: () => void
  /** Ends any session and returns to the dimmed idle HUD */
  onCloseForTonight: () => void
  onDismiss: () => void
}

function Choice({ title, hint, icon, onClick }: { title: string; hint: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/60 text-left transition-colors"
    >
      <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 shrink-0">{icon}</div>
      <div>
        <div className="text-sm text-white font-light">{title}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{hint}</div>
      </div>
    </button>
  )
}

function Technique({ t }: { t: TechniqueCopy }) {
  return (
    <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
      <p className="text-sm text-zinc-100 font-light mb-1.5">{t.title}</p>
      <ol className="space-y-1 list-decimal list-inside">
        {t.steps.map(step => (
          <li key={step} className="text-xs text-zinc-400 leading-relaxed">{step}</li>
        ))}
      </ol>
      {t.note && <p className="text-xs text-indigo-200/80 mt-2 leading-relaxed">{t.note}</p>}
    </div>
  )
}

const primaryButton = 'w-full py-2.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-100 text-sm font-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const quietButton = 'w-full py-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-light transition-colors'

export function NightProtectionPanel({
  bandwidthScore,
  overrideUsedTonight,
  overrideEnabled,
  initialView = 'stop',
  onStartOverride,
  onCantSleep,
  onHabit,
  onCloseForTonight,
  onDismiss,
}: NightProtectionPanelProps) {
  const [view, setView] = useState<NightProtectionView>(initialView)
  const [kit, setKit] = useState<'sleep' | 'calm'>('sleep')

  const overrideCheck = canStartOverride(overrideUsedTonight, overrideEnabled)
  const remaining = overridesRemaining(overrideUsedTonight)

  const goCantSleep = () => {
    onCantSleep()
    setView('cant-sleep')
  }

  const goHabit = () => {
    onHabit()
    setView('habit')
  }

  const BackToStop = () => (
    <button
      onClick={() => setView('stop')}
      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> {NIGHT_COPY.cantSleepBack}
    </button>
  )

  return (
    <div className="w-[475px] rounded-3xl bg-[#07090c]/85 backdrop-blur-xl border border-red-500/30 shadow-2xl overflow-hidden">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Moon className="w-5 h-5 text-indigo-300 animate-pulse" />
            <div className="text-xs text-zinc-500">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · computer opened
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mt-1 -mr-1"
            aria-label={NIGHT_COPY.stopDismiss}
            title={NIGHT_COPY.stopDismiss}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {view === 'stop' && (
          <>
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-3 text-red-400">
                <AlertTriangle className="w-7 h-7" />
                <h2 className="text-4xl font-light tracking-[0.2em]">{NIGHT_COPY.stopTitle}</h2>
              </div>
              <p className="text-lg text-zinc-100 font-light">{NIGHT_COPY.stopHeadline}</p>
              <p className="text-sm text-zinc-400">
                {bandwidthScore !== null
                  ? NIGHT_COPY.stopBandwidth(Math.round(bandwidthScore))
                  : NIGHT_COPY.stopBandwidthUnknown}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-zinc-300 text-center mb-3">{NIGHT_COPY.stopQuestion}</p>
              <Choice
                title={NIGHT_COPY.stopChoiceUrgent}
                hint={NIGHT_COPY.stopChoiceUrgentHint}
                icon={<Clock className="w-4 h-4" />}
                onClick={() => setView('urgent')}
              />
              <Choice
                title={NIGHT_COPY.stopChoiceCantSleep}
                hint={NIGHT_COPY.stopChoiceCantSleepHint}
                icon={<BedDouble className="w-4 h-4" />}
                onClick={goCantSleep}
              />
              <Choice
                title={NIGHT_COPY.stopChoiceHabit}
                hint={NIGHT_COPY.stopChoiceHabitHint}
                icon={<Wind className="w-4 h-4" />}
                onClick={goHabit}
              />
            </div>

            <p className="text-[11px] text-zinc-600 text-center leading-relaxed">{NIGHT_COPY.stopFooter}</p>
          </>
        )}

        {view === 'urgent' && (
          <div className="space-y-4">
            <BackToStop />
            <div>
              <h3 className="text-lg text-amber-200 font-light">{NIGHT_COPY.urgentTitle}</h3>
              <p className="text-xs text-zinc-400 mt-1">{NIGHT_COPY.urgentIntro}</p>
            </div>
            <ul className="space-y-2">
              {NIGHT_COPY.urgentQuestions.map(q => (
                <li key={q} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-sm text-zinc-200 leading-snug">
                  {q}
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500 leading-relaxed">{NIGHT_COPY.urgentNote}</p>

            <div className="space-y-2">
              <p className="text-xs text-center text-amber-200/80">
                {overrideCheck.ok
                  ? NIGHT_COPY.urgentRemaining(remaining)
                  : overrideCheck.reason === 'disabled'
                    ? NIGHT_COPY.urgentDisabled
                    : NIGHT_COPY.urgentLimitReached}
              </p>
              <button
                onClick={onStartOverride}
                disabled={!overrideCheck.ok}
                className="w-full py-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-sm font-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {NIGHT_COPY.urgentStart} ({OVERRIDE_MINUTES} min)
              </button>
              <button onClick={onCloseForTonight} className={quietButton}>
                {NIGHT_COPY.urgentSleepInstead}
              </button>
            </div>
          </div>
        )}

        {view === 'cant-sleep' && (
          <div className="space-y-4">
            <BackToStop />
            <div>
              <h3 className="text-lg text-indigo-200 font-light">{NIGHT_COPY.cantSleepTitle}</h3>
              <p className="text-xs text-zinc-400 mt-1">{NIGHT_COPY.cantSleepIntro}</p>
            </div>
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
              {([
                ['sleep', NIGHT_COPY.sleepTab],
                ['calm', NIGHT_COPY.calmTab],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setKit(id)}
                  className={`flex-1 py-2 transition-colors ${
                    kit === id ? 'bg-indigo-500/20 text-indigo-200' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-[330px] overflow-y-auto pr-1">
              {(kit === 'sleep' ? SLEEP_TECHNIQUES : CALMING_EXERCISES).map(t => (
                <Technique key={t.title} t={t} />
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed">{NIGHT_COPY.cantSleepFooter}</p>
            <button onClick={onCloseForTonight} className={primaryButton}>
              {NIGHT_COPY.closeForTonight}
            </button>
          </div>
        )}

        {view === 'habit' && (
          <div className="space-y-5 text-center py-2">
            <p className="text-lg text-zinc-100 font-light">{NIGHT_COPY.habitLine}</p>
            <button onClick={onCloseForTonight} className={primaryButton}>
              {NIGHT_COPY.closeForTonight}
            </button>
            <button onClick={() => setView('stop')} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              {NIGHT_COPY.cantSleepBack}
            </button>
          </div>
        )}

        {view === 'override-ended' && (
          <div className="space-y-5 text-center py-2">
            <div className="flex items-center justify-center gap-3 text-amber-300">
              <Clock className="w-6 h-6" />
              <h3 className="text-xl font-light">{NIGHT_COPY.overrideEndedTitle}</h3>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">{NIGHT_COPY.overrideEndedBody}</p>
            <button onClick={onCloseForTonight} className={primaryButton}>
              {NIGHT_COPY.closeForTonight}
            </button>
            {canStartOverride(overrideUsedTonight, overrideEnabled).ok && (
              <button onClick={() => setView('urgent')} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                {NIGHT_COPY.stopChoiceUrgent}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
