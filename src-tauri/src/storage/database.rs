use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use crate::telemetry::persistence::init_telemetry_tables;

#[allow(dead_code)]
const CURRENT_SCHEMA_VERSION: i32 = 4;

/// Get the path to the SQLite database file.
/// Creates the app data directory if it doesn't exist.
pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    if !app_data.exists() {
        fs::create_dir_all(&app_data)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_data.join("dustoff.db"))
}

/// Initialize the database connection and run migrations.
/// Returns a configured Connection with foreign keys enabled.
pub fn init_database(app: &AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable foreign key constraints
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    // Run migrations
    run_migrations(&conn)?;

    Ok(conn)
}

/// Check current schema version and run necessary migrations.
fn run_migrations(conn: &Connection) -> Result<(), String> {
    // Create schema_version table if it doesn't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )
    .map_err(|e| format!("Failed to create schema_version table: {}", e))?;

    // Get current version
    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Run migrations in order
    if current_version < 1 {
        migrate_v1(conn)?;
    }

    // Initialize telemetry tables (idempotent - uses CREATE IF NOT EXISTS)
    init_telemetry_tables(conn)?;

    // Migration v2: Add whitelisted_apps and whitelisted_tabs to recovery_data
    if current_version < 2 {
        migrate_v2(conn)?;
    }

    // Migration v3: preferences table (night mode, tone, prompt style, AI pause)
    if current_version < 3 {
        migrate_v3(conn)?;
    }

    // Migration v4: three-phase night mode (phase bounds, emergency override
    // toggle) and the night_events table
    if current_version < 4 {
        migrate_v4(conn)?;
    }

    Ok(())
}

/// Migration v4: full night mode. Adds shutdown_start, protection_start and
/// emergency_override_enabled to preferences (idempotent column checks) and
/// creates night_events.
fn migrate_v4(conn: &Connection) -> Result<(), String> {
    super::preferences::init_preferences_table(conn)?;
    super::preferences::ensure_night_phase_columns(conn)?;
    super::night::init_night_table(conn)?;
    conn.execute("UPDATE schema_version SET version = 4", [])
        .map_err(|e| format!("Failed to update schema version: {}", e))?;
    Ok(())
}

/// Migration v3: preferences absorbed from the retired Chrome extension
fn migrate_v3(conn: &Connection) -> Result<(), String> {
    super::preferences::init_preferences_table(conn)?;
    conn.execute("UPDATE schema_version SET version = 3", [])
        .map_err(|e| format!("Failed to update schema version: {}", e))?;
    Ok(())
}

/// Migration v2: Add whitelisted apps/tabs columns to recovery_data
fn migrate_v2(conn: &Connection) -> Result<(), String> {
    // Check if columns already exist (in case table was created fresh with v1)
    let has_apps_column: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('recovery_data') WHERE name='whitelisted_apps'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0) > 0;

    if !has_apps_column {
        conn.execute(
            "ALTER TABLE recovery_data ADD COLUMN whitelisted_apps TEXT DEFAULT '[]'",
            [],
        )
        .map_err(|e| format!("Failed to add whitelisted_apps column: {}", e))?;
    }

    let has_tabs_column: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('recovery_data') WHERE name='whitelisted_tabs'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0) > 0;

    if !has_tabs_column {
        conn.execute(
            "ALTER TABLE recovery_data ADD COLUMN whitelisted_tabs TEXT DEFAULT '[]'",
            [],
        )
        .map_err(|e| format!("Failed to add whitelisted_tabs column: {}", e))?;
    }

    // Update schema version
    conn.execute("UPDATE schema_version SET version = 2", [])
        .map_err(|e| format!("Failed to update schema version: {}", e))?;

    Ok(())
}

/// Migration v1: Initial schema creation
fn migrate_v1(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        -- ============================================
        -- CALIBRATIONS TABLE
        -- Daily bandwidth calibration records
        -- ============================================
        CREATE TABLE IF NOT EXISTS calibrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            calibration_score REAL NOT NULL,
            sleep_hours REAL NOT NULL,
            sleep_quality INTEGER NOT NULL,
            emotional_residue INTEGER NOT NULL,
            emotional_state TEXT NOT NULL,
            distractions TEXT NOT NULL DEFAULT '[]',
            timestamp INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_calibrations_date ON calibrations(date);

        -- ============================================
        -- SESSIONS TABLE
        -- Focus session records
        -- ============================================
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            planned_duration_minutes INTEGER NOT NULL,
            actual_duration_minutes INTEGER,
            mode TEXT NOT NULL,
            intention TEXT,
            victory_level TEXT,
            flow_efficiency REAL,
            longest_streak_minutes INTEGER DEFAULT 0,
            distraction_attempts INTEGER DEFAULT 0,
            interventions_used INTEGER DEFAULT 0,
            end_reason TEXT,
            end_sub_reason TEXT,
            timeline_blocks TEXT DEFAULT '[]',
            distraction_events TEXT DEFAULT '[]',
            intervention_events TEXT DEFAULT '[]',
            whitelisted_apps TEXT DEFAULT '[]',
            whitelisted_tabs TEXT DEFAULT '[]'
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

        -- ============================================
        -- REFLECTIONS TABLE
        -- Post-session reflection records
        -- ============================================
        CREATE TABLE IF NOT EXISTS reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
            what_went_well TEXT NOT NULL,
            friction_notes TEXT,
            closing_energy INTEGER NOT NULL,
            skipped INTEGER DEFAULT 0
        );

        -- ============================================
        -- PARKING LOT ITEMS TABLE
        -- Captured thoughts, tasks, and distractions
        -- ============================================
        CREATE TABLE IF NOT EXISTS parking_lot_items (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            item_status TEXT,
            category TEXT,
            tags TEXT DEFAULT '[]',
            action TEXT,
            session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
            resolved_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_parking_lot_items_status ON parking_lot_items(status);

        -- ============================================
        -- RECOVERY DATA TABLE
        -- Single row for crash recovery
        -- ============================================
        CREATE TABLE IF NOT EXISTS recovery_data (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            session_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            planned_duration_minutes INTEGER NOT NULL,
            mode TEXT NOT NULL,
            intention TEXT,
            elapsed_seconds INTEGER NOT NULL,
            bandwidth_at_pause REAL,
            whitelisted_apps TEXT DEFAULT '[]',
            whitelisted_tabs TEXT DEFAULT '[]'
        );

        -- ============================================
        -- USER DATA TABLE
        -- Single row for user settings
        -- ============================================
        CREATE TABLE IF NOT EXISTS user_data (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            email TEXT,
            first_name TEXT,
            operator_name TEXT,
            default_mode TEXT DEFAULT 'Flow'
        );

        -- Record migration version
        INSERT INTO schema_version (version) VALUES (1);
        "#,
    )
    .map_err(|e| format!("Migration v1 failed: {}", e))?;

    println!("[Database] Migration v1 completed successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_migrations_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        // Run migrations twice - should not fail
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();

        // Verify tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"calibrations".to_string()));
        assert!(tables.contains(&"sessions".to_string()));
        assert!(tables.contains(&"reflections".to_string()));
        assert!(tables.contains(&"parking_lot_items".to_string()));
        assert!(tables.contains(&"recovery_data".to_string()));
        assert!(tables.contains(&"user_data".to_string()));
        assert!(tables.contains(&"preferences".to_string()));
        assert!(tables.contains(&"night_events".to_string()));
        assert!(tables.contains(&"schema_version".to_string()));

        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_migration_v3_to_v4_keeps_preferences_and_adds_night_columns() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        // Build a database as v0.3.0-dev left it: schema v3, six-column
        // preferences table with a saved row, no night_events table.
        conn.execute(
            "CREATE TABLE schema_version (version INTEGER PRIMARY KEY)",
            [],
        )
        .unwrap();
        migrate_v1(&conn).unwrap();
        init_telemetry_tables(&conn).unwrap();
        migrate_v2(&conn).unwrap();
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
            INSERT INTO preferences (id, night_mode_enabled, night_mode_start, night_mode_end, tone, prompt_style, ai_pause_enabled)
            VALUES (1, 1, '21:00', '07:00', 'gentle', 'scientific', 0);
            UPDATE schema_version SET version = 3;
            "#,
        )
        .unwrap();

        run_migrations(&conn).unwrap();

        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 4);

        let prefs = super::super::preferences::get_preferences(&conn).unwrap();
        assert_eq!(prefs.tone, "gentle");
        assert_eq!(prefs.prompt_style, "scientific");
        assert!(!prefs.ai_pause_enabled);
        assert_eq!(prefs.night_mode_start, "21:00");
        assert_eq!(prefs.night_mode_end, "07:00");
        assert_eq!(prefs.shutdown_start, "22:00");
        assert_eq!(prefs.protection_start, "00:00");
        assert!(prefs.emergency_override_enabled);

        // night_events is usable straight after the migration
        super::super::night::record_night_event(&conn, "2026-01-15", "habit", None).unwrap();
        assert_eq!(
            super::super::night::count_night_events(&conn, "2026-01-15", "habit").unwrap(),
            1
        );

        // Running again is a no-op
        run_migrations(&conn).unwrap();
    }

    #[test]
    fn test_foreign_key_constraint() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();

        // Insert a reflection with non-existent session_id should fail
        let result = conn.execute(
            "INSERT INTO reflections (session_id, what_went_well, closing_energy) 
             VALUES ('nonexistent', 'test', 5)",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_single_row_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();

        // Insert first row - should succeed
        conn.execute(
            "INSERT INTO user_data (id, email) VALUES (1, 'test@example.com')",
            [],
        )
        .unwrap();

        // Try to insert second row - should fail due to CHECK constraint
        let result = conn.execute(
            "INSERT INTO user_data (id, email) VALUES (2, 'other@example.com')",
            [],
        );

        assert!(result.is_err());
    }
}
