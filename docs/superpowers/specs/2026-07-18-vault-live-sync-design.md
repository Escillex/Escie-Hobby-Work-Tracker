# Vault Live Sync — Design

Date: 2026-07-18
Status: approved (design conversation)

## Goal

Make note sync two-way and live. Today the app writes notes into the vault
notes folder but never reads them back; edits made in Obsidian are invisible
to the app. After this feature, the notes folder and the Notes tab show the
same content at all times while the app runs.

Decisions from brainstorming:

- **Live file watching** (not focus-based or manual refresh).
- **Full two-way auto-sync**: linked notes auto-save from the app to their
  file; file edits flow back into the app.
- **Rename keeps the old file**: renaming a linked note in the app creates a
  new file and leaves the old one in the vault untouched.
- **Import**: md files created directly in the notes folder become notes in
  the app.

Standing invariants that still hold: the app never deletes vault files;
bodies are written verbatim (no frontmatter).

## Architecture

Three layers:

1. **Rust watcher + read commands** (`src-tauri/src/lib.rs`) — filesystem
   access and change notification.
2. **Pure reconcile logic** (`src/lib/vaultSync.ts`) — decides what each
   change means (update / import / unlink / relink / ignore). Unit-tested.
3. **App-level sync hook** — wires watcher events and startup scans through
   the reconcile logic into dispatches, and debounces app-side auto-saves.

## 1. Rust side

New commands, all guarded like `write_note` (`.md`-only paths, no parent-dir
components; `list_notes` takes a directory and is non-recursive):

- `read_note(path) -> String` — read one md file.
- `list_notes(dir) -> Vec<NoteFileInfo>` where
  `NoteFileInfo { path: String, mtime_ms: u64 }` — top-level `*.md` files
  only. Missing dir returns an empty list (first run before any capture).
- `watch_notes(dir)` — starts a `notify` watcher on the folder, replacing
  any previous watcher (watcher handle kept in managed state behind a
  mutex). Emits a `notes:changed` Tauri event carrying the affected paths,
  debounced ~500ms in Rust to absorb editor save bursts. Only `.md` paths
  are forwarded.

Dependency: add the `notify` crate (plus `notify-debouncer-mini` or a small
hand-rolled debounce) to `src-tauri/Cargo.toml`.

## 2. Reconcile logic (`src/lib/vaultSync.ts`, pure)

A reconcile compares the folder contents against the notes list and yields
actions. Inputs: current notes, current notes-dir path, the dir listing
(path + mtime), and file contents where needed. Outputs (per file/note):

- **update** — a note's `vaultFile` matches the path and the file content
  differs from `note.body` → patch `{ body, updatedAt: mtime as ISO }`.
- **import** — no note owns the path and it is not in the archived list →
  new note: title = basename minus `.md`, body = file content,
  `vaultFile` = path, `vaultTitle` = title, timestamps from mtime.
- **unlink** — a note's `vaultFile` is missing from the listing, or lies
  outside the current notes dir (folder setting changed) → patch
  `{ vaultFile: undefined, vaultTitle: undefined }`. Content stays.
- **relink** (rename made in Obsidian) — when, in the same reconcile batch,
  a note lost its file AND an unowned file has content identical to that
  note's body, relink the note to the new path instead of unlink + import.
  This collapses an Obsidian-side rename into a clean rename in the app.
- **ignore** — the file content equals what the app last wrote to that path
  (echo suppression, below).

Echo suppression: the sync layer keeps an in-memory map of
`path -> last content written by the app`. Watcher events whose read
content equals the recorded write are dropped. Entries expire when
superseded; nothing is persisted.

Archived paths: renaming a linked note in the app releases its old file.
Released paths go into an in-memory + persisted list
(`AppData.vaultArchived: string[]`) so the import rule never re-imports
them as duplicate notes. Entries whose file no longer exists are pruned
during reconcile. The files themselves are never touched.

## 3. App wiring

- **Startup / folder change**: call `watch_notes(dir)` and run a full
  reconcile (`list_notes` + reads) so edits made while the app was closed
  are picked up. Re-runs whenever `vaultNotesFolder` or `vaultPath`
  changes. No vault path configured → no watcher, feature dormant.
- **Watcher events**: `notes:changed` triggers a reconcile scoped to the
  reported paths.
- **Auto-save (app → vault)**: for notes with `vaultFile`, body edits are
  written via the existing `saveNoteToVault` on a ~1.5s debounce after the
  last keystroke. Title renames apply on blur of the title field: a new
  file is created under the new name (existing `resolveNoteWrite`
  behavior), the note's `vaultFile`/`vaultTitle` update via `note/patch`,
  and the old path is appended to `vaultArchived`.
- **First link**: unchanged — captures link at creation; "To vault" links
  an existing note. Unlinked notes never auto-save.
- Dispatches use `note/patch` throughout; `updatedAt` is set explicitly
  from file mtime on incoming updates (never bumped for bookkeeping-only
  patches).

## Conflicts

Last-writer-wins. Single user, both directions live, so divergence windows
are the debounce intervals. No merge UI.

## Error handling

- Read/list/watch failures flash once (existing `flash` pattern) and leave
  notes untouched; sync retries on the next event or startup.
- A file that disappears between listing and reading is treated as unlink
  on the next reconcile, not an error.

## Testing

- `vaultSync.test.ts` (vitest, Node env): reconcile decision table —
  update, import, unlink, relink-on-identical-content, echo-suppressed
  ignore, archived-path skip, folder-change unlink, mtime → updatedAt
  mapping.
- Rust: `cargo check`; command guards mirror the existing `write_note`
  tests-by-inspection (no Rust test harness in this repo yet).
- Manual smoke: edit in Obsidian → app updates; type in app → file updates;
  create file in Obsidian → note appears; rename in Obsidian → note follows
  (relink); rename in app → new file, old file stays and is not re-imported;
  delete file in Obsidian → note unlinks but keeps content; restart app
  after offline Obsidian edits → changes appear.

## Out of scope

- Subfolders inside the notes folder (top-level only).
- Frontmatter/metadata sync.
- Merge/conflict UI.
- Syncing anything other than notes (tasks, media) to the vault.
