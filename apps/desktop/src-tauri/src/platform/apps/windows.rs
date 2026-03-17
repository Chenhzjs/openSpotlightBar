use std::{env, path::PathBuf};

use walkdir::WalkDir;

use crate::models::AppRecord;

pub fn discover() -> Vec<AppRecord> {
    let mut roots = Vec::new();

    if let Ok(program_data) = env::var("ProgramData") {
        roots.push(PathBuf::from(program_data).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(app_data) = env::var("APPDATA") {
        roots.push(PathBuf::from(app_data).join(r"Microsoft\Windows\Start Menu\Programs"));
    }

    let mut records = Vec::new();
    for root in roots {
        if !root.exists() {
            continue;
        }

        for entry in WalkDir::new(root)
            .max_depth(5)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            let extension = path.extension().and_then(|value| value.to_str());
            if entry.file_type().is_dir() || !matches!(extension, Some("lnk" | "exe" | "url")) {
                continue;
            }

            let path_string = path.to_string_lossy().to_string();
            let name = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Application")
                .to_string();
            records.push(AppRecord {
                id: format!("windows-app:{path_string}"),
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
