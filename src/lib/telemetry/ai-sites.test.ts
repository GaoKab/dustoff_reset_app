import { describe, it, expect } from 'vitest'
import { isAiChatDomain, AiPauseTracker } from './ai-sites'

describe('AI-site detection', () => {
  it('recognises the AI chat hosts and their subdomains only', () => {
    expect(isAiChatDomain('chatgpt.com')).toBe(true)
    expect(isAiChatDomain('chat.openai.com')).toBe(true)
    expect(isAiChatDomain('claude.ai')).toBe(true)
    expect(isAiChatDomain('www.perplexity.ai')).toBe(true)
    expect(isAiChatDomain('gemini.google.com')).toBe(true)
    expect(isAiChatDomain('docs.google.com')).toBe(false)
    expect(isAiChatDomain('notclaude.ai')).toBe(false)
    expect(isAiChatDomain(null)).toBe(false)
  })
})

describe('AiPauseTracker', () => {
  it('fires when the user leaves an AI tab within the arrival window, then honours the cooldown', () => {
    const t = new AiPauseTracker({ arrivalWindowMs: 25_000, cooldownMs: 600_000 })
    expect(t.onTabSwitch('claude.ai', 0)).toBe(false)       // arriving never fires
    expect(t.onTabSwitch('github.com', 10_000)).toBe(true)  // left after 10s
    expect(t.onTabSwitch('claude.ai', 20_000)).toBe(false)
    expect(t.onTabSwitch('github.com', 25_000)).toBe(false) // cooldown
    expect(t.onTabSwitch('claude.ai', 700_000)).toBe(false)
    expect(t.onAppSwitch(705_000)).toBe(true)               // leaving the browser counts
  })

  it('does not fire when the user stayed longer than the window or switched between AI tabs late', () => {
    const t = new AiPauseTracker({ arrivalWindowMs: 25_000, cooldownMs: 0 })
    t.onTabSwitch('chatgpt.com', 0)
    expect(t.onTabSwitch('github.com', 26_000)).toBe(false)
    expect(t.onAppSwitch(30_000)).toBe(false)               // nothing pending any more
    t.onTabSwitch('chatgpt.com', 100_000)
    expect(t.onTabSwitch('claude.ai', 105_000)).toBe(true)  // leaving one AI tab for another still counts
    t.reset()
    expect(t.onAppSwitch(106_000)).toBe(false)
  })
})
