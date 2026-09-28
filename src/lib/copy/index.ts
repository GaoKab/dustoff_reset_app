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

const RESET_SUBHEADING_NIGHT = 'Late in the day. Keep this one slow, or use the Shutdown to close the day'

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
// Ported from the extension's night-mode.js and the night-mode web client.
// Statistics and percentages from the originals were dropped; the wording
// keeps the substance. Plain, warm, never shaming.

export const NIGHT_COPY = {
  // Wind-down (default 20:00 to 22:00)
  windDownLine: 'Winding down. The HUD stays quiet from here.',
  windDownTitle: 'Time to start winding down',
  windDownBody: 'Your brain needs to move from work mode to rest mode. That takes a little time.',
  windDownEstimate: (minutes: number) => `About ${minutes} minutes to wind down, going by today's session load.`,
  windDownActivities: [
    '5 minutes of slow breathing (4-7-8)',
    'Gentle stretching, nothing that gets the heart going',
    'Close the browser tabs you do not need',
    'Dim the screen',
    'Set out tomorrow\'s clothes',
  ],
  windDownDismiss: 'Got it',
  lateStartLine: 'It is late. Start if you need to. A shorter one might serve you better.',

  // Shutdown protocol (default 22:00 to 00:00)
  shutdownNudgeTitle: 'Close the day?',
  shutdownNudgeBody: 'A 15 minute shutdown in three steps. Tomorrow, you will be grateful you rested.',
  shutdownNudgeAction: 'Start the shutdown',
  shutdownNudgeDismiss: 'Not tonight',
  shutdownTitle: 'Shutdown Protocol',
  shutdownIntro: 'Your brain is still running hot. Fifteen minutes, three steps, then you are done.',
  shutdownStep1Title: 'Close open tasks',
  shutdownStep1Body: 'What were you working on today? Mark each one done, or carry it to tomorrow.',
  shutdownStep1Empty: 'No sessions today, so nothing to close. Straight on to the brain dump.',
  shutdownDone: 'Done',
  shutdownCarry: 'Carry to tomorrow',
  shutdownStep2Title: 'Brain dump',
  shutdownStep2Body: 'What is still on your mind? Get it out of your head and into the Parking Lot.',
  shutdownStep2Placeholder: 'Worries, ideas, reminders, anything. One per line. It will be here tomorrow.',
  shutdownStep2Hint: 'This will be waiting for you tomorrow morning. For now, let it go.',
  shutdownStep3Title: 'Physical transition',
  shutdownStep3Body: 'Your brain follows your body. Signal that work time is over.',
  shutdownChecklist: [
    'Stand up from your desk',
    'Close your laptop (really)',
    'Take 3 deep breaths',
    'Move to a different room',
  ],
  shutdownCompleted: (done: number, total: number) => `Completed ${done} of ${total}`,
  shutdownNext: 'Continue',
  shutdownBack: 'Back',
  shutdownFinish: 'Complete the shutdown',
  shutdownCompleteTitle: 'Shutdown complete',
  shutdownCompleteBody: 'Your notes are saved for tomorrow morning. Close the laptop and rest.',
  shutdownCompleteAction: 'Close and rest',
  shutdownStepOf: (step: number, total: number) => `Step ${step} of ${total}`,
  shutdownMinutes: (minutes: number) => `${minutes} minutes`,

  // Night protection (default 00:00 to 06:00)
  stopTitle: 'STOP',
  stopHeadline: 'Opening your laptop now will make tomorrow worse.',
  stopBandwidth: (score: number) => `Your bandwidth was ${score} when you stopped.`,
  stopBandwidthUnknown: 'Your brain needs rest, not more work.',
  stopQuestion: "What's really going on?",
  stopChoiceUrgent: 'It is truly urgent',
  stopChoiceUrgentHint: 'Check that honestly, then get 30 minutes',
  stopChoiceCantSleep: "I can't sleep",
  stopChoiceCantSleepHint: 'Sleep techniques and calming exercises',
  stopChoiceHabit: 'It is habit, not need',
  stopChoiceHabitHint: 'Close for tonight',
  stopDismiss: 'Not now',
  stopFooter: 'Your well-being matters more than any task. Tomorrow, you will be grateful you rested.',

  // Urgent work challenge
  urgentTitle: 'Is it really urgent?',
  urgentIntro: 'Ask yourself honestly:',
  urgentQuestions: [
    'Will someone be harmed if this waits until morning?',
    'Is this a true emergency, or does it just feel urgent?',
    'Could you send a message saying it will be done tomorrow?',
    'Are you avoiding going to sleep?',
  ],
  urgentNote: 'True emergencies are rare. Most urgent work can wait until morning, and you will do it better rested.',
  urgentStart: 'Start a 30 minute override',
  urgentRemaining: (left: number) => (left === 1 ? 'One override left tonight.' : `${left} overrides left tonight.`),
  urgentLimitReached: 'You have used both overrides for tonight. What is left can wait for the morning.',
  urgentDisabled: 'Emergency override is turned off in Settings.',
  urgentSleepInstead: "Actually, I'll sleep",

  // Override
  overrideTitle: 'Emergency override',
  overrideBody: 'Thirty minutes. Do the one thing, then close the laptop.',
  overrideEnd: 'End the override',
  overrideEndedTitle: 'Override ended. Close the laptop.',
  overrideEndedBody: 'Whatever is left will still be there in the morning, and so will you.',

  // Habit acknowledgement
  habitLine: "That's honest. Nothing here needs you tonight.",
  closeForTonight: 'Close for tonight',

  // Can't sleep
  cantSleepTitle: 'Can\'t sleep',
  cantSleepIntro: 'Two small kits. Pick whichever fits how you feel.',
  sleepTab: 'Sleep techniques',
  calmTab: 'Calming exercises',
  cantSleepBack: 'Back',
  cantSleepFooter: 'Anxiety at night is common. Your worries will still be there tomorrow, and you will handle them better after sleep.',
} as const

export interface TechniqueCopy {
  title: string
  steps: string[]
  note?: string
}

/** Sleep techniques, ported from the original with the claims removed. */
export const SLEEP_TECHNIQUES: TechniqueCopy[] = [
  {
    title: '4-7-8 breathing',
    steps: [
      'Breathe in through your nose for 4 seconds',
      'Hold for 7 seconds',
      'Breathe out through your mouth for 8 seconds',
      'Repeat 4 times',
    ],
  },
  {
    title: 'Body scan',
    steps: [
      'Lie down and start with your toes. Notice any tension',
      'Move up through your legs, torso and arms, letting each part soften',
      'Finish with your neck, face and scalp',
      'Take 10 to 15 minutes. Do not rush it',
    ],
  },
  {
    title: 'Tense and release',
    steps: [
      'Tense your toes for 5 seconds, then let go',
      'Move up: calves, thighs, stomach, chest',
      'Then arms, hands, shoulders, neck, face',
      'Notice the difference between tense and relaxed',
    ],
  },
  {
    title: 'Still awake after 20 minutes?',
    steps: [
      'Get up and do something calming in dim light, like reading or gentle stretching',
      'Go back to bed when you feel sleepy. Do not force it',
    ],
  },
]

/** Calming exercises for when the mind will not let go. */
export const CALMING_EXERCISES: TechniqueCopy[] = [
  {
    title: '5-4-3-2-1 grounding',
    steps: [
      'Name 5 things you can see',
      '4 things you can touch',
      '3 things you can hear',
      '2 things you can smell',
      '1 thing you can taste',
    ],
  },
  {
    title: 'Box breathing',
    steps: [
      'Breathe in for 4',
      'Hold for 4',
      'Breathe out for 4',
      'Hold empty for 4',
      'Repeat until you feel calmer',
    ],
  },
  {
    title: 'Write it down',
    steps: [
      'Write what is worrying you, in a sentence or two',
      'What is the worst that could happen? What is most likely?',
      'Can you do anything about it right now?',
    ],
    note: 'If you cannot do anything right now, give yourself permission to let it go until morning. You have acknowledged it. That is enough for tonight.',
  },
]
