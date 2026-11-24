mod commands;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::fs::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::fs::list_dir,
            commands::fs::list_files,
            commands::fs::read_file,
            commands::fs::list_system_fonts,
            commands::fs::watch_repo,
            commands::git::get_git_status_and_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pore");
}
