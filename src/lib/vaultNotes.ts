/** Sanitize a note title into a vault-safe markdown filename (no extension).
 *  Mirrors Obsidian's forbidden-character set; empty results become Untitled. */
export function safeFilename(title: string): string {
  return (
    title
      .slice(0, 60)
      .replace(/[/\\:*?"<>|#^[\]]/g, "")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .trim() || "Untitled"
  );
}

export type NoteWrite =
  | { action: "create"; filename: string }
  | { action: "overwrite"; path: string };

/** Decide how to write a note to the vault: overwrite the file it was last
 *  written to only when the title hasn't changed since that write (recorded
 *  via `vaultTitle`), or create a fresh file otherwise — including when the
 *  file's dedup-suffixed name would otherwise coincidentally match a rename.
 *  The old file is never touched on rename — the app never deletes vault
 *  files. */
export function resolveNoteWrite(
  title: string,
  vaultFile?: string,
  vaultTitle?: string,
): NoteWrite {
  if (vaultFile && vaultTitle === title) {
    return { action: "overwrite", path: vaultFile };
  }
  return { action: "create", filename: `${safeFilename(title)}.md` };
}
