// src/hooks/useTauriWindow.ts
// React hook and utilities for Tauri window management

import { tauriBridge } from '@/lib/tauri-bridge'

// Panel dimensions - increased for better content fit
// Heights include HUD (80px) + margin (12px) + panel content
export const PANEL_DIMENSIONS = {
  hudOnly: { width: 320, height: 80 },
  calibration: { width: 420, height: 720 },      // Calibration ceremony
  preSession: { width: 420, height: 700 },       // 6-step wizard needs more height
  entryPoint: { width: 420, height: 700 },       // Entry Point: How do you want to start?
  quickStart: { width: 500, height: 740 },       // Quick Start panel (wider)
  presetPicker: { width: 480, height: 700 },     // Preset Picker panel
  savePrompt: { width: 480, height: 700 },        // Save Preset Prompt panel
  reset: { width: 520, height: 520 },            // Reset ritual selection
  parkingLot: { width: 540, height: 640 },       // Parking lot management
  parkingLotHarvest: { width: 660, height: 720 },// Harvest panel
  postSessionSummary: { width: 640, height: 850 },// Session summary (with bandwidth impact)
  progress: { width: 640, height: 860 },         // Progress dashboard (trends + weekly summary)
  settings: { width: 520, height: 860 },         // Settings (night phases, override, tone, prompt style, AI pause)
  shutdown: { width: 520, height: 760 },         // Night mode: three-step Shutdown Protocol
  nightProtection: { width: 520, height: 760 },  // Night mode: STOP screen and its choices
  sessionReflection: { width: 600, height: 640 },// Reflection questions (increased)
  flowCelebration: { width: 540, height: 300 },  // Flow celebration
  endSession: { width: 560, height: 680 },       // End session modal (taller for expanded sub-options)
  recovery: { width: 520, height: 580 },         // Recovery/Interrupted session modal (HUD + modal + padding)
  intervention: { width: 520, height: 720 },     // All intervention screens (Flow + Legend, dynamic content)
  badgeNotification: { width: 440, height: 280 },// Badge unlock toast (HUD + notification with full text visible)
  badgeShareModal: { width: 460, height: 780 },  // Badge share modal (scaled card + buttons + preview)
  permissionSetup: { width: 440, height: 420 },  // Permission setup panel (compact)
  permissionSetupExpanded: { width: 440, height: 620 },  // Permission setup with instructions + error + proceed
} as const

export type PanelType = keyof typeof PANEL_DIMENSIONS

/**
 * Resize the window to fit the specified panel type.
 * If panel is null, resizes to HUD-only dimensions.
 */
export async function resizeForPanel(panel: PanelType | null): Promise<void> {
  const dims = panel ? PANEL_DIMENSIONS[panel] : PANEL_DIMENSIONS.hudOnly
  await tauriBridge.resizeWindow(dims.width, dims.height)
}

/**
 * Start dragging the window (call on mousedown of drag handle).
 * Used for frameless window dragging.
 */
export async function startDragging(): Promise<void> {
  await tauriBridge.startDragging()
}

/**
 * Get the current window size.
 */
export async function getWindowSize(): Promise<{ width: number; height: number }> {
  return tauriBridge.getWindowSize()
}

/**
 * Set the window position.
 */
export async function setWindowPosition(x: number, y: number): Promise<void> {
  await tauriBridge.setWindowPosition(x, y)
}

/**
 * Get the current window position.
 */
export async function getWindowPosition(): Promise<{ x: number; y: number }> {
  return tauriBridge.getWindowPosition()
}

/**
 * React hook for window management.
 * Provides panel resizing and window control functions.
 */
export function useTauriWindow() {
  return {
    resizeForPanel,
    startDragging,
    getWindowSize,
    setWindowPosition,
    getWindowPosition,
    PANEL_DIMENSIONS,
  }
}
