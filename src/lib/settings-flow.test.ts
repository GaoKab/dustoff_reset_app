import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/preferences/types'
import {
  normalizeDraftClocks,
  validatePreferencesDraft,
  preferencesPatch,
  settingsSavedLine,
  panelAfterSettingsSave,
  nightProtectionMayTakeOver,
} from './settings-flow'
import { nightPhaseFor } from '@/lib/night/schedule'

vi.mock('@/lib/tauri-bridge', () => ({ tauriBridge: { resizeWindow: vi.fn() } }))

const prefs = (patch: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...patch })

describe('draft clocks', () => {
  it('normalises what a time input hands over', () => {
    const d = normalizeDraftClocks(prefs({ workStart: '9:00', workEnd: '17:00:00' }))
    expect(d?.workStart).toBe('09:00')
    expect(d?.workEnd).toBe('17:00')
  })

  it('refuses a partial value instead of throwing', () => {
    expect(normalizeDraftClocks(prefs({ workEnd: '' }))).toBeNull()
    expect(normalizeDraftClocks(prefs({ workEnd: '17:' }))).toBeNull()
    expect(normalizeDraftClocks(prefs({ nightModeStart: '25:00' }))).toBeNull()
  })
})

describe('validatePreferencesDraft', () => {
  it('accepts the defaults', () => {
    expect(validatePreferencesDraft(prefs())).toBeNull()
  })

  it('names a malformed time in one line', () => {
    expect(validatePreferencesDraft(prefs({ workStart: '' }))).toBe('Each time needs the form HH:MM.')
  })

  it('mirrors the Rust rule that work start and end differ', () => {
    expect(validatePreferencesDraft(prefs({ workStart: '09:00', workEnd: '09:00' }))).toMatch(/different/)
  })

  it('checks the explicit phases only when the override is on', () => {
    const outOfOrder = { nightModeStart: '20:00', shutdownStart: '19:00', protectionStart: '00:00', nightModeEnd: '06:00' }
    expect(validatePreferencesDraft(prefs({ ...outOfOrder, phaseOverride: false }))).toBeNull()
    expect(validatePreferencesDraft(prefs({ ...outOfOrder, phaseOverride: true }))).toMatch(/Night protection needs to start after shutdown/)
  })
})

describe('preferencesPatch', () => {
  it('contains only the fields that changed, comparing work days by value', () => {
    const base = prefs()
    expect(preferencesPatch(base, { ...base, workDays: [...base.workDays] })).toEqual({})
    const days = base.workDays.map((d, i) => (i === 5 ? !d : d))
    expect(preferencesPatch(base, { ...base, workEnd: '18:00', workDays: days })).toEqual({ workEnd: '18:00', workDays: days })
  })
})

describe('settingsSavedLine', () => {
  it('reads the derived phases back', () => {
    expect(settingsSavedLine(prefs())).toBe(
      'Saved. Wind-down from 8:00 pm, shutdown from 10:00 pm, night protection from midnight to 6:00 am.'
    )
    expect(settingsSavedLine(prefs({ scheduleMode: 'night_shift', workStart: '19:00', workEnd: '07:00' }))).toBe(
      'Saved. Wind-down from 8:00 am, shutdown from 10:00 am, night protection from noon to 6:00 pm.'
    )
  })

  it('says why the standard clock applies when the hours cannot fit', () => {
    expect(settingsSavedLine(prefs({ scheduleMode: 'custom', workStart: '09:00', workEnd: '06:00' }))).toMatch(/^Saved\. Those hours leave less than six hours/)
  })

  it('says so when night mode is off', () => {
    expect(settingsSavedLine(prefs({ nightModeEnabled: false }))).toBe('Saved. Night mode is off.')
  })
})

describe('panelAfterSettingsSave', () => {
  it('returns to the entry point after the first-run card, never the bare HUD', () => {
    expect(panelAfterSettingsSave({ from: 'setup' })).toBe('entryPoint')
  })

  it('returns to what was open before the HUD gear was tapped', () => {
    expect(panelAfterSettingsSave({ from: 'hud', returnTo: null })).toBeNull()
    expect(panelAfterSettingsSave({ from: 'hud', returnTo: 'progress' })).toBe('progress')
    expect(panelAfterSettingsSave({ from: 'hud', returnTo: 'settings' })).toBeNull()
    expect(panelAfterSettingsSave(null)).toBeNull()
  })
})

describe('nightProtectionMayTakeOver', () => {
  it('lets the STOP screen in only when nothing else is open', () => {
    expect(nightProtectionMayTakeOver(null)).toBe(true)
    expect(nightProtectionMayTakeOver('nightProtection')).toBe(true)
    expect(nightProtectionMayTakeOver('settings')).toBe(false)
    expect(nightProtectionMayTakeOver('entryPoint')).toBe(false)
    expect(nightProtectionMayTakeOver('calibration')).toBe(false)
  })

  // Regression for the founder's report: typing a night shift's hours in
  // the morning moves "now" into night protection. With a per-keystroke
  // save that flip showed the STOP screen over the open Settings panel.
  it('regression: a shift edit that lands in night protection does not evict Settings', () => {
    const morning = new Date(2026, 0, 15, 11, 30) // Thursday 11:30
    const midEdit = prefs({ scheduleMode: 'night_shift', workStart: '22:00', workEnd: '06:00' })
    expect(nightPhaseFor(morning, midEdit)).toBe('night-protection')
    expect(nightProtectionMayTakeOver('settings')).toBe(false)
  })
})

describe('panelDimensions', () => {
  it('never hands the window an unknown or zero size', async () => {
    const { panelDimensions, PANEL_DIMENSIONS } = await import('@/hooks/useTauriWindow')
    expect(panelDimensions('settings')).toEqual(PANEL_DIMENSIONS.settings)
    expect(panelDimensions(null)).toEqual(PANEL_DIMENSIONS.hudOnly)
    // A key the table does not have (a stale or misspelt panel name)
    expect(panelDimensions('doesNotExist' as never)).toEqual(PANEL_DIMENSIONS.hudOnly)
  })
})
