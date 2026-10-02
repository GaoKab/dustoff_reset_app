// src/features/desktop/panels/ShutdownPanel/index.tsx
// The Shutdown Protocol, ported from the extension's night-mode.js and the
// night-mode client's ShutdownView. Three steps, about fifteen minutes:
//   1. Close open tasks: today's session intentions, done or carry to tomorrow
//   2. Brain dump into the existing Parking Lot
//   3. Physical transition checklist
// Completion is reported to the caller, which records it for the night so
// the protocol is not offered again this evening.

import { useEffect, useMemo, useState } from 'react'
import { Moon, CheckCircle2, Brain, Sparkles, X, Check, ArrowRight } from 'lucide-react'
import { NIGHT_COPY } from '@/lib/copy'
import { tauriBridge } from '@/lib/tauri-bridge'
import { addParkingLotItem, markForNextSession } from '@/lib/parking-lot-storage'
import { localDateKey } from '@/lib/night'
import type { SessionRecord } from '@/lib/tauri-types'

interface ShutdownPanelProps {
  onComplete: () => void
  onClose: () => void
}

type TaskChoice = 'done' | 'carry' | null

interface OpenTask {
  sessionId: string
  intention: string
  choice: TaskChoice
}

const STEP_MINUTES = 5
const TOTAL_STEPS = 3

function StepHeader({ icon, title, body, step }: { icon: React.ReactNode; title: string; body: string; step: number }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-300 shrink-0">{icon}</div>
      <div>
        <div className="text-xs text-indigo-300/80">
          {NIGHT_COPY.shutdownStepOf(step, TOTAL_STEPS)} · {NIGHT_COPY.shutdownMinutes(STEP_MINUTES)}
        </div>
        <h3 className="text-base text-white font-light mt-0.5">{title}</h3>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

export function ShutdownPanel({ onComplete, onClose }: ShutdownPanelProps) {
  const [step, setStep] = useState(0)
  const [tasks, setTasks] = useState<OpenTask[]>([])
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [dump, setDump] = useState('')
  const [saving, setSaving] = useState(false)
  const [checklist, setChecklist] = useState<boolean[]>(() => NIGHT_COPY.shutdownChecklist.map(() => false))
  const [finished, setFinished] = useState(false)

  // Step 1: today's session intentions from SQLite
  useEffect(() => {
    let cancelled = false
    const today = localDateKey(new Date())
    tauriBridge
      .getAllSessions(today, today)
      .then((sessions: SessionRecord[]) => {
        if (cancelled) return
        const seen = new Set<string>()
        const open: OpenTask[] = []
        for (const s of sessions) {
          const text = (s.intention ?? '').trim()
          if (!text || seen.has(text.toLowerCase())) continue
          seen.add(text.toLowerCase())
          open.push({ sessionId: s.sessionId, intention: text, choice: null })
        }
        setTasks(open)
      })
      .catch(err => console.log('[Shutdown] Could not load today\'s sessions:', err))
      .finally(() => { if (!cancelled) setTasksLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const chooseTask = (sessionId: string, choice: TaskChoice) =>
    setTasks(prev => prev.map(t => (t.sessionId === sessionId ? { ...t, choice } : t)))

  const completedChecks = useMemo(() => checklist.filter(Boolean).length, [checklist])

  // Leaving step 1: carried tasks go to the Parking Lot, flagged for the next session
  const finishStep1 = async () => {
    setSaving(true)
    try {
      for (const t of tasks) {
        if (t.choice !== 'carry') continue
        const item = await addParkingLotItem(`Tomorrow: ${t.intention}`)
        await markForNextSession(item.id)
      }
    } catch (err) {
      console.error('[Shutdown] Could not carry tasks to tomorrow:', err)
    } finally {
      setSaving(false)
      setStep(1)
    }
  }

  // Leaving step 2: every non-empty line becomes a Parking Lot item
  const finishStep2 = async () => {
    const lines = dump.split('\n').map(l => l.trim()).filter(Boolean)
    setSaving(true)
    try {
      for (const line of lines) {
        await addParkingLotItem(line)
      }
    } catch (err) {
      console.error('[Shutdown] Could not save brain dump:', err)
    } finally {
      setSaving(false)
      setStep(2)
    }
  }

  const finishStep3 = () => {
    setFinished(true)
    onComplete()
  }

  const nextButton = 'w-full py-2.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-100 text-sm font-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2'
  const backButton = 'px-4 py-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-light transition-colors'

  return (
    <div className="w-[475px] rounded-3xl bg-[#0a0f0d]/60 backdrop-blur-xl border border-indigo-400/30 shadow-2xl overflow-hidden">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Moon className="w-5 h-5 text-indigo-300" />
            <div>
              <h2 className="text-xl font-light text-indigo-200">{NIGHT_COPY.shutdownTitle}</h2>
              {!finished && <p className="text-sm text-zinc-400 mt-0.5">{NIGHT_COPY.shutdownIntro}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mt-1 -mr-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        {!finished && (
          <div className="flex gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-colors duration-500 ${
                  i <= step ? 'bg-indigo-400' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
        )}

        {finished ? (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-300" />
            </div>
            <h3 className="text-lg text-white font-light">{NIGHT_COPY.shutdownCompleteTitle}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed px-4">{NIGHT_COPY.shutdownCompleteBody}</p>
            <button onClick={onClose} className={nextButton}>
              {NIGHT_COPY.shutdownCompleteAction}
            </button>
          </div>
        ) : step === 0 ? (
          <div className="space-y-4">
            <StepHeader
              icon={<CheckCircle2 className="w-5 h-5" />}
              step={1}
              title={NIGHT_COPY.shutdownStep1Title}
              body={NIGHT_COPY.shutdownStep1Body}
            />
            {!tasksLoaded ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Loading today's sessions…</p>
            ) : tasks.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">{NIGHT_COPY.shutdownStep1Empty}</p>
            ) : (
              <ul className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {tasks.map(t => (
                  <li key={t.sessionId} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                    <p className="text-sm text-zinc-200 leading-snug">{t.intention}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => chooseTask(t.sessionId, 'done')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                          t.choice === 'done'
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                            : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                        }`}
                      >
                        {NIGHT_COPY.shutdownDone}
                      </button>
                      <button
                        onClick={() => chooseTask(t.sessionId, 'carry')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                          t.choice === 'carry'
                            ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200'
                            : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                        }`}
                      >
                        {NIGHT_COPY.shutdownCarry}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={finishStep1} disabled={saving || !tasksLoaded} className={nextButton}>
              {NIGHT_COPY.shutdownNext} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <StepHeader
              icon={<Brain className="w-5 h-5" />}
              step={2}
              title={NIGHT_COPY.shutdownStep2Title}
              body={NIGHT_COPY.shutdownStep2Body}
            />
            <textarea
              value={dump}
              onChange={e => setDump(e.target.value)}
              placeholder={NIGHT_COPY.shutdownStep2Placeholder}
              rows={6}
              className="w-full rounded-xl bg-zinc-900/70 border border-zinc-700 focus:border-indigo-400 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 p-3 resize-none"
            />
            <p className="text-xs text-zinc-500">{NIGHT_COPY.shutdownStep2Hint}</p>
            <div className="flex gap-2">
              <button onClick={() => setStep(0)} className={backButton}>{NIGHT_COPY.shutdownBack}</button>
              <button onClick={finishStep2} disabled={saving} className={nextButton}>
                {NIGHT_COPY.shutdownNext} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <StepHeader
              icon={<Sparkles className="w-5 h-5" />}
              step={3}
              title={NIGHT_COPY.shutdownStep3Title}
              body={NIGHT_COPY.shutdownStep3Body}
            />
            <ul className="space-y-2">
              {NIGHT_COPY.shutdownChecklist.map((item, i) => (
                <li key={item}>
                  <button
                    onClick={() => setChecklist(prev => prev.map((v, idx) => (idx === i ? !v : v)))}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-600 text-left transition-colors"
                  >
                    <span
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        checklist[i] ? 'bg-indigo-400/30 border-indigo-300' : 'border-zinc-600'
                      }`}
                    >
                      {checklist[i] && <Check className="w-3.5 h-3.5 text-indigo-100" />}
                    </span>
                    <span className={`text-sm ${checklist[i] ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{item}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500 text-center">
              {NIGHT_COPY.shutdownCompleted(completedChecks, NIGHT_COPY.shutdownChecklist.length)}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className={backButton}>{NIGHT_COPY.shutdownBack}</button>
              <button onClick={finishStep3} className={nextButton}>
                {NIGHT_COPY.shutdownFinish}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
