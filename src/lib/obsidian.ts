import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Note, Settings } from "./types";
import { resolveNoteWrite } from "./vaultNotes";

const DEFAULT_FOLDER = "Hyperfocus";

/** The vault folder that receives note files. */
const notesDir = (s: Settings): string =>
  `${s.vaultPath}/${s.vaultNotesFolder?.trim() || DEFAULT_FOLDER}`;

/** Write a note into the vault notes folder as its own markdown file.
 *  First exports create (dedup-safe); re-exports overwrite the note's own
 *  file; a renamed note gets a fresh file and the old one is left alone.
 *  Returns the path written — callers store it back on the note. */
export async function saveNoteToVault(
  settings: Settings,
  note: Note,
): Promise<string> {
  if (!settings.vaultPath) throw new Error("No vault folder set");
  const write = resolveNoteWrite(note.title, note.vaultFile);
  if (write.action === "overwrite") {
    await invoke("write_note", { path: write.path, content: note.body });
    return write.path;
  }
  return invoke<string>("create_note", {
    dir: notesDir(settings),
    filename: write.filename,
    content: note.body,
  });
}

/** Open a written note file in Obsidian. */
export async function openNoteInObsidian(path: string): Promise<void> {
  await openUrl(`obsidian://open?path=${encodeURIComponent(path)}`);
}

/** Open the vault itself in Obsidian. */
export async function openVault(settings: Settings): Promise<void> {
  if (!settings.vaultPath) return;
  await openUrl(`obsidian://open?path=${encodeURIComponent(settings.vaultPath)}`);
}

export interface ObsidianStatus {
  vaultExists: boolean;
  installed: boolean;
}

/** Whether the configured vault folder exists and Obsidian is installed. */
export async function obsidianStatus(vaultPath: string | undefined): Promise<ObsidianStatus> {
  const s = await invoke<{ vault_exists: boolean; installed: boolean }>("obsidian_status", {
    vaultPath: vaultPath ?? "",
  });
  return { vaultExists: s.vault_exists, installed: s.installed };
}
