/** Sanitize a note title into a vault-safe markdown filename (no extension).
 *  Mirrors Obsidian's forbidden-character set; empty results become Untitled. */
export function safeFilename(title: string): string {
  return (
    title
      .slice(0, 60)
      .replace(/[/\\:*?"<>|#^[\]]/g, "")
      .trim() || "Untitled"
  );
}

export type NoteWrite =
  | { action: "create"; filename: string }
  | { action: "overwrite"; path: string };

/** Decide how to write a note to the vault: overwrite the file it was last
 *  written to while the title still matches (including a " N" dedup suffix
 *  added by create_note), or create a fresh file otherwise. The old file is
 *  never touched on rename — the app never deletes vault files. */
export function resolveNoteWrite(title: string, vaultFile?: string): NoteWrite {
  const safe = safeFilename(title);
  if (vaultFile) {
    const base = vaultFile
      .slice(vaultFile.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");
    if (base === safe || base.replace(/ \d+$/, "") === safe) {
      return { action: "overwrite", path: vaultFile };
    }
  }
  return { action: "create", filename: `${safe}.md` };
}
