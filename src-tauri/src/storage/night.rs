//! Night mode events: everything the three-phase night mode records locally.
//!
//! One append-only table, `night_events`, keyed by a "night date". The night
//! date is the calendar date of the evening (an event at 01:30 on the 16th
//! belongs to the night of the 15th); the frontend computes it so the same
//! key is used for gating "once per night" behaviour and for these rows.
//!
//! Kinds (free text, but the frontend uses this fixed set):
//!   wind_down_shown      the wind-down card was offered
//!   shutdown_completed   the shutdown protocol was finished
//!   protection_stop      the STOP screen was shown (detail = what triggered it)
//!   override             a 30-minute emergency override started
//!   cant_sleep           the user chose "I can't sleep" (feeds the insomnia line)
//!   habit                the user chose "It is habit, not need"
//!   session_end          a session ended (detail = bandwidth at that moment)

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NightEvent {
    pub id: i64,
    /// YYYY-MM-DD, the evening the night belongs to
    pub night_date: String,
    pub kind: String,
    /// Optional free text: trigger name, a score, a note
    pub detail: Option<String>,
    /// ISO 8601 timestamp of when the row was written
    pub created_at: String,
}

/// Create the night_events table (idempotent).
pub fn init_night_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS night_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            night_date TEXT NOT NULL,
            kind TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_night_events_date_kind ON night_events(night_date, kind);
        "#,
    )
    .map_err(|e| format!("Failed to create night_events table: {}", e))
}

fn is_valid_date(value: &str) -> bool {
    let parts: Vec<&str> = value.split('-').collect();
    parts.len() == 3
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts[2].len() == 2
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
}

/// Append one event. Rejects empty kinds and malformed dates so a UI bug
/// cannot fill the table with rows that can never be queried back.
pub fn record_night_event(
    conn: &Connection,
    night_date: &str,
    kind: &str,
    detail: Option<&str>,
) -> Result<NightEvent, String> {
    if kind.trim().is_empty() {
        return Err("Night event kind cannot be empty".to_string());
    }
    if !is_valid_date(night_date) {
        return Err(format!("Invalid night date: {}", night_date));
    }
    conn.execute(
        "INSERT INTO night_events (night_date, kind, detail) VALUES (?1, ?2, ?3)",
        params![night_date, kind, detail],
    )
    .map_err(|e| format!("Failed to record night event: {}", e))?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, night_date, kind, detail, created_at FROM night_events WHERE id = ?1",
        params![id],
        row_to_event,
    )
    .map_err(|e| format!("Failed to read back night event: {}", e))
}

fn row_to_event(row: &rusqlite::Row) -> rusqlite::Result<NightEvent> {
    Ok(NightEvent {
        id: row.get(0)?,
        night_date: row.get(1)?,
        kind: row.get(2)?,
        detail: row.get(3)?,
        created_at: row.get(4)?,
    })
}

/// All events for one night, oldest first.
pub fn get_night_events(conn: &Connection, night_date: &str) -> Result<Vec<NightEvent>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, night_date, kind, detail, created_at FROM night_events
             WHERE night_date = ?1 ORDER BY id ASC",
        )
        .map_err(|e| format!("Failed to prepare night events query: {}", e))?;
    let rows = stmt
        .query_map(params![night_date], row_to_event)
        .map_err(|e| format!("Failed to query night events: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read night events: {}", e))
}

/// How many events of one kind happened on one night. Used for the
/// override limit (at most two per night) and for "already offered tonight".
pub fn count_night_events(conn: &Connection, night_date: &str, kind: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM night_events WHERE night_date = ?1 AND kind = ?2",
        params![night_date, kind],
        |row| row.get(0),
    )
    .map_err(|e| format!("Failed to count night events: {}", e))
}

/// How many distinct nights since `since_date` (inclusive) had at least one
/// event of this kind. Feeds the rolling seven-day insomnia line: three
/// "I can't sleep" taps on one night still count as one night.
pub fn count_nights_with_event_since(
    conn: &Connection,
    since_date: &str,
    kind: &str,
) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(DISTINCT night_date) FROM night_events WHERE night_date >= ?1 AND kind = ?2",
        params![since_date, kind],
        |row| row.get(0),
    )
    .map_err(|e| format!("Failed to count nights with event: {}", e))
}

/// The most recent event of one kind, any night. Used to show the bandwidth
/// at the last session end on the STOP screen.
pub fn get_latest_night_event(conn: &Connection, kind: &str) -> Result<Option<NightEvent>, String> {
    let result = conn.query_row(
        "SELECT id, night_date, kind, detail, created_at FROM night_events
         WHERE kind = ?1 ORDER BY id DESC LIMIT 1",
        params![kind],
        row_to_event,
    );
    match result {
        Ok(event) => Ok(Some(event)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get latest night event: {}", e)),
    }
}

/// Remove every night event (used by reset_all_data).
pub fn clear_night_events(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM night_events", [])
        .map_err(|e| format!("Failed to clear night events: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_night_table(&conn).unwrap();
        init_night_table(&conn).unwrap(); // idempotent
        conn
    }

    #[test]
    fn records_and_reads_back_in_order() {
        let conn = setup();
        let first = record_night_event(&conn, "2026-01-15", "protection_stop", Some("app_open")).unwrap();
        let second = record_night_event(&conn, "2026-01-15", "override", None).unwrap();
        assert_eq!(first.kind, "protection_stop");
        assert_eq!(first.detail.as_deref(), Some("app_open"));
        assert!(second.id > first.id);
        assert!(!first.created_at.is_empty());

        let events = get_night_events(&conn, "2026-01-15").unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0], first);
        assert_eq!(events[1], second);
        assert!(get_night_events(&conn, "2026-01-16").unwrap().is_empty());
    }

    #[test]
    fn counts_per_night_and_kind_for_the_override_limit() {
        let conn = setup();
        record_night_event(&conn, "2026-01-15", "override", None).unwrap();
        record_night_event(&conn, "2026-01-15", "override", None).unwrap();
        record_night_event(&conn, "2026-01-15", "cant_sleep", None).unwrap();
        record_night_event(&conn, "2026-01-16", "override", None).unwrap();

        assert_eq!(count_night_events(&conn, "2026-01-15", "override").unwrap(), 2);
        assert_eq!(count_night_events(&conn, "2026-01-16", "override").unwrap(), 1);
        assert_eq!(count_night_events(&conn, "2026-01-15", "cant_sleep").unwrap(), 1);
        assert_eq!(count_night_events(&conn, "2026-01-17", "override").unwrap(), 0);
    }

    #[test]
    fn shutdown_completion_is_per_night() {
        let conn = setup();
        assert_eq!(count_night_events(&conn, "2026-01-15", "shutdown_completed").unwrap(), 0);
        record_night_event(&conn, "2026-01-15", "shutdown_completed", None).unwrap();
        assert_eq!(count_night_events(&conn, "2026-01-15", "shutdown_completed").unwrap(), 1);
        // The next evening is offered again
        assert_eq!(count_night_events(&conn, "2026-01-16", "shutdown_completed").unwrap(), 0);
    }

    #[test]
    fn insomnia_counts_distinct_nights_in_the_window() {
        let conn = setup();
        // Two taps on one night count once
        record_night_event(&conn, "2026-01-10", "cant_sleep", None).unwrap();
        record_night_event(&conn, "2026-01-10", "cant_sleep", None).unwrap();
        record_night_event(&conn, "2026-01-12", "cant_sleep", None).unwrap();
        // Old night falls outside the window
        record_night_event(&conn, "2026-01-01", "cant_sleep", None).unwrap();
        // Other kinds are ignored
        record_night_event(&conn, "2026-01-13", "habit", None).unwrap();

        assert_eq!(count_nights_with_event_since(&conn, "2026-01-08", "cant_sleep").unwrap(), 2);
        assert_eq!(count_nights_with_event_since(&conn, "2026-01-01", "cant_sleep").unwrap(), 3);
        assert_eq!(count_nights_with_event_since(&conn, "2026-01-13", "cant_sleep").unwrap(), 0);
    }

    #[test]
    fn latest_event_returns_the_newest_of_that_kind() {
        let conn = setup();
        assert!(get_latest_night_event(&conn, "session_end").unwrap().is_none());
        record_night_event(&conn, "2026-01-14", "session_end", Some("61")).unwrap();
        record_night_event(&conn, "2026-01-15", "session_end", Some("48")).unwrap();
        record_night_event(&conn, "2026-01-15", "habit", None).unwrap();
        let latest = get_latest_night_event(&conn, "session_end").unwrap().unwrap();
        assert_eq!(latest.detail.as_deref(), Some("48"));
        assert_eq!(latest.night_date, "2026-01-15");
    }

    #[test]
    fn rejects_bad_input_and_clears() {
        let conn = setup();
        assert!(record_night_event(&conn, "2026-01-15", "", None).is_err());
        assert!(record_night_event(&conn, "15/01/2026", "habit", None).is_err());
        assert!(record_night_event(&conn, "", "habit", None).is_err());

        record_night_event(&conn, "2026-01-15", "habit", None).unwrap();
        clear_night_events(&conn).unwrap();
        assert!(get_night_events(&conn, "2026-01-15").unwrap().is_empty());
    }
}
