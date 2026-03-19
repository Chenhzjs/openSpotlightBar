mod commands;
mod db;
mod error;
mod models;
mod platform;
mod services;
mod state;

use std::sync::Arc;

use commands::{
    bootstrap_state, delete_snippet, delete_workflow, fetch_plugin_registry,
    get_file_index_status, hide_window, install_marketplace_plugin, open_devtools, resize_window,
    list_clipboard_items, list_snippets, list_workflows, perform_action, plugin_exec_shell,
    plugin_read_clipboard_text, plugin_write_clipboard_text, rebuild_file_index, record_selection,
    save_snippet, save_workflow, search_apps, search_files, uninstall_marketplace_plugin,
    update_settings, workflow_exec_shell, workflow_http_request,
};
use db::Database;
use error::{AppError, AppResult};
use state::AppState;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = toggle_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| AppError::Message(error.to_string()))?;
            let db = Arc::new(Database::new(&app_dir)?);
            let settings = db.get_settings()?;
            let state = AppState::new(db.clone(), settings.hotkey.clone());
            let file_index_status = services::file_index::load_status(&db, &settings)?;
            if let Ok(mut guard) = state.file_index_status.lock() {
                *guard = file_index_status;
            }
            app.manage(state.clone());

            refresh_app_cache(app.handle());
            register_hotkey(app.handle(), &settings.hotkey)?;
            services::clipboard_monitor::spawn(app.handle().clone());
            services::file_index::spawn_rebuild(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_state,
            resize_window,
            search_apps,
            search_files,
            list_clipboard_items,
            list_snippets,
            save_snippet,
            delete_snippet,
            list_workflows,
            save_workflow,
            delete_workflow,
            update_settings,
            record_selection,
            rebuild_file_index,
            get_file_index_status,
            plugin_exec_shell,
            workflow_exec_shell,
            workflow_http_request,
            plugin_read_clipboard_text,
            plugin_write_clipboard_text,
            perform_action,
            hide_window,
            open_devtools,
            fetch_plugin_registry,
            install_marketplace_plugin,
            uninstall_marketplace_plugin
        ])
        .run(tauri::generate_context!())
        .expect("error while running Open Spotlight Bar");
}

pub fn refresh_app_cache(app_handle: &AppHandle) {
    let state = app_handle.state::<AppState>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let apps = platform::apps::discover_apps();
        if let Ok(mut cache) = state.app_cache.lock() {
            *cache = apps;
        }
    });
}

pub fn register_hotkey(app: &AppHandle, hotkey: &str) -> AppResult<()> {
    let shortcut: Shortcut = hotkey
        .parse()
        .map_err(|error| AppError::Message(format!("Invalid hotkey {hotkey}: {error}")))?;
    app.global_shortcut()
        .register(shortcut)
        .map_err(|error| AppError::Message(error.to_string()))?;
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut current_hotkey) = state.current_hotkey.lock() {
            *current_hotkey = hotkey.to_string();
        }
    }
    Ok(())
}

pub fn update_hotkey(app: &AppHandle, hotkey: &str) -> AppResult<()> {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(current) = state.current_hotkey.lock() {
            if !current.is_empty() {
                if let Ok(existing) = current.parse::<Shortcut>() {
                    let _ = app.global_shortcut().unregister(existing);
                }
            }
        }
    }
    register_hotkey(app, hotkey)
}

pub fn toggle_main_window(app: &AppHandle) -> AppResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::from("Main window was not found"))?;

    if window.is_visible()? {
        window.hide()?;
    } else {
        window.show()?;
        center_window_for_current_size(&window)?;
        window.set_focus()?;
    }
    Ok(())
}

fn center_window_for_current_size(window: &WebviewWindow) -> AppResult<()> {
    let monitor = window.current_monitor()?.or(window.primary_monitor()?);

    let Some(monitor) = monitor else {
        window.center()?;
        return Ok(());
    };

    let work_area = monitor.work_area();
    let size = window.outer_size()?;
    let x = work_area.position.x + ((work_area.size.width as i32 - size.width as i32) / 2);
    let y = work_area.position.y + ((work_area.size.height as i32 - size.height as i32) / 2);

    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}
