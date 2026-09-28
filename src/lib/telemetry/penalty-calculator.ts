// src/lib/telemetry/penalty-calculator.ts
// Penalty calculation logic (platform-agnostic)

import { AppCategory, isDistraction, getAppCategory, getDomainCategory } from './app-categories'
import { Mode, getModeWeights } from './mode-weights'
import {
  BASE_PENALTIES,
  BASE_BONUSES,
  getEscalationMultiplier,
  getDelayGateSeconds,
  getPenaltyKeyForCategory,
  triggersExtension,
} from './penalties'
import type { ActiveAppInfo, BrowserTabInfo } from './telemetry-listener'

/**
 * Result of a penalty calculation
 */
export interface PenaltyResult {
  basePenalty: number
  modeWeight: number
  escalationMultiplier: number
  /** Night mode drift multiplier (1 by day; 1.2 / 1.5 / 2.0 by night phase) */
  nightMultiplier: number
  finalPenalty: number
  category: AppCategory
  penaltyType: string
  categoryName: string
}

/**
 * Result of a bonus calculation
 */
export interface BonusResult {
  baseBonus: number
  modeWeight: number
  finalBonus: number
  bonusType: string
}

/**
 * Intervention configuration
 */
export interface InterventionConfig {
  type: 'delay_gate' | 'block_screen' | 'communication_warning' | 'none'
  delaySeconds?: number
  canWaitThrough: boolean
  triggerExtension: boolean
  extensionMinutes: number
  message?: string
}

/**
 * Check if app is Dustoff Reset (always whitelisted)
 */
function isDustoffReset(appInfo: ActiveAppInfo): boolean {
  const name = appInfo.appName.toLowerCase()
  const bundleId = (appInfo.bundleId || '').toLowerCase()
  
  return (
    name.includes('dustoff') ||
    name.includes('dustoff_reset') ||
    name.includes('dustoff reset') ||
    bundleId.includes('dustoff') ||
    bundleId.includes('dustoff_reset')
  )
}

/**
 * Calculate the penalty for an app switch
 */
export function calculateAppSwitchPenalty(
  toApp: ActiveAppInfo,
  mode: Mode,
  offenseNumber: number,
  isWhitelisted: boolean = false,
  nightMultiplier: number = 1
): PenaltyResult {
  // Get category
  const category = getAppCategory(toApp)
  const categoryName = category.replace('_', ' ')
  
  // Always whitelist Dustoff Reset itself
  if (isDustoffReset(toApp)) {
    return {
      basePenalty: 0,
      modeWeight: 1,
      escalationMultiplier: 1,
      nightMultiplier: 1,
      finalPenalty: 0,
      category: AppCategory.PRODUCTIVE,
      penaltyType: 'dustoff_reset',
      categoryName: 'Dustoff Reset',
    }
  }
  
  // If whitelisted, no penalty
  if (isWhitelisted) {
    return {
      basePenalty: 0,
      modeWeight: 1,
      escalationMultiplier: 1,
      nightMultiplier: 1,
      finalPenalty: 0,
      category,
      penaltyType: 'whitelisted',
      categoryName,
    }
  }
  
  // If productive, no penalty
  if (category === AppCategory.PRODUCTIVE) {
    return {
      basePenalty: 0,
      modeWeight: 1,
      escalationMultiplier: 1,
      nightMultiplier: 1,
      finalPenalty: 0,
      category,
      penaltyType: 'productive',
      categoryName,
    }
  }
  
  // Get base penalty for category
  const penaltyKey = getPenaltyKeyForCategory(category)
  const basePenalty = BASE_PENALTIES[penaltyKey]
  
  // Get mode weight
  const modeWeight = getModeWeights(mode).penaltyWeight
  
  // Get escalation (only for distractions)
  const escalationMultiplier = isDistraction(category)
    ? getEscalationMultiplier(offenseNumber)
    : 1.0
  
  // Calculate final penalty. The night multiplier comes from src/lib/night
  // (wind-down 1.2, shutdown 1.5, night protection 2.0; gentle tone caps
  // at 1.2) and is 1 by day, so daytime sessions are unchanged.
  const finalPenalty = Math.round(
    basePenalty * modeWeight * escalationMultiplier * nightMultiplier * 10
  ) / 10
  
  return {
    basePenalty,
    modeWeight,
    escalationMultiplier,
    nightMultiplier,
    finalPenalty,
    category,
    penaltyType: penaltyKey,
    categoryName,
  }
}

/**
 * Calculate the penalty for a domain/tab switch
 */
export function calculateDomainPenalty(
  domain: string | null,
  mode: Mode,
  offenseNumber: number,
  isWhitelisted: boolean = false,
  nightMultiplier: number = 1
): PenaltyResult {
  // Get category from domain
  const category = getDomainCategory(domain)
  const categoryName = category.replace('_', ' ')
  
  // If whitelisted, no penalty
  if (isWhitelisted) {
    return {
      basePenalty: 0,
      modeWeight: 1,
      escalationMultiplier: 1,
      nightMultiplier: 1,
      finalPenalty: 0,
      category,
      penaltyType: 'whitelisted_domain',
      categoryName,
    }
  }
  
  // If productive or neutral, no penalty
  if (category === AppCategory.PRODUCTIVE || category === AppCategory.NEUTRAL) {
    return {
      basePenalty: 0,
      modeWeight: 1,
      escalationMultiplier: 1,
      nightMultiplier: 1,
      finalPenalty: 0,
      category,
      penaltyType: category === AppCategory.PRODUCTIVE ? 'productive_domain' : 'neutral_domain',
      categoryName,
    }
  }
  
  // Get base penalty for domain category
  let basePenalty = 0
  let penaltyType = 'domain_penalty'
  
  if (category === AppCategory.SOCIAL_MEDIA) {
    basePenalty = BASE_PENALTIES.domain_social_media
    penaltyType = 'domain_social_media'
  } else if (category === AppCategory.ENTERTAINMENT) {
    basePenalty = BASE_PENALTIES.domain_entertainment
    penaltyType = 'domain_entertainment'
  } else if (category === AppCategory.COMMUNICATION) {
    basePenalty = BASE_PENALTIES.app_switch_communication
    penaltyType = 'domain_communication'
  } else {
    basePenalty = BASE_PENALTIES.domain_non_whitelist
    penaltyType = 'domain_non_whitelist'
  }
  
  // Get mode weight
  const modeWeight = getModeWeights(mode).penaltyWeight
  
  // Get escalation (only for distractions)
  const escalationMultiplier = isDistraction(category)
    ? getEscalationMultiplier(offenseNumber)
    : 1.0
  
  // Calculate final penalty. The night multiplier comes from src/lib/night
  // (wind-down 1.2, shutdown 1.5, night protection 2.0; gentle tone caps
  // at 1.2) and is 1 by day, so daytime sessions are unchanged.
  const finalPenalty = Math.round(
    basePenalty * modeWeight * escalationMultiplier * nightMultiplier * 10
  ) / 10
  
  return {
    basePenalty,
    modeWeight,
    escalationMultiplier,
    nightMultiplier,
    finalPenalty,
    category,
    penaltyType,
    categoryName,
  }
}

/**
 * Calculate a bonus
 */
export function calculateBonus(
  bonusType: keyof typeof BASE_BONUSES,
  mode: Mode
): BonusResult {
  const baseBonus = BASE_BONUSES[bonusType]
  const modeWeight = getModeWeights(mode).bonusWeight
  const finalBonus = Math.round(baseBonus * modeWeight * 10) / 10
  
  return {
    baseBonus,
    modeWeight,
    finalBonus,
    bonusType,
  }
}

/**
 * Get intervention configuration for an app switch
 */
export function getInterventionConfig(
  toApp: ActiveAppInfo,
  mode: Mode,
  offenseNumber: number,
  communicationUsed: boolean = false
): InterventionConfig {
  const category = getAppCategory(toApp)
  
  // Zen mode: never intervene
  if (mode === 'Zen') {
    return {
      type: 'none',
      canWaitThrough: true,
      triggerExtension: false,
      extensionMinutes: 0,
    }
  }
  
  // Not a distraction or communication: no intervention
  if (!isDistraction(category) && category !== AppCategory.COMMUNICATION) {
    return {
      type: 'none',
      canWaitThrough: true,
      triggerExtension: false,
      extensionMinutes: 0,
    }
  }
  
  // Flow mode: delay gate for distractions
  if (mode === 'Flow') {
    if (isDistraction(category)) {
      return {
        type: 'delay_gate',
        delaySeconds: getDelayGateSeconds(offenseNumber),
        canWaitThrough: true,
        triggerExtension: false,
        extensionMinutes: 0,
        message: getDelayGateMessage(offenseNumber),
      }
    }
    // Flow allows communication without intervention
    return {
      type: 'none',
      canWaitThrough: true,
      triggerExtension: false,
      extensionMinutes: 0,
    }
  }
  
  // Legend mode: strict enforcement
  if (mode === 'Legend') {
    // Communication: warning first time, then block
    if (category === AppCategory.COMMUNICATION) {
      if (!communicationUsed) {
        return {
          type: 'communication_warning',
          delaySeconds: 30,
          canWaitThrough: true,
          triggerExtension: false,
          extensionMinutes: 0,
          message: 'You have 30 seconds. After that, communication apps are blocked.',
        }
      } else {
        return {
          type: 'block_screen',
          canWaitThrough: false,
          triggerExtension: triggersExtension(offenseNumber),
          extensionMinutes: triggersExtension(offenseNumber) ? 5 : 0,
          message: 'Communication apps are blocked for this session.',
        }
      }
    }
    
    // Distractions: always block
    if (isDistraction(category)) {
      return {
        type: 'block_screen',
        canWaitThrough: false,
        triggerExtension: triggersExtension(offenseNumber),
        extensionMinutes: triggersExtension(offenseNumber) ? 5 : 0,
        message: getBlockMessage(offenseNumber, toApp.appName),
      }
    }
  }
  
  // Default: no intervention
  return {
    type: 'none',
    canWaitThrough: true,
    triggerExtension: false,
    extensionMinutes: 0,
  }
}

/**
 * Get delay gate message based on offense number
 */
function getDelayGateMessage(offenseNumber: number): string {
  switch (offenseNumber) {
    case 1:
      return 'Wait to continue, or return to work.'
    case 2:
      return 'Second time. Is this worth it?'
    case 3:
      return "You're slipping."
    default:
      return "Don't let yourself down."
  }
}

/**
 * Get block message based on offense number
 */
function getBlockMessage(offenseNumber: number, appName: string): string {
  switch (offenseNumber) {
    case 1:
      return `${appName} is blocked.`
    case 2:
      return `Again? ${appName} is blocked.`
    case 3:
      return 'Session extended +5 minutes.'
    case 4:
    case 5:
      return "You're fighting yourself."
    default:
      return 'The wall is here to help you.'
  }
}

/**
 * Check if an app switch should be penalized
 */
export function shouldPenalize(
  toApp: ActiveAppInfo,
  mode: Mode,
  isWhitelisted: boolean = false
): boolean {
  if (isWhitelisted) return false
  
  const category = getAppCategory(toApp)
  
  // Never penalize productive apps
  if (category === AppCategory.PRODUCTIVE) return false
  
  return true
}

/**
 * Check if a domain should be penalized
 */
export function shouldPenalizeDomain(
  domain: string | null,
  mode: Mode,
  isWhitelisted: boolean = false
): boolean {
  if (isWhitelisted) return false
  if (!domain) return false
  
  const category = getDomainCategory(domain)
  
  // Never penalize productive or neutral domains
  if (category === AppCategory.PRODUCTIVE || category === AppCategory.NEUTRAL) {
    return false
  }
  
  return true
}

/**
 * Check if a domain is whitelisted based on user's whitelist
 */
export function isDomainWhitelisted(
  domain: string | null,
  whitelistedDomains: string[]
): boolean {
  if (!domain) return false
  
  const domainLower = domain.toLowerCase()
  
  return whitelistedDomains.some(whiteDomain => {
    const whitedomainLower = whiteDomain.toLowerCase()
    // Match if domain equals or is subdomain of whitelisted domain
    return domainLower === whitedomainLower || 
           domainLower.endsWith(`.${whitedomainLower}`) ||
           whitedomainLower.includes(domainLower) ||
           domainLower.includes(whitedomainLower)
  })
}

/**
 * Check if an app is whitelisted based on user's whitelist
 */
export function isAppWhitelisted(
  appInfo: ActiveAppInfo,
  whitelistedApps: string[]
): boolean {
  const appNameLower = appInfo.appName.toLowerCase()
  
  return whitelistedApps.some(whiteApp => {
    const whiteAppLower = whiteApp.toLowerCase()
    return appNameLower.includes(whiteAppLower) || whiteAppLower.includes(appNameLower)
  })
}
