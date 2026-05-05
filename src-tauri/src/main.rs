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
                .app_data_dir()
                .or_else(|| app.path_resolver().app_config_dir())
                .ok_or_else(|| format!("Install write failed: {}; app data dir unavailable", install_err))?;
            let fallback_file = unique_file_path(app_dir.join("cns-startup-log.json"));
            let path = write_file(fallback_file.clone(), &content)
                .map_err(|fallback_err| format!("Install write failed: {}; fallback write failed: {}", install_err, fallback_err))?;
            return Ok(path.to_string_lossy().to_string());
        }
    }
}

#[tauri::command]
fn set_secure_github_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("cns", "github_token")
        .map_err(|err| format!("Failed to create keyring entry: {}", err))?;
    entry
        .set_password(&token)
        .map_err(|err| format!("Failed to store token in keyring: {}", err))?;
    Ok(())
}

#[tauri::command]
fn get_secure_github_token() -> Result<String, String> {
    let entry = keyring::Entry::new("cns", "github_token")
        .map_err(|err| format!("Failed to create keyring entry: {}", err))?;
    entry
        .get_password()
        .map_err(|err| format!("Failed to read token from keyring: {}", err))
}

#[tauri::command]
fn clear_secure_github_token() -> Result<(), String> {
    let entry = keyring::Entry::new("cns", "github_token")
        .map_err(|err| format!("Failed to create keyring entry: {}", err))?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(_) => Ok(()),
    }
}

#[tauri::command]
async fn download_github_file(
    window: tauri::Window,
    owner: String,
    repo: String,
    token: String,
    path: String,
    file_name: String,
) -> Result<String, String> {
    let encoded_path = path
        .split('/')
        .map(|segment| urlencoding::encode(segment).to_string())
        .collect::<Vec<String>>()
        .join("/");
    let url = format!(
        "https://api.github.com/repos/{}/{}/contents/{}",
        owner, repo, encoded_path
    );
    let client = reqwest::Client::new();
    let mut response = client
        .get(url)
        .header("Accept", "application/vnd.github.raw")
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "CNS-YouTube-Downloader")
        .send()
        .await
        .map_err(|err| format!("E_NET_REQ: {}", err))?;
    if !response.status().is_success() {
        return Err(format!("E_HTTP_{}: download failed", response.status()));
    }
    let resolver = window.app_handle().path_resolver();
    let mut target = tauri::api::path::download_dir()
        .or_else(|| resolver.app_data_dir())
        .or_else(|| resolver.app_config_dir())
        .ok_or_else(|| "E_DIR_RESOLVE: cannot resolve writable directory".to_string())?;
    if let Err(err) = fs::create_dir_all(&target) {
        return Err(format!("E_DIR_CREATE: {}: {}", target.display(), err));
    }
    target.push(file_name);
    let mut tmp_path = target.clone();
    let file_name_tmp = match tmp_path.file_name().and_then(|s| s.to_str()) {
        Some(name) => format!("{}.part", name),
        None => "download.part".to_string(),
    };
    tmp_path.set_file_name(file_name_tmp);
    let mut output = fs::File::create(&tmp_path)
        .map_err(|err| format!("E_FILE_CREATE: {}: {}", tmp_path.display(), err))?;
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|err| format!("E_STREAM_READ: {}", err))?;
        match chunk {
            Some(bytes) => output
                .write_all(&bytes)
                .map_err(|err| format!("E_FILE_WRITE: {}: {}", tmp_path.display(), err))?,
            None => break,
        }
    }
    output
        .flush()
        .map_err(|err| format!("E_FILE_FLUSH: {}: {}", tmp_path.display(), err))?;
    fs::rename(&tmp_path, &target)
        .map_err(|err| format!("E_FILE_RENAME: {} -> {}: {}", tmp_path.display(), target.display(), err))?;
    Ok(target.to_string_lossy().to_string())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      export_logs_to_file,
      set_secure_github_token,
      get_secure_github_token,
      clear_secure_github_token,
      download_github_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
