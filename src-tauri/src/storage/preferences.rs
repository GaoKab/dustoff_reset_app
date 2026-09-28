//! User preferences absorbed from the retired Chrome extension:
//! night mode (three phases with editable bounds, emergency override),
//! tone, prompt style and the AI-site pause toggle, plus the v0.3 work
//! schedule ("When do you usually work?") that night mode follows.
//!
//! The four phase bounds are derived from the schedule by
//! `derive_phase_bounds`, the twin of `derivePhaseBounds` in
//! src/lib/night/schedule.ts. The explicit phase columns are kept as an
//! advanced override that wins only when `phase_override` is set.
//!
//! Stored as a single row (id = 1) in the `preferences` table. Missing row
//! means defaults; every read goes through validation so the frontend never
//! sees an unknown tone/style, a malformed time or phases out of order.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const TONES: [&str; 3] = ["gentle", "standard", "firm"];
pub const PROMPT_STYLES: [&str; 3] = ["mindfulness", "scientific", "spiritual"];
/// standard: the usual evening clock. night_shift and custom: derived from
/// the work hours. The two non-standard modes derive identically; the mode
/// only changes the copy and unlocks "keep my shift rhythm on days off".
pub const SCHEDULE_MODES: [&str; 3] = ["standard", "night_shift", "custom"];

/// Standard night clock: wind-down 20:00, shutdown 22:00, protection 00:00,
/// night ends 06:00. Used by `standard` mode and as the fallback.
pub const STANDARD_BOUNDS: [&str; 4] = ["20:00", "22:00", "00:00", "06:00"];

const MINUTES_PER_DAY: i32 = 24 * 60;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    /// Night mode on/off (default on)
    pub night_mode_enabled: bool,
    /// Wind-down starts here; also the start of the whole night window
    /// ("HH:MM" local time, default "20:00")
    pub night_mode_start: String,
    /// Shutdown protocol phase starts here (default "22:00")
    #[serde(default = "default_shutdown_start")]
    pub shutdown_start: String,
    /// Night protection phase starts here (default "00:00")
    #[serde(default = "default_protection_start")]
    pub protection_start: String,
    /// Night window end; night protection ends here (default "06:00")
    pub night_mode_end: String,
    /// Allow the 30-minute emergency override during night protection (default on)
    #[serde(default = "default_true")]
    pub emergency_override_enabled: bool,
    /// gentle | standard | firm
    pub tone: String,
    /// mindfulness | scientific | spiritual
    pub prompt_style: String,
    /// "Hold. Stay here." pause when tabbing away from an AI chat (default on)
    pub ai_pause_enabled: bool,
    /// standard | night_shift | custom (default standard)
    #[serde(default = "default_schedule_mode")]
    pub schedule_mode: String,
    /// Work days, Monday first (default Monday to Friday)
    #[serde(default = "default_work_days")]
    pub work_days: [bool; 7],
    /// Work starts here ("HH:MM", default "09:00"); may be later than work_end
    #[serde(default = "default_work_start")]
    pub work_start: String,
    /// Work ends here ("HH:MM", default "17:00")
    #[serde(default = "default_work_end")]
    pub work_end: String,
    /// Advanced: use the four explicit phase fields instead of the schedule
    #[serde(default)]
    pub phase_override: bool,
    /// night_shift only: keep the shifted night on days off (default off)
    #[serde(default)]
    pub keep_shift_rhythm_on_days_off: bool,
    /// The first-run "When do you usually work?" card has been answered
    #[serde(default)]
    pub schedule_setup_done: bool,
}

fn default_schedule_mode() -> String {
    "standard".to_string()
}

fn default_work_days() -> [bool; 7] {
    [true, true, true, true, true, false, false]
}

fn default_work_start() -> String {
    "09:00".to_string()
}

fn default_work_end() -> String {
    "17:00".to_string()
}

fn default_shutdown_start() -> String {
    "22:00".to_string()
}

fn default_protection_start() -> String {
    "00:00".to_string()
}

fn default_true() -> bool {
    true
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            night_mode_enabled: true,
            night_mode_start: "20:00".to_string(),
            shutdown_start: default_shutdown_start(),
            protection_start: default_protection_start(),
            night_mode_end: "06:00".to_string(),
            emergency_override_enabled: true,
            tone: "standard".to_string(),
            prompt_style: "mindfulness".to_string(),
            ai_pause_enabled: true,
            schedule_mode: default_schedule_mode(),
            work_days: default_work_days(),
            work_start: default_work_start(),
            work_end: default_work_end(),
            phase_override: false,
            keep_shift_rhythm_on_days_off: false,
            schedule_setup_done: false,
        }
    }
}

/// Validate a "HH:MM" 24h time string.
pub fn is_valid_time(value: &str) -> bool {
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() != 2 || parts[0].len() != 2 || parts[1].len() != 2 {
        return false;
    }
    match (parts[0].parse::<u8>(), parts[1].parse::<u8>()) {
        (Ok(h), Ok(m)) => h < 24 && m < 60,
        _ => false,
    }
}

/// "HH:MM" to minutes since midnight. Caller must have validated the string.
fn clock_minutes(value: &str) -> i32 {
    let parts: Vec<&str> = value.split(':').collect();
    let h: i32 = parts[0].parse().unwrap_or(0);
    let m: i32 = parts[1].parse().unwrap_or(0);
    h * 60 + m
}

/// Check that the four phase bounds are in order around the clock:
/// wind-down start, then shutdown start, then protection start, then the
/// window end, each strictly later than the previous when measured as an
/// offset from the wind-down start. This accepts windows that cross
/// midnight (20:00, 22:00, 00:00, 06:00) and rejects zero-length phases.
pub fn phase_bounds_in_order(start: &str, shutdown: &str, protection: &str, end: &str) -> bool {
    if ![start, shutdown, protection, end].iter().all(|t| is_valid_time(t)) {
        return false;
    }
    let s = clock_minutes(start);
    let offset = |t: &str| (clock_minutes(t) - s).rem_euclid(MINUTES_PER_DAY);
    let shutdown_off = offset(shutdown);
    let protection_off = offset(protection);
    let end_off = offset(end);
    // end_off == 0 would mean end == start, a 24-hour window, which is not a night
    shutdown_off > 0 && protection_off > shutdown_off && end_off > protection_off
}

/// Minutes since midnight back to "HH:MM", wrapping around the clock.
fn minutes_to_clock(minutes: i32) -> String {
    let m = minutes.rem_euclid(MINUTES_PER_DAY);
    format!("{:02}:{:02}", m / 60, m % 60)
}

/// Where the effective phase bounds came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundsSource {
    /// The standard evening clock (standard mode, or the fallback)
    Standard,
    /// Derived from work_start / work_end
    Schedule,
    /// The explicit phase fields (phase_override)
    Override,
}

/// The four effective phase bounds, in order: wind-down start, shutdown
/// start, protection start, night end.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DerivedBounds {
    pub bounds: [String; 4],
    pub source: BoundsSource,
    /// Why the schedule (or override) could not be used and standard applies
    pub problem: Option<String>,
}

fn standard_bounds() -> [String; 4] {
    [
        STANDARD_BOUNDS[0].to_string(),
        STANDARD_BOUNDS[1].to_string(),
        STANDARD_BOUNDS[2].to_string(),
        STANDARD_BOUNDS[3].to_string(),
    ]
}

/// Derive the four phase bounds from the schedule. Twin of
/// `derivePhaseBounds` in src/lib/night/schedule.ts; keep the two in step.
///
/// - `phase_override`: the explicit fields win, if they are in order.
/// - `standard`: the standard clock.
/// - `night_shift` / `custom`: wind-down 1h after work_end, shutdown 3h
///   after, protection 5h after, night ends 1h before work_start, all
///   modulo 24h. The gap between shifts must fit those phases (at least
///   six hours) or the standard clock is used and `problem` says why.
pub fn derive_phase_bounds(prefs: &Preferences) -> DerivedBounds {
    if prefs.phase_override {
        let explicit = [
            prefs.night_mode_start.clone(),
            prefs.shutdown_start.clone(),
            prefs.protection_start.clone(),
            prefs.night_mode_end.clone(),
        ];
        if phase_bounds_in_order(&explicit[0], &explicit[1], &explicit[2], &explicit[3]) {
            return DerivedBounds { bounds: explicit, source: BoundsSource::Override, problem: None };
        }
        return DerivedBounds {
            bounds: standard_bounds(),
            source: BoundsSource::Standard,
            problem: Some("The phase times are out of order, so the standard clock applies.".to_string()),
        };
    }
    if prefs.schedule_mode == "standard" {
        return DerivedBounds { bounds: standard_bounds(), source: BoundsSource::Standard, problem: None };
    }
    if !is_valid_time(&prefs.work_start) || !is_valid_time(&prefs.work_end) {
        return DerivedBounds {
            bounds: standard_bounds(),
            source: BoundsSource::Standard,
            problem: Some("Work hours need the form HH:MM, so the standard clock applies.".to_string()),
        };
    }
    let ws = clock_minutes(&prefs.work_start);
    let we = clock_minutes(&prefs.work_end);
    if ws == we {
        return DerivedBounds {
            bounds: standard_bounds(),
            source: BoundsSource::Standard,
            problem: Some("Work start and end are the same time, so the standard clock applies.".to_string()),
        };
    }
    let derived = [
        minutes_to_clock(we + 60),
        minutes_to_clock(we + 180),
        minutes_to_clock(we + 300),
        minutes_to_clock(ws - 60),
    ];
    if phase_bounds_in_order(&derived[0], &derived[1], &derived[2], &derived[3]) {
        DerivedBounds { bounds: derived, source: BoundsSource::Schedule, problem: None }
    } else {
        DerivedBounds {
            bounds: standard_bounds(),
            source: BoundsSource::Standard,
            problem: Some(
                "Those hours leave less than six hours between shifts, so night mode cannot fit and the standard clock applies."
                    .to_string(),
            ),
        }
    }
}

impl Preferences {
    /// Check every field; returns a human-readable reason on failure.
    pub fn validate(&self) -> Result<(), String> {
        if !TONES.contains(&self.tone.as_str()) {
            return Err(format!("Unknown tone: {}", self.tone));
        }
        if !PROMPT_STYLES.contains(&self.prompt_style.as_str()) {
            return Err(format!("Unknown prompt style: {}", self.prompt_style));
        }
        if !is_valid_time(&self.night_mode_start) {
            return Err(format!("Invalid night mode start: {}", self.night_mode_start));
        }
        if !is_valid_time(&self.shutdown_start) {
            return Err(format!("Invalid shutdown start: {}", self.shutdown_start));
        }
        if !is_valid_time(&self.protection_start) {
            return Err(format!("Invalid night protection start: {}", self.protection_start));
        }
        if !is_valid_time(&self.night_mode_end) {
            return Err(format!("Invalid night mode end: {}", self.night_mode_end));
        }
        if !phase_bounds_in_order(
            &self.night_mode_start,
            &self.shutdown_start,
            &self.protection_start,
            &self.night_mode_end,
        ) {
            return Err(
                "Night phases must run in order: wind-down, then shutdown, then night protection, then the end"
                    .to_string(),
            );
        }
        if !SCHEDULE_MODES.contains(&self.schedule_mode.as_str()) {
            return Err(format!("Unknown schedule mode: {}", self.schedule_mode));
        }
        if !is_valid_time(&self.work_start) {
            return Err(format!("Invalid work start: {}", self.work_start));
        }
        if !is_valid_time(&self.work_end) {
            return Err(format!("Invalid work end: {}", self.work_end));
        }
        if clock_minutes(&self.work_start) == clock_minutes(&self.work_end) {
            return Err("Work start and work end must differ".to_string());
        }
        Ok(())
    }

    /// Return a copy with any invalid field replaced by its default.
    /// Used on read so a hand-edited database cannot break the UI.
    /// If the phase bounds are individually valid but out of order, all
    /// four fall back to the defaults together so the phases stay coherent.
    pub fn sanitized(&self) -> Self {
        let d = Self::default();
        let work_ok = is_valid_time(&self.work_start)
            && is_valid_time(&self.work_end)
            && clock_minutes(&self.work_start) != clock_minutes(&self.work_end);
        let times_ok = phase_bounds_in_order(
            &self.night_mode_start,
            &self.shutdown_start,
            &self.protection_start,
            &self.night_mode_end,
        );
        Self {
            night_mode_enabled: self.night_mode_enabled,
            night_mode_start: if times_ok { self.night_mode_start.clone() } else { d.night_mode_start },
            shutdown_start: if times_ok { self.shutdown_start.clone() } else { d.shutdown_start },
            protection_start: if times_ok { self.protection_start.clone() } else { d.protection_start },
            night_mode_end: if times_ok { self.night_mode_end.clone() } else { d.night_mode_end },
            emergency_override_enabled: self.emergency_override_enabled,
            tone: if TONES.contains(&self.tone.as_str()) {
                self.tone.clone()
            } else {
                d.tone
            },
            prompt_style: if PROMPT_STYLES.contains(&self.prompt_style.as_str()) {
                self.prompt_style.clone()
            } else {
                d.prompt_style
            },
            ai_pause_enabled: self.ai_pause_enabled,
            schedule_mode: if SCHEDULE_MODES.contains(&self.schedule_mode.as_str()) {
                self.schedule_mode.clone()
            } else {
                d.schedule_mode
            },
            work_days: self.work_days,
            work_start: if work_ok { self.work_start.clone() } else { d.work_start },
            work_end: if work_ok { self.work_end.clone() } else { d.work_end },
            phase_override: self.phase_override,
            keep_shift_rhythm_on_days_off: self.keep_shift_rhythm_on_days_off,
            schedule_setup_done: self.schedule_setup_done,
        }
    }
}

/// Seven booleans, Monday first, to the "1111100" column text.
fn work_days_to_text(days: &[bool; 7]) -> String {
    days.iter().map(|d| if *d { '1' } else { '0' }).collect()
}

/// The "1111100" column text back to seven booleans. Anything that is not
/// exactly seven characters falls back to Monday to Friday.
fn work_days_from_text(text: &str) -> [bool; 7] {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() != 7 {
        return default_work_days();
    }
    let mut days = [false; 7];
    for (i, c) in chars.iter().enumerate() {
        days[i] = *c == '1';
    }
    days
}

/// Create the preferences table (idempotent). Fresh databases get every
/// column here; databases created at schema v3 get the v0.3 night columns
/// from `ensure_night_phase_columns` (migration v4) and the schedule
/// columns from `ensure_schedule_columns` (migration v5).
pub fn init_preferences_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS preferences (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            night_mode_enabled INTEGER NOT NULL DEFAULT 1,
            night_mode_start TEXT NOT NULL DEFAULT '20:00',
            night_mode_end TEXT NOT NULL DEFAULT '06:00',
            tone TEXT NOT NULL DEFAULT 'standard',
            prompt_style TEXT NOT NULL DEFAULT 'mindfulness',
            ai_pause_enabled INTEGER NOT NULL DEFAULT 1,
            shutdown_start TEXT NOT NULL DEFAULT '22:00',
            protection_start TEXT NOT NULL DEFAULT '00:00',
            emergency_override_enabled INTEGER NOT NULL DEFAULT 1,
            schedule_mode TEXT NOT NULL DEFAULT 'standard',
            work_days TEXT NOT NULL DEFAULT '1111100',
            work_start TEXT NOT NULL DEFAULT '09:00',
            work_end TEXT NOT NULL DEFAULT '17:00',
            phase_override INTEGER NOT NULL DEFAULT 0,
            keep_shift_rhythm_on_days_off INTEGER NOT NULL DEFAULT 0,
            schedule_setup_done INTEGER NOT NULL DEFAULT 0
        );
        "#,
    )
    .map_err(|e| format!("Failed to create preferences table: {}", e))
}

/// Add the three-phase night columns to a preferences table created before
/// schema v4. Idempotent: checks pragma_table_info before each ALTER.
pub fn ensure_night_phase_columns(conn: &Connection) -> Result<(), String> {
    ensure_columns(
        conn,
        &[
            ("shutdown_start", "TEXT NOT NULL DEFAULT '22:00'"),
            ("protection_start", "TEXT NOT NULL DEFAULT '00:00'"),
            ("emergency_override_enabled", "INTEGER NOT NULL DEFAULT 1"),
        ],
    )
}

/// Add the work schedule columns to a preferences table created before
/// schema v5 (idempotent). A row whose explicit phase bounds were changed
/// from the defaults before v5 gets `phase_override` set, so the times the
/// person chose keep winning instead of being silently replaced by the
/// standard clock.
pub fn ensure_schedule_columns(conn: &Connection) -> Result<(), String> {
    let had_override_column = column_exists(conn, "phase_override");
    ensure_columns(
        conn,
        &[
            ("schedule_mode", "TEXT NOT NULL DEFAULT 'standard'"),
            ("work_days", "TEXT NOT NULL DEFAULT '1111100'"),
            ("work_start", "TEXT NOT NULL DEFAULT '09:00'"),
            ("work_end", "TEXT NOT NULL DEFAULT '17:00'"),
            ("phase_override", "INTEGER NOT NULL DEFAULT 0"),
            ("keep_shift_rhythm_on_days_off", "INTEGER NOT NULL DEFAULT 0"),
            ("schedule_setup_done", "INTEGER NOT NULL DEFAULT 0"),
        ],
    )?;
    if !had_override_column {
        conn.execute(
            r#"
            UPDATE preferences SET phase_override = 1
            WHERE NOT (night_mode_start = ?1 AND shutdown_start = ?2
                       AND protection_start = ?3 AND night_mode_end = ?4)
            "#,
            params![STANDARD_BOUNDS[0], STANDARD_BOUNDS[1], STANDARD_BOUNDS[2], STANDARD_BOUNDS[3]],
        )
        .map_err(|e| format!("Failed to mark custom phase bounds as an override: {}", e))?;
    }
    Ok(())
}

fn column_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('preferences') WHERE name = ?1",
        params![name],
        |row| row.get::<_, i32>(0),
    )
    .unwrap_or(0)
        > 0
}

/// ALTER TABLE ADD COLUMN for each column that is missing.
fn ensure_columns(conn: &Connection, columns: &[(&str, &str)]) -> Result<(), String> {
    for (name, definition) in columns {
        if !column_exists(conn, name) {
            conn.execute(
                &format!("ALTER TABLE preferences ADD COLUMN {} {}", name, definition),
                [],
            )
            .map_err(|e| format!("Failed to add preferences column {}: {}", name, e))?;
        }
    }
    Ok(())
}

/// Read preferences. Returns defaults when nothing has been saved yet.
pub fn get_preferences(conn: &Connection) -> Result<Preferences, String> {
    let result = conn.query_row(
        r#"
        SELECT night_mode_enabled, night_mode_start, night_mode_end,
               tone, prompt_style, ai_pause_enabled,
               shutdown_start, protection_start, emergency_override_enabled,
               schedule_mode, work_days, work_start, work_end,
               phase_override, keep_shift_rhythm_on_days_off, schedule_setup_done
        FROM preferences WHERE id = 1
        "#,
        [],
        |row| {
            Ok(Preferences {
                night_mode_enabled: row.get::<_, i32>(0)? != 0,
                night_mode_start: row.get(1)?,
                night_mode_end: row.get(2)?,
                tone: row.get(3)?,
                prompt_style: row.get(4)?,
                ai_pause_enabled: row.get::<_, i32>(5)? != 0,
                shutdown_start: row.get(6)?,
                protection_start: row.get(7)?,
                emergency_override_enabled: row.get::<_, i32>(8)? != 0,
                schedule_mode: row.get(9)?,
                work_days: work_days_from_text(&row.get::<_, String>(10)?),
                work_start: row.get(11)?,
                work_end: row.get(12)?,
                phase_override: row.get::<_, i32>(13)? != 0,
                keep_shift_rhythm_on_days_off: row.get::<_, i32>(14)? != 0,
                schedule_setup_done: row.get::<_, i32>(15)? != 0,
            })
        },
    );

    match result {
        Ok(prefs) => Ok(prefs.sanitized()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Preferences::default()),
        Err(e) => Err(format!("Failed to get preferences: {}", e)),
    }
}

/// Save the full preferences row. Rejects invalid values instead of
/// silently coercing them, so a bad UI write is visible.
pub fn save_preferences(conn: &Connection, prefs: &Preferences) -> Result<(), String> {
    prefs.validate()?;
    conn.execute(
        r#"
        INSERT OR REPLACE INTO preferences
        (id, night_mode_enabled, night_mode_start, night_mode_end, tone, prompt_style, ai_pause_enabled,
         shutdown_start, protection_start, emergency_override_enabled,
         schedule_mode, work_days, work_start, work_end,
         phase_override, keep_shift_rhythm_on_days_off, schedule_setup_done)
        VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        "#,
        params![
            prefs.night_mode_enabled as i32,
            prefs.night_mode_start,
            prefs.night_mode_end,
            prefs.tone,
            prefs.prompt_style,
            prefs.ai_pause_enabled as i32,
            prefs.shutdown_start,
            prefs.protection_start,
            prefs.emergency_override_enabled as i32,
            prefs.schedule_mode,
            work_days_to_text(&prefs.work_days),
            prefs.work_start,
            prefs.work_end,
            prefs.phase_override as i32,
            prefs.keep_shift_rhythm_on_days_off as i32,
            prefs.schedule_setup_done as i32,
        ],
    )
    .map_err(|e| format!("Failed to save preferences: {}", e))?;
    Ok(())
}

/// Remove saved preferences (used by reset_all_data).
pub fn clear_preferences(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM preferences WHERE id = 1", [])
        .map_err(|e| format!("Failed to clear preferences: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_preferences_table(&conn).unwrap();
        conn
    }

    #[test]
    fn defaults_when_no_row() {
        let conn = setup();
        let prefs = get_preferences(&conn).unwrap();
        assert_eq!(prefs, Preferences::default());
        assert!(prefs.night_mode_enabled);
        assert_eq!(prefs.night_mode_start, "20:00");
        assert_eq!(prefs.shutdown_start, "22:00");
        assert_eq!(prefs.protection_start, "00:00");
        assert_eq!(prefs.night_mode_end, "06:00");
        assert!(prefs.emergency_override_enabled);
        assert_eq!(prefs.tone, "standard");
        assert_eq!(prefs.prompt_style, "mindfulness");
        assert!(prefs.ai_pause_enabled);
    }

    #[test]
    fn round_trip() {
        let conn = setup();
        let prefs = Preferences {
            night_mode_enabled: false,
            night_mode_start: "21:30".to_string(),
            shutdown_start: "23:00".to_string(),
            protection_start: "01:00".to_string(),
            night_mode_end: "07:00".to_string(),
            emergency_override_enabled: false,
            tone: "gentle".to_string(),
            prompt_style: "spiritual".to_string(),
            ai_pause_enabled: false,
            schedule_mode: "night_shift".to_string(),
            work_days: [false, true, true, true, true, true, false],
            work_start: "19:00".to_string(),
            work_end: "07:00".to_string(),
            phase_override: true,
            keep_shift_rhythm_on_days_off: true,
            schedule_setup_done: true,
        };
        save_preferences(&conn, &prefs).unwrap();
        assert_eq!(get_preferences(&conn).unwrap(), prefs);

        // Second save replaces, does not duplicate
        let updated = Preferences { tone: "firm".to_string(), ..prefs.clone() };
        save_preferences(&conn, &updated).unwrap();
        assert_eq!(get_preferences(&conn).unwrap(), updated);
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM preferences", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn rejects_invalid_values() {
        let conn = setup();
        let bad_tone = Preferences { tone: "shouty".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &bad_tone).is_err());

        let bad_style = Preferences { prompt_style: "astrology".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &bad_style).is_err());

        let bad_time = Preferences { night_mode_start: "25:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &bad_time).is_err());

        let bad_format = Preferences { night_mode_end: "6:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &bad_format).is_err());

        let bad_shutdown = Preferences { shutdown_start: "24:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &bad_shutdown).is_err());

        // Nothing was written
        assert_eq!(get_preferences(&conn).unwrap(), Preferences::default());
    }

    #[test]
    fn rejects_phases_out_of_order() {
        let conn = setup();
        // Shutdown before wind-down
        let p = Preferences { shutdown_start: "19:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        // Protection before shutdown
        let p = Preferences { protection_start: "21:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        // End before protection start
        let p = Preferences { night_mode_end: "23:30".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        // Zero-length phase
        let p = Preferences { shutdown_start: "20:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        // 24 hour window (end == start)
        let p = Preferences { night_mode_end: "20:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
    }

    #[test]
    fn accepts_phases_that_do_not_cross_midnight_and_ones_that_do() {
        // All before midnight
        assert!(phase_bounds_in_order("18:00", "19:00", "20:00", "23:00"));
        // Crossing midnight at the shutdown boundary
        assert!(phase_bounds_in_order("22:00", "23:30", "01:00", "07:00"));
        // Crossing midnight inside wind-down
        assert!(phase_bounds_in_order("23:00", "00:30", "02:00", "06:00"));
        // Defaults
        assert!(phase_bounds_in_order("20:00", "22:00", "00:00", "06:00"));
        // Malformed
        assert!(!phase_bounds_in_order("20:00", "late", "00:00", "06:00"));
    }

    #[test]
    fn sanitizes_hand_edited_row() {
        let conn = setup();
        conn.execute(
            "INSERT INTO preferences (id, night_mode_enabled, night_mode_start, night_mode_end, tone, prompt_style, ai_pause_enabled)
             VALUES (1, 0, 'late', '06:00', 'loud', 'scientific', 1)",
            [],
        )
        .unwrap();
        let prefs = get_preferences(&conn).unwrap();
        assert!(!prefs.night_mode_enabled);
        assert_eq!(prefs.night_mode_start, "20:00"); // replaced
        assert_eq!(prefs.night_mode_end, "06:00");
        assert_eq!(prefs.tone, "standard"); // replaced
        assert_eq!(prefs.prompt_style, "scientific"); // kept
        assert!(prefs.emergency_override_enabled); // column default
    }

    #[test]
    fn sanitizes_out_of_order_phases_together() {
        let conn = setup();
        conn.execute(
            "INSERT INTO preferences (id, night_mode_start, shutdown_start, protection_start, night_mode_end)
             VALUES (1, '20:00', '19:00', '00:00', '06:00')",
            [],
        )
        .unwrap();
        let prefs = get_preferences(&conn).unwrap();
        assert_eq!(prefs.shutdown_start, "22:00");
        assert_eq!(prefs.night_mode_start, "20:00");
        assert_eq!(prefs.protection_start, "00:00");
        assert_eq!(prefs.night_mode_end, "06:00");
    }

    #[test]
    fn clear_returns_to_defaults() {
        let conn = setup();
        let prefs = Preferences { tone: "firm".to_string(), ..Default::default() };
        save_preferences(&conn, &prefs).unwrap();
        clear_preferences(&conn).unwrap();
        assert_eq!(get_preferences(&conn).unwrap(), Preferences::default());
    }

    #[test]
    fn upgrades_v3_table_in_place() {
        // A table shaped like schema v3 (no night phase columns)
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                night_mode_enabled INTEGER NOT NULL DEFAULT 1,
                night_mode_start TEXT NOT NULL DEFAULT '20:00',
                night_mode_end TEXT NOT NULL DEFAULT '06:00',
                tone TEXT NOT NULL DEFAULT 'standard',
                prompt_style TEXT NOT NULL DEFAULT 'mindfulness',
                ai_pause_enabled INTEGER NOT NULL DEFAULT 1
            );
            INSERT INTO preferences (id, tone, night_mode_start) VALUES (1, 'firm', '21:00');
            "#,
        )
        .unwrap();
        ensure_night_phase_columns(&conn).unwrap();
        ensure_night_phase_columns(&conn).unwrap(); // idempotent
        ensure_schedule_columns(&conn).unwrap(); // v5 follows v4 in run_migrations

        let prefs = get_preferences(&conn).unwrap();
        assert_eq!(prefs.tone, "firm"); // existing data kept
        assert_eq!(prefs.night_mode_start, "21:00");
        assert_eq!(prefs.shutdown_start, "22:00"); // new column defaults
        assert_eq!(prefs.protection_start, "00:00");
        assert!(prefs.emergency_override_enabled);
    }

    #[test]
    fn deserializes_v3_payload_without_new_fields() {
        // An older frontend build may still send the six-field shape
        let json = r#"{"nightModeEnabled":true,"nightModeStart":"20:00","nightModeEnd":"06:00",
                      "tone":"standard","promptStyle":"mindfulness","aiPauseEnabled":true}"#;
        let prefs: Preferences = serde_json::from_str(json).unwrap();
        assert_eq!(prefs, Preferences::default());
    }

    #[test]
    fn rejects_bad_schedule() {
        let conn = setup();
        let p = Preferences { schedule_mode: "weekend".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        let p = Preferences { work_start: "9:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        let p = Preferences { work_end: "25:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        let p = Preferences { work_start: "09:00".to_string(), work_end: "09:00".to_string(), ..Default::default() };
        assert!(save_preferences(&conn, &p).is_err());
        assert_eq!(get_preferences(&conn).unwrap(), Preferences::default());
    }

    #[test]
    fn sanitizes_bad_schedule_row() {
        let conn = setup();
        conn.execute(
            "INSERT INTO preferences (id, schedule_mode, work_days, work_start, work_end)
             VALUES (1, 'weekend', '11', '09:00', '09:00')",
            [],
        )
        .unwrap();
        let prefs = get_preferences(&conn).unwrap();
        assert_eq!(prefs.schedule_mode, "standard");
        assert_eq!(prefs.work_days, [true, true, true, true, true, false, false]);
        assert_eq!(prefs.work_start, "09:00");
        assert_eq!(prefs.work_end, "17:00");
    }

    #[test]
    fn derives_standard_bounds_by_default() {
        let d = derive_phase_bounds(&Preferences::default());
        assert_eq!(d.source, BoundsSource::Standard);
        assert_eq!(d.bounds, ["20:00", "22:00", "00:00", "06:00"]);
        assert!(d.problem.is_none());
    }

    #[test]
    fn derives_bounds_from_a_night_shift() {
        // 19:00 to 07:00: wind-down 08:00, shutdown 10:00, protection 12:00, ends 18:00
        let p = Preferences {
            schedule_mode: "night_shift".to_string(),
            work_start: "19:00".to_string(),
            work_end: "07:00".to_string(),
            ..Default::default()
        };
        let d = derive_phase_bounds(&p);
        assert_eq!(d.source, BoundsSource::Schedule);
        assert_eq!(d.bounds, ["08:00", "10:00", "12:00", "18:00"]);

        // 22:00 to 06:00: wind-down 07:00, shutdown 09:00, protection 11:00, ends 21:00
        let p = Preferences { work_start: "22:00".to_string(), work_end: "06:00".to_string(), ..p };
        assert_eq!(derive_phase_bounds(&p).bounds, ["07:00", "09:00", "11:00", "21:00"]);
    }

    #[test]
    fn derives_bounds_from_custom_day_hours_and_wraps_midnight() {
        // 09:00 to 17:00: wind-down 18:00, shutdown 20:00, protection 22:00, ends 08:00
        let p = Preferences { schedule_mode: "custom".to_string(), ..Default::default() };
        let d = derive_phase_bounds(&p);
        assert_eq!(d.source, BoundsSource::Schedule);
        assert_eq!(d.bounds, ["18:00", "20:00", "22:00", "08:00"]);

        // 14:00 to 22:30: shutdown at 01:30 and protection at 03:30 wrap past midnight
        let p = Preferences { work_start: "14:00".to_string(), work_end: "22:30".to_string(), ..p };
        assert_eq!(derive_phase_bounds(&p).bounds, ["23:30", "01:30", "03:30", "13:00"]);
    }

    #[test]
    fn falls_back_to_standard_when_the_gap_between_shifts_is_too_short() {
        // 08:00 to 03:00 leaves five hours: the night ends before protection starts
        let p = Preferences {
            schedule_mode: "custom".to_string(),
            work_start: "08:00".to_string(),
            work_end: "03:00".to_string(),
            ..Default::default()
        };
        let d = derive_phase_bounds(&p);
        assert_eq!(d.source, BoundsSource::Standard);
        assert_eq!(d.bounds, ["20:00", "22:00", "00:00", "06:00"]);
        assert!(d.problem.unwrap().contains("six hours"));

        // Same start and end: also standard, with a reason
        let p = Preferences { work_end: "08:00".to_string(), ..p };
        assert!(derive_phase_bounds(&p).problem.is_some());
    }

    #[test]
    fn explicit_phase_override_wins() {
        let p = Preferences {
            schedule_mode: "night_shift".to_string(),
            work_start: "19:00".to_string(),
            work_end: "07:00".to_string(),
            phase_override: true,
            night_mode_start: "21:00".to_string(),
            shutdown_start: "23:00".to_string(),
            protection_start: "01:00".to_string(),
            night_mode_end: "07:00".to_string(),
            ..Default::default()
        };
        let d = derive_phase_bounds(&p);
        assert_eq!(d.source, BoundsSource::Override);
        assert_eq!(d.bounds, ["21:00", "23:00", "01:00", "07:00"]);
    }

    #[test]
    fn upgrades_v4_table_and_marks_custom_bounds_as_override() {
        // A table shaped like schema v4, with bounds the person changed
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                night_mode_enabled INTEGER NOT NULL DEFAULT 1,
                night_mode_start TEXT NOT NULL DEFAULT '20:00',
                night_mode_end TEXT NOT NULL DEFAULT '06:00',
                tone TEXT NOT NULL DEFAULT 'standard',
                prompt_style TEXT NOT NULL DEFAULT 'mindfulness',
                ai_pause_enabled INTEGER NOT NULL DEFAULT 1,
                shutdown_start TEXT NOT NULL DEFAULT '22:00',
                protection_start TEXT NOT NULL DEFAULT '00:00',
                emergency_override_enabled INTEGER NOT NULL DEFAULT 1
            );
            INSERT INTO preferences (id, night_mode_start, shutdown_start) VALUES (1, '21:00', '23:00');
            "#,
        )
        .unwrap();
        ensure_schedule_columns(&conn).unwrap();
        ensure_schedule_columns(&conn).unwrap(); // idempotent

        let prefs = get_preferences(&conn).unwrap();
        assert_eq!(prefs.schedule_mode, "standard");
        assert_eq!(prefs.work_days, [true, true, true, true, true, false, false]);
        assert_eq!(prefs.work_start, "09:00");
        assert_eq!(prefs.work_end, "17:00");
        assert!(prefs.phase_override); // custom bounds kept winning
        assert!(!prefs.keep_shift_rhythm_on_days_off);
        assert!(!prefs.schedule_setup_done);
        assert_eq!(derive_phase_bounds(&prefs).bounds, ["21:00", "23:00", "00:00", "06:00"]);
    }

    #[test]
    fn upgrades_v4_table_with_default_bounds_without_override() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                night_mode_enabled INTEGER NOT NULL DEFAULT 1,
                night_mode_start TEXT NOT NULL DEFAULT '20:00',
                night_mode_end TEXT NOT NULL DEFAULT '06:00',
                tone TEXT NOT NULL DEFAULT 'standard',
                prompt_style TEXT NOT NULL DEFAULT 'mindfulness',
                ai_pause_enabled INTEGER NOT NULL DEFAULT 1,
                shutdown_start TEXT NOT NULL DEFAULT '22:00',
                protection_start TEXT NOT NULL DEFAULT '00:00',
                emergency_override_enabled INTEGER NOT NULL DEFAULT 1
            );
            INSERT INTO preferences (id, tone) VALUES (1, 'firm');
            "#,
        )
        .unwrap();
        ensure_schedule_columns(&conn).unwrap();
        let prefs = get_preferences(&conn).unwrap();
        assert_eq!(prefs.tone, "firm");
        assert!(!prefs.phase_override);
    }

    #[test]
    fn deserializes_v4_payload_without_schedule_fields() {
        let json = r#"{"nightModeEnabled":true,"nightModeStart":"20:00","shutdownStart":"22:00",
                      "protectionStart":"00:00","nightModeEnd":"06:00","emergencyOverrideEnabled":true,
                      "tone":"standard","promptStyle":"mindfulness","aiPauseEnabled":true}"#;
        let prefs: Preferences = serde_json::from_str(json).unwrap();
        assert_eq!(prefs, Preferences::default());
    }

    #[test]
    fn work_days_round_trip_as_text() {
        let days = [false, true, false, true, false, true, true];
        assert_eq!(work_days_to_text(&days), "0101011");
        assert_eq!(work_days_from_text("0101011"), days);
        assert_eq!(work_days_from_text("11"), default_work_days());
    }

    #[test]
    fn time_validation() {
        assert!(is_valid_time("00:00"));
        assert!(is_valid_time("23:59"));
        assert!(!is_valid_time("24:00"));
        assert!(!is_valid_time("12:60"));
        assert!(!is_valid_time("9:00"));
        assert!(!is_valid_time("09-00"));
        assert!(!is_valid_time(""));
    }
}
