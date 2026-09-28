import { describe, it, expect } from 'vitest'
import {
  getInterventionCopy,
  getResetPrompt,
  getResetPanelCopy,
  getAiPauseCopy,
  applyToneToIntervention,
  RESET_PROMPTS,
  NIGHT_COPY,
  DEFAULT_COPY_CONTEXT,
} from './index'

describe('copy table', () => {
  it('varies intervention copy by tone and style, and shifts to wind-down at night', () => {
    const gentle = getInterventionCopy('friction', 'Flow', { ...DEFAULT_COPY_CONTEXT, tone: 'gentle' })
    const firm = getInterventionCopy('friction', 'Flow', { ...DEFAULT_COPY_CONTEXT, tone: 'firm' })
    const scientific = getInterventionCopy('friction', 'Flow', { ...DEFAULT_COPY_CONTEXT, promptStyle: 'scientific' })
    const night = getInterventionCopy('friction', 'Flow', { ...DEFAULT_COPY_CONTEXT, nightPhase: 'wind-down' })

    expect(gentle.title).not.toEqual(firm.title)
    expect(scientific.message).not.toEqual(gentle.message)
    expect(night.message).toContain('grateful you rested')

    // Legend keeps its capitals unless gentle
    expect(getInterventionCopy('friction', 'Legend', DEFAULT_COPY_CONTEXT).title).toBe('FRICTION DETECTED')
    expect(getInterventionCopy('friction', 'Legend', { ...DEFAULT_COPY_CONTEXT, tone: 'gentle' }).title).toBe('A gentle nudge')
  })

  it('picks reset prompts deterministically per style and stays in range', () => {
    expect(getResetPrompt('mindfulness', 0)).toBe(RESET_PROMPTS.mindfulness[0])
    expect(getResetPrompt('scientific', RESET_PROMPTS.scientific.length + 1)).toBe(RESET_PROMPTS.scientific[1])
    expect(getResetPrompt('spiritual', -1)).toBe(RESET_PROMPTS.spiritual[RESET_PROMPTS.spiritual.length - 1])

    const panel = getResetPanelCopy({ ...DEFAULT_COPY_CONTEXT, promptStyle: 'spiritual' }, 3)
    expect(panel.prompt).toBe(RESET_PROMPTS.spiritual[3])
    expect(getResetPanelCopy({ ...DEFAULT_COPY_CONTEXT, nightPhase: 'close-day' }).subheading).toContain('close the day')
  })

  it('gentle tone removes delay-gate escalation only', () => {
    const gate = { type: 'delay_gate', delaySeconds: 10 }
    expect(applyToneToIntervention(gate, 'gentle').type).toBe('none')
    expect(applyToneToIntervention(gate, 'standard').type).toBe('delay_gate')
    expect(applyToneToIntervention(gate, 'firm').type).toBe('delay_gate')
    expect(applyToneToIntervention({ type: 'block_screen' }, 'gentle').type).toBe('block_screen')
  })

  it('keeps the extension headline for the AI pause and has no em-dashes anywhere', () => {
    const copy = getAiPauseCopy(DEFAULT_COPY_CONTEXT)
    expect(copy.line1).toBe('Hold.')
    expect(copy.line2).toBe('Stay here.')

    const everything = [
      ...Object.values(RESET_PROMPTS).flat(),
      ...Object.values(NIGHT_COPY),
      copy.subtext,
      getAiPauseCopy({ ...DEFAULT_COPY_CONTEXT, nightPhase: 'after-midnight' }).subtext,
      ...(['gentle', 'standard', 'firm'] as const).flatMap(tone =>
        (['mindfulness', 'scientific', 'spiritual'] as const).flatMap(promptStyle =>
          (['friction', 'focus-slipping'] as const).flatMap(kind => {
            const c = getInterventionCopy(kind, 'Flow', { tone, promptStyle, nightPhase: 'day' })
            return [c.title, c.message, c.action]
          })
        )
      ),
    ]
    for (const line of everything) {
      expect(line).not.toContain('—')
    }
  })
})
