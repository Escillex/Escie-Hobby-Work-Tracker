# Vault Notes Folder — Design

Date: 2026-07-17

## Context

Hyperfocus Dash syncs notes to an Obsidian vault two ways today:

1. **Dashboard quick-capture** (`NotesWidget`) appends the captured title as a
   `- [ ] title *(captured ...)*` line to a single inbox file
   (`vaultInboxNote`, default `Hyperfocus Inbox.md`) via the `append_note`
   Rust command.
2. **Notes tab** (`NotesView`) has a manual "To vault" button that writes the
   selected note as a real `.md` file via `create_note` — but into the vault
   **root**, and pressing it twice produces `Title 1.md` (the command dedupes
   instead of overwriting).

The user wants real markdown files in a dedicated folder: every note its own
`.md` file inside one folder in the vault, no more titles-only inbox.

Decisions made during brainstorming:

- **Notes tab stays manual** ("To vault" button), but targets the folder and
  re-export updates the existing file instead of duplicating.
- **Quick captures write a file immediately** (title as filename, empty body).
  The inbox file concept is removed entirely.
- The app **never deletes or renames files in the vault**; deleting a note
  in-app leaves its exported file alone.

## Data model (`src/lib/types.ts`)

- `Settings.vaultNotesFolder?: string` — folder name inside the vault that
  receives note files. Empty/unset falls back to `"Hyperfocus"` at the call
  site (same pattern as the old `DEFAULT_INBOX`).
- `Settings.vaultInboxNote` — **removed** from the type. An old persisted
  value may linger in `data.json` as an unknown field, which nothing reads —
  harmless, so no migration step needed.
- `Note.vaultFile?: string` — absolute path of the file this note was last
  written to. Additive and optional; no migration needed.

## Library (`src/lib/obsidian.ts`)

- `DEFAULT_INBOX`, `inboxPath`, and `appendToInbox` are **removed**.
- New `notesDir(settings): string` → `` `${vaultPath}/${vaultNotesFolder?.trim() || "Hyperfocus"}` ``.
- `promoteNoteToVault` becomes `saveNoteToVault(settings, note: Note): Promise<string>`:
  - Sanitizes the title with the existing character-strip logic (kept as a
    small `safeFilename(title)` helper, exported for tests).
  - **First export** (no `note.vaultFile`): `create_note` into `notesDir`
    (dedup-safe), return the written path.
  - **Re-export, same title**: if `note.vaultFile` is set and its basename
    matches the current sanitized title, overwrite that exact path with the
    new `write_note` command.
  - **Re-export, renamed**: title's sanitized basename no longer matches the
    stored path → `create_note` a fresh file under the new title; the old
    file stays in the vault untouched.
  - Returns the path actually written; callers dispatch `note/update` to
    store it in `vaultFile`.
  - Does **not** open Obsidian itself — opening stays a caller concern so the
    capture path can write silently.
- File content: `note.body` verbatim. No frontmatter, no injected `# title` —
  the filename is the title, Obsidian-style.

## Rust (`src-tauri/src/lib.rs`)

- New `write_note(path: String, content: String)` command: plain
  `std::fs::write` after `create_dir_all` on the parent. Overwrites.
- `append_note` command **removed** (its only caller was the inbox).
- `create_note` unchanged.

## UI

- **`NotesWidget` (dashboard capture):** on capture, when `vaultPath` is set,
  call `saveNoteToVault` with the fresh note (empty body) and on success
  dispatch `note/update` with the returned `vaultFile`. Errors keep the
  existing `flash("Vault sync failed: ...")`. No Obsidian window is opened.
- **`NotesView` ("To vault" button):** calls `saveNoteToVault`, dispatches
  `note/update` with the returned path, then opens the file via the existing
  `obsidian://open` URL. Button label/placement unchanged.
- **`SettingsPanel`:** the "Inbox note" field is replaced by a "Notes folder"
  text field bound to `vaultNotesFolder` (placeholder `Hyperfocus`), with a
  one-line hint that captured thoughts and exported notes land there.

## Error handling

- No vault configured: capture still saves the note in-app and skips the file
  write silently (current behavior); the Notes-tab button surfaces
  "No vault folder set" via the existing flash.
- Write failures surface through the existing flash notices in both places.

## Testing

- Vitest (pure logic only, matching the repo's convention): `safeFilename`
  edge cases (illegal characters, length cap, empty → `Untitled`) and the
  re-export decision (same-title → overwrite stored path; renamed → new file;
  no stored path → create). The decision logic is extracted as a pure
  function so it tests without Tauri.
- Manual smoke: capture a thought → file appears in `<vault>/<folder>/`;
  export a note, edit, re-export → same file updated; rename, re-export →
  new file, old file intact; Settings folder change redirects new writes.

## Out of scope

- Auto-sync on every edit.
- Deleting/renaming vault files from the app.
- Importing vault files back into the app.
