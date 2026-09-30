# Dustoff Reset - Technical Capabilities

**Version:** 0.1.0  
**Platform:** macOS (Windows/Linux planned)  
**Architecture:** Tauri 2.x (Rust backend + React/TypeScript frontend)

---

## Executive Summary

Dustoff Reset is a **cognitive capacity management system** that operates as a desktop overlay application. It monitors user behavior in real-time, applies biologically-grounded algorithms to track focus "bandwidth," and intervenes when cognitive capacity drops to prevent unproductive work sessions.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Real-Time App Monitoring](#2-real-time-app-monitoring)
3. [Cognitive Bandwidth Engine](#3-cognitive-bandwidth-engine)
4. [Daily Calibration System](#4-daily-calibration-system)
5. [Intervention System](#5-intervention-system)
6. [Flow State Detection](#6-flow-state-detection)
7. [Session Modes](#7-session-modes)
8. [Parking Lot (Thought Capture)](#8-parking-lot-thought-capture)
9. [Reset Rituals](#9-reset-rituals)
10. [Gamification & Virality](#10-gamification--virality)
11. [Data Persistence](#11-data-persistence)
12. [Window Management](#12-window-management)
13. [Permission System](#13-permission-system)
14. [Cross-Platform Support](#14-cross-platform-support)
15. [v0.3.0-dev: Absorbed Extension Features](#15-v030-dev-absorbed-extension-features)

---

## 1. System Architecture

### 1.1 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + TypeScript | UI components, state management |
| **Styling** | Tailwind CSS | Dark glassmorphism design system |
| **Desktop Runtime** | Tauri 2.x | Native window, system APIs |
| **Backend** | Rust | Performance-critical logic, OS integration |
| **Database** | SQLite (via Rust) | Local data persistence |
| **IPC** | Tauri Commands | Type-safe frontend ↔ backend communication |

### 1.2 Application Flow

```
┌──────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐  │
│  │   HUD   │  │ Panels  │  │ Modals  │  │  Interventions  │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘  │
│       │            │            │                 │           │
│       └────────────┴────────────┴─────────────────┘           │
│                           │                                   │
│                    ┌──────┴──────┐                            │
│                    │ Tauri Bridge │                           │
│                    └──────┬──────┘                            │
└───────────────────────────┼───────────────────────────────────┘
                            │ IPC (invoke)
┌───────────────────────────┼───────────────────────────────────┐
│                    BACKEND (Rust)                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────┐ │
│  │ Commands │  │   Telemetry  │  │   Storage  │  │ Badges  │ │
│  │          │  │   Platform   │  │  Database  │  │ Streaks │ │
│  └──────────┘  └──────────────┘  └────────────┘  └─────────┘ │
│                       │                                       │
│              ┌────────┴────────┐                              │
│              │  OS-Level APIs  │                              │
│              │  (NSWorkspace,  │                              │
│              │   AppleScript)  │                              │
│              └─────────────────┘                              │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Real-Time App Monitoring

### 2.1 Frontmost Application Detection (macOS)

The system uses **Objective-C runtime bindings** to detect the currently focused application:

```rust
// Uses NSWorkspace API directly
let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
let frontmost_app: *mut Object = msg_send![workspace, frontmostApplication];
let app_name: String = msg_send![frontmost_app, localizedName];
let bundle_id: String = msg_send![frontmost_app, bundleIdentifier];
```

**Data Captured:**
- Application name (e.g., "Google Chrome")
- Bundle identifier (e.g., "com.google.Chrome")
- Window title (via AppleScript)
- Active since timestamp

### 2.2 Window Title Detection

For browsers and multi-window apps, window titles are captured via AppleScript:

```applescript
tell application "System Events"
    tell process "Google Chrome"
        if exists (window 1) then
            return name of window 1
        end if
    end tell
end tell
```

**Use Cases:**
- Detect specific browser tabs (YouTube, Twitter, etc.)
- Identify document names in productivity apps
- Track context switches within the same application

### 2.3 Idle Time Detection

System idle time is detected via IOKit:

```rust
// Uses ioreg to get HIDIdleTime
Command::new("ioreg")
    .args(["-c", "IOHIDSystem", "-d", "4"])
    .output()
```

**Use Cases:**
- Pause bandwidth decay during idle
- Detect user returning from break
- Inform reset ritual recommendations

### 2.4 Polling Frequency

| Event Type | Polling Interval |
|------------|------------------|
| Frontmost app | 1 second |
| Window title | 1 second |
| Idle time | 5 seconds |

---

## 3. Cognitive Bandwidth Engine

### 3.1 Core Concept

**Bandwidth** is a 0-100 score representing the user's current cognitive capacity:

| Range | State | Meaning |
|-------|-------|---------|
| 75-100 | Optimal | Ready for deep work, flow eligible |
| 60-74 | Normal | Functional, minor friction |
| 50-59 | Warning | Friction intervention triggered |
| 0-49 | Critical | Focus-slipping intervention triggered |

### 3.2 Bandwidth Events

**Penalties (reduce bandwidth):**

| Event | Penalty | Trigger |
|-------|---------|---------|
| Friction (manual) | -5 | User reports feeling stuck |
| Focus-slipping (manual) | -10 | User reports mind wandering |
| Non-whitelisted app | -12 | Opens blocked app |
| Non-whitelisted app (repeat) | -6 | Same app within 2 min |
| Tab switch | -2 | Browser tab change |
| Tab burst (>5 in 60s) | -5 | Frantic switching |
| App switch | -4 | Application change |
| App burst (>3 in 60s) | -6 | Rapid app switching |

**Gains (increase bandwidth):**

| Event | Gain | Trigger |
|-------|------|---------|
| Sustained focus | +1/min | No distractions for 1 minute |
| Flow celebration | +5 | Entering flow state |
| Flow streak | +1/min | Each minute in flow |
| Breath Reset | +5 | Complete 2-min ritual |
| Walk Reset | +7.5 | Complete 5-min ritual |
| Dump Reset | +6 | Complete parking lot dump |

### 3.3 Mode-Specific Penalty Weights

Different session modes apply penalty multipliers:

| Mode | Non-Whitelisted App | Tab Switch | App Switch |
|------|---------------------|------------|------------|
| **Zen** | 0.75x | 0.5x | 0.5x |
| **Flow** | 1.0x | 1.0x | 1.0x |
| **Legend** | 1.5x | 1.25x | 1.25x |

---

## 4. Daily Calibration System

### 4.1 Calibration Ceremony

Before each workday, users complete a **5-minute calibration** that establishes their baseline bandwidth:

**Step 1: Sleep Assessment (40 points max)**
- Sleep hours (25 pts): Optimal 7-9 hours
- Sleep quality (15 pts): User rating 1-10

**Step 2: Emotional State (40 points max)**
- Emotional residue (20 pts): Lingering stress level 1-10
- Current state (20 pts): Energized, Focused, Calm, Tired, Anxious, Scattered

**Step 3: Distraction Awareness (20 points max)**
- Identify potential distractions (0-6 items)
- Fewer = higher score (counterintuitive: awareness is the goal)

### 4.2 Calibration Expiry

Calibrations expire at **5:00 AM local time** (workday boundary):

```typescript
if (currentHour < 5) {
    // Use yesterday's date
    calibrationDate = yesterday
}
```

---

## 5. Intervention System

### 5.1 Intervention Types

| Type | Trigger | Purpose |
|------|---------|---------|
| **Friction** | Bandwidth 50-59 | Warning: capacity declining |
| **Focus-Slipping** | Bandwidth <50 | Critical: immediate action needed |
| **Non-Whitelisted App** | Opens blocked app | Immediate violation |
| **Tab Burst** | >5 tabs in 60s | Frantic behavior detected |

### 5.2 Mode-Specific Responses

**Zen Mode:**
- Gentle, calming tone
- Emerald green theme
- Auto-dismisses after 10 seconds
- Encourages self-compassion

**Flow Mode:**
- Focused, practical tone
- Cyan blue theme
- Auto-dismisses after 10 seconds
- Emphasizes flow preservation

**Legend Mode:**
- Aggressive, confrontational tone
- Red theme with pulsing glow
- **No auto-dismiss** (requires action)
- Escalating consequences

### 5.3 Intervention Actions

**Flow Mode - Delay Gate:**
1. Intervention appears with 10-second countdown
2. User can "Minimize App" → App is minimized, returns to work
3. User can "Continue Anyway" → Proceeds but takes bandwidth penalty
4. Timer expires → Auto-returns to work

**Legend Mode - Block Screen:**
1. Full-screen red overlay blocks work
2. User must acknowledge and return
3. Bandwidth penalty applied
4. Tab/app can be force-closed

---

## 6. Flow State Detection

### 6.1 Entry Conditions (ALL must be true)

| Condition | Threshold |
|-----------|-----------|
| Sustained focus | ≥12 minutes |
| No context switches | 12 minutes |
| No interventions | 12 minutes |
| Bandwidth | ≥75 |

### 6.2 Exit Conditions (ANY triggers exit)

- Any context switch (tab or app)
- Any intervention triggered
- Bandwidth drops below 75
- Session paused/ended

### 6.3 Flow Celebration

When flow is detected:
1. Celebration overlay appears with particle effects
2. +5 bandwidth bonus awarded
3. HUD updates to show flow state
4. Flow streak timer begins (+1 bandwidth/minute)

---

## 7. Session Modes

### 7.1 Zen Mode

**Philosophy:** Gentle, supportive, forgiving

| Aspect | Behavior |
|--------|----------|
| Penalty multiplier | 0.5x - 0.75x |
| Intervention tone | Calming, supportive |
| Auto-dismiss | Yes (10s) |
| App blocking | Soft (can override) |

### 7.2 Flow Mode (Default)

**Philosophy:** Balanced, practical, focused

| Aspect | Behavior |
|--------|----------|
| Penalty multiplier | 1.0x |
| Intervention tone | Clear, practical |
| Auto-dismiss | Yes (10s) |
| App blocking | Standard |

### 7.3 Legend Mode

**Philosophy:** Aggressive, confrontational, unforgiving

| Aspect | Behavior |
|--------|----------|
| Penalty multiplier | 1.25x - 1.5x |
| Intervention tone | Harsh, direct |
| Auto-dismiss | **No** |
| App blocking | Hard (force close) |

---

## 8. Parking Lot (Thought Capture)

### 8.1 Purpose

The **Parking Lot** is a quick-capture system for intrusive thoughts that would otherwise derail focus.

### 8.2 Item Types

| Type | Description |
|------|-------------|
| **Task** | Something to do later |
| **Idea** | Creative thought to explore |
| **Question** | Research or ask someone |
| **Follow-up** | Need to circle back |

### 8.3 Item Lifecycle

```
Capture → Review (Post-Session) → Action/Complete/Dismiss
```

1. **During session:** Quick add via HUD button
2. **Post-session harvest:** Review each item, categorize, plan
3. **Next session:** Carry forward or complete

### 8.4 Bandwidth Restoration

Adding items to the parking lot triggers a **Dump Reset** (+6 bandwidth) when multiple items are captured, clearing mental clutter.

---

## 9. Reset Rituals

### 9.1 Available Rituals

| Ritual | Duration | Bandwidth Gain | Activity |
|--------|----------|----------------|----------|
| **Breath Reset** | 2 min | +5 | Guided breathing exercise |
| **Walk Reset** | 5 min | +7.5 | Physical movement break |
| **Dump Reset** | 2-3 min | +6 | Parking lot brain dump |

### 9.2 Ritual Flow

1. User pauses session or intervention triggers pause
2. Ritual selection panel appears
3. User selects ritual
4. Countdown timer runs
5. On completion, bandwidth restored
6. Session resumes

---

## 10. Gamification & Virality

### 10.1 Badge System

**45 unique badges** across categories:

| Category | Examples |
|----------|----------|
| **Milestone** | First Blood, Week Warrior, Centurion |
| **Streak** | 3-Day, 7-Day, 30-Day, 100-Day |
| **Performance** | Perfect Session, Bandwidth Master, Zero Distractions |
| **Mode-Specific** | Zen Master, Flow Architect, Legend Survivor |
| **Resilience** | Comeback Kid, Phoenix Rising |
| **Shame** | Rage Quit, Distraction Disaster, The Struggle |

### 10.2 Badge Rarity

| Rarity | Unlock Rate | Examples |
|--------|-------------|----------|
| Common | ~80% | First Blood, Day One |
| Uncommon | ~50% | Week Warrior, Mode Explorer |
| Rare | ~20% | Month Master, Bandwidth Master |
| Epic | ~5% | Century Club, Legend Survivor |
| Legendary | ~1% | Year Strong, Perfect Year |
| Shame | ~30% | Walk of shame badges |

### 10.3 Social Sharing

**Twitter/X Integration:**
```typescript
const twitterUrl = `https://twitter.com/intent/tweet?text=${text}&hashtags=${hashtags}`
await openUrl(twitterUrl) // Opens in default browser
```

**LinkedIn Integration:**
```typescript
const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${appUrl}`
await openUrl(linkedInUrl)
```

### 10.4 Streak System

| Streak Type | Reset Condition |
|-------------|-----------------|
| **Daily** | Miss a calendar day |
| **Weekly** | Miss a calendar week |
| **Legend Daily** | Miss a Legend mode day |
| **Perfect Week** | Any missed day in current week |

---

## 11. Data Persistence

### 11.1 SQLite Database

All data is stored locally in SQLite:

```
~/.dustoff-reset/data.db
```

### 11.2 Data Models

| Table | Purpose |
|-------|---------|
| `calibrations` | Daily calibration records |
| `sessions` | Session history and metrics |
| `parking_lot_items` | Thought capture items |
| `user_badges` | Unlocked badges |
| `streaks` | Streak records |
| `telemetry_events` | App switch/distraction events |
| `reflections` | Post-session reflections |

### 11.3 Session Recovery

If app crashes during a session:
1. Session state is saved every 30 seconds
2. On next launch, recovery modal appears
3. User can resume or discard

---

## 12. Window Management

### 12.1 Window Characteristics

| Property | Value |
|----------|-------|
| Decorations | None (frameless) |
| Transparency | Yes (glassmorphism) |
| Always on top | Yes (overlay) |
| Visible on all desktops | Yes (macOS Spaces and Linux workspaces; no effect on Windows) |
| Resizable | Yes (programmatic) |
| Skip taskbar | Yes |

### 12.2 Dynamic Sizing

The window resizes based on current panel:

| Panel | Dimensions |
|-------|------------|
| HUD only | 320 × 80 |
| Calibration | 420 × 720 |
| Pre-session | 420 × 700 |
| Intervention | 520 × 720 |
| Post-session | 640 × 850 |

### 12.3 Window API

```typescript
await tauriBridge.resizeWindow(width, height)
await tauriBridge.setWindowPosition(x, y)
await tauriBridge.startDragging() // Frameless drag
await tauriBridge.setAlwaysOnTop(true)
```

---

## 13. Permission System

### 13.1 Required Permissions

| Permission | Platform | Purpose |
|------------|----------|---------|
| **Accessibility** | macOS | Detect frontmost app, window titles |
| **Screen Recording** | macOS | Future: screenshot-based detection |

### 13.2 Permission Check

```rust
// Uses AXIsProcessTrusted() via osascript
let output = Command::new("osascript")
    .arg("-l").arg("JavaScript")
    .arg("-e").arg("ObjC.import('ApplicationServices'); $.AXIsProcessTrusted()")
    .output()
```

### 13.3 Permission Flow

1. App launches → check permissions
2. If not granted → show permission setup panel
3. User opens System Settings → enables permission
4. User clicks "Check Again" → verify grant
5. If granted → hide panel, proceed normally

---

## 14. Cross-Platform Support

### 14.1 Current Status

| Platform | Status |
|----------|--------|
| **macOS** | ✅ Full support |
| **Windows** | 🔄 In development |
| **Linux** | 🔄 In development |

### 14.2 Platform Abstraction

The codebase uses a **PlatformMonitor** trait for cross-platform compatibility:

```rust
pub trait PlatformMonitor {
    fn get_frontmost_app(&self) -> Result<ActiveAppInfo, String>;
    fn get_idle_time_seconds(&self) -> Result<u64, String>;
    fn platform_name(&self) -> &'static str;
}
```

**macOS:** Uses `objc` crate + AppleScript  
**Windows:** Will use Win32 APIs (`GetForegroundWindow`)  
**Linux:** Will use X11/Wayland APIs

---

## 15. v0.3.0-dev: Absorbed Extension Features

The Chrome extension is being retired; the desktop app is the one tool. Its behaviours now live in the app. Everything is local (SQLite `preferences` and `night_events` tables, schema v5), nothing is forced, and the user can turn each piece off in the Settings panel (gear on the idle HUD).

### 15.1 Night Mode (three phases)

Ported from the extension's `night-mode.js` and the night-mode web client. Every behaviour below is a strong default with an escape hatch. Nothing locks the machine.

- **Setting:** on by default. The four phase bounds (wind-down start, shutdown start, night protection start, night end) are derived from the person's work schedule (section 15.1a) and validated as a set on both sides (Rust `phase_bounds_in_order`, TypeScript `validatePhaseBounds`) so the phases always run in order around the clock. The standard clock is 20:00 / 22:00 / 00:00 / 06:00. An "Allow emergency override" toggle (default on).
- **Phase resolution** (`src/lib/night`): `getNightPhase` returns `day`, `wind-down`, `shutdown` or `night-protection`, handling windows that cross midnight at any boundary. The app never calls it with raw preference fields: `resolveNight` in `src/lib/night/schedule.ts` is the one accessor that turns the schedule into the effective `NightSettings`, and `useNightMode` recomputes the phase and the night key through it every 30 seconds. The multiplier, the nudges, the STOP screen and the Shutdown Protocol offer all follow from that one phase value.
- **Wind-down (20:00 to 22:00):** the HUD dims and desaturates; intervention copy shifts to wind-down wording. At the first idle moment a card is offered once per evening: "Time to start winding down", the original's activity list (checkable, not saved) and "About N minutes to wind down", where N is 15 plus 5 per full hour of today's sessions, capped at 60, rounded to 5 (`estimateWindDownMinutes`; the original's "night activation" score does not exist in the app, so session load is the honest stand-in).
- **Shutdown Protocol (22:00 to 00:00):** offered once per evening at the first idle moment, and available any time as the "Shutdown" reset type. Three steps of about five minutes: (1) close open tasks, listing today's session intentions from SQLite with Done / Carry to tomorrow (carried tasks become Parking Lot items flagged for the next session); (2) brain dump, one Parking Lot item per line; (3) the physical transition checklist ("Stand up from your desk", "Close your laptop (really)", "Take 3 deep breaths", "Move to a different room") with a "Completed N of M" line. Completion is recorded as a `shutdown_completed` night event so it is not offered again that evening.
- **Night Protection (00:00 to 06:00):** a full-panel STOP screen appears when the app is open in the window (once per night), when a session start is requested, or on the first telemetry activity in the window during a session (once per night). It never replaces a panel that is open (Settings, a wizard, a summary): `nightProtectionMayTakeOver` lets it in only when the panel slot is free, so it waits until that panel closes. A render error anywhere below the HUD is caught by `PanelErrorBoundary` and shown as one line ("Something went wrong. Tap to reopen.") instead of blanking the transparent window. It says "Opening your laptop now will make tomorrow worse." and "Your bandwidth was N when you stopped." (the last session-end bandwidth tonight, else today's calibration). Then "What's really going on?":
  - *It is truly urgent*: the original's honesty questions, then a 30-minute emergency override with a visible countdown card under the HUD and a proper end screen ("Override ended. Close the laptop."). At most two overrides per night, counted from `night_events`; the Settings toggle can remove the option entirely.
  - *I can't sleep*: the ported sleep techniques (4-7-8 breathing, body scan, tense and release, "still awake after 20 minutes") and calming exercises (5-4-3-2-1 grounding, box breathing, write it down). Percentages and claims from the originals were dropped.
  - *It is habit, not need*: a one-line acknowledgement and "Close for tonight", which ends any session quietly and returns to the dimmed idle HUD.
  - The X ("Not now") always closes the screen. If the STOP came from a session start request, dismissing lets the start proceed.
- **Night drift multiplier:** during an active session, drift penalties are multiplied by phase, ported from the desktop agent: wind-down x1.2, shutdown x1.5, night protection x2.0. Gentle tone caps at x1.2. Applied in `calculateAppSwitchPenalty` / `calculateDomainPenalty` (`nightMultiplier` argument, wrapped once in App.tsx) and shown as the HUD tooltip ("Night multiplier active: drift costs x1.5 during shutdown.") so it is never a hidden rule.
- **Insomnia line:** distinct nights in the last seven with an "I can't sleep" choice drive the original's graded wording ("You haven't reported sleep trouble this week." / one night / 2 nights / multiple nights), shown under a small "Nights" heading in the Progress panel and nowhere else. No advice, no medical language.
- **Recording:** `night_events` rows (night date, kind, detail) for `wind_down_shown`, `shutdown_completed`, `protection_stop` (with its trigger), `override`, `cant_sleep`, `habit` and `session_end` (bandwidth). The night date is the **night key** from `nightKey(now, bounds)`: the local date on which that night's window starts. For a window that crosses midnight, anything before the window's end belongs to the previous date (01:30 belongs to the previous evening; the key turns over at the night's end, 06:00 on the standard clock). For a night-shift "night" that sits inside one date (08:00 to 18:00) the key is that date. Once-per-night gating flags in `localStorage`, the override limit, shutdown completion and "Your bandwidth was N when you stopped" all use this key, so they follow the person's derived night rather than the calendar date.

### 15.1a "When do you usually work?" (work schedule)

Night mode follows the person's day, not the clock, so it works for night-shift and rotating-shift workers.

- **Model** (`preferences`, schema v5; Rust `storage/preferences.rs`, TypeScript `src/lib/preferences/types.ts`): `schedule_mode` (`standard` | `night_shift` | `custom`, default standard), `work_days` (seven booleans, Monday first, default Monday to Friday, stored as `1111100`), `work_start` and `work_end` (`HH:MM`, may cross midnight, default 09:00 to 17:00), `phase_override` (advanced: the four explicit phase fields win), `keep_shift_rhythm_on_days_off` (night_shift only, default off) and `schedule_setup_done` (the first-run card was answered). Validation rejects an unknown mode, malformed times and `work_start == work_end`; a hand-edited row is sanitised to defaults on read.
- **Derivation** (one pure function, `derivePhaseBounds` in `src/lib/night/schedule.ts`, twin `derive_phase_bounds` in Rust): `standard` keeps the standard clock. `night_shift` and `custom` derive from the work hours: wind-down 1 hour after work ends, shutdown 3 hours after, night protection 5 hours after, and the night ends 1 hour before work starts, all modulo 24 hours. A 19:00 to 07:00 shift gives 08:00 / 10:00 / 12:00 / 18:00; 22:00 to 06:00 gives 07:00 / 09:00 / 11:00 / 21:00; 09:00 to 17:00 gives 18:00 / 20:00 / 22:00 / 08:00. If the derived bounds do not satisfy the ordering rule (the gap between shifts is under six hours) or the hours are malformed, the standard clock applies and the reason is surfaced in Settings. With `phase_override` on, the explicit fields win when they are in order, otherwise the same fallback.
- **Days off and shifts** (`resolveNight`): for a schedule-derived night, the relevant shift is the one in progress or the one that ended most recently, and the day it started decides. On a work day the derived bounds apply; while the person is on shift there is no night at all (the phase is `day`); on a day off the standard clock applies so a nurse on a day off still has a normal night, unless the mode is `night_shift` and "keep my shift rhythm on days off" is ticked. The explicit override applies on every day.
- **Migration v5** (`ensure_schedule_columns`): adds the seven columns idempotently. A pre-v5 row whose phase bounds were changed from the defaults gets `phase_override = 1`, so hand-set times keep winning instead of being replaced by the standard clock.
- **Setup:** a first-run card under the idle HUD, once and remembered, with three choices in plain words: "Regular daytime hours (default)", "I work nights or rotating shifts", "Custom". Picking a shift or custom schedule opens Settings with that mode preselected and nothing saved yet; "Later" keeps the standard clock and does not ask again. Settings edits live in a local draft (`SettingsPanel`) and are validated as a whole (`validatePreferencesDraft` in `src/lib/settings-flow.ts`, the twin of the Rust `validate`) on Save: one write, then a one-line confirmation under the HUD ("Saved. Wind-down from 8:00 pm, …") and the person returns to where they were, the entry point after the first-run card. Cancel drops the draft. Saving each keystroke used to re-derive the phases mid-edit, and a flip into night protection let the STOP screen replace the open panel. The Settings section "When do you usually work?" has the same three choices, day-of-week toggles, start and end time pickers, the days-off tick for shift workers, a live preview line that reads the derived phases back in plain words ("Wind-down from 8:00 pm, shutdown from 10:00 pm, night protection from midnight to 6:00 am.") with any fallback reason, and the advanced "Set the phase times myself" override that reveals the four explicit pickers.
- **Parking lot, not built:** habit-learned suggestions ("your last two weeks suggest you stop around 11pm, move Shutdown?") derived from `night_events` and session ends. If it is ever built it is suggest-only, a line in Settings with an Apply button, never a silent change to the schedule. Nothing learns or adapts on its own today (see the note at the top of `src/lib/night/schedule.ts`).

### 15.2 Tone and Prompt Style

- **Tone:** `gentle` | `standard` | `firm` (default standard). Gentle uses softer titles and actions, never escalates to a Flow-mode delay gate (penalties still apply) and caps the night multiplier at x1.2. Firm uses direct wording and the existing escalation. Nudge thresholds are unchanged in every tone.
- **Prompt style:** `mindfulness` | `scientific` | `spiritual` (default mindfulness). Drives the reset prompt shown during a ritual, the reset panel subheading, the intervention message and the AI pause subtext. The spiritual variant is kept available but is not the default.
- **Implementation:** one copy table in `src/lib/copy/index.ts` consumed by `InterventionOverlayAdapter`, `ResetPanelAdapter`, the night cards and panels and the AI pause overlay. App.tsx routes `getInterventionConfig` through a single tone-aware wrapper.

### 15.3 AI-Site Pause ("Hold. Stay here.")

- **Trigger:** during a session, the frontmost browser tab is an AI chat site (chat.openai.com, chatgpt.com, claude.ai, gemini.google.com, perplexity.ai, chat.deepseek.com, grok.com) and the user switches away from it (tab or app) within 25 seconds of arriving.
- **Response:** a small non-blocking card under the HUD for about 6 seconds, at most once every 10 minutes (once per hour on gentle tone). These domains stay in the productive list.
- **Platform:** macOS only for now. Tab URLs come from AppleScript (`telemetry/app_monitor.rs`); on Windows no tab events are emitted and the feature is silently absent (the settings toggle says so). Logic lives in `src/lib/telemetry/ai-sites.ts` and `src/hooks/useAiSitePause.ts`.

### 15.4 What is verified, and what is not

Verified by automated tests (run on Linux; `cargo test` in `src-tauri`, `npm test`, `npm run build`):

- Rust: `storage/preferences.rs` (defaults, round trip with the new columns, rejection of malformed times, out-of-order phases and bad schedules, sanitising a hand-edited row, in-place upgrade of v3 and v4 tables including the override marking, deserialising v3- and v4-shaped payloads, the phase derivation for standard, a 19:00 to 07:00 shift, 22:00 to 06:00, custom hours that wrap midnight, the too-short-gap fallback and the explicit override, work-days text round trip); `storage/night.rs` (record and read back, per-night counts for the override limit and shutdown completion, distinct-night counts for the insomnia line, latest event, input rejection, clear); `storage/database.rs` (migrations idempotent at v5, a v3 database upgraded keeping its preferences, and a v4 database upgraded to v5 with a schedule saved through it).
- TypeScript (vitest): the Settings draft (`src/lib/settings-flow.test.ts`: tolerant clock normalisation, whole-draft validation, the changed-fields patch, the saved line, the return panel, and the regression that a night-shift edit landing in night protection cannot evict Settings), a guarded panel-size lookup, phase resolution across midnight with default and custom bounds, ordering validation, night keys across midnight for the standard clock, a night-shift day "night" and a later-crossing window, `derivePhaseBounds` for standard, 19:00 to 07:00, 22:00 to 06:00 and custom 09:00 to 17:00, the fallbacks and the override, shift detection, `resolveNight` on work days, on shift, on days off with and without the shift-rhythm tick, the plain-words preview, multiplier selection and the gentle cap, the tooltip note, override limits and countdown arithmetic, the insomnia wording, the wind-down estimate, the copy table and the AI-site tracker.

Not run on a Mac in this pass, so unverified end to end: the Settings Save/Cancel footer fitting inside the 900 px window and the saved line fitting above the entry point panel; the actual window resizing for the new `shutdown` and `nightProtection` panels, the taller wind-down and schedule setup cards and the now-scrolling Settings panel; the first-run schedule card appearing once and staying gone after a restart (it is read from the `preferences` row, which is tested, but the packaged app was not launched); the telemetry activity trigger firing from real app and tab switch events; the override countdown surviving an app restart (it is read back from `localStorage` on load, but this was not exercised in the packaged app); the Tauri IPC round trip for the five `night_events` commands (the storage functions behind them are tested, the commands are registered in `main.rs`, but no UI-driven call was made). Timing behaviour was tested with fixed dates, not by waiting through a real night.

---

## Summary of Technical Capabilities

| Capability | Implementation |
|------------|----------------|
| Real-time app detection | Objective-C runtime (macOS) |
| Window title capture | AppleScript |
| Bandwidth calculation | Biologically-grounded algorithms |
| Flow state detection | 4-condition threshold system |
| Intervention system | Mode-specific escalation |
| Session recovery | Auto-save + recovery modal |
| Gamification | 45 badges, streaks, social sharing |
| Data persistence | Local SQLite database |
| Window management | Frameless overlay, dynamic sizing |
| Cross-platform | Trait-based abstraction |

---

## Future Capabilities (Roadmap)

| Feature | Description |
|---------|-------------|
| **AI Focus Coach** | Personalized recommendations |
| **Team Analytics** | Manager dashboard |
| **Calendar Integration** | Auto-block focus time |
| **Browser Extension** | Retired; its three-phase night mode, tone/style and AI pause now live in the app (see section 15) |
| **Mobile Companion** | Break reminders, stats |
| **Wearable Integration** | HRV-based calibration |

---

*Document generated: January 2026*  
*Dustoff Reset v0.1.0*
