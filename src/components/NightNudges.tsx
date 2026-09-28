// src/components/NightNudges.tsx
// Night mode nudges, ported from the extension's evening behaviour.
// - CloseDayNudge: after 22:00, offer a "close the day" reset once. Never forces.
// - AfterMidnightLine: one line above the session start flow past midnight.

import { Moon, X } from 'lucide-react'
import { NIGHT_COPY } from '@/lib/copy'

interface CloseDayNudgeProps {
  onCloseDay: () => void
  onDismiss: () => void
}

export function CloseDayNudge({ onCloseDay, onDismiss }: CloseDayNudgeProps) {
  return (
    <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="rounded-2xl bg-[#0a0f0d]/90 backdrop-blur-xl border border-indigo-400/30 shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-indigo-500/20 rounded-lg flex-shrink-0">
            <Moon className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-light">{NIGHT_COPY.closeDayTitle}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{NIGHT_COPY.closeDayBody}</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
            title={NIGHT_COPY.closeDayDismiss}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onCloseDay}
            className="flex-1 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-sm font-light transition-colors"
          >
            {NIGHT_COPY.closeDayAction}
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-light transition-colors"
          >
            {NIGHT_COPY.closeDayDismiss}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AfterMidnightLine() {
  return (
    <div className="mb-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0a0f0d]/80 border border-indigo-400/20 text-xs text-indigo-200/90">
      <Moon className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />
      <span>{NIGHT_COPY.afterMidnightLine}</span>
    </div>
  )
}
