use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

/// Launch a user-defined command detached from the app, so launched apps
/// survive the dashboard closing.
#[tauri::command]
fn launch_app(command: String) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Command is empty".into());
    }

    let mut cmd = Command::new("sh");
    cmd.arg("-c")
        .arg(trimmed)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch `{trimmed}`: {e}"))
}

/// Append a line to a note file (created if missing) — used for the
/// Obsidian inbox sync.
#[tauri::command]
fn append_note(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&p)
        .map_err(|e| format!("Cannot open {path}: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())
}

/// Create a new markdown note, adding a numeric suffix instead of
/// clobbering an existing file. Returns the path that was written.
#[tauri::command]
fn create_note(dir: String, filename: String, content: String) -> Result<String, String> {
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let base = filename.trim_end_matches(".md");
    let mut path = PathBuf::from(&dir).join(format!("{base}.md"));
    let mut n = 1;
    while path.exists() {
        path = PathBuf::from(&dir).join(format!("{base} {n}.md"));
        n += 1;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            launch_app,
            append_note,
            create_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
