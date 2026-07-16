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
        .invoke_handler(tauri::generate_handler![
            launch_app,
            append_note,
            create_note,
            installed_steam_appids,
            obsidian_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
