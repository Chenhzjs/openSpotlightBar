use std::path::PathBuf;

use directories::UserDirs;
use walkdir::WalkDir;

use crate::models::AppRecord;

pub fn discover() -> Vec<AppRecord> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];

    if let Some(user_dirs) = UserDirs::new() {
        roots.push(user_dirs.home_dir().join("Applications"));
    }

    let mut records = Vec::new();
    for root in roots {
        if !root.exists() {
            continue;
        }

        for entry in WalkDir::new(root)
            .max_depth(3)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if !path.is_dir() || path.extension().and_then(|value| value.to_str()) != Some("app") {
                continue;
            }

            let name = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Application")
                .to_string();
            let path_string = path.to_string_lossy().to_string();
            records.push(AppRecord {
                id: format!("mac-app:{path_string}"),
                name,
                path: path_string.clone(),
                launch_target: Some(path_string),
                launch_target_type: Some("path".to_string()),
                icon: None,
                bundle_id: None,
                keywords: Vec::new(),
            });
        }
    }

    records.sort_by(|left, right| left.name.cmp(&right.name));
    records.dedup_by(|left, right| left.path == right.path);
    records
}
