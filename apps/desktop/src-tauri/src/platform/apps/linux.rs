use std::{fs, path::PathBuf};

use directories::UserDirs;
use walkdir::WalkDir;

use crate::models::AppRecord;

pub fn discover() -> Vec<AppRecord> {
    let mut roots = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
    ];

    if let Some(user_dirs) = UserDirs::new() {
        roots.push(user_dirs.home_dir().join(".local/share/applications"));
    }

    let mut records = Vec::new();
    for root in roots {
        if !root.exists() {
            continue;
        }

        for entry in WalkDir::new(root)
            .max_depth(4)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if entry.file_type().is_dir()
                || path.extension().and_then(|value| value.to_str()) != Some("desktop")
            {
                continue;
            }

            if let Ok(content) = fs::read_to_string(path) {
                let name = content
                    .lines()
                    .find_map(|line| line.strip_prefix("Name="))
                    .unwrap_or_else(|| {
                        path.file_stem()
                            .and_then(|value| value.to_str())
                            .unwrap_or("Application")
                    });
                let exec = content
                    .lines()
                    .find_map(|line| line.strip_prefix("Exec="))
                    .map(|value| value.replace("%U", "").replace("%u", "").trim().to_string());
                let path_string = path.to_string_lossy().to_string();
                records.push(AppRecord {
                    id: format!("linux-app:{path_string}"),
                    name: name.to_string(),
                    path: path_string,
                    launch_target: exec.clone(),
                    launch_target_type: exec.as_ref().map(|_| "command".to_string()),
                    icon: None,
                    bundle_id: None,
                    keywords: Vec::new(),
                });
            }
        }
    }

    records.sort_by(|left, right| left.name.cmp(&right.name));
    records.dedup_by(|left, right| {
        left.name == right.name && left.launch_target == right.launch_target
    });
    records
}
