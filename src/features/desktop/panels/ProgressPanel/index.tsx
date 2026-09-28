// src/features/desktop/panels/ProgressPanel/index.tsx
// Individual progress dashboard: your capacity and sessions over time.
//
// Claims discipline: shows the user's own history against their own history —
// patterns, not diagnoses. Calibration scores are capacity-side (higher =
// more capacity). No burnout language, no predictions.

import { useState, useEffect, useMemo } from 'react'
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import { tauriBridge } from '@/lib/tauri-bridge'
import { insomniaLine, dateKeyDaysAgo } from '@/lib/night'
import type { CalibrationData, SessionRecord } from '@/lib/tauri-types'

interface ProgressPanelProps {
  onClose: () => void
}

type RangeDays = 7 | 30

interface DayFocus {
  day: string // e.g. "Mon 8"
  minutes: number
}

interface WeekSummary {
  sessions: number
  focusMinutes: number
  avgCalibration: number | null
  avgFlowEfficiency: number | null
}

const dayKey = (iso: string) => iso.slice(0, 10)

function summarize(
  sessions: SessionRecord[],
  calibrations: CalibrationData[],
  fromMs: number,
  toMs: number
): WeekSummary {
  const inRange = sessions.filter(s => {
    const t = new Date(s.startedAt).getTime()
    return t >= fromMs && t < toMs && s.endedAt !== null
  })
  const focusMinutes = inRange.reduce((sum, s) => sum + (s.actualDurationMinutes || 0), 0)
  const flowVals = inRange
    .map(s => s.flowEfficiency)
    .filter((v): v is number => v !== null)
  const calVals = calibrations.filter(c => {
    const t = new Date(c.date + 'T12:00:00').getTime()
    return t >= fromMs && t < toMs
  })
  return {
    sessions: inRange.length,
    focusMinutes,
    avgCalibration: calVals.length
      ? Math.round(calVals.reduce((s, c) => s + c.calibrationScore, 0) / calVals.length)
      : null,
    avgFlowEfficiency: flowVals.length
      ? Math.round(flowVals.reduce((s, v) => s + v, 0) / flowVals.length)
      : null,
  }
}

function Delta({ now, prev, suffix = '' }: { now: number | null; prev: number | null; suffix?: string }) {
  if (now === null || prev === null) return null
  const diff = now - prev
  if (Math.abs(diff) < 1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-zinc-500">
        <Minus className="w-3 h-3" /> same as last week
      </span>
    )
  }
  const up = diff > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${up ? 'text-emerald-400' : 'text-amber-400'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{Math.round(diff)}{suffix} vs last week
    </span>
  )
}

export function ProgressPanel({ onClose }: ProgressPanelProps) {
  const [range, setRange] = useState<RangeDays>(7)
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [calibrations, setCalibrations] = useState<CalibrationData[]>([])
  const [loading, setLoading] = useState(true)
  // Night mode: distinct nights in the last seven with an "I can't sleep" choice
  const [troubleNights, setTroubleNights] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [allSessions, calHistory] = await Promise.all([
          tauriBridge.getAllSessions(),
          tauriBridge.getCalibrationHistory(35),
        ])
        setSessions(allSessions)
        setCalibrations(calHistory)
        try {
          const nights = await tauriBridge.countNightsWithEventSince(dateKeyDaysAgo(new Date(), 6), 'cant_sleep')
          setTroubleNights(nights)
        } catch (nightError) {
          console.log('[Progress] Night events unavailable:', nightError)
        }
      } catch (error) {
        console.error('[Progress] Failed to load history:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  const thisWeek = useMemo(
    () => summarize(sessions, calibrations, now - 7 * DAY, now),
    [sessions, calibrations, now]
  )
  const lastWeek = useMemo(
    () => summarize(sessions, calibrations, now - 14 * DAY, now - 7 * DAY),
    [sessions, calibrations, now]
  )

  // Calibration trend (oldest → newest, clipped to range)
  const calTrend = useMemo(() => {
    const cutoff = now - range * DAY
    return [...calibrations]
      .filter(c => new Date(c.date + 'T12:00:00').getTime() >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(c => ({
        day: c.date.slice(5), // MM-DD
        score: Math.round(c.calibrationScore),
      }))
  }, [calibrations, range, now])

  // Daily focus minutes for the selected range
  const focusByDay = useMemo(() => {
    const days: DayFocus[] = []
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now - i * DAY)
      const key = dayKey(d.toISOString())
      const minutes = sessions
        .filter(s => s.endedAt && dayKey(s.startedAt) === key)
        .reduce((sum, s) => sum + (s.actualDurationMinutes || 0), 0)
      days.push({
        day: range === 7
          ? d.toLocaleDateString(undefined, { weekday: 'short' })
          : String(d.getDate()),
        minutes,
      })
    }
    return days
  }, [sessions, range, now])

  // Honest session outcomes (selected range)
  const outcomes = useMemo(() => {
    const cutoff = now - range * DAY
    const ended = sessions.filter(
      s => s.endedAt && new Date(s.startedAt).getTime() >= cutoff
    )
    const count = (pred: (s: SessionRecord) => boolean) => ended.filter(pred).length
    return {
      finished: count(s => s.endReason === 'completed' || s.endReason === 'mission_complete'),
      ranOutOfTime: count(s => s.endReason === 'stopping_early' && s.endSubReason === 'Ran out of time'),
      stoppedEarly: count(s => s.endReason === 'stopping_early' && s.endSubReason !== 'Ran out of time'),
      pulledAway: count(s => s.endReason === 'pulled_away'),
      total: ended.length,
    }
  }, [sessions, range, now])

  // Personal bests (all time)
  const bests = useMemo(() => {
    const streak = Math.max(0, ...sessions.map(s => s.longestStreakMinutes || 0))
    const bestCal = Math.max(0, ...calibrations.map(c => c.calibrationScore))
    return { streak, bestCal: Math.round(bestCal) }
  }, [sessions, calibrations])

  const hasAnyData = sessions.length > 0 || calibrations.length > 0

  return (
    <div className="text-white">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-light text-emerald-400">Your Progress</h2>
          <p className="text-sm text-zinc-400 mt-0.5">You, compared to you — nothing else.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
            {([7, 30] as RangeDays[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 transition-colors ${
                  range === r ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500 py-12 text-center">Loading your history…</p>
      ) : !hasAnyData ? (
        <p className="text-sm text-zinc-500 py-12 text-center">
          No history yet. Calibrate and run a session — this page starts telling your story tomorrow.
        </p>
      ) : (
        <div className="space-y-5">
          {/* This week summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500">Focus time this week</p>
              <p className="text-2xl font-light mt-0.5">
                {Math.floor(thisWeek.focusMinutes / 60)}h {thisWeek.focusMinutes % 60}m
              </p>
              <Delta now={thisWeek.focusMinutes} prev={lastWeek.focusMinutes} suffix="m" />
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500">Sessions this week</p>
              <p className="text-2xl font-light mt-0.5">{thisWeek.sessions}</p>
              <Delta now={thisWeek.sessions} prev={lastWeek.sessions} />
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500">Avg morning calibration</p>
              <p className="text-2xl font-light mt-0.5">{thisWeek.avgCalibration ?? '—'}</p>
              <Delta now={thisWeek.avgCalibration} prev={lastWeek.avgCalibration} />
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500">Avg flow efficiency</p>
              <p className="text-2xl font-light mt-0.5">
                {thisWeek.avgFlowEfficiency !== null ? `${thisWeek.avgFlowEfficiency}%` : '—'}
              </p>
              <Delta now={thisWeek.avgFlowEfficiency} prev={lastWeek.avgFlowEfficiency} suffix="%" />
            </div>
          </div>

          {/* Morning calibration trend */}
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <p className="text-sm text-zinc-300 mb-1">Morning calibration</p>
            <p className="text-xs text-zinc-500 mb-2">Your starting capacity each day (higher = more capacity)</p>
            {calTrend.length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={calTrend} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#0a0f0d', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelStyle={{ color: '#a1a1aa' }}
                  />
                  <ReferenceLine y={75} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Two or more calibrations needed to draw a trend.
              </p>
            )}
          </div>

          {/* Daily focus minutes */}
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <p className="text-sm text-zinc-300 mb-2">Focus minutes per day</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={focusByDay} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 10 }} interval={range === 30 ? 4 : 0} />
                <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#0a0f0d', border: '1px solid #3f3f46', borderRadius: 8 }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Bar dataKey="minutes" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Honest endings */}
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <p className="text-sm text-zinc-300 mb-2">How sessions ended ({range}d)</p>
            {outcomes.total === 0 ? (
              <p className="text-xs text-zinc-500 py-2 text-center">No completed sessions in this range.</p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {[
                  { label: 'Finished what I intended', value: outcomes.finished, color: 'bg-emerald-500' },
                  { label: 'Ran out of time', value: outcomes.ranOutOfTime, color: 'bg-blue-500' },
                  { label: 'Stopped early', value: outcomes.stoppedEarly, color: 'bg-amber-500' },
                  { label: 'Pulled away', value: outcomes.pulledAway, color: 'bg-red-400' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="text-zinc-400 text-xs w-44 flex-shrink-0">{row.label}</span>
                    <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.color} rounded-full`}
                        style={{ width: `${(row.value / outcomes.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-zinc-300 text-xs w-6 text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Personal bests */}
          <div className="flex gap-3">
            <div className="flex-1 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500">Longest focus streak</p>
              <p className="text-lg font-light">{bests.streak} min</p>
            </div>
            <div className="flex-1 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500">Best morning calibration</p>
              <p className="text-lg font-light">{bests.bestCal}</p>
            </div>
          </div>

          {/* Nights: the only place the insomnia line appears. No advice. */}
          {troubleNights !== null && (
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1">Nights</p>
              <p className="text-sm text-zinc-300">{insomniaLine(troubleNights)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
