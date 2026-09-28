// src/lib/telemetry/ai-sites.ts
// AI-site pause ("Latency Reset" from the retired extension).
//
// The moment: you send a prompt, the model thinks, and the hand reaches for
// another tab. If the user leaves an AI chat tab within a short window of
// arriving, we show a small "Hold. Stay here." for a few seconds.
//
// Pure logic here (no React, no Tauri) so it can be unit tested. The hook in
// src/hooks/useAiSitePause.ts feeds it telemetry events.

export const AI_CHAT_DOMAINS = [
  'chat.openai.com',
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'perplexity.ai',
  'chat.deepseek.com',
  'grok.com',
] as const

/** Leaving within this many ms of arriving counts as the tab-away impulse. */
export const AI_PAUSE_ARRIVAL_WINDOW_MS = 25_000
/** How long the overlay stays up. */
export const AI_PAUSE_DISPLAY_MS = 6_000
/** Minimum gap between two pauses. */
export const AI_PAUSE_COOLDOWN_MS: Record<'gentle' | 'standard' | 'firm', number> = {
  gentle: 60 * 60_000,
  standard: 10 * 60_000,
  firm: 10 * 60_000,
}

/** Does this domain (as reported by telemetry) belong to an AI chat site? */
export function isAiChatDomain(domain: string | null | undefined): boolean {
  if (!domain) return false
  const d = domain.toLowerCase().replace(/^www\./, '')
  return AI_CHAT_DOMAINS.some(host => d === host || d.endsWith('.' + host))
}

export interface AiPauseTrackerOptions {
  arrivalWindowMs?: number
  cooldownMs?: number
}

/**
 * Tracks arrival at an AI chat tab and decides whether leaving it should
 * trigger the pause. Feed it every tab switch and app switch.
 */
export class AiPauseTracker {
  private arrivedAt: number | null = null
  private lastShownAt: number | null = null
  private readonly arrivalWindowMs: number
  private cooldownMs: number

  constructor(options: AiPauseTrackerOptions = {}) {
    this.arrivalWindowMs = options.arrivalWindowMs ?? AI_PAUSE_ARRIVAL_WINDOW_MS
    this.cooldownMs = options.cooldownMs ?? AI_PAUSE_COOLDOWN_MS.standard
  }

  setCooldown(ms: number): void {
    this.cooldownMs = ms
  }

  /**
   * A browser tab became active. Returns true when the pause should show
   * (the user just left an AI tab they had only just arrived at).
   */
  onTabSwitch(domain: string | null | undefined, now: number): boolean {
    const shouldShow = this.leave(now)
    if (isAiChatDomain(domain)) {
      this.arrivedAt = now
    }
    return shouldShow
  }

  /**
   * The frontmost app changed. Leaving the browser for another app counts
   * as leaving the AI tab; returning to the browser does not re-arm.
   */
  onAppSwitch(now: number): boolean {
    return this.leave(now)
  }

  /** Forget any pending arrival (session ended, feature disabled). */
  reset(): void {
    this.arrivedAt = null
  }

  private leave(now: number): boolean {
    if (this.arrivedAt === null) return false
    const dwell = now - this.arrivedAt
    this.arrivedAt = null
    if (dwell < 0 || dwell > this.arrivalWindowMs) return false
    if (this.lastShownAt !== null && now - this.lastShownAt < this.cooldownMs) return false
    this.lastShownAt = now
    return true
  }
}
