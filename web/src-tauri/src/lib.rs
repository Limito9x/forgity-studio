pub mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_local_machine_info,
            open_or_init_workspace_root,
            save_workspace_root_config,
            save_local_palette,
            load_local_palette,
            save_local_structs,
            load_local_structs,
            save_local_constants,
            load_local_constants,
            list_unreal_content_items,
            create_local_pipeline_draft,
            save_local_pipeline_draft,
            rename_local_pipeline_draft,
            duplicate_local_pipeline_draft,
            delete_local_pipeline_draft,
            save_local_pipeline_snapshot,
            load_local_pipeline_snapshot,
            scan_local_script_folders,
            scan_local_pipeline_drafts,
            analyze_local_scripts_native,
            run_local_pipeline_draft_native,
            get_runner_unreal_project,
            set_runner_unreal_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
