use std::sync::{Arc, Mutex};

use crate::{
    db::Database,
    models::{AppRecord, FileIndexStatus},
};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub app_cache: Arc<Mutex<Vec<AppRecord>>>,
    pub file_index_status: Arc<Mutex<FileIndexStatus>>,
    pub current_hotkey: Arc<Mutex<String>>,
}

impl AppState {
    pub fn new(db: Arc<Database>, hotkey: String) -> Self {
        Self {
            db,
            app_cache: Arc::new(Mutex::new(Vec::new())),
            file_index_status: Arc::new(Mutex::new(FileIndexStatus::default())),
            current_hotkey: Arc::new(Mutex::new(hotkey)),
        }
    }
}
