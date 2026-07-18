import type { Note } from "./types";

/** One markdown file in the notes folder, as reported by list_notes. */
export interface VaultFileInfo {
  path: string;
  mtimeMs: number;
}

export type SyncAction =
  | { kind: "update"; noteId: string; body: string; updatedAt: string }
  | { kind: "import"; path: string; title: string; body: string; iso: string }
  | { kind: "relink"; noteId: string; path: string; title: string }
  | { kind: "unlink"; noteId: string }
  | { kind: "set-archived"; paths: string[] };

/** In-memory record of the app's own writes, used to suppress watcher
 *  echoes and to avoid importing a fresh capture's file as a duplicate
 *  before its note/patch lands. Never persisted. */
const lastWrites = new Map<string, string>();

export function recordVaultWrite(path: string, content: string): void {
  lastWrites.set(path, content);
}

export function getLastWrites(): ReadonlyMap<string, string> {
  return lastWrites;
}

const titleOf = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");

/** Compare the notes folder against the notes list and decide what each
 *  difference means. Pure: all filesystem state comes in as arguments.
 *  Files without an entry in `contents` were unreadable this pass and are
 *  skipped; the next reconcile retries them. */
export function planReconcile(input: {
  notes: Note[];
  dir: string;
  files: VaultFileInfo[];
  contents: Map<string, string>;
  archived: string[];
  lastWrites: ReadonlyMap<string, string>;
}): SyncAction[] {
  const { notes, dir, files, contents, archived } = input;
  const prefix = dir.endsWith("/") ? dir : `${dir}/`;
  const listed = new Map(files.map((f) => [f.path, f]));
  const owned = new Set(
    notes.filter((n) => n.vaultFile).map((n) => n.vaultFile as string),
  );
  const actions: SyncAction[] = [];

  // Linked notes: pull changed content; collect notes whose file is gone
  // (deleted, renamed, or left behind by a folder-setting change).
  const lost: Note[] = [];
  for (const n of notes) {
    if (!n.vaultFile) continue;
    const f = listed.get(n.vaultFile);
    if (!f || !n.vaultFile.startsWith(prefix)) {
      lost.push(n);
      continue;
    }
    const content = contents.get(n.vaultFile);
    if (content === undefined || content === n.body) continue;
    if (input.lastWrites.get(n.vaultFile) === content) continue;
    actions.push({
      kind: "update",
      noteId: n.id,
      body: content,
      updatedAt: new Date(f.mtimeMs).toISOString(),
    });
  }

  // Unowned files: candidates for relink (an Obsidian-side rename) or
  // import. The app's own in-flight writes and released rename copies
  // are excluded.
  const archivedSet = new Set(archived);
  const unowned = files.filter(
    (f) =>
      !owned.has(f.path) &&
      !archivedSet.has(f.path) &&
      input.lastWrites.get(f.path) !== contents.get(f.path),
  );

  const taken = new Set<string>();
  for (const n of lost) {
    const match = unowned.find(
      (f) => !taken.has(f.path) && contents.get(f.path) === n.body,
    );
    if (match) {
      taken.add(match.path);
      actions.push({
        kind: "relink",
        noteId: n.id,
        path: match.path,
        title: titleOf(match.path),
      });
    } else {
      actions.push({ kind: "unlink", noteId: n.id });
    }
  }

  for (const f of unowned) {
    if (taken.has(f.path)) continue;
    const content = contents.get(f.path);
    if (content === undefined) continue;
    actions.push({
      kind: "import",
      path: f.path,
      title: titleOf(f.path),
      body: content,
      iso: new Date(f.mtimeMs).toISOString(),
    });
  }

  // Released rename copies stay excluded from import while their file
  // exists; once the file is gone the entry has no purpose.
  const pruned = archived.filter((p) => listed.has(p));
  if (pruned.length !== archived.length) {
    actions.push({ kind: "set-archived", paths: pruned });
  }

  return actions;
}
