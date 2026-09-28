// src/lib/copy/index.ts
// One small copy table for nudges, interventions, reset prompts and the
// AI-site pause. Tone and prompt style come from user preferences; night
// phase comes from src/lib/night. Overlays and panels read from here so
// wording lives in one place instead of being scattered through App.tsx.
//
// Voice: plain, warm, no shame. No em-dashes in anything user-facing.

import type { Tone, PromptStyle } from '@/lib/preferences/types'
import type { NightPhase } from '@/lib/night'

export interface CopyContext {
  tone: Tone
  promptStyle: PromptStyle
  nightPhase: NightPhase
}

export const DEFAULT_COPY_CONTEXT: CopyContext = {
  tone: 'standard',
  promptStyle: 'mindfulness',
  nightPhase: 'day',
}

export type SessionModeName = 'Zen' | 'Flow' | 'Legend'
export type InterventionKind = 'friction' | 'focus-slipping'

export interface InterventionCopy {
  title: string
  message: string
  action: string
}

// ============================================
// RESET PROMPTS (ported from the extension's prompt library)
// ============================================

export const RESET_PROMPTS: Record<PromptStyle, string[]> = {
  mindfulness: [
    'Take three slow breaths. In through the nose, a short hold, out through the mouth.',
    'Notice five things you can see, four you can touch, three you can hear, two you can smell, one you can taste.',
    'Close your eyes for one minute and stay with the present moment.',
    'Stretch gently and notice how your body feels right now.',
    'Scan from head to toe. Where there is tension, let it soften.',
    'Feel your feet on the floor. You are here, now, and that is enough.',
  ],
  scientific: [
    'The 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.',
    'A ten minute walk lowers stress hormones and sharpens attention for the next block of work.',
    'Standing and stretching moves blood back to the brain after a long sit.',
    'Mild dehydration blunts concentration. Drink some water while you are up.',
    'Brief breaks restore motivation and improve decision quality. This one counts.',
    'Attention runs in cycles. Resting between them is how the next one holds.',
  ],
  spiritual: [
    'Come to me, all who are weary and burdened, and I will give you rest. (Matthew 11:28)',
    'Be still, and know. (Psalm 46:10)',
    'Breathing in, I calm body and mind. Breathing out, I smile. (Thich Nhat Hanh)',
    'Peace comes from within. Do not seek it without. (Buddha)',
    'Indeed, with hardship comes ease. (Quran 94:6)',
    'When the mind is steady, it is like the flame of a candle in a windless place. (Bhagavad Gita)',
    'Whether you meditate, pray, or simply breathe, this moment is yours to rest in.',
  ],
}

/** Pick a reset prompt for a style. `seed` (any integer) selects deterministically. */
export function getResetPrompt(style: PromptStyle, seed: number): string {
  const list = RESET_PROMPTS[style] ?? RESET_PROMPTS.mindfulness
  const index = ((Math.floor(seed) % list.length) + list.length) % list.length
  return list[index]
}

// ============================================
// RESET PANEL
// ============================================

export interface ResetPanelCopy {
  heading: string
  subheading: string
  prompt: string
}

const RESET_SUBHEADING: Record<PromptStyle, string> = {
  mindfulness: 'Take a moment to recharge and return focused',
  scientific: 'Short breaks restore attention faster than pushing through',
  spiritual: 'Rest is not wasted. Take a moment and come back whole',
}

const RESET_SUBHEADING_NIGHT = 'Late in the day. Keep this one slow, or use it to close the day'

export function getResetPanelCopy(ctx: CopyContext, seed: number = Date.now() / 60000): ResetPanelCopy {
  const night = ctx.nightPhase !== 'day'
  return {
    heading: 'Choose Your Reset',
    subheading: night ? RESET_SUBHEADING_NIGHT : RESET_SUBHEADING[ctx.promptStyle],
    prompt: getResetPrompt(ctx.promptStyle, seed),
  }
}

// ============================================
// INTERVENTIONS (friction / focus slipping)
// ============================================

const INTERVENTION_MESSAGE: Record<InterventionKind, Record<PromptStyle, string>> = {
  friction: {
    mindfulness: 'A few switches in a row. Take one slow breath and pick the one thing you came here to do.',
    scientific: 'Context switches are stacking up. Each one costs a few minutes of refocus time. One task at a time gets it back.',
    spiritual: 'Be still for a moment. Let go of the extra tabs and return to the one thing in front of you.',
  },
  'focus-slipping': {
    mindfulness: 'Focus is slipping. Notice where your attention went, then bring it back gently. A short reset helps.',
    scientific: 'Capacity is dropping below the range where deep work holds. A two minute reset restores more than pushing on.',
    spiritual: 'The mind is wandering. That is allowed. Come back, rest a moment, and begin again.',
  },
}

const INTERVENTION_MESSAGE_NIGHT: Record<InterventionKind, string> = {
  friction: 'It is late and the switching is adding up. Wrap this up gently, or take a short reset. Tomorrow, you will be grateful you rested.',
  'focus-slipping': 'Focus is going, and it is late. That is your body asking to stop. A short reset, then close the day.',
}

const INTERVENTION_FRAMING: Record<Tone, Record<InterventionKind, { title: string; action: string }>> = {
  gentle: {
    friction: { title: 'A gentle nudge', action: 'Take a breath' },
    'focus-slipping': { title: 'Focus drifting', action: 'Short reset' },
  },
  standard: {
    friction: { title: 'Friction Detected', action: 'Reset Focus' },
    'focus-slipping': { title: 'Focus Slipping', action: 'Assess & Reset' },
  },
  firm: {
    friction: { title: 'Friction. Stop switching.', action: 'Reset now' },
    'focus-slipping': { title: 'Focus slipping. Act now.', action: 'Reset now' },
  },
}

export function getInterventionCopy(
  kind: InterventionKind,
  sessionMode: SessionModeName,
  ctx: CopyContext
): InterventionCopy {
  const framing = INTERVENTION_FRAMING[ctx.tone][kind]
  const message = ctx.nightPhase !== 'day'
    ? INTERVENTION_MESSAGE_NIGHT[kind]
    : INTERVENTION_MESSAGE[kind][ctx.promptStyle]

  // Legend mode keeps its shouting titles unless the tone is gentle
  const legendCaps = sessionMode === 'Legend' && ctx.tone !== 'gentle'
  return {
    title: legendCaps ? framing.title.toUpperCase() : framing.title,
    message,
    action: legendCaps ? framing.action.toUpperCase() : framing.action,
  }
}

// ============================================
// TONE GATING FOR TELEMETRY INTERVENTIONS
// ============================================

/**
 * Gentle tone never escalates to a delay gate: the penalty still lands and
 * the softer nudge copy still shows, but no countdown. Standard and firm
 * keep the existing escalation untouched.
 */
export function applyToneToIntervention<T extends { type: string }>(config: T, tone: Tone): T {
  if (tone === 'gentle' && config.type === 'delay_gate') {
    return { ...config, type: 'none' }
  }
  return config
}

// ============================================
// AI-SITE PAUSE ("Hold. Stay here.")
// ============================================

export interface AiPauseCopy {
  line1: string
  line2: string
  subtext: string
}

const AI_PAUSE_SUBTEXT: Record<PromptStyle, string> = {
  mindfulness: 'The answer is coming. Let the wait be the rest.',
  scientific: 'Switching now costs the refocus later. The wait is shorter than it feels.',
  spiritual: 'Patience is a practice. This pause is part of the work.',
}

const AI_PAUSE_SUBTEXT_NIGHT = 'It is late. Let it finish, then let yourself finish.'

export function getAiPauseCopy(ctx: CopyContext): AiPauseCopy {
  return {
    line1: 'Hold.',
    line2: 'Stay here.',
    subtext: ctx.nightPhase !== 'day' ? AI_PAUSE_SUBTEXT_NIGHT : AI_PAUSE_SUBTEXT[ctx.promptStyle],
  }
}

// ============================================
// NIGHT MODE
// ============================================

export const NIGHT_COPY = {
  windDownLine: 'Winding down. The HUD stays quiet from here.',
  closeDayTitle: 'Close the day?',
  closeDayBody: 'Tomorrow, you will be grateful you rested. A short reset to land it, then you are done.',
  closeDayAction: 'Close the day',
  closeDayDismiss: 'Not yet',
  afterMidnightLine: 'It is past midnight. Start if you need to. A shorter one might serve you better.',
} as const
