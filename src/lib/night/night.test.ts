import { describe, it, expect } from 'vitest'
import {
  isWithinNightWindow,
  getNightPhase,
  parseClock,
  validatePhaseBounds,
  nightKey,
  minutesToClock,
  dateKeyDaysAgo,
  getNightMultiplier,
  getNightMultiplierNote,
  canStartOverride,
  overridesRemaining,
  overrideSecondsLeft,
  formatCountdown,
  insomniaLine,
  estimateWindDownMinutes,
  DEFAULT_NIGHT_SETTINGS,
  MAX_OVERRIDES_PER_NIGHT,
} from './index'

const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m)
const settings = DEFAULT_NIGHT_SETTINGS

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
})

describe('three phases', () => {
  it('resolves the default phases across midnight', () => {
    expect(getNightPhase(at(12), settings)).toBe('day')
    expect(getNightPhase(at(19, 59), settings)).toBe('day')
    expect(getNightPhase(at(20, 0), settings)).toBe('wind-down')
    expect(getNightPhase(at(21, 59), settings)).toBe('wind-down')
    expect(getNightPhase(at(22, 0), settings)).toBe('shutdown')
    expect(getNightPhase(at(23, 59), settings)).toBe('shutdown')
    expect(getNightPhase(at(0, 0), settings)).toBe('night-protection')
    expect(getNightPhase(at(3, 30), settings)).toBe('night-protection')
    expect(getNightPhase(at(5, 59), settings)).toBe('night-protection')
    expect(getNightPhase(at(6, 0), settings)).toBe('day')
  })

  it('honours custom bounds, including a window that crosses midnight inside wind-down', () => {
    const late = { ...settings, nightModeStart: '23:00', shutdownStart: '00:30', protectionStart: '02:00', nightModeEnd: '07:00' }
    expect(getNightPhase(at(22, 59), late)).toBe('day')
    expect(getNightPhase(at(23, 30), late)).toBe('wind-down')
    expect(getNightPhase(at(0, 15), late)).toBe('wind-down')
    expect(getNightPhase(at(0, 30), late)).toBe('shutdown')
    expect(getNightPhase(at(1, 59), late)).toBe('shutdown')
    expect(getNightPhase(at(2), late)).toBe('night-protection')
    expect(getNightPhase(at(6, 59), late)).toBe('night-protection')
    expect(getNightPhase(at(7), late)).toBe('day')

    // A window fully before midnight
    const early = { ...settings, nightModeStart: '18:00', shutdownStart: '19:00', protectionStart: '20:00', nightModeEnd: '23:00' }
    expect(getNightPhase(at(18, 30), early)).toBe('wind-down')
    expect(getNightPhase(at(19, 30), early)).toBe('shutdown')
    expect(getNightPhase(at(22, 30), early)).toBe('night-protection')
    expect(getNightPhase(at(23), early)).toBe('day')
    expect(getNightPhase(at(1), early)).toBe('day')
  })

  it('is day when night mode is off or the bounds are out of order', () => {
    expect(getNightPhase(at(23), { ...settings, nightModeEnabled: false })).toBe('day')
    expect(getNightPhase(at(23), { ...settings, shutdownStart: '19:00' })).toBe('day')
    expect(getNightPhase(at(23), { ...settings, nightModeEnd: 'soon' })).toBe('day')
  })

  it('validates phase ordering around the clock like the Rust side', () => {
    expect(validatePhaseBounds(settings)).toBeNull()
    expect(validatePhaseBounds({ nightModeStart: '22:00', shutdownStart: '23:30', protectionStart: '01:00', nightModeEnd: '07:00' })).toBeNull()
    expect(validatePhaseBounds({ ...settings, shutdownStart: '20:00' })).toMatch(/Shutdown/)
    expect(validatePhaseBounds({ ...settings, protectionStart: '21:00' })).toMatch(/protection/)
    expect(validatePhaseBounds({ ...settings, nightModeEnd: '23:30' })).toMatch(/end/)
    expect(validatePhaseBounds({ ...settings, nightModeEnd: '20:00' })).not.toBeNull()
    expect(validatePhaseBounds({ ...settings, nightModeStart: '8pm' })).toMatch(/HH:MM/)
  })
})

describe('night keys', () => {
  it('keeps one key from the evening through the small hours when the night crosses midnight', () => {
    expect(nightKey(new Date(2026, 0, 15, 20, 30), settings)).toBe('2026-01-15')
    expect(nightKey(new Date(2026, 0, 15, 23, 59), settings)).toBe('2026-01-15')
    expect(nightKey(new Date(2026, 0, 16, 0, 0), settings)).toBe('2026-01-15')
    expect(nightKey(new Date(2026, 0, 16, 5, 59), settings)).toBe('2026-01-15')
    // The night ends at 06:00; from then on the key is the new day's night
    expect(nightKey(new Date(2026, 0, 16, 6, 0), settings)).toBe('2026-01-16')
    expect(nightKey(new Date(2026, 0, 16, 12, 0), settings)).toBe('2026-01-16')
    // Month boundary
    expect(nightKey(new Date(2026, 1, 1, 2, 0), settings)).toBe('2026-01-31')
  })

  it('follows the derived night, not the calendar date', () => {
    // A night shift's "night" of 08:00 to 18:00 sits inside one date
    const shifted = { nightModeStart: '08:00', shutdownStart: '10:00', protectionStart: '12:00', nightModeEnd: '18:00' }
    expect(nightKey(new Date(2026, 0, 16, 1, 0), shifted)).toBe('2026-01-16')
    expect(nightKey(new Date(2026, 0, 16, 9, 0), shifted)).toBe('2026-01-16')
    expect(nightKey(new Date(2026, 0, 16, 23, 0), shifted)).toBe('2026-01-16')
    // A day shift's night of 18:00 to 08:00 crosses midnight later than the standard one
    const late = { nightModeStart: '18:00', shutdownStart: '20:00', protectionStart: '22:00', nightModeEnd: '08:00' }
    expect(nightKey(new Date(2026, 0, 16, 7, 59), late)).toBe('2026-01-15')
    expect(nightKey(new Date(2026, 0, 16, 8, 0), late)).toBe('2026-01-16')
    // Malformed bounds: the calendar date
    expect(nightKey(new Date(2026, 0, 16, 1, 0), { ...settings, nightModeEnd: 'dawn' })).toBe('2026-01-16')
  })

  it('formats minutes back to the clock, wrapping around', () => {
    expect(minutesToClock(0)).toBe('00:00')
    expect(minutesToClock(8 * 60 + 5)).toBe('08:05')
    expect(minutesToClock(25 * 60)).toBe('01:00')
    expect(minutesToClock(-60)).toBe('23:00')
  })

  it('computes rolling window starts', () => {
    expect(dateKeyDaysAgo(new Date(2026, 0, 15, 10), 7)).toBe('2026-01-08')
    expect(dateKeyDaysAgo(new Date(2026, 2, 3, 10), 6)).toBe('2026-02-25')
  })
})

describe('night drift multiplier', () => {
  it('selects the desktop agent multipliers by phase', () => {
    expect(getNightMultiplier('day', 'standard')).toBe(1)
    expect(getNightMultiplier('wind-down', 'standard')).toBe(1.2)
    expect(getNightMultiplier('shutdown', 'standard')).toBe(1.5)
    expect(getNightMultiplier('night-protection', 'standard')).toBe(2.0)
    expect(getNightMultiplier('night-protection', 'firm')).toBe(2.0)
  })

  it('caps at 1.2 on gentle tone', () => {
    expect(getNightMultiplier('wind-down', 'gentle')).toBe(1.2)
    expect(getNightMultiplier('shutdown', 'gentle')).toBe(1.2)
    expect(getNightMultiplier('night-protection', 'gentle')).toBe(1.2)
    expect(getNightMultiplier('day', 'gentle')).toBe(1)
  })

  it('explains itself in one line and stays quiet by day', () => {
    expect(getNightMultiplierNote('day', 'standard')).toBeNull()
    expect(getNightMultiplierNote('shutdown', 'standard')).toBe('Night multiplier active: drift costs x1.5 during shutdown.')
    expect(getNightMultiplierNote('night-protection', 'gentle')).toContain('x1.2')
  })
})

describe('emergency override', () => {
  it('allows at most two per night and respects the settings toggle', () => {
    expect(MAX_OVERRIDES_PER_NIGHT).toBe(2)
    expect(canStartOverride(0, true)).toEqual({ ok: true })
    expect(canStartOverride(1, true)).toEqual({ ok: true })
    expect(canStartOverride(2, true)).toEqual({ ok: false, reason: 'limit-reached' })
    expect(canStartOverride(5, true)).toEqual({ ok: false, reason: 'limit-reached' })
    expect(canStartOverride(0, false)).toEqual({ ok: false, reason: 'disabled' })
    expect(overridesRemaining(0)).toBe(2)
    expect(overridesRemaining(1)).toBe(1)
    expect(overridesRemaining(3)).toBe(0)
  })

  it('counts down without going negative', () => {
    const now = 1_000_000
    expect(overrideSecondsLeft(now + 30 * 60 * 1000, now)).toBe(1800)
    expect(overrideSecondsLeft(now + 1500, now)).toBe(2)
    expect(overrideSecondsLeft(now - 5000, now)).toBe(0)
    expect(formatCountdown(1800)).toBe('30:00')
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(0)).toBe('0:00')
  })
})

describe('insomnia line', () => {
  it('uses the original graded wording', () => {
    expect(insomniaLine(0)).toBe("You haven't reported sleep trouble this week.")
    expect(insomniaLine(1)).toBe("You've had one night of sleep trouble this week.")
    expect(insomniaLine(2)).toBe("You've had trouble sleeping 2 nights this week.")
    expect(insomniaLine(3)).toBe("You've had trouble sleeping multiple nights this week.")
    expect(insomniaLine(7)).toBe(insomniaLine(3))
  })
})

describe('wind-down estimate', () => {
  it('grows with session load, floors at 15 and caps at 60, in steps of 5', () => {
    expect(estimateWindDownMinutes(0)).toBe(15)
    expect(estimateWindDownMinutes(59)).toBe(15)
    expect(estimateWindDownMinutes(60)).toBe(20)
    expect(estimateWindDownMinutes(4 * 60 + 30)).toBe(35)
    expect(estimateWindDownMinutes(9 * 60)).toBe(60)
    expect(estimateWindDownMinutes(20 * 60)).toBe(60)
    expect(estimateWindDownMinutes(-10)).toBe(15)
  })
})
