// All possible panel states in the app
export type PanelType =
  // HUD States
  | 'hud'
  | 'hudMinimized'
  
  // Entry Flow (Phase 9)
  | 'entryPoint'
  | 'quickStart'
  | 'presetPicker'
  
  // Wizard Flow
  | 'sessionType'
  | 'modeSelect'
  | 'duration'
  | 'apps'
  | 'domains'
  | 'mentalPrep1'
  | 'mentalPrep2'
  | 'savePrompt'
  
  // Pre-Session (legacy wizard - consolidated steps)
  | 'preSession'
  
  // Active Session
  | 'activeSession'
  | 'sessionComplete'
  
  // Interventions
  | 'delayGate'
  | 'blockScreen'
  
  // Post-Session
  | 'postSessionSummary'
  | 'sessionReflection'
  | 'parkingLotHarvest'
  
  // Other Panels
  | 'calibration'
  | 'settings'
  | 'reset'
  | 'parkingLot'
  | 'endSession'
  | 'recovery'
  | 'intervention'
  | 'badgeNotification'
  | 'badgeShareModal'
  | 'permissionSetup'
  | 'permissionSetupExpanded'
  | 'flowCelebration';

// Back navigation mapping
// Defines where to go when user clicks "back" from each panel
export const BACK_NAVIGATION: Partial<Record<PanelType, PanelType>> = {
  // Entry Flow
  entryPoint: 'hud',
  quickStart: 'entryPoint',
  presetPicker: 'entryPoint',
  
  // Wizard Flow (if these become separate panels)
  modeSelect: 'entryPoint',
  sessionType: 'entryPoint',
  duration: 'modeSelect',
  apps: 'duration',
  domains: 'apps',
  mentalPrep1: 'domains',
  mentalPrep2: 'mentalPrep1',
  // savePrompt is special - depends on whether user skipped mental prep
  // It should go back to mentalPrep2 if completed, or mentalPrep1 if skipped
  
  // Pre-Session (legacy - goes back to entry point)
  preSession: 'entryPoint',
  
  // Post-Session flow
  sessionReflection: 'postSessionSummary',
  parkingLotHarvest: 'postSessionSummary',
};

// Panels that should show the HUD underneath (overlay panels)
// These panels appear above the HUD and don't replace it
export const OVERLAY_PANELS: PanelType[] = [
  // Entry Flow panels
  'entryPoint',
  'quickStart',
  'presetPicker',
  
  // Interventions (shown during active session)
  'delayGate',
  'blockScreen',
  
  // Active session overlays
  'intervention',
  'flowCelebration',
  
  // Badge notifications (shown above other content)
  'badgeNotification',
  'badgeShareModal',
  
  // End session modal (shown during session)
  'endSession',
];

// Panels that are full-screen replacements (hide HUD)
export const FULLSCREEN_PANELS: PanelType[] = [
  'calibration',
  'settings',
  'preSession',
  'savePrompt',
  'reset',
  'parkingLot',
  'postSessionSummary',
  'sessionReflection',
  'parkingLotHarvest',
  'permissionSetup',
  'permissionSetupExpanded',
  'recovery',
];

// Panels that are modal dialogs (centered, with backdrop)
export const MODAL_PANELS: PanelType[] = [
  'endSession',
  'recovery',
  'badgeShareModal',
];

// Helper function to check if a panel is an overlay
export function isOverlayPanel(panel: PanelType | null): boolean {
  if (!panel) return false;
  return OVERLAY_PANELS.includes(panel);
}

// Helper function to check if a panel is fullscreen
export function isFullscreenPanel(panel: PanelType | null): boolean {
  if (!panel) return false;
  return FULLSCREEN_PANELS.includes(panel);
}

// Helper function to check if a panel is a modal
export function isModalPanel(panel: PanelType | null): boolean {
  if (!panel) return false;
  return MODAL_PANELS.includes(panel);
}

// Helper function to get the back navigation target
export function getBackNavigation(currentPanel: PanelType | null): PanelType | null {
  if (!currentPanel) return null;
  return BACK_NAVIGATION[currentPanel] || null;
}
