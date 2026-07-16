import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Impulse, Settings } from "./types";

const DEFAULT_INBOX = "Hyperfocus Inbox.md";

const inboxPath = (s: Settings) =>
  `${s.vaultPath}/${s.vaultInboxNote?.trim() || DEFAULT_INBOX}`;

/** Append a captured impulse to the vault inbox note as a task line. */
export async function appendToInbox(settings: Settings, text: string): Promise<void> {
  if (!settings.vaultPath) return;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  await invoke("append_note", {
    path: inboxPath(settings),
    content: `- [ ] ${text} *(captured ${stamp})*\n`,
  });
}

/** Promote an impulse to its own markdown note in the vault and open it
 *  in Obsidian. Returns the created file path. */
export async function promoteToNote(settings: Settings, impulse: Impulse): Promise<string> {
  if (!settings.vaultPath) throw new Error("No vault folder set");
  const title =
    impulse.text
      .slice(0, 50)
      .replace(/[/\\:*?"<>|#^[\]]/g, "")
      .trim() || "Impulse";
  const content = `---
created: ${impulse.createdAt}
source: hyperfocus-dash
---

${impulse.text}
`;
  const path = await invoke<string>("create_note", {
    dir: settings.vaultPath,
    filename: `${title}.md`,
    content,
  });
  await openUrl(`obsidian://open?path=${encodeURIComponent(path)}`);
  return path;
}

/** Write an in-app note to the vault as a markdown file and open it. */
export async function promoteNoteToVault(
  settings: Settings,
  title: string,
  body: string,
): Promise<string> {
  if (!settings.vaultPath) throw new Error("No vault folder set");
  const safe =
    title
      .slice(0, 60)
      .replace(/[/\\:*?"<>|#^[\]]/g, "")
      .trim() || "Untitled";
  const path = await invoke<string>("create_note", {
    dir: settings.vaultPath,
    filename: `${safe}.md`,
    content: body,
  });
  await openUrl(`obsidian://open?path=${encodeURIComponent(path)}`);
  return path;
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
