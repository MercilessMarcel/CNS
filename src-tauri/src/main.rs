// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn export_logs_to_file(window: tauri::Window, content: String) -> Result<String, String> {
    fn unique_file_path(base: PathBuf) -> PathBuf {
        if !base.exists() {
            return base;
        }

        let mut index = 1;
        loop {
            let candidate = base.with_file_name(format!("cns-startup-log-{}.json", index));
            if !candidate.exists() {
                return candidate;
            }
            index += 1;
        }
    }

    fn ensure_dir(path: &PathBuf) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|err| format!("Failed to create directory {}: {}", dir.display(), err))
        } else {
            Err("Failed to determine parent directory".to_string())
        }
    }

    fn write_file(path: PathBuf, content: &str) -> Result<PathBuf, String> {
        ensure_dir(&path)?;
        let mut file = fs::File::create(&path).map_err(|err| format!("Failed to create {}: {}", path.display(), err))?;
        file.write_all(content.as_bytes())
            .map_err(|err| format!("Failed to write {}: {}", path.display(), err))?;
        Ok(path)
    }

    let app = window.app_handle();
    let install_dir = env::current_exe()
        .map_err(|err| format!("Failed to locate executable path: {}", err))?
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to determine install directory".to_string())?;

    let install_file = unique_file_path(install_dir.join("cns-startup-log.json"));
    match write_file(install_file.clone(), &content) {
        Ok(path) => return Ok(path.to_string_lossy().to_string()),
        Err(install_err) => {
            let app_dir = app
                .path_resolver()
                .app_dir()
                .ok_or_else(|| format!("Install write failed: {}; app data dir unavailable", install_err))?;
            let fallback_file = unique_file_path(app_dir.join("cns-startup-log.json"));
            let path = write_file(fallback_file.clone(), &content)
                .map_err(|fallback_err| format!("Install write failed: {}; fallback write failed: {}", install_err, fallback_err))?;
            return Ok(path.to_string_lossy().to_string());
        }
    }
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![export_logs_to_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
