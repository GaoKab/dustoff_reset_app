// src/features/desktop/overlays/AiPauseOverlay/index.tsx
// "Hold. Stay here." A small, non-blocking card under the HUD for a few
// seconds when the user tabs away from an AI chat right after arriving.
// No buttons to press, nothing to dismiss; it fades on its own.

import type { AiPauseCopy } from '@/lib/copy'

interface AiPauseOverlayProps {
  isOpen: boolean
  copy: AiPauseCopy
}

export function AiPauseOverlay({ isOpen, copy }: AiPauseOverlayProps) {
  if (!isOpen) return null

  return (
    <div className="mt-3 w-[320px] animate-in fade-in duration-500 pointer-events-none">
      <div className="rounded-2xl bg-[#0a0f0d]/85 backdrop-blur-xl border border-zinc-600/40 shadow-2xl px-5 py-4 text-center">
        <div className="text-2xl font-light text-white tracking-wide">
          <span className="animate-in fade-in duration-700">{copy.line1}</span>{' '}
          <span className="animate-in fade-in duration-700 delay-700 fill-mode-both">{copy.line2}</span>
        </div>
        <p className="text-xs text-zinc-400 mt-2">{copy.subtext}</p>
      </div>
    </div>
  )
}

export type { AiPauseOverlayProps }
