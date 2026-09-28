import { describe, it, expect } from 'vitest'
import { DEFAULT_PREFERENCES } from '@/lib/preferences/types'
import {
  derivePhaseBounds,
  resolveNight,
  nightPhaseFor,
  nightKeyFor,
  shiftFor,
  weekdayIndex,
  clockWords,
  describeNightBounds,
  describeDaysOff,
  STANDARD_BOUNDS,
} from './schedule'

// January 2026: Mon 12, Tue 13, Wed 14, Thu 15, Fri 16, Sat 17, Sun 18, Mon 19
const jan = (day: number, h: number, m = 0) => new Date(2026, 0, day, h, m)

const nightShift = {
  ...DEFAULT_PREFERENCES,
  scheduleMode: 'night_shift' as const,
  workStart: '19:00',
  workEnd: '07:00',
}
const lateShift = { ...nightShift, workStart: '22:00', workEnd: '06:00' }
const custom = { ...DEFAULT_PREFERENCES, scheduleMode: 'custom' as const, workStart: '09:00', workEnd: '17:00' }

describe('derivePhaseBounds', () => {
  it('keeps the standard clock in standard mode, whatever the work hours say', () => {
    const d = derivePhaseBounds({ ...DEFAULT_PREFERENCES, workStart: '19:00', workEnd: '07:00' })
    expect(d.source).toBe('standard')
    expect(d.bounds).toEqual(STANDARD_BOUNDS)
    expect(d.problem).toBeNull()
  })

  it('derives a 19:00 to 07:00 night shift', () => {
    const d = derivePhaseBounds(nightShift)
    expect(d.source).toBe('schedule')
    expect(d.bounds).toEqual({ nightModeStart: '08:00', shutdownStart: '10:00', protectionStart: '12:00', nightModeEnd: '18:00' })
  })

  it('derives a 22:00 to 06:00 shift', () => {
    expect(derivePhaseBounds(lateShift).bounds).toEqual({
      nightModeStart: '07:00',
      shutdownStart: '09:00',
      protectionStart: '11:00',
      nightModeEnd: '21:00',
    })
  })

  it('derives custom 09:00 to 17:00 hours, with the night crossing midnight', () => {
    const d = derivePhaseBounds(custom)
    expect(d.source).toBe('schedule')
    expect(d.bounds).toEqual({ nightModeStart: '18:00', shutdownStart: '20:00', protectionStart: '22:00', nightModeEnd: '08:00' })
  })

  it('wraps phases that land past midnight', () => {
    expect(derivePhaseBounds({ ...custom, workStart: '14:00', workEnd: '22:30' }).bounds).toEqual({
      nightModeStart: '23:30',
      shutdownStart: '01:30',
      protectionStart: '03:30',
      nightModeEnd: '13:00',
    })
  })

  it('falls back to standard with a message when the gap between shifts is too short', () => {
    const d = derivePhaseBounds({ ...custom, workStart: '08:00', workEnd: '03:00' })
    expect(d.source).toBe('standard')
    expect(d.bounds).toEqual(STANDARD_BOUNDS)
    expect(d.problem).toMatch(/six hours/)
    expect(derivePhaseBounds({ ...custom, workStart: '09:00', workEnd: '09:00' }).problem).toMatch(/same time/)
    expect(derivePhaseBounds({ ...custom, workEnd: '5pm' }).problem).toMatch(/HH:MM/)
  })

  it('lets the explicit phase override win, and falls back when it is out of order', () => {
    const explicit = { ...nightShift, phaseOverride: true, nightModeStart: '21:00', shutdownStart: '23:00', protectionStart: '01:00', nightModeEnd: '07:00' }
    const d = derivePhaseBounds(explicit)
    expect(d.source).toBe('override')
    expect(d.bounds).toEqual({ nightModeStart: '21:00', shutdownStart: '23:00', protectionStart: '01:00', nightModeEnd: '07:00' })
    const broken = derivePhaseBounds({ ...explicit, shutdownStart: '20:00' })
    expect(broken.source).toBe('standard')
    expect(broken.problem).toMatch(/out of order/)
  })
})

describe('shifts and weekdays', () => {
  it('indexes Monday first', () => {
    expect(weekdayIndex(jan(12, 10))).toBe(0)
    expect(weekdayIndex(jan(18, 10))).toBe(6)
  })

  it('finds the shift in progress or the one that ended last', () => {
    // Crossing shift 19:00 to 07:00
    expect(shiftFor(jan(13, 20), '19:00', '07:00')).toEqual({ startDate: jan(13, 0), atWork: true })
    expect(shiftFor(jan(14, 3), '19:00', '07:00')).toEqual({ startDate: jan(13, 0), atWork: true })
    expect(shiftFor(jan(14, 12), '19:00', '07:00')).toEqual({ startDate: jan(13, 0), atWork: false })
    // Day shift 09:00 to 17:00
    expect(shiftFor(jan(13, 10), '09:00', '17:00')).toEqual({ startDate: jan(13, 0), atWork: true })
    expect(shiftFor(jan(13, 20), '09:00', '17:00')).toEqual({ startDate: jan(13, 0), atWork: false })
    expect(shiftFor(jan(14, 7), '09:00', '17:00')).toEqual({ startDate: jan(13, 0), atWork: false })
    expect(shiftFor(jan(14, 7), '09:00', '09:00')).toBeNull()
  })
})

describe('resolveNight: the one accessor', () => {
  it('is off when night mode is off', () => {
    expect(resolveNight(jan(13, 23), { ...nightShift, nightModeEnabled: false }).reason).toBe('off')
    expect(nightPhaseFor(jan(13, 23), { ...nightShift, nightModeEnabled: false })).toBe('day')
  })

  it('uses the standard clock in standard mode, every day', () => {
    expect(resolveNight(jan(17, 23), DEFAULT_PREFERENCES).reason).toBe('standard')
    expect(nightPhaseFor(jan(17, 23), DEFAULT_PREFERENCES)).toBe('shutdown')
    expect(nightPhaseFor(jan(18, 2), DEFAULT_PREFERENCES)).toBe('night-protection')
  })

  it('gives a nurse her day sleep after a work night, and no night while on shift', () => {
    // Tuesday shift 19:00 to Wednesday 07:00: at work, no night
    expect(resolveNight(jan(13, 23), nightShift).reason).toBe('at-work')
    expect(nightPhaseFor(jan(13, 23), nightShift)).toBe('day')
    expect(nightPhaseFor(jan(14, 2), nightShift)).toBe('day')
    // Wednesday daytime: wind-down 08:00, shutdown 10:00, protection 12:00 to 18:00
    expect(resolveNight(jan(14, 9), nightShift).reason).toBe('schedule')
    expect(nightPhaseFor(jan(14, 7, 30), nightShift)).toBe('day')
    expect(nightPhaseFor(jan(14, 9), nightShift)).toBe('wind-down')
    expect(nightPhaseFor(jan(14, 11), nightShift)).toBe('shutdown')
    expect(nightPhaseFor(jan(14, 14), nightShift)).toBe('night-protection')
    expect(nightPhaseFor(jan(14, 18), nightShift)).toBe('day')
  })

  it('gives a nurse a normal night on her days off', () => {
    // Saturday daytime follows the Friday shift: still her rhythm
    expect(resolveNight(jan(17, 14), nightShift).reason).toBe('schedule')
    expect(nightPhaseFor(jan(17, 14), nightShift)).toBe('night-protection')
    // Saturday night: no shift started Saturday, so the usual evening clock
    expect(resolveNight(jan(17, 23), nightShift).reason).toBe('day-off')
    expect(nightPhaseFor(jan(17, 21), nightShift)).toBe('wind-down')
    expect(nightPhaseFor(jan(17, 23), nightShift)).toBe('shutdown')
    expect(nightPhaseFor(jan(18, 2), nightShift)).toBe('night-protection')
    expect(nightPhaseFor(jan(18, 14), nightShift)).toBe('day')
    // Monday: back on shift at 19:00
    expect(resolveNight(jan(19, 20), nightShift).reason).toBe('at-work')
  })

  it('keeps the shift rhythm on days off when asked', () => {
    const keep = { ...nightShift, keepShiftRhythmOnDaysOff: true }
    expect(resolveNight(jan(17, 23), keep).reason).toBe('schedule')
    expect(nightPhaseFor(jan(17, 23), keep)).toBe('day')
    expect(nightPhaseFor(jan(18, 14), keep)).toBe('night-protection')
    // The tick is night_shift only; custom ignores it
    expect(resolveNight(jan(17, 23), { ...custom, keepShiftRhythmOnDaysOff: true }).reason).toBe('day-off')
  })

  it('handles custom day hours across the week', () => {
    // Tuesday at work
    expect(resolveNight(jan(13, 10), custom).reason).toBe('at-work')
    // Tuesday evening: wind-down 18:00, shutdown 20:00, protection 22:00 to 08:00
    expect(nightPhaseFor(jan(13, 19), custom)).toBe('wind-down')
    expect(nightPhaseFor(jan(13, 21), custom)).toBe('shutdown')
    expect(nightPhaseFor(jan(14, 7), custom)).toBe('night-protection')
    expect(nightPhaseFor(jan(14, 8), custom)).toBe('day')
    // Saturday morning still belongs to Friday's night
    expect(nightPhaseFor(jan(17, 7), custom)).toBe('night-protection')
    // Saturday evening: a day off, the usual clock
    expect(resolveNight(jan(17, 19), custom).reason).toBe('day-off')
    expect(nightPhaseFor(jan(17, 19), custom)).toBe('day')
    expect(nightPhaseFor(jan(17, 20), custom)).toBe('wind-down')
  })

  it('honours the explicit override on every day', () => {
    const explicit = { ...nightShift, phaseOverride: true, nightModeStart: '21:00', shutdownStart: '23:00', protectionStart: '01:00', nightModeEnd: '07:00' }
    expect(resolveNight(jan(17, 23), explicit).reason).toBe('override')
    expect(nightPhaseFor(jan(13, 23, 30), explicit)).toBe('shutdown')
  })

  it('keys nights by the derived window', () => {
    // Night shift: the Wednesday day sleep is keyed Wednesday, across the whole day
    expect(nightKeyFor(jan(14, 9), nightShift)).toBe('2026-01-14')
    expect(nightKeyFor(jan(14, 17), nightShift)).toBe('2026-01-14')
    // Custom day hours: Wednesday 07:00 is still Tuesday's night
    expect(nightKeyFor(jan(14, 7), custom)).toBe('2026-01-13')
    expect(nightKeyFor(jan(14, 8), custom)).toBe('2026-01-14')
    // Standard: the usual key
    expect(nightKeyFor(jan(14, 5), DEFAULT_PREFERENCES)).toBe('2026-01-13')
  })
})

describe('plain words', () => {
  it('reads times back in plain words', () => {
    expect(clockWords('00:00')).toBe('midnight')
    expect(clockWords('12:00')).toBe('noon')
    expect(clockWords('08:00')).toBe('8:00 am')
    expect(clockWords('20:00')).toBe('8:00 pm')
    expect(clockWords('00:30')).toBe('12:30 am')
    expect(clockWords('12:30')).toBe('12:30 pm')
    expect(clockWords('late')).toBe('late')
  })

  it('describes the standard clock and a shift', () => {
    expect(describeNightBounds(STANDARD_BOUNDS)).toBe(
      'Wind-down from 8:00 pm, shutdown from 10:00 pm, night protection from midnight to 6:00 am.'
    )
    expect(describeNightBounds(derivePhaseBounds(nightShift).bounds)).toBe(
      'Wind-down from 8:00 am, shutdown from 10:00 am, night protection from noon to 6:00 pm.'
    )
  })

  it('describes days off', () => {
    expect(describeDaysOff(DEFAULT_PREFERENCES)).toBeNull()
    expect(describeDaysOff(nightShift)).toMatch(/usual evening clock/)
    expect(describeDaysOff({ ...nightShift, keepShiftRhythmOnDaysOff: true })).toBe('The same rhythm on days off.')
    expect(describeDaysOff({ ...nightShift, phaseOverride: true })).toBeNull()
  })
})
