use crate::models::AppRecord;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub fn discover_apps() -> Vec<AppRecord> {
    #[cfg(target_os = "macos")]
    {
        return macos::discover();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::discover();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::discover();
    }
    #[allow(unreachable_code)]
    Vec::new()
}
