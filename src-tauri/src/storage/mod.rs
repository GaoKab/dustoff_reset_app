pub mod database;
pub mod calibration;
pub mod session;
pub mod reflection;
pub mod parking_lot;
pub mod recovery;
pub mod user;
pub mod preferences;

pub use database::*;
pub use calibration::*;
pub use session::*;
pub use reflection::*;
pub use parking_lot::*;
pub use recovery::*;
pub use user::*;
pub use preferences::*;

// Re-export for use by Tauri commands
#[allow(unused_imports)]
pub use database::{get_db_path, init_database};

#[allow(unused_imports)]
pub use calibration::{
    clear_all_calibrations, clear_calibration, get_recent_calibrations, get_workday_date,
    has_calibrated_today, load_calibration, load_calibration_for_today, save_calibration,
};

#[allow(unused_imports)]
pub use session::{
    count_sessions, delete_all_sessions, delete_session, get_active_session, get_all_sessions,
    get_latest_session, get_session, get_sessions_for_today, get_sessions_in_range, save_session,
};

#[allow(unused_imports)]
pub use reflection::{
    count_reflections, delete_all_reflections, delete_reflection, get_completed_reflections,
    get_recent_reflections_with_sessions, get_reflection, get_reflection_with_session,
    save_reflection,
};

#[allow(unused_imports)]
pub use recovery::{
    clear_recovery_data, get_recovery_data, has_recovery_data, save_recovery_data,
    update_recovery_elapsed, update_recovery_state,
};
