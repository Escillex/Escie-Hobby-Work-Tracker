# Vault Live Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-way live sync between the app's notes and their markdown files in the Obsidian vault notes folder.

**Architecture:** A Rust `notify` watcher emits debounced `notes:changed` events; a pure reconcile module (`src/lib/vaultSync.ts`) turns folder listings + file contents into update/import/relink/unlink actions; an app-level hook (`src/lib/useVaultSync.ts`) wires watcher and startup scans into dispatches; `NotesView` gains debounced auto-save and rename-on-blur. Spec: `docs/superpowers/specs/2026-07-18-vault-live-sync-design.md`.

**Tech Stack:** Tauri 2 (Rust: `notify-debouncer-mini`), React 19, TypeScript, vitest (Node env, pure modules only).

## Global Constraints

- NO emojis anywhere: code, comments, UI copy, commit messages.
- NO `Co-Authored-By` trailer on commits.
- Never hardcode the user's name in code defaults or seed data.
- Gates that must pass before every commit touching TS: `pnpm exec tsc --noEmit && pnpm exec vite build && pnpm exec vitest run`. For Rust: `cargo check` in `src-tauri`.
- The app never deletes or renames vault files. Bodies are written/read verbatim, no frontmatter.
- Invariants preserved from earlier features: `resolveNoteWrite` overwrite only when `vaultTitle === title`; `note/patch` never bumps `updatedAt` implicitly.

---

### Task 1: Rust watcher and read commands

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing new.
- Produces (webview-invokable): `read_note(path: String) -> Result<String, String>`; `list_notes(dir: String) -> Result<Vec<NoteFileInfo>, String>` where `NoteFileInfo` serializes as `{ path: string, mtimeMs: number }`; `watch_notes(dir: String) -> Result<(), String>` which emits Tauri event `"notes:changed"` with payload `string[]` (md paths), debounced 500ms. Task 4 calls all three and listens for the event.

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml` `[dependencies]`, add:

```toml
notify-debouncer-mini = "0.4"
```

- [ ] **Step 2: Add the commands**

In `src-tauri/src/lib.rs`, after the existing `create_note` function, add:

```rust
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
        Err(_) => return Ok(vec![]),
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
```

If the `notify-debouncer-mini` 0.4 API differs from the above (e.g. event field names), adapt to the crate's actual API — the requirements are: 500ms debounce, non-recursive watch, only `.md` paths forwarded, event name `notes:changed`, payload `Vec<String>`.

- [ ] **Step 3: Register state and handlers**

In `run()`, add `.manage(NotesWatcher(std::sync::Mutex::new(None)))` to the builder chain (before `.invoke_handler`), and extend the handler list:

```rust
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
```

- [ ] **Step 4: Verify**

Run: `cd src-tauri && cargo check`
Expected: clean (first run downloads the new crate).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "Add note read, list, and folder watch commands"
```

---

### Task 2: Pure reconcile module

**Files:**
- Create: `src/lib/vaultSync.ts`
- Create: `src/lib/vaultSync.test.ts`

**Interfaces:**
- Consumes: `Note` type from `./types`.
- Produces: `VaultFileInfo { path: string; mtimeMs: number }`; `SyncAction` union; `planReconcile(input): SyncAction[]`; `recordVaultWrite(path, content)`; `getLastWrites(): ReadonlyMap<string, string>`. Task 3 calls `recordVaultWrite`; Task 4 calls `planReconcile`/`getLastWrites`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/vaultSync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Note } from "./types";
import { planReconcile, type VaultFileInfo } from "./vaultSync";

const DIR = "/vault/Hyperfocus";
const T0 = 1_770_000_000_000; // fixed epoch ms for deterministic ISO strings

function note(p: Partial<Note> & { id: string }): Note {
  return {
    title: "",
    body: "",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...p,
  };
}

function file(path: string, mtimeMs = T0): VaultFileInfo {
  return { path, mtimeMs };
}

function plan(over: Partial<Parameters<typeof planReconcile>[0]>) {
  return planReconcile({
    notes: [],
    dir: DIR,
    files: [],
    contents: new Map(),
    archived: [],
    lastWrites: new Map(),
    ...over,
  });
}

describe("planReconcile", () => {
  it("updates a linked note whose file content changed", () => {
    const n = note({ id: "a", title: "Idea", body: "old", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/Idea.md`)],
      contents: new Map([[`${DIR}/Idea.md`, "new"]]),
    });
    expect(actions).toEqual([
      { kind: "update", noteId: "a", body: "new", updatedAt: new Date(T0).toISOString() },
    ]);
  });

  it("does nothing when file content equals the note body", () => {
    const n = note({ id: "a", title: "Idea", body: "same", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/Idea.md`)],
      contents: new Map([[`${DIR}/Idea.md`, "same"]]),
    });
    expect(actions).toEqual([]);
  });

  it("suppresses the echo of the app's own write", () => {
    const n = note({ id: "a", title: "Idea", body: "typed more", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/Idea.md`)],
      contents: new Map([[`${DIR}/Idea.md`, "typed"]]),
      lastWrites: new Map([[`${DIR}/Idea.md`, "typed"]]),
    });
    expect(actions).toEqual([]);
  });

  it("imports an unowned file with filename as title", () => {
    const actions = plan({
      files: [file(`${DIR}/Fresh thought.md`)],
      contents: new Map([[`${DIR}/Fresh thought.md`, "hello"]]),
    });
    expect(actions).toEqual([
      {
        kind: "import",
        path: `${DIR}/Fresh thought.md`,
        title: "Fresh thought",
        body: "hello",
        iso: new Date(T0).toISOString(),
      },
    ]);
  });

  it("never imports an archived path", () => {
    const actions = plan({
      files: [file(`${DIR}/Old name.md`)],
      contents: new Map([[`${DIR}/Old name.md`, "stale copy"]]),
      archived: [`${DIR}/Old name.md`],
    });
    expect(actions).toEqual([]);
  });

  it("skips an unowned file that matches the app's own fresh write", () => {
    // A capture's file exists before its note/patch lands; must not import a duplicate.
    const actions = plan({
      files: [file(`${DIR}/Captured.md`)],
      contents: new Map([[`${DIR}/Captured.md`, ""]]),
      lastWrites: new Map([[`${DIR}/Captured.md`, ""]]),
    });
    expect(actions).toEqual([]);
  });

  it("unlinks a note whose file is gone", () => {
    const n = note({ id: "a", title: "Gone", body: "kept", vaultFile: `${DIR}/Gone.md`, vaultTitle: "Gone" });
    const actions = plan({ notes: [n] });
    expect(actions).toEqual([{ kind: "unlink", noteId: "a" }]);
  });

  it("unlinks a note linked outside the current folder", () => {
    const n = note({ id: "a", title: "Moved", body: "kept", vaultFile: "/vault/OldFolder/Moved.md", vaultTitle: "Moved" });
    const actions = plan({ notes: [n] });
    expect(actions).toEqual([{ kind: "unlink", noteId: "a" }]);
  });

  it("relinks a lost note to an unowned file with identical content", () => {
    const n = note({ id: "a", title: "Before", body: "same words", vaultFile: `${DIR}/Before.md`, vaultTitle: "Before" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/After.md`)],
      contents: new Map([[`${DIR}/After.md`, "same words"]]),
    });
    expect(actions).toEqual([
      { kind: "relink", noteId: "a", path: `${DIR}/After.md`, title: "After" },
    ]);
  });

  it("relinks at most one note per file; the other lost note unlinks", () => {
    const a = note({ id: "a", title: "A", body: "dup", vaultFile: `${DIR}/A.md`, vaultTitle: "A" });
    const b = note({ id: "b", title: "B", body: "dup", vaultFile: `${DIR}/B.md`, vaultTitle: "B" });
    const actions = plan({
      notes: [a, b],
      files: [file(`${DIR}/C.md`)],
      contents: new Map([[`${DIR}/C.md`, "dup"]]),
    });
    expect(actions).toEqual([
      { kind: "relink", noteId: "a", path: `${DIR}/C.md`, title: "C" },
      { kind: "unlink", noteId: "b" },
    ]);
  });

  it("prunes archived paths whose files are gone", () => {
    const actions = plan({
      files: [file(`${DIR}/Still here.md`)],
      contents: new Map([[`${DIR}/Still here.md`, "x"]]),
      archived: [`${DIR}/Still here.md`, `${DIR}/Deleted.md`],
    });
    expect(actions).toEqual([
      { kind: "set-archived", paths: [`${DIR}/Still here.md`] },
    ]);
  });

  it("skips updates for files whose content could not be read", () => {
    const n = note({ id: "a", title: "Idea", body: "old", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({ notes: [n], files: [file(`${DIR}/Idea.md`)] });
    expect(actions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/vaultSync.test.ts`
Expected: FAIL — cannot resolve `./vaultSync`.

- [ ] **Step 3: Implement the module**

Create `src/lib/vaultSync.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/vaultSync.test.ts`
Expected: 12 tests pass. Note the `lastWrites` map comparison in tests uses a plain `Map` — compatible with `ReadonlyMap`.

- [ ] **Step 5: Full gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build && pnpm exec vitest run`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vaultSync.ts src/lib/vaultSync.test.ts
git commit -m "Add pure vault reconcile planner"
```

---

### Task 3: State plumbing — archived list, reducer action, write recording

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/reducer.ts`
- Modify: `src/lib/obsidian.ts`

**Interfaces:**
- Consumes: `recordVaultWrite` from `./vaultSync` (Task 2).
- Produces: `AppData.vaultArchived?: string[]`; reducer action `{ type: "vault/set-archived"; paths: string[] }`; `overwriteNoteFile(path: string, content: string): Promise<void>` and exported `notesDir(s: Settings): string` from `src/lib/obsidian.ts`. Tasks 4 and 5 rely on all of these.

- [ ] **Step 1: Types**

In `src/lib/types.ts`, in `AppData` after `notes: Note[];`, add:

```ts
  vaultArchived?: string[]; // vault files released by app-side renames; never re-imported, never deleted
```

- [ ] **Step 2: Reducer**

In `src/lib/reducer.ts`, add to the `Action` union after the `note/delete` line:

```ts
  | { type: "vault/set-archived"; paths: string[] }
```

and add a case after `note/delete`'s case:

```ts
    case "vault/set-archived":
      return { ...state, vaultArchived: action.paths };
```

- [ ] **Step 3: Record app writes in obsidian.ts**

In `src/lib/obsidian.ts`:

Add to the imports:

```ts
import { recordVaultWrite } from "./vaultSync";
```

Change `notesDir` from a module-private const to an export (same body):

```ts
/** The vault folder that receives note files. */
export const notesDir = (s: Settings): string =>
  `${s.vaultPath}/${s.vaultNotesFolder?.trim() || DEFAULT_FOLDER}`;
```

In `saveNoteToVault`, record both write paths. The function becomes:

```ts
export async function saveNoteToVault(
  settings: Settings,
  note: Note,
): Promise<string> {
  if (!settings.vaultPath) throw new Error("No vault folder set");
  const write = resolveNoteWrite(note.title, note.vaultFile, note.vaultTitle);
  if (write.action === "overwrite") {
    await invoke("write_note", { path: write.path, content: note.body });
    recordVaultWrite(write.path, note.body);
    return write.path;
  }
  const path = await invoke<string>("create_note", {
    dir: notesDir(settings),
    filename: write.filename,
    content: note.body,
  });
  recordVaultWrite(path, note.body);
  return path;
}
```

After `saveNoteToVault`, add:

```ts
/** Overwrite a linked note's existing file without the rename logic —
 *  used by the auto-save path, where a pending title edit must not
 *  create a new file until the rename applies on blur. */
export async function overwriteNoteFile(
  path: string,
  content: string,
): Promise<void> {
  await invoke("write_note", { path, content });
  recordVaultWrite(path, content);
}
```

- [ ] **Step 4: Gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build && pnpm exec vitest run`
Expected: all clean (nothing consumes the new pieces yet; tsc's `noUnusedLocals` does not flag unused exports).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/reducer.ts src/lib/obsidian.ts
git commit -m "Add archived vault paths and record app-side writes"
```

---

### Task 4: Sync hook and app wiring

**Files:**
- Create: `src/lib/useVaultSync.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `read_note`/`list_notes`/`watch_notes` commands and the `notes:changed` event (Task 1); `planReconcile`, `getLastWrites`, `VaultFileInfo` (Task 2); `notesDir` (Task 3); `useApp` from `./state`; `uid` from `./types`.
- Produces: `useVaultSync(): void`, mounted once in `Dashboard`.

- [ ] **Step 1: Write the hook**

Create `src/lib/useVaultSync.ts`:

```ts
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "./state";
import { uid } from "./types";
import { notesDir } from "./obsidian";
import { getLastWrites, planReconcile, type VaultFileInfo } from "./vaultSync";

/** Keep notes and their vault files in sync while the app runs: a full
 *  reconcile at startup and on every folder change event. Reads the whole
 *  folder each pass — notes folders are small, and it keeps the logic
 *  simple and self-healing. Dormant without a configured vault path. */
export function useVaultSync(): void {
  const { data, dispatch, hydrated } = useApp();
  const dataRef = useRef(data);
  dataRef.current = data;
  const running = useRef(false);
  const { vaultPath, vaultNotesFolder } = data.settings;

  useEffect(() => {
    if (!hydrated || !vaultPath) return;
    const dir = notesDir(dataRef.current.settings);
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const reconcile = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const files = await invoke<VaultFileInfo[]>("list_notes", { dir });
        const contents = new Map<string, string>();
        for (const f of files) {
          try {
            contents.set(f.path, await invoke<string>("read_note", { path: f.path }));
          } catch {
            // Unreadable this pass (e.g. deleted mid-scan); next event retries.
          }
        }
        if (disposed) return;
        const d = dataRef.current;
        const actions = planReconcile({
          notes: d.notes,
          dir,
          files,
          contents,
          archived: d.vaultArchived ?? [],
          lastWrites: getLastWrites(),
        });
        for (const a of actions) {
          switch (a.kind) {
            case "update":
              dispatch({
                type: "note/patch",
                id: a.noteId,
                patch: { body: a.body, updatedAt: a.updatedAt },
              });
              break;
            case "relink":
              dispatch({
                type: "note/patch",
                id: a.noteId,
                patch: { vaultFile: a.path, vaultTitle: a.title, title: a.title },
              });
              break;
            case "unlink":
              dispatch({
                type: "note/patch",
                id: a.noteId,
                patch: { vaultFile: undefined, vaultTitle: undefined },
              });
              break;
            case "import":
              dispatch({
                type: "note/add",
                note: {
                  id: uid(),
                  title: a.title,
                  body: a.body,
                  createdAt: a.iso,
                  updatedAt: a.iso,
                  vaultFile: a.path,
                  vaultTitle: a.title,
                },
              });
              break;
            case "set-archived":
              dispatch({ type: "vault/set-archived", paths: a.paths });
              break;
          }
        }
      } catch (e) {
        console.error("Vault sync failed:", e);
      } finally {
        running.current = false;
      }
    };

    invoke("watch_notes", { dir }).catch((e) =>
      console.error("Vault watcher failed:", e),
    );
    void reconcile();
    listen("notes:changed", () => void reconcile()).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [hydrated, vaultPath, vaultNotesFolder, dispatch]);
}
```

Note on the unlink patch: `{ vaultFile: undefined, vaultTitle: undefined }` relies on the reducer's spread (`{ ...n, ...action.patch }`) overwriting the fields with `undefined`. If `tsc` rejects the explicit `undefined` members (it will only if `exactOptionalPropertyTypes` is enabled — it currently is not), adjust `Note` to `vaultFile?: string | undefined` rather than changing the reducer.

- [ ] **Step 2: Mount it**

In `src/App.tsx`, add the import:

```ts
import { useVaultSync } from "./lib/useVaultSync";
```

and inside `Dashboard`, directly after `useTodoScheduler();`:

```ts
  useVaultSync();
```

- [ ] **Step 3: Gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build && pnpm exec vitest run`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/useVaultSync.ts src/App.tsx
git commit -m "Reconcile vault notes at startup and on folder changes"
```

---

### Task 5: NotesView auto-save and rename-on-blur

**Files:**
- Modify: `src/components/NotesView.tsx`

**Interfaces:**
- Consumes: `overwriteNoteFile`, `saveNoteToVault` from `../lib/obsidian` (Task 3); existing `note/patch` and new `vault/set-archived` actions.
- Produces: user-facing behavior only.

- [ ] **Step 1: Imports and refs**

In `src/components/NotesView.tsx`, extend the obsidian import (line 7):

```ts
import { saveNoteToVault, openNoteInObsidian, overwriteNoteFile } from "../lib/obsidian";
```

Change the react import (line 1) to include `useRef`:

```ts
import { useRef, useState } from "react";
```

Inside the component, after the `notice` state, add:

```ts
  const autosaveTimer = useRef<number>(undefined);
```

- [ ] **Step 2: Auto-save on body edits**

Replace the `patch` function with:

```ts
  const patch = (p: Partial<Note>) => {
    if (!selected) return;
    const next = { ...selected, ...p, updatedAt: new Date().toISOString() };
    dispatch({ type: "note/update", note: next });
    // Linked notes auto-save body edits to their file. Deliberately writes
    // to the current vaultFile even while a title edit is pending — the
    // rename applies on blur, not per keystroke.
    if (next.vaultFile && p.body !== undefined) {
      window.clearTimeout(autosaveTimer.current);
      const path = next.vaultFile;
      const body = next.body;
      autosaveTimer.current = window.setTimeout(() => {
        overwriteNoteFile(path, body).catch((e) => flash(`Vault write failed: ${e}`));
      }, 1500);
    }
  };
```

(The timer captures `path` and `body` as locals, so a pending write lands correctly even if the user switches notes before it fires. `flash` is defined below `patch` in the file — hoisting is fine since the timer runs later, but move `flash` above `patch` if you prefer; either compiles.)

- [ ] **Step 3: Rename applies on blur**

On the title `<input className="editor-title" ...>`, add an `onBlur` handler:

```tsx
              <input
                className="editor-title"
                placeholder="Untitled"
                value={selected.title}
                onChange={(e) => patch({ title: e.target.value })}
                onBlur={async () => {
                  if (!selected.vaultFile || selected.title === selected.vaultTitle) return;
                  const oldPath = selected.vaultFile;
                  try {
                    const path = await saveNoteToVault(data.settings, selected);
                    dispatch({
                      type: "note/patch",
                      id: selected.id,
                      patch: { vaultFile: path, vaultTitle: selected.title },
                    });
                    dispatch({
                      type: "vault/set-archived",
                      paths: [...(data.vaultArchived ?? []), oldPath],
                    });
                  } catch (e) {
                    flash(`${e}`);
                  }
                }}
              />
```

`saveNoteToVault` sees `title !== vaultTitle` and creates a fresh file under the new name (existing `resolveNoteWrite` behavior); the old file stays in the vault and its path joins `vaultArchived` so the reconciler never re-imports it.

- [ ] **Step 4: Gates**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build && pnpm exec vitest run`
Expected: all clean.

- [ ] **Step 5: Manual smoke**

`pnpm tauri dev` (rebuilds Rust once for Task 1): edit a linked note's file in Obsidian -> app body updates within ~1s; type in the app -> file updates ~1.5s after the last keystroke; create an md file in the folder -> a note appears; rename the file in Obsidian -> the note follows (relink, title changes); rename a note in the app and click away -> new file appears, old file stays and no duplicate note imports; delete a file in Obsidian -> the note stays but its To vault state resets (unlinked); quit the app, edit files in Obsidian, relaunch -> changes appear. (If you cannot drive the GUI in this session, skip and note it — the controller handles GUI verification.)

- [ ] **Step 6: Commit**

```bash
git add src/components/NotesView.tsx
git commit -m "Auto-save linked notes and apply renames on blur"
```
