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

/// Overwrite a markdown note at an exact path — used when re-exporting a
/// note to the file it was previously written to. Creates parent dirs.
/// Only plain `.md` paths are accepted, so a compromised webview cannot use
/// this as a general file-write primitive.
#[tauri::command]
fn write_note(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(format!("Refusing to write non-markdown file: {path}"));
    }
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("Refusing path with parent components: {path}"));
    }
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, content).map_err(|e| format!("Cannot write {path}: {e}"))
}

/// Create a new markdown note, adding a numeric suffix instead of
/// clobbering an existing file. Returns the path that was written.
#[tauri::command]
fn create_note(dir: String, filename: String, content: String) -> Result<String, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err(format!("Refusing filename with path components: {filename}"));
    }
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

/// Read a markdown note's content. Same guards as write_note so the
/// webview cannot use this to read arbitrary files.
#[tauri::command]
fn read_note(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if p.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(format!("Refusing to read non-markdown file: {path}"));
    }
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("Refusing path with parent components: {path}"));
    }
    std::fs::read_to_string(&p).map_err(|e| format!("Cannot read {path}: {e}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteFileInfo {
    path: String,
    mtime_ms: u64,
}

/// List top-level markdown files in the notes folder with their mtimes.
/// A missing folder is an empty list, not an error (first run).
#[tauri::command]
fn list_notes(dir: String) -> Result<Vec<NoteFileInfo>, String> {
    let p = PathBuf::from(&dir);
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("Refusing path with parent components: {dir}"));
    }
    let entries = match std::fs::read_dir(&p) {
        Ok(e) => e,
        // Only a genuinely absent folder is an empty list (first run).
        // Other failures (permissions, unmounted drive) must error so the
        // frontend skips the reconcile instead of unlinking every note.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(format!("Cannot list {dir}: {e}")),
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let mtime_ms = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(NoteFileInfo {
            path: path.to_string_lossy().into_owned(),
            mtime_ms,
        });
    }
    Ok(out)
}

/// Keeps the folder watcher alive for the app's lifetime; replaced when
/// the notes folder setting changes.
struct NotesWatcher(
    std::sync::Mutex<
        Option<notify_debouncer_mini::Debouncer<notify_debouncer_mini::notify::RecommendedWatcher>>,
    >,
);

/// Watch the notes folder and emit a debounced "notes:changed" event with
/// the affected markdown paths. Replaces any previous watcher.
#[tauri::command]
fn watch_notes(
    app: tauri::AppHandle,
    state: tauri::State<NotesWatcher>,
    dir: String,
) -> Result<(), String> {
    use tauri::Emitter;
    let p = PathBuf::from(&dir);
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("Refusing path with parent components: {dir}"));
    }
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    let mut debouncer = notify_debouncer_mini::new_debouncer(
        std::time::Duration::from_millis(500),
        move |res: notify_debouncer_mini::DebounceEventResult| {
            if let Ok(events) = res {
                let paths: Vec<String> = events
                    .iter()
                    .filter(|e| e.path.extension().and_then(|x| x.to_str()) == Some("md"))
                    .map(|e| e.path.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    let _ = app.emit("notes:changed", paths);
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(&p, notify_debouncer_mini::notify::RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(debouncer);
    Ok(())
}

/// Scan Steam's library folders for installed games, returning their app ids.
/// Reads `appmanifest_<id>.acf` filenames across every library path found in
/// the `libraryfolders.vdf` files. No Steam API needed — purely local.
#[tauri::command]
fn installed_steam_appids() -> Vec<u32> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut steamapps: Vec<String> = vec![
        format!("{home}/.steam/steam/steamapps"),
        format!("{home}/.local/share/Steam/steamapps"),
    ];

    // Pull extra library paths (e.g. other drives) from libraryfolders.vdf.
    for base in steamapps.clone() {
        let vdf = format!("{base}/libraryfolders.vdf");
        if let Ok(content) = std::fs::read_to_string(&vdf) {
            for line in content.lines() {
                if line.contains("\"path\"") {
                    if let Some(path) = line.split('"').nth(3) {
                        steamapps.push(format!("{path}/steamapps"));
                    }
                }
            }
        }
    }

    let mut ids = std::collections::HashSet::new();
    for dir in steamapps {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if let Some(id) = name
                .strip_prefix("appmanifest_")
                .and_then(|r| r.strip_suffix(".acf"))
                .and_then(|s| s.parse::<u32>().ok())
            {
                ids.insert(id);
            }
        }
    }
    ids.into_iter().collect()
}

#[derive(serde::Serialize)]
struct ObsidianStatus {
    vault_exists: bool,
    installed: bool,
}

/// Report whether the configured vault folder exists and whether an Obsidian
/// binary (native or flatpak) is present on this machine.
#[tauri::command]
fn obsidian_status(vault_path: String) -> ObsidianStatus {
    let vault_exists = !vault_path.is_empty() && std::path::Path::new(&vault_path).is_dir();

    let on_path = std::process::Command::new("sh")
        .arg("-c")
        .arg("command -v obsidian")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    let home = std::env::var("HOME").unwrap_or_default();
    let flatpak = [
        "/var/lib/flatpak/app/md.obsidian.Obsidian".to_string(),
        format!("{home}/.local/share/flatpak/app/md.obsidian.Obsidian"),
    ]
    .iter()
    .any(|p| std::path::Path::new(p).exists());

    ObsidianStatus {
        vault_exists,
        installed: on_path || flatpak,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(NotesWatcher(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            launch_app,
            write_note,
            create_note,
            read_note,
            list_notes,
            watch_notes,
            installed_steam_appids,
            obsidian_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
