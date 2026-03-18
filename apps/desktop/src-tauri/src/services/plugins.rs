use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

use crate::{
    error::{AppError, AppResult},
    models::{DiscoveredPlugin, PluginManifest},
};

pub fn discover_plugins(app: &AppHandle) -> AppResult<Vec<DiscoveredPlugin>> {
    let mut discovered = Vec::new();
    let mut seen_ids = HashSet::new();

    for root in candidate_plugin_roots(app)? {
        if !root.exists() {
            continue;
        }

        let entries = match fs::read_dir(&root) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let plugin_dir = entry.path();
            if !plugin_dir.is_dir() {
                continue;
            }

            if let Some(plugin) = load_plugin_from_dir(&plugin_dir, &mut seen_ids)? {
                discovered.push(plugin);
            }
        }
    }

    discovered.sort_by(|left, right| left.manifest.name.cmp(&right.manifest.name));
    Ok(discovered)
}

fn candidate_plugin_roots(app: &AppHandle) -> AppResult<Vec<PathBuf>> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    let app_plugins_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Message(error.to_string()))?
        .join("plugins");

    push_unique_path(&mut roots, &mut seen, app_plugins_dir);

    if let Ok(current_dir) = std::env::current_dir() {
        push_unique_path(&mut roots, &mut seen, current_dir.join("plugins"));
    }

    // TODO: Add packaged resource discovery so example plugins can ship with production builds.
    Ok(roots)
}

fn push_unique_path(roots: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    let key = path.to_string_lossy().to_string();
    if seen.insert(key) {
        roots.push(path);
    }
}

fn load_plugin_from_dir(
    plugin_dir: &Path,
    seen_ids: &mut HashSet<String>,
) -> AppResult<Option<DiscoveredPlugin>> {
    let manifest_path = plugin_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Ok(None);
    }

    let manifest_raw = match fs::read_to_string(&manifest_path) {
        Ok(raw) => raw,
        Err(_) => return Ok(None),
    };

    let manifest: PluginManifest = match serde_json::from_str(&manifest_raw) {
        Ok(manifest) => manifest,
        Err(_) => return Ok(None),
    };

    let mut validation_errors = validate_manifest(&manifest);
    if !seen_ids.insert(manifest.id.clone()) {
        validation_errors.push(format!("Duplicate plugin id: {}", manifest.id));
    }

    let entry_path = resolve_entry_path(plugin_dir, &manifest.entry, &mut validation_errors);
    let entry_source = match entry_path.as_ref() {
        Some(path) => fs::read_to_string(path).unwrap_or_else(|_| {
            validation_errors.push("Plugin entry could not be read.".to_string());
            String::new()
        }),
        None => String::new(),
    };

    Ok(Some(DiscoveredPlugin {
        manifest,
        root_path: plugin_dir.to_string_lossy().to_string(),
        entry_path: entry_path
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default(),
        entry_source,
        validation_errors,
    }))
}

fn validate_manifest(manifest: &PluginManifest) -> Vec<String> {
    let mut errors = Vec::new();

    if manifest.id.trim().is_empty() {
        errors.push("Plugin id must not be empty.".to_string());
    }
    if manifest.name.trim().is_empty() {
        errors.push("Plugin name must not be empty.".to_string());
    }
    if manifest.version.trim().is_empty() {
        errors.push("Plugin version must not be empty.".to_string());
    }
    if manifest.entry.trim().is_empty() {
        errors.push("Plugin entry must not be empty.".to_string());
    }

    let mut seen_commands = HashSet::new();
    for command in &manifest.commands {
        if command.name.trim().is_empty() {
            errors.push(format!(
                "Plugin {} has a command with an empty name.",
                manifest.id
            ));
        }
        if command.title.trim().is_empty() {
            errors.push(format!(
                "Plugin {} has a command with an empty title.",
                manifest.id
            ));
        }
        if !seen_commands.insert(command.name.clone()) {
            errors.push(format!(
                "Plugin {} defines duplicate command name {}.",
                manifest.id, command.name
            ));
        }
    }

    let mut seen_permissions = HashSet::new();
    for permission in &manifest.permissions {
        if !is_supported_permission(permission) {
            errors.push(format!(
                "Plugin {} requests unsupported permission {}.",
                manifest.id, permission
            ));
        }
        if !seen_permissions.insert(permission.clone()) {
            errors.push(format!(
                "Plugin {} declares duplicate permission {}.",
                manifest.id, permission
            ));
        }
    }

    errors
}

fn resolve_entry_path(
    plugin_dir: &Path,
    manifest_entry: &str,
    validation_errors: &mut Vec<String>,
) -> Option<PathBuf> {
    let root = match plugin_dir.canonicalize() {
        Ok(path) => path,
        Err(_) => {
            validation_errors.push("Plugin root could not be resolved.".to_string());
            return None;
        }
    };

    let candidate = root.join(manifest_entry);
    let canonical_entry = match candidate.canonicalize() {
        Ok(path) => path,
        Err(_) => {
            validation_errors.push("Plugin entry file does not exist.".to_string());
            return None;
        }
    };

    if !canonical_entry.starts_with(&root) {
        validation_errors.push("Plugin entry must stay within the plugin directory.".to_string());
        return None;
    }

    Some(canonical_entry)
}

fn is_supported_permission(permission: &str) -> bool {
    matches!(
        permission,
        "network"
            | "filesystem.read"
            | "filesystem.write"
            | "clipboard.read"
            | "clipboard.write"
            | "shell.exec"
            | "notifications"
    )
}
