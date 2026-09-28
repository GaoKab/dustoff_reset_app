// src/components/overlays/InterventionOverlayAdapter.tsx
// Adapts the InterventionOverlay to work with App.tsx and bandwidth engine

import { InterventionOverlay } from '@/features/desktop/overlays/InterventionOverlay'
import type { SessionMode } from '@/features/desktop/hud/FloatingHUD/types'
import { getInterventionCopy, DEFAULT_COPY_CONTEXT, type CopyContext } from '@/lib/copy'

// Map our simplified types to the overlay's type system
type InterventionType = 'friction' | 'focus-slipping'

interface InterventionOverlayAdapterProps {
  isOpen: boolean
  type: InterventionType
  mode: SessionMode
  currentBandwidth: number
  /** Tone, prompt style and night phase for the wording */
  copyContext?: CopyContext
  onDismiss: () => void
  onReset: () => void
}

/**
 * InterventionOverlayAdapter
 * 
 * Wraps the InterventionOverlay component to integrate with the bandwidth engine.
 * 
 * Intervention Types:
 * - friction (bandwidth 50-60): Gentle nudge, suggests taking a break
 * - focus-slipping (bandwidth < 50): Stronger warning, recommends reset
 * 
 * Mode Behavior:
 * - Zen: Gentle, encouraging overlay (inline)
 * - Flow: Informative overlay (inline)
 * - Legend: Full-screen blocker that demands attention
 * 
 * The underlying InterventionOverlay component handles:
 * - Mode-specific styling and messaging
 * - Auto-dismiss after 10 seconds
 * - Progress bar countdown
 */
export function InterventionOverlayAdapter({
  isOpen,
  type,
  mode,
  currentBandwidth,
  copyContext = DEFAULT_COPY_CONTEXT,
  onDismiss,
  onReset,
}: InterventionOverlayAdapterProps) {
  if (!isOpen) return null
  
  // Map our type to the overlay's expected type
  // The overlay uses 'focus-slipping' for stronger warnings
  const overlayType = type === 'focus-slipping' ? 'focus-slipping' : 'friction'
  const copy = getInterventionCopy(overlayType, mode, copyContext)
  
  // For Legend mode, the overlay itself renders fullscreen
  // For Zen/Flow, we wrap it in a container
  if (mode === 'Legend') {
    return (
      <InterventionOverlay
        isOpen={true}
        type={overlayType}
        mode={mode}
        details={{
          duration: currentBandwidth, // Pass bandwidth for context
        }}
        copy={copy}
        onDismiss={onDismiss}
        onAction={onReset}
      />
    )
  }
  
  // Zen/Flow modes: Inline intervention below HUD
  return (
    <InterventionOverlay
      isOpen={true}
      type={overlayType}
      mode={mode}
      details={{
        duration: currentBandwidth,
      }}
      copy={copy}
      onDismiss={onDismiss}
      onAction={onReset}
    />
  )
}

export type { InterventionOverlayAdapterProps, InterventionType }
