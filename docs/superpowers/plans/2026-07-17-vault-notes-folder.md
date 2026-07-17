# Vault Notes Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every note becomes a real `.md` file in a dedicated vault folder — quick captures write one immediately, the Notes tab's "To vault" button writes into the folder and updates the same file on re-export — replacing the titles-only inbox.

**Architecture:** A new pure module `src/lib/vaultNotes.ts` decides filenames and create-vs-overwrite (vitest-covered, no Tauri imports). `src/lib/obsidian.ts` loses the inbox and gains `saveNoteToVault` on top of two Rust commands: the existing dedup-safe `create_note` for first exports and a new plain-overwrite `write_note` for re-exports. `Note.vaultFile` remembers where a note was written; `Settings.vaultNotesFolder` names the folder (default "Hyperfocus").

**Tech Stack:** React 19 + TypeScript (strict, `noUnusedLocals: true`), Tauri 2 (Rust commands), vitest (Node env, pure logic only).

Spec: `docs/superpowers/specs/2026-07-17-vault-notes-folder-design.md`

## Global Constraints

- NO emojis anywhere: code, UI copy, commit messages.
- NO `Co-Authored-By` trailer on commits.
- No hardcoded personal defaults or seed data ("Hyperfocus" is the app name, allowed).
- The app never deletes or renames files in the vault.
- File content is `note.body` verbatim — no frontmatter, no injected title.
- `pnpm exec tsc --noEmit` and `pnpm exec vite build` must pass after every task; `cargo check` must pass after the Rust task.
- vitest tests import only pure modules (no `@tauri-apps/*` imports in tested files).

---

### Task 1: Pure filename/write-decision module + tests

**Files:**
- Create: `src/lib/vaultNotes.ts`
- Test: `src/lib/vaultNotes.test.ts`

**Interfaces:**
- Consumes: nothing (pure, zero imports).
- Produces: `safeFilename(title: string): string`; `type NoteWrite = { action: "create"; filename: string } | { action: "overwrite"; path: string }`; `resolveNoteWrite(title: string, vaultFile?: string): NoteWrite`. Task 3's `saveNoteToVault` consumes `resolveNoteWrite`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/vaultNotes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { safeFilename, resolveNoteWrite } from "./vaultNotes";

describe("safeFilename", () => {
  it("strips characters Obsidian/filesystems reject", () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe("abcdefghijklmn");
  });
  it("caps length at 60 characters", () => {
    expect(safeFilename("x".repeat(80))).toHaveLength(60);
  });
  it("falls back to Untitled for empty or all-stripped titles", () => {
    expect(safeFilename("")).toBe("Untitled");
    expect(safeFilename("###")).toBe("Untitled");
  });
});

describe("resolveNoteWrite", () => {
  it("creates when the note was never exported", () => {
    expect(resolveNoteWrite("My Note", undefined)).toEqual({
      action: "create",
      filename: "My Note.md",
    });
  });
  it("overwrites the stored path when the title still matches", () => {
    expect(resolveNoteWrite("My Note", "/v/Hyperfocus/My Note.md")).toEqual({
      action: "overwrite",
      path: "/v/Hyperfocus/My Note.md",
    });
  });
  it("overwrites a dedup-suffixed file from create_note", () => {
    expect(resolveNoteWrite("My Note", "/v/Hyperfocus/My Note 2.md")).toEqual({
      action: "overwrite",
      path: "/v/Hyperfocus/My Note 2.md",
    });
  });
  it("creates a fresh file when the note was renamed", () => {
    expect(resolveNoteWrite("New Title", "/v/Hyperfocus/Old Title.md")).toEqual({
      action: "create",
      filename: "New Title.md",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/vaultNotes.test.ts`
Expected: FAIL — cannot find module `./vaultNotes`.

- [ ] **Step 3: Implement the module**

Create `src/lib/vaultNotes.ts`:

```ts
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
```

Note: `safeFilename("x".repeat(80))` yields 60 "x"s — the slice happens before strip/trim, and the test title has nothing to strip, so the length assertion holds.

- [ ] **Step 4: Run the full suite to verify green**

Run: `pnpm exec vitest run`
Expected: all pass (existing media/reducer suites + 7 new).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm exec tsc --noEmit` — expected clean.

```bash
git add src/lib/vaultNotes.ts src/lib/vaultNotes.test.ts
git commit -m "Add pure vault note filename and write-decision helpers"
```

---

### Task 2: Rust — add `write_note`, remove `append_note`

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: Tauri command `write_note(path: String, content: String) -> Result<(), String>` (plain overwrite, creates parent dirs). Task 3 invokes it as `invoke("write_note", { path, content })`. The `append_note` command disappears — its only caller (`appendToInbox`) is deleted in Task 3; `invoke` is untyped so nothing breaks at compile time in between.

- [ ] **Step 1: Replace `append_note` with `write_note`**

In `src-tauri/src/lib.rs`, delete the `append_note` function (lines 33-48, the `/// Append a line to a note file...` doc comment through its closing brace) and add in its place:

```rust
/// Overwrite a markdown note at an exact path — used when re-exporting a
/// note to the file it was previously written to. Creates parent dirs.
#[tauri::command]
fn write_note(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, content).map_err(|e| format!("Cannot write {path}: {e}"))
}
```

- [ ] **Step 2: Update the handler registration**

In the `invoke_handler(tauri::generate_handler![...])` list (~line 154), replace `append_note,` with `write_note,`.

- [ ] **Step 3: Drop imports orphaned by the removal**

`append_note` was the user of `OpenOptions`/`io::Write`. Run `cargo check` (next step) and remove any `use` items it flags as unused (expect `std::fs::OpenOptions` and `std::io::Write`; leave anything still used by other functions).

- [ ] **Step 4: Verify the Rust build**

Run: `cd src-tauri && cargo check && cd ..`
Expected: clean — no errors, no unused-import warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "Replace append_note command with overwriting write_note"
```

---

### Task 3: Wire the folder through settings, library, and UI

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/obsidian.ts`
- Modify: `src/components/NotesWidget.tsx`
- Modify: `src/components/NotesView.tsx`
- Modify: `src/components/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `resolveNoteWrite` from `./vaultNotes` (Task 1); `write_note` / `create_note` Rust commands (Task 2).
- Produces: `saveNoteToVault(settings: Settings, note: Note): Promise<string>` and `openNoteInObsidian(path: string): Promise<void>` from `src/lib/obsidian.ts`; `Note.vaultFile?: string`; `Settings.vaultNotesFolder?: string`.

- [ ] **Step 1: Update the types**

In `src/lib/types.ts`:
- In `Settings` (line 138), replace `vaultInboxNote?: string;` with `vaultNotesFolder?: string;`.
- In `Note` (after `updatedAt: string; // ISO`, line 103), add `vaultFile?: string; // vault path this note was last written to`.

No migration: an old persisted `vaultInboxNote` value lingers in `data.json` as an unknown field nothing reads; `vaultFile` is additive.

- [ ] **Step 2: Rework `src/lib/obsidian.ts`**

Replace the file's inbox/promote section. Remove `DEFAULT_INBOX`, `inboxPath`, `appendToInbox`, and `promoteNoteToVault`. Keep `openVault`, `ObsidianStatus`, and `obsidianStatus` unchanged. The file becomes:

```ts
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
```

- [ ] **Step 3: Quick captures write a file (`NotesWidget.tsx`)**

Change the import (line 6) from `appendToInbox` to `saveNoteToVault`, and in `capture()` replace:

```ts
    if (data.settings.vaultPath) {
      appendToInbox(data.settings, t).catch((e) => flash(`Vault sync failed: ${e}`));
    }
```

with:

```ts
    if (data.settings.vaultPath) {
      saveNoteToVault(data.settings, note)
        .then((path) =>
          dispatch({ type: "note/update", note: { ...note, vaultFile: path } }),
        )
        .catch((e) => flash(`Vault sync failed: ${e}`));
    }
```

(`note` is the freshly built object dispatched just above — body is empty, so the file is created with the title as its name and empty content. No Obsidian window opens.)

- [ ] **Step 4: "To vault" targets the folder and remembers its file (`NotesView.tsx`)**

Change the import (line 7) from `promoteNoteToVault` to `saveNoteToVault, openNoteInObsidian`, and replace `toVault`:

```ts
  const toVault = async () => {
    if (!selected) return;
    try {
      const path = await saveNoteToVault(data.settings, selected);
      dispatch({ type: "note/update", note: { ...selected, vaultFile: path } });
      await openNoteInObsidian(path);
      flash("Saved to vault and opened in Obsidian");
    } catch (e) {
      flash(`${e}`);
    }
  };
```

- [ ] **Step 5: Settings field (`SettingsPanel.tsx`)**

Replace the Inbox-note field (lines 217-225) with:

```tsx
      <div className="field">
        <label>Notes folder (captured thoughts and exported notes land here)</label>
        <input
          className="input"
          defaultValue={s.vaultNotesFolder ?? ""}
          placeholder="Hyperfocus"
          onBlur={(e) => set({ vaultNotesFolder: e.target.value.trim() || undefined })}
        />
      </div>
```

- [ ] **Step 6: Verify typecheck, build, tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build && pnpm exec vitest run`
Expected: all clean. `tsc` will catch any straggler `vaultInboxNote`/`appendToInbox`/`promoteNoteToVault` references — there must be none.

- [ ] **Step 7: Manual smoke**

`pnpm tauri dev`: capture a thought on the dashboard -> `<vault>/Hyperfocus/<title>.md` appears (empty body); open Notes tab, write a body, "To vault" -> same file gains the body (no `Title 1.md`); rename the note, "To vault" -> new file under the new title, old file untouched; change the folder name in Settings -> next capture lands in the new folder; with no vault path set, capture works silently and "To vault" flashes the error. (If you cannot drive the GUI in this session, skip and note it — verify via typecheck/build instead.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/obsidian.ts src/components/NotesWidget.tsx src/components/NotesView.tsx src/components/SettingsPanel.tsx
git commit -m "Write notes to a vault folder as individual markdown files"
```
