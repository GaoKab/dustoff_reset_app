import { describe, it, expect } from 'vitest'
import { isWithinNightWindow, getNightPhase, parseClock } from './index'

const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m)
const settings = { nightModeEnabled: true, nightModeStart: '20:00', nightModeEnd: '06:00' }

describe('night window', () => {
  it('handles windows that cross midnight', () => {
    expect(isWithinNightWindow(at(19, 59), '20:00', '06:00')).toBe(false)
    expect(isWithinNightWindow(at(20, 0), '20:00', '06:00')).toBe(true)
    expect(isWithinNightWindow(at(23, 30), '20:00', '06:00')).toBe(true)
    expect(isWithinNightWindow(at(2), '20:00', '06:00')).toBe(true)
    expect(isWithinNightWindow(at(5, 59), '20:00', '06:00')).toBe(true)
    expect(isWithinNightWindow(at(6), '20:00', '06:00')).toBe(false)
    expect(isWithinNightWindow(at(12), '20:00', '06:00')).toBe(false)
  })

  it('handles same-day windows and rejects malformed or empty ones', () => {
    expect(isWithinNightWindow(at(14), '13:00', '15:00')).toBe(true)
    expect(isWithinNightWindow(at(16), '13:00', '15:00')).toBe(false)
    expect(isWithinNightWindow(at(14), '13:00', '13:00')).toBe(false)
    expect(isWithinNightWindow(at(14), 'late', '15:00')).toBe(false)
    expect(parseClock('7:00')).toBeNull()
    expect(parseClock('23:59')).toBe(23 * 60 + 59)
  })

  it('reports the phase used by the HUD, the close-day nudge and the midnight line', () => {
    expect(getNightPhase(at(12), settings)).toBe('day')
    expect(getNightPhase(at(20, 30), settings)).toBe('wind-down')
    expect(getNightPhase(at(22), settings)).toBe('close-day')
    expect(getNightPhase(at(23, 59), settings)).toBe('close-day')
    expect(getNightPhase(at(0, 10), settings)).toBe('after-midnight')
    expect(getNightPhase(at(5), settings)).toBe('after-midnight')
    expect(getNightPhase(at(23), { ...settings, nightModeEnabled: false })).toBe('day')
  })
})
