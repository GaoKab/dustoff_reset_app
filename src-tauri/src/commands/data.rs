//! Data commands for Tauri frontend communication.
//! These commands are the bridge between the React frontend and Rust storage.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::models::{
    CalibrationData, ItemAction, ItemCategory, ItemStatus, ParkingLotItem, ParkingLotStatus,
    RecoveryData, ReflectionObject, SessionRecord,
};
use crate::storage;
use crate::storage::preferences::Preferences;
use crate::storage::night::NightEvent;
use crate::storage::user::UserData;
use crate::AppState;

// ============================================
// CALIBRATION COMMANDS
// ============================================

#[tauri::command]
pub fn save_calibration(state: State<AppState>, data: CalibrationData) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::calibration::save_calibration(&conn, &data)
}

#[tauri::command]
pub fn load_calibration(state: State<AppState>) -> Result<Option<CalibrationData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::calibration::load_calibration_for_today(&conn)
}

#[tauri::command]
pub fn clear_calibration(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let date = storage::calibration::get_workday_date();
    storage::calibration::clear_calibration(&conn, &date)
}

/// Recent daily calibrations (newest first) — feeds the Progress panel's
/// capacity trend. Uses the storage helper that already existed but was
/// never exposed as a command.
#[tauri::command]
pub fn get_calibration_history(
    state: State<AppState>,
    limit: Option<i32>,
) -> Result<Vec<CalibrationData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::calibration::get_recent_calibrations(&conn, limit.unwrap_or(30))
}

// ============================================
// SESSION COMMANDS
// ============================================

#[tauri::command]
pub fn save_session(state: State<AppState>, session: SessionRecord) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::session::save_session(&conn, &session)
}

#[tauri::command]
pub fn get_session(
    state: State<AppState>,
    session_id: String,
) -> Result<Option<SessionRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::session::get_session(&conn, &session_id)
}

#[tauri::command]
pub fn get_all_sessions(
    state: State<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<SessionRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    match (start_date, end_date) {
        (Some(start), Some(end)) => storage::session::get_sessions_in_range(&conn, &start, &end),
        _ => storage::session::get_all_sessions(&conn),
    }
}

// ============================================
// REFLECTION COMMANDS
// ============================================

#[tauri::command]
pub fn save_reflection(state: State<AppState>, reflection: ReflectionObject) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::reflection::save_reflection(&conn, &reflection)
}

#[tauri::command]
pub fn get_reflection(
    state: State<AppState>,
    session_id: String,
) -> Result<Option<ReflectionObject>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::reflection::get_reflection(&conn, &session_id)
}

// ============================================
// RECOVERY COMMANDS
// ============================================

#[tauri::command]
pub fn save_recovery_data(state: State<AppState>, data: RecoveryData) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::recovery::save_recovery_data(&conn, &data)
}

#[tauri::command]
pub fn get_recovery_data(state: State<AppState>) -> Result<Option<RecoveryData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::recovery::get_recovery_data(&conn)
}

#[tauri::command]
pub fn clear_recovery_data(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::recovery::clear_recovery_data(&conn)
}

// ============================================
// PARKING LOT COMMANDS
// ============================================

/// Partial update for parking lot items from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkingLotItemUpdate {
    pub text: Option<String>,
    pub status: Option<ParkingLotStatus>,
    pub item_status: Option<ItemStatus>,
    pub category: Option<ItemCategory>,
    pub tags: Option<Vec<String>>,
    pub action: Option<ItemAction>,
    pub session_id: Option<String>,
    pub resolved_at: Option<String>,
}

#[tauri::command]
pub fn add_parking_lot_item(
    state: State<AppState>,
    text: String,
) -> Result<ParkingLotItem, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Create new item with generated UUID
    let item = ParkingLotItem::new(uuid::Uuid::new_v4().to_string(), text);

    // Save to database
    storage::parking_lot::add_parking_lot_item(&conn, &item)?;

    // Return the created item
    Ok(item)
}

#[tauri::command]
pub fn update_parking_lot_item(
    state: State<AppState>,
    id: String,
    updates: ParkingLotItemUpdate,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Get existing item
    let existing = storage::parking_lot::get_parking_lot_item(&conn, &id)?
        .ok_or_else(|| format!("Parking lot item not found: {}", id))?;

    // Apply updates
    let updated_item = ParkingLotItem {
        id: existing.id,
        text: updates.text.unwrap_or(existing.text),
        timestamp: existing.timestamp,
        status: updates.status.unwrap_or(existing.status),
        item_status: updates.item_status.or(existing.item_status),
        category: updates.category.or(existing.category),
        tags: updates.tags.unwrap_or(existing.tags),
        action: updates.action.or(existing.action),
        session_id: updates.session_id.or(existing.session_id),
        resolved_at: updates.resolved_at.or(existing.resolved_at),
    };

    storage::parking_lot::update_parking_lot_item(&conn, &updated_item)
}

#[tauri::command]
pub fn get_active_parking_lot_items(
    state: State<AppState>,
) -> Result<Vec<ParkingLotItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::parking_lot::get_active_parking_lot_items(&conn)
}

#[tauri::command]
pub fn get_next_session_items(state: State<AppState>) -> Result<Vec<ParkingLotItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::parking_lot::get_next_session_items(&conn)
}

#[tauri::command]
pub fn delete_parking_lot_item(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::parking_lot::delete_parking_lot_item(&conn, &id)
}

// ============================================
// USER COMMANDS
// ============================================

#[tauri::command]
pub fn save_user(
    state: State<AppState>,
    email: Option<String>,
    first_name: Option<String>,
    operator_name: Option<String>,
    default_mode: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::user::save_user(
        &conn,
        email.as_deref(),
        first_name.as_deref(),
        operator_name.as_deref(),
        default_mode.as_deref(),
    )
}

#[tauri::command]
pub fn get_user(state: State<AppState>) -> Result<Option<UserData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::user::get_user(&conn)
}

// ============================================
// PREFERENCES COMMANDS
// ============================================

#[tauri::command]
pub fn get_preferences(state: State<AppState>) -> Result<Preferences, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::preferences::get_preferences(&conn)
}

#[tauri::command]
pub fn save_preferences(state: State<AppState>, prefs: Preferences) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::preferences::save_preferences(&conn, &prefs)
}

// ============================================
// NIGHT MODE EVENTS (STOP screen, overrides, can't sleep, shutdown, session end)
// ============================================

#[tauri::command]
pub fn record_night_event(
    state: State<AppState>,
    night_date: String,
    kind: String,
    detail: Option<String>,
) -> Result<NightEvent, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::night::record_night_event(&conn, &night_date, &kind, detail.as_deref())
}

#[tauri::command]
pub fn get_night_events(state: State<AppState>, night_date: String) -> Result<Vec<NightEvent>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::night::get_night_events(&conn, &night_date)
}

#[tauri::command]
pub fn count_night_events(
    state: State<AppState>,
    night_date: String,
    kind: String,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::night::count_night_events(&conn, &night_date, &kind)
}

#[tauri::command]
pub fn count_nights_with_event_since(
    state: State<AppState>,
    since_date: String,
    kind: String,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::night::count_nights_with_event_since(&conn, &since_date, &kind)
}

#[tauri::command]
pub fn get_latest_night_event(
    state: State<AppState>,
    kind: String,
) -> Result<Option<NightEvent>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    storage::night::get_latest_night_event(&conn, &kind)
}

// ============================================
// UTILITY COMMANDS
// ============================================

#[tauri::command]
pub fn get_workday_date() -> Result<String, String> {
    Ok(storage::calibration::get_workday_date())
}

#[tauri::command]
pub fn generate_uuid() -> Result<String, String> {
    Ok(uuid::Uuid::new_v4().to_string())
}

#[tauri::command]
pub fn reset_all_data(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Clear all tables in order (respect foreign keys)
    storage::reflection::delete_all_reflections(&conn)?;
    storage::parking_lot::delete_all_parking_lot_items(&conn)?;
    storage::session::delete_all_sessions(&conn)?;
    storage::calibration::clear_all_calibrations(&conn)?;
    storage::recovery::clear_recovery_data(&conn)?;
    storage::user::clear_user(&conn)?;
    storage::preferences::clear_preferences(&conn)?;
    storage::night::clear_night_events(&conn)?;

    Ok(())
}
