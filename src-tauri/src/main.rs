// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod badges;
mod models;
mod permissions;
mod presets;
mod storage;
mod telemetry;
mod commands;

use std::sync::Mutex;
use storage::init_database;
use tauri::Manager;

// Import AppState from the library crate
use dustoff_reset_lib::AppState;

// Import TelemetryState for managing telemetry
use commands::telemetry::TelemetryState;

// Import permission commands
use commands::permissions::{
    check_permissions,
    are_all_permissions_granted,
    open_system_permissions,
    get_current_platform,
    request_permission,
};

// Import preset commands
use commands::presets::{
    init_presets,
    get_all_presets,
    get_preset,
    create_user_preset,
    update_user_preset,
    delete_user_preset,
    save_as_last_session,
    use_preset,
    get_quick_start_config,
    get_user_preset_count,
    get_all_cached_apps,
    cache_new_app,
    set_app_user_classification,
    check_needs_app_scan,
    record_app_scan_complete,
    get_blocked_domains,
    get_whitelisted_domains,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize database
            let conn = init_database(&app.handle()).expect("Failed to initialize database");

            // Store in app state
            let app_state = AppState {
                db: Mutex::new(conn),
            };
            
            // Initialize badge tables
            if let Ok(conn) = app_state.db.lock() {
                if let Err(e) = badges::persistence::init_badge_tables(&conn) {
                    eprintln!("Warning: Failed to initialize badge tables: {}", e);
                }
            }
            
            app.manage(app_state);

            // Initialize telemetry state
            app.manage(TelemetryState::new());

            // Ensure window is fully transparent on macOS
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // Disable window shadow for cleaner transparent look
                    let _ = window.set_shadow(false);
                    
                    // Inject script to ensure transparent background
                    let _ = window.eval(r#"
                        document.documentElement.style.background = 'transparent';
                        document.body.style.background = 'transparent';
                        if (document.getElementById('root')) {
                            document.getElementById('root').style.background = 'transparent';
                        }
                    "#);
                }
            }

            println!("Dustoff Reset initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window commands (from Day 1)
            commands::windows::resize_window,
            commands::windows::get_window_size,
            commands::windows::start_dragging,
            commands::windows::set_window_position,
            commands::windows::get_window_position,
            commands::windows::set_always_on_top,
            commands::windows::is_always_on_top,
            // Data commands (adding today)
            commands::data::save_calibration,
            commands::data::load_calibration,
            commands::data::clear_calibration,
            commands::data::save_session,
            commands::data::get_session,
            commands::data::get_all_sessions,
            commands::data::save_reflection,
            commands::data::get_reflection,
            commands::data::save_recovery_data,
            commands::data::get_recovery_data,
            commands::data::clear_recovery_data,
            commands::data::add_parking_lot_item,
            commands::data::update_parking_lot_item,
            commands::data::get_active_parking_lot_items,
            commands::data::get_next_session_items,
            commands::data::delete_parking_lot_item,
            commands::data::save_user,
            commands::data::get_user,
            commands::data::get_preferences,
            commands::data::save_preferences,
            commands::data::get_workday_date,
            commands::data::get_calibration_history,
            commands::data::generate_uuid,
            commands::data::reset_all_data,
            // Telemetry commands
            commands::telemetry::start_telemetry_monitor,
            commands::telemetry::stop_telemetry_monitor,
            commands::telemetry::is_telemetry_running,
            commands::telemetry::get_telemetry_events,
            commands::telemetry::get_telemetry_stats,
            commands::telemetry::save_telemetry_stats,
            commands::telemetry::get_system_apps,
            commands::telemetry::get_system_browsers,
            commands::telemetry::focus_app,
            commands::telemetry::minimize_app,
            commands::telemetry::close_browser_tab,
            // Badge commands
            commands::badges::init_badges,
            commands::badges::get_badges,
            commands::badges::get_recent_unlocked_badges,
            commands::badges::check_badge_unlocked,
            commands::badges::get_streaks,
            commands::badges::get_streak,
            commands::badges::check_streak_at_risk,
            commands::badges::get_stat,
            commands::badges::evaluate_badges_for_session,
            commands::badges::get_badge_count,
            commands::badges::record_badge_share,
            // Permissions commands
            check_permissions,
            are_all_permissions_granted,
            open_system_permissions,
            get_current_platform,
            request_permission,
            // Preset commands
            init_presets,
            get_all_presets,
            get_preset,
            create_user_preset,
            update_user_preset,
            delete_user_preset,
            save_as_last_session,
            use_preset,
            get_quick_start_config,
            get_user_preset_count,
            get_all_cached_apps,
            cache_new_app,
            set_app_user_classification,
            check_needs_app_scan,
            record_app_scan_complete,
            get_blocked_domains,
            get_whitelisted_domains,
            // Calendar commands (read-only, local)
            commands::calendar::get_upcoming_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
