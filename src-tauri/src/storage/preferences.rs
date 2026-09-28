//! User preferences absorbed from the retired Chrome extension:
//! night mode window, tone, prompt style and the AI-site pause toggle.
//!
//! Stored as a single row (id = 1) in the `preferences` table. Missing row
//! means defaults; every read goes through validation so the frontend never
//! sees an unknown tone/style or a malformed time.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const TONES: [&str; 3] = ["gentle", "standard", "firm"];
pub const PROMPT_STYLES: [&str; 3] = ["mindfulness", "scientific", "spiritual"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    /// Night mode on/off (default on)
    pub night_mode_enabled: bool,
    /// Night window start, "HH:MM" local time (default "20:00")
    pub night_mode_start: String,
    /// Night window end, "HH:MM" local time (default "06:00")
    pub night_mode_end: String,
    /// gentle | standard | firm
    pub tone: String,
    /// mindfulness | scientific | spiritual
    pub prompt_style: String,
    /// "Hold. Stay here." pause when tabbing away from an AI chat (default on)
    pub ai_pause_enabled: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            night_mode_enabled: true,
            night_mode_start: "20:00".to_string(),
            night_mode_end: "06:00".to_string(),
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
        if !is_valid_time(&self.night_mode_end) {
            return Err(format!("Invalid night mode end: {}", self.night_mode_end));
        }
        Ok(())
    }

    /// Return a copy with any invalid field replaced by its default.
    /// Used on read so a hand-edited database cannot break the UI.
    pub fn sanitized(&self) -> Self {
        let d = Self::default();
        Self {
            night_mode_enabled: self.night_mode_enabled,
            night_mode_start: if is_valid_time(&self.night_mode_start) {
                self.night_mode_start.clone()
            } else {
                d.night_mode_start
            },
            night_mode_end: if is_valid_time(&self.night_mode_end) {
                self.night_mode_end.clone()
            } else {
                d.night_mode_end
            },
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

/// Create the preferences table (idempotent).
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
            ai_pause_enabled INTEGER NOT NULL DEFAULT 1
        );
        "#,
    )
    .map_err(|e| format!("Failed to create preferences table: {}", e))
}

/// Read preferences. Returns defaults when nothing has been saved yet.
pub fn get_preferences(conn: &Connection) -> Result<Preferences, String> {
    let result = conn.query_row(
        r#"
        SELECT night_mode_enabled, night_mode_start, night_mode_end,
               tone, prompt_style, ai_pause_enabled
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
        (id, night_mode_enabled, night_mode_start, night_mode_end, tone, prompt_style, ai_pause_enabled)
        VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![
            prefs.night_mode_enabled as i32,
            prefs.night_mode_start,
            prefs.night_mode_end,
            prefs.tone,
            prefs.prompt_style,
            prefs.ai_pause_enabled as i32,
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
        assert_eq!(prefs.night_mode_end, "06:00");
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
            night_mode_end: "07:00".to_string(),
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

        // Nothing was written
        assert_eq!(get_preferences(&conn).unwrap(), Preferences::default());
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
