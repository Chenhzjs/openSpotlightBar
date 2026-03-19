use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::state::AppState;

pub fn spawn(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app_handle.state::<AppState>().inner().clone();
        let mut previous_text = String::new();

        loop {
            let settings = match state.db.get_settings() {
                Ok(settings) => settings,
                Err(_) => {
                    tokio::time::sleep(Duration::from_millis(1200)).await;
                    continue;
                }
            };

            if let Ok(mut clipboard) = arboard::Clipboard::new() {
                if let Ok(text) = clipboard.get_text() {
                    let normalized = text.trim().to_string();
                    if !normalized.is_empty() && normalized != previous_text {
                        previous_text = normalized.clone();

                        let _ = state.db.insert_clipboard_text(
                            &normalized,
                            None,
                            settings.clipboard.max_items,
                        );
                    }
                }
            }

            // Polling-based clipboard monitoring for cross-platform compatibility.
            tokio::time::sleep(Duration::from_millis(
                settings.clipboard.poll_interval_ms.max(400),
            ))
            .await;
        }
    });
}
