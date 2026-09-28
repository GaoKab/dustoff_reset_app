//! User preferences absorbed from the retired Chrome extension:
//! night mode (three phases with editable bounds, emergency override),
//! tone, prompt style and the AI-site pause toggle.
//!
//! Stored as a single row (id = 1) in the `preferences` table. Missing row
//! means defaults; every read goes through validation so the frontend never
//! sees an unknown tone/style, a malformed time or phases out of order.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const TONES: [&str; 3] = ["gentle", "standard", "firm"];
pub const PROMPT_STYLES: [&str; 3] = ["mindfulness", "scientific", "spiritual"];

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
        Ok(())
    }

    /// Return a copy with any invalid field replaced by its default.
    /// Used on read so a hand-edited database cannot break the UI.
    /// If the phase bounds are individually valid but out of order, all
    /// four fall back to the defaults together so the phases stay coherent.
    pub fn sanitized(&self) -> Self {
        let d = Self::default();
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
        }
    }
}

/// Create the preferences table (idempotent). Fresh databases get every
/// column here; databases created at schema v3 get the v0.3 night columns
/// from `ensure_night_phase_columns` (migration v4).
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
            emergency_override_enabled INTEGER NOT NULL DEFAULT 1
        );
        "#,
    )
    .map_err(|e| format!("Failed to create preferences table: {}", e))
}

/// Add the three-phase night columns to a preferences table created before
/// schema v4. Idempotent: checks pragma_table_info before each ALTER.
pub fn ensure_night_phase_columns(conn: &Connection) -> Result<(), String> {
    let columns: [(&str, &str); 3] = [
        ("shutdown_start", "TEXT NOT NULL DEFAULT '22:00'"),
        ("protection_start", "TEXT NOT NULL DEFAULT '00:00'"),
        ("emergency_override_enabled", "INTEGER NOT NULL DEFAULT 1"),
    ];
    for (name, definition) in columns {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('preferences') WHERE name = ?1",
                params![name],
                |row| row.get::<_, i32>(0),
            )
            .unwrap_or(0)
            > 0;
        if !exists {
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
               shutdown_start, protection_start, emergency_override_enabled
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
         shutdown_start, protection_start, emergency_override_enabled)
        VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
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
