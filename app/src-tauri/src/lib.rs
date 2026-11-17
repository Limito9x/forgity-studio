pub mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::local_execution::LocalExecutionState::default())
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
            commands::contracts::save_script_override,
            commands::contracts::clear_script_override,
            commands::contracts::get_pipeline_contract_spec,
            commands::contracts::validate_local_pipeline_graph,
            load_local_palette,
            save_local_structs,
            load_local_structs,
            save_local_constants,
            load_local_constants,
            load_constant_palette,
            load_workspace_node_contracts,
            save_local_script_override,
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
            run_local_pipeline,
            run_cloud_bundle,
            export_execution_bundle,
            build_publish_bundle_json,
            cancel_local_pipeline,
            get_runner_unreal_project,
            set_runner_unreal_project,
            get_local_runner_config,
            save_local_runner_config,
            scan_local_dcc_executors,
            commands::template_manifest::scan_template_dependencies,
            list_registered_workspaces,
            get_registered_workspace,
            register_workspace,
            touch_workspace_opened,
            remove_workspace_from_registry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
