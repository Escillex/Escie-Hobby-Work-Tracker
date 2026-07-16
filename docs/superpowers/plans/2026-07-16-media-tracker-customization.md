# Media Tracker Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-category custom statuses (guarded for sync-backed categories), entry editing, group-by-status display, a manual "installed" flag and hours for games, and multi-select bulk actions to the Media Tracker.

**Architecture:** Data-model additions are backward-compatible and additive. Pure logic (status resolution, install detection, grouping) moves to `src/lib/media.ts` with unit tests; the reducer moves to `src/lib/reducer.ts` (Tauri-free, testable) and gains `category/update`. The 1,100-line `MediaTracker.tsx` sheds its modals into `src/components/MediaModals.tsx`. UI is verified by typecheck + build + a manual smoke checklist, matching this repo's existing workflow.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vite 7, pnpm. New dev dependency: **vitest** (pairs with the existing Vite install; used for the pure-logic tests only).

## Global Constraints

- No emojis anywhere, including commit messages and UI copy.
- No `Co-Authored-By` trailer on commits.
- The user's name may appear in author/identity fields but NEVER as a hardcoded default or seed value in shipped code.
- Statuses are free-form strings for Games and manual categories; sync-backed categories (`anilist-anime`, `anilist-manga`, `tmdb-movie`, `tmdb-tv`) stay locked to the canonical `MEDIA_STATUSES`.
- Icons are Nerd Font glyphs in `src/lib/icons.ts` (`IC.*`); no emoji, no inline SVG.
- Each UI task must end with `pnpm exec tsc --noEmit` and `pnpm exec vite build` both clean before committing.

## File Map

- `src/lib/types.ts` (modify) — `MediaEntry.installed?`, `MediaCategory.statuses?`, widen `MediaEntry.status` to `string`.
- `src/lib/media.ts` (create) — `statusesFor`, `canCustomizeStatuses`, `isEntryInstalled`, `groupByStatus`.
- `src/lib/media.test.ts` (create) — unit tests for the above.
- `src/lib/reducer.ts` (create) — the `reducer` + `Action` moved out of `state.tsx`, plus `category/update`.
- `src/lib/reducer.test.ts` (create) — reducer unit tests.
- `src/lib/state.tsx` (modify) — import `reducer`/`Action` from `reducer.ts`.
- `src/lib/icons.ts` (modify) — add `edit` (pencil) glyph.
- `src/components/MediaModals.tsx` (create) — `EntryFormModal`, `EntryDetailModal`, `AddCategoryModal`, `ManageCategoryModal`.
- `src/components/MediaTracker.tsx` (modify) — status widening ripple, use helpers, grouping, edit button, gear button, select mode + bulk bar; import modals from `MediaModals.tsx`.
- `src/components/MediaTracker.css` (modify) — styles for groups, edit button, manage modal, select checkboxes, bulk bar.
- `package.json` (modify) — `vitest` devDependency + `test` script.

---

### Task 1: Data model + pure helpers + test setup

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/anilist.ts` (one cast) and `src/components/MediaTracker.tsx` (status-widening ripple, ~6 sites)
- Create: `src/lib/media.ts`
- Create: `src/lib/media.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `MediaEntry.installed?: boolean`, `MediaCategory.statuses?: string[]`, `MediaEntry.status: string`.
- Produces `src/lib/media.ts`:
  - `statusesFor(category: MediaCategory): string[]`
  - `canCustomizeStatuses(source: CategorySource): boolean`
  - `isEntryInstalled(entry: MediaEntry, detected: Set<number> | null): boolean`
  - `groupByStatus(entries: MediaEntry[], statuses: string[]): { status: string; entries: MediaEntry[] }[]`

- [ ] **Step 1: Add vitest**

Run:
```bash
cd /home/escillex/Code/Personal/hyperfocus-dash && pnpm add -D vitest
```
Then add a `test` script to `package.json` `scripts` (leave the others unchanged):
```json
    "preview": "vite preview",
    "test": "vitest run",
    "tauri": "tauri"
```

- [ ] **Step 2: Widen the data model in `src/lib/types.ts`**

In `MediaEntry`, change the status line and add `installed`:
```ts
  progress: number;
  total?: number | null;
  status: string; // canonical MediaStatus for synced categories; free-form otherwise
  installed?: boolean; // manual "installed on this machine" override (games)
```
In `MediaCategory`, add `statuses`:
```ts
export interface MediaCategory {
  id: string;
  name: string;
  source: CategorySource;
  statuses?: string[]; // custom ordered status list; falls back to MEDIA_STATUSES
}
```
Leave `MediaStatus` and `MEDIA_STATUSES` exactly as they are — they remain the canonical set.

- [ ] **Step 3: Write the failing helper tests in `src/lib/media.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  statusesFor,
  canCustomizeStatuses,
  isEntryInstalled,
  groupByStatus,
} from "./media";
import { MEDIA_STATUSES } from "./types";
import type { MediaCategory, MediaEntry } from "./types";

const cat = (over: Partial<MediaCategory> = {}): MediaCategory => ({
  id: "c",
  name: "C",
  source: "manual",
  ...over,
});
const entry = (over: Partial<MediaEntry> = {}): MediaEntry => ({
  id: "e",
  categoryId: "c",
  title: "t",
  progress: 0,
  status: "CURRENT",
  ...over,
});

describe("statusesFor", () => {
  it("falls back to canonical statuses when unset", () => {
    expect(statusesFor(cat())).toEqual(MEDIA_STATUSES);
  });
  it("uses the category's custom statuses when set", () => {
    expect(statusesFor(cat({ statuses: ["Playing", "Beat"] }))).toEqual([
      "Playing",
      "Beat",
    ]);
  });
});

describe("canCustomizeStatuses", () => {
  it("allows games and manual", () => {
    expect(canCustomizeStatuses("games")).toBe(true);
    expect(canCustomizeStatuses("manual")).toBe(true);
  });
  it("locks synced sources", () => {
    for (const s of [
      "anilist-anime",
      "anilist-manga",
      "tmdb-movie",
      "tmdb-tv",
    ] as const) {
      expect(canCustomizeStatuses(s)).toBe(false);
    }
  });
});

describe("isEntryInstalled", () => {
  it("true when manually flagged", () => {
    expect(isEntryInstalled(entry({ installed: true }), null)).toBe(true);
  });
  it("true when Steam app is detected", () => {
    expect(isEntryInstalled(entry({ steamAppId: 570 }), new Set([570]))).toBe(
      true,
    );
  });
  it("false when not flagged and not detected", () => {
    expect(isEntryInstalled(entry({ steamAppId: 570 }), new Set([1]))).toBe(
      false,
    );
    expect(isEntryInstalled(entry(), null)).toBe(false);
  });
});

describe("groupByStatus", () => {
  it("orders sections by the status list and drops empties", () => {
    const es = [entry({ status: "CURRENT" }), entry({ status: "COMPLETED" })];
    const g = groupByStatus(es, ["COMPLETED", "PLANNING", "CURRENT"]);
    expect(g.map((x) => x.status)).toEqual(["COMPLETED", "CURRENT"]);
  });
  it("collects unknown statuses into a trailing Other section", () => {
    const es = [entry({ status: "PLANNING" }), entry({ status: "Weird" })];
    const g = groupByStatus(es, ["PLANNING"]);
    expect(g.map((x) => x.status)).toEqual(["PLANNING", "Other"]);
    expect(g[1].entries).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/lib/media.test.ts`
Expected: FAIL — cannot resolve `./media` (module not created yet).

- [ ] **Step 5: Implement `src/lib/media.ts`**

```ts
import type { CategorySource, MediaCategory, MediaEntry } from "./types";
import { MEDIA_STATUSES } from "./types";

/** The status list a category uses — its custom set, or the canonical default. */
export function statusesFor(category: MediaCategory): string[] {
  return category.statuses ?? MEDIA_STATUSES;
}

/** Whether a category's status *definitions* may be edited. Categories that sync
 *  status to an external service (AniList push, TMDB watchlist/rated) stay locked
 *  to the canonical set; only Games and manual categories are free-form. */
export function canCustomizeStatuses(source: CategorySource): boolean {
  return source === "games" || source === "manual";
}

/** Whether an entry counts as installed: a manual override, or Steam detection. */
export function isEntryInstalled(
  entry: MediaEntry,
  detected: Set<number> | null,
): boolean {
  return (
    entry.installed === true ||
    (entry.steamAppId != null && (detected?.has(entry.steamAppId) ?? false))
  );
}

export interface StatusGroup {
  status: string;
  entries: MediaEntry[];
}

/** Group entries into sections following `statuses` order. Empty sections are
 *  dropped; any entry whose status is not in the list lands in a trailing
 *  "Other" section so nothing disappears from view. */
export function groupByStatus(
  entries: MediaEntry[],
  statuses: string[],
): StatusGroup[] {
  const groups: StatusGroup[] = statuses.map((status) => ({
    status,
    entries: [],
  }));
  const byStatus = new Map(groups.map((g) => [g.status, g]));
  const other: MediaEntry[] = [];
  for (const e of entries) {
    const group = byStatus.get(e.status);
    if (group) group.entries.push(e);
    else other.push(e);
  }
  const result = groups.filter((g) => g.entries.length > 0);
  if (other.length) result.push({ status: "Other", entries: other });
  return result;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/lib/media.test.ts`
Expected: PASS (11 assertions across 4 suites).

- [ ] **Step 7: Fix the status-widening ripple so the build stays green**

In `src/components/MediaTracker.tsx`:

`bump` (around line 193) — change the annotation from `MediaStatus` to `string` and cast at the AniList call:
```ts
    const progress = entry.progress + 1;
    const completed = entry.total != null && progress >= entry.total;
    const status: string = completed ? "COMPLETED" : entry.status;
    dispatch({ type: "media/update", entry: { ...entry, progress, status } });
    if (isAniList && token && entry.anilistId) {
      try {
        await saveEntry(token, {
          mediaId: entry.anilistId,
          progress,
          status: status as MediaStatus,
        });
```

`setStatus` (around line 204):
```ts
  const setStatus = async (entry: MediaEntry, status: string) => {
    dispatch({ type: "media/update", entry: { ...entry, status } });
    if (isAniList && token && entry.anilistId) {
      try {
        await saveEntry(token, { mediaId: entry.anilistId, status: status as MediaStatus });
```

`MediaCard` prop type (around line 612): `onStatus: (s: MediaStatus) => void;` → `onStatus: (s: string) => void;`

`MediaCard` status select (around line 670): `onChange={(e) => onStatus(e.target.value as MediaStatus)}` → `onChange={(e) => onStatus(e.target.value)}`.

Leave the `import type { ... MediaStatus ... }` on line 3 in place — it is still used by the two `as MediaStatus` casts and by `ManualEntryModal`.

`src/lib/anilist.ts` needs no change: line 122 assigns a `MediaStatus` into the now-`string` field (widening, safe), and `saveEntry`'s `status?: MediaStatus` parameter is unchanged (callers cast).

- [ ] **Step 8: Verify typecheck and build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both succeed, no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/lib/media.ts src/lib/media.test.ts src/components/MediaTracker.tsx package.json pnpm-lock.yaml
git commit -m "Add media status/install helpers and widen entry status"
```

---

### Task 2: Reducer extraction + category/update action

**Files:**
- Create: `src/lib/reducer.ts`
- Create: `src/lib/reducer.test.ts`
- Modify: `src/lib/state.tsx`

**Interfaces:**
- Consumes: types from Task 1.
- Produces: `reducer(state: AppData, action: Action): AppData` and the `Action` union (now including `{ type: "category/update"; category: MediaCategory }`), both exported from `src/lib/reducer.ts`.

- [ ] **Step 1: Create `src/lib/reducer.ts` by moving the reducer out of `state.tsx`**

Cut the `Action` type (currently `state.tsx` lines ~23-41) and the `reducer` function (lines ~43-146) into a new file. Add the `category/update` case. The file imports only types and `localDate` — no React, no Tauri (keeps it unit-testable):

```ts
import type {
  AppData,
  Launcher,
  MediaCategory,
  MediaEntry,
  Todo,
  Note,
  FocusRef,
  Settings,
} from "./types";
import { localDate } from "./types";

export type Action =
  | { type: "hydrate"; data: AppData }
  | { type: "launcher/add"; launcher: Launcher }
  | { type: "launcher/update"; launcher: Launcher }
  | { type: "launcher/delete"; id: string }
  | { type: "category/add"; category: MediaCategory }
  | { type: "category/update"; category: MediaCategory }
  | { type: "category/delete"; id: string }
  | { type: "media/replaceCategory"; categoryId: string; entries: MediaEntry[] }
  | { type: "media/add"; entry: MediaEntry }
  | { type: "media/update"; entry: MediaEntry }
  | { type: "media/delete"; id: string }
  | { type: "note/add"; note: Note }
  | { type: "note/update"; note: Note }
  | { type: "note/delete"; id: string }
  | { type: "todo/add"; todo: Todo }
  | { type: "todo/update"; todo: Todo }
  | { type: "todo/delete"; id: string }
  | { type: "focus/set"; slot: "now" | "next"; ref?: FocusRef }
  | { type: "settings/update"; settings: Partial<Settings> };

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case "hydrate":
      return action.data;
    case "launcher/add":
      return { ...state, launchers: [...state.launchers, action.launcher] };
    case "launcher/update":
      return {
        ...state,
        launchers: state.launchers.map((l) =>
          l.id === action.launcher.id ? action.launcher : l,
        ),
      };
    case "launcher/delete":
      return {
        ...state,
        launchers: state.launchers.filter((l) => l.id !== action.id),
      };
    case "category/add":
      return {
        ...state,
        media: {
          ...state.media,
          categories: [...state.media.categories, action.category],
        },
      };
    case "category/update":
      return {
        ...state,
        media: {
          ...state.media,
          categories: state.media.categories.map((c) =>
            c.id === action.category.id ? action.category : c,
          ),
        },
      };
    case "category/delete":
      return {
        ...state,
        media: {
          categories: state.media.categories.filter((c) => c.id !== action.id),
          entries: state.media.entries.filter((e) => e.categoryId !== action.id),
        },
      };
    case "media/replaceCategory":
      return {
        ...state,
        media: {
          ...state.media,
          entries: [
            ...state.media.entries.filter(
              (e) => e.categoryId !== action.categoryId,
            ),
            ...action.entries,
          ],
        },
      };
    case "media/add":
      return {
        ...state,
        media: {
          ...state.media,
          entries: [action.entry, ...state.media.entries],
        },
      };
    case "media/update":
      return {
        ...state,
        media: {
          ...state.media,
          entries: state.media.entries.map((e) => {
            if (e.id !== action.entry.id) return e;
            const next = action.entry;
            if (next.status === "COMPLETED" && e.status !== "COMPLETED") {
              return { ...next, completedAt: next.completedAt ?? localDate() };
            }
            return next;
          }),
        },
      };
    case "media/delete":
      return {
        ...state,
        media: {
          ...state.media,
          entries: state.media.entries.filter((e) => e.id !== action.id),
        },
      };
    case "note/add":
      return { ...state, notes: [action.note, ...state.notes] };
    case "note/update":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.note.id ? action.note : n,
        ),
      };
    case "note/delete":
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };
    case "todo/add":
      return { ...state, todos: [...state.todos, action.todo] };
    case "todo/update":
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.todo.id ? action.todo : t,
        ),
      };
    case "todo/delete":
      return { ...state, todos: state.todos.filter((t) => t.id !== action.id) };
    case "focus/set":
      return { ...state, focus: { ...state.focus, [action.slot]: action.ref } };
    case "settings/update":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    default:
      return state;
  }
}
```

- [ ] **Step 2: Update `src/lib/state.tsx` to consume the extracted reducer**

Remove the now-moved `Action` type and `reducer` function. Remove the type imports only `reducer.ts` needs if they are now unused in `state.tsx` (keep `AppData` and `localDate` — still used by `EMPTY`). Add near the top:
```ts
import { reducer, type Action } from "./reducer";
```
Re-export `Action` so existing imports keep working (`state.tsx` currently is where components import `Action` from — confirm with `grep -rn 'from "./state"' src | grep Action` and `grep -rn 'from "../lib/state"' src | grep Action`). Add:
```ts
export type { Action } from "./reducer";
```
Everything else in `state.tsx` (`AppProvider`, `useApp`, `EMPTY`, `Ctx`) stays.

- [ ] **Step 3: Write the failing reducer tests in `src/lib/reducer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reducer } from "./reducer";
import { defaultData } from "./types";
import type { MediaCategory, MediaEntry } from "./types";

describe("category/update", () => {
  it("replaces a category by id, leaving others untouched", () => {
    const base = defaultData();
    const games = base.media.categories.find((c) => c.id === "games")!;
    const updated: MediaCategory = {
      ...games,
      name: "Video Games",
      statuses: ["Playing", "Beat"],
    };
    const next = reducer(base, { type: "category/update", category: updated });
    expect(next.media.categories.find((c) => c.id === "games")).toEqual(updated);
    expect(next.media.categories).toHaveLength(base.media.categories.length);
  });
});

describe("media/update completedAt stamping", () => {
  const gameEntry: MediaEntry = {
    id: "x",
    categoryId: "games",
    title: "g",
    progress: 0,
    status: "CURRENT",
  };

  it("stamps completedAt when moving to canonical COMPLETED", () => {
    const added = reducer(defaultData(), { type: "media/add", entry: gameEntry });
    const done = reducer(added, {
      type: "media/update",
      entry: { ...gameEntry, status: "COMPLETED" },
    });
    expect(done.media.entries[0].completedAt).toBeTruthy();
  });

  it("does not stamp completedAt for a custom status", () => {
    const added = reducer(defaultData(), {
      type: "media/add",
      entry: { ...gameEntry, status: "Playing" },
    });
    const moved = reducer(added, {
      type: "media/update",
      entry: { ...gameEntry, status: "Beat" },
    });
    expect(moved.media.entries[0].completedAt).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the reducer tests**

Run: `pnpm exec vitest run src/lib/reducer.test.ts`
Expected: PASS (3 assertions). If the import of `./reducer` pulls in Tauri and errors, that indicates a stray non-type import was moved in — `reducer.ts` must import only from `./types`.

- [ ] **Step 5: Verify typecheck and build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reducer.ts src/lib/reducer.test.ts src/lib/state.tsx
git commit -m "Extract reducer to its own module and add category/update"
```

---

### Task 3: Extract modals into MediaModals.tsx (no behavior change)

**Files:**
- Create: `src/components/MediaModals.tsx`
- Modify: `src/components/MediaTracker.tsx`

**Interfaces:**
- Produces (re-exported for later tasks): `EntryDetailModal`, `AddCategoryModal`, `ManualEntryModal` components with their current prop shapes.

- [ ] **Step 1: Create `src/components/MediaModals.tsx` and move three modals verbatim**

Move these three functions **unchanged** from `MediaTracker.tsx` into the new file: `EntryDetailModal`, `AddCategoryModal`, `ManualEntryModal`. Give the new file this import header (it needs exactly what those three functions reference):
```tsx
import { useState } from "react";
import type { ChecklistItem, MediaEntry, MediaStatus, Recurrence } from "../lib/types";
import { MEDIA_STATUSES, uid, localDate } from "../lib/types";
import { useFocusActions } from "../lib/focus";
import { setSeasonWatched } from "../lib/tmdb";
import { IC } from "../lib/icons";
import { Modal } from "./Modal";
import { StarRating } from "./StarRating";
```
`EntryDetailModal` also references the module-level helpers `toggleChecklistItem`, `nextRecurrence`, and `RECURRENCE_LABEL`. Move those three helpers (currently near the top of `MediaTracker.tsx`, ~lines 30-50) into `MediaModals.tsx` as well, above the components. Add `export` to each of the three moved components.

- [ ] **Step 2: Update `MediaTracker.tsx` to import the moved pieces and drop the originals**

Delete the three moved component functions and the three moved helper functions from `MediaTracker.tsx`. Add an import:
```tsx
import { EntryDetailModal, AddCategoryModal, ManualEntryModal } from "./MediaModals";
```
`MediaTracker.tsx` still uses `toggleChecklistItem` in its `toggleTask` handler (CategoryView, ~line 241) and in `MediaCard`'s task preview — those call sites remain. Since the helper moved, either (a) keep `toggleChecklistItem` in `MediaTracker.tsx` and import it into `MediaModals.tsx`, or (b) export it from `MediaModals.tsx` and import back. Choose (a): keep `toggleChecklistItem`, `nextRecurrence`, `RECURRENCE_LABEL` in `MediaTracker.tsx` and have `MediaModals.tsx` import them:
```tsx
// in MediaModals.tsx, replace the local helpers with:
import { toggleChecklistItem, nextRecurrence, RECURRENCE_LABEL } from "./MediaTracker";
```
And in `MediaTracker.tsx` add `export` to those three helpers. (This keeps the checklist behavior in one place.)

- [ ] **Step 3: Verify typecheck and build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both succeed; no runtime/behavior change.

- [ ] **Step 4: Manual smoke**

Run `pnpm tauri dev`, open a media entry's detail modal (notes/checklist), add a manual entry, add a category. Confirm all three still work exactly as before. Close dev.

- [ ] **Step 5: Commit**

```bash
git add src/components/MediaModals.tsx src/components/MediaTracker.tsx
git commit -m "Extract media modals into MediaModals.tsx"
```

---

### Task 4: Edit entries + custom-game installed flag + game hours

**Files:**
- Modify: `src/lib/icons.ts`
- Modify: `src/components/MediaModals.tsx` (generalize `ManualEntryModal` -> `EntryFormModal`)
- Modify: `src/components/MediaTracker.tsx` (edit button, use `isEntryInstalled`, pass category to form)
- Modify: `src/components/MediaTracker.css`

**Interfaces:**
- Consumes: `isEntryInstalled`, `statusesFor` (Task 1).
- Produces: `EntryFormModal` with props `{ category: MediaCategory; entry?: MediaEntry; onClose: () => void; onSave: (e: MediaEntry) => void }` (add when `entry` omitted, edit otherwise).

- [ ] **Step 1: Add a pencil icon to `src/lib/icons.ts`**

Add inside the `IC` object (near `gear`):
```ts
  edit: "", // pen-to-square (Nerd Font / Font Awesome)
```

- [ ] **Step 2: Replace `ManualEntryModal` with `EntryFormModal` in `MediaModals.tsx`**

Delete the existing `ManualEntryModal` and add:
```tsx
export function EntryFormModal({
  category,
  entry,
  onClose,
  onSave,
}: {
  category: MediaCategory;
  entry?: MediaEntry;
  onClose: () => void;
  onSave: (e: MediaEntry) => void;
}) {
  const isGame = category.source === "games";
  const statuses = statusesFor(category);
  const editing = entry != null;

  const [title, setTitle] = useState(entry?.title ?? "");
  const [total, setTotal] = useState(
    entry?.total != null ? String(entry.total) : "",
  );
  const [hours, setHours] = useState(
    isGame && entry ? String(entry.progress) : "",
  );
  const [coverUrl, setCoverUrl] = useState(entry?.coverUrl ?? "");
  const [launchCommand, setLaunchCommand] = useState(entry?.launchCommand ?? "");
  const [installed, setInstalled] = useState(entry?.installed ?? false);
  const [status, setStatus] = useState<string>(
    entry?.status ?? statuses[0] ?? "PLANNING",
  );

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const base: MediaEntry = {
      ...(entry ?? {
        id: uid(),
        categoryId: category.id,
        progress: 0,
      }),
      title: trimmed,
      total: total ? Number(total) : isGame ? null : null,
      coverUrl: coverUrl.trim() || undefined,
      status,
    };
    if (isGame) {
      base.progress = hours ? Number(hours) : (entry?.progress ?? 0);
      base.launchCommand = launchCommand.trim() || undefined;
      base.installed = installed || undefined;
    }
    if (status === "COMPLETED" && !base.completedAt) base.completedAt = localDate();
    onSave(base);
  };

  return (
    <Modal title={editing ? "Edit entry" : "Add entry"} onClose={onClose}>
      <div className="field">
        <label>Title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      {isGame ? (
        <div className="field">
          <label>Hours played</label>
          <input
            className="input"
            type="number"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
      ) : (
        <div className="field">
          <label>Total episodes / parts (optional)</label>
          <input
            className="input"
            type="number"
            min="1"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>
      )}
      <div className="field">
        <label>Cover image URL (optional)</label>
        <input
          className="input"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      {isGame && (
        <>
          <div className="field">
            <label>Launch command (optional)</label>
            <input
              className="input"
              value={launchCommand}
              onChange={(e) => setLaunchCommand(e.target.value)}
              placeholder="hydra, xdg-open steam://rungameid/..., an-anime-game-launcher"
            />
          </div>
          <label className="entry-form-check">
            <input
              type="checkbox"
              checked={installed}
              onChange={(e) => setInstalled(e.target.checked)}
            />
            Installed on this machine
          </label>
        </>
      )}
      <div className="field">
        <label>Status</label>
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {(statuses.includes(status) ? statuses : [status, ...statuses]).map(
            (s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="modal-actions">
        <button className="btn primary" disabled={!title.trim()} onClick={save}>
          {editing ? "Save" : "Add"}
        </button>
      </div>
    </Modal>
  );
}
```
Update the import header of `MediaModals.tsx` to add `MediaCategory` to the types import and to import the helper:
```tsx
import type { ChecklistItem, MediaCategory, MediaEntry, Recurrence } from "../lib/types";
import { uid, localDate } from "../lib/types";
import { statusesFor } from "../lib/media";
```
(`MediaStatus` and `MEDIA_STATUSES` are no longer needed in `MediaModals.tsx` once `ManualEntryModal` is gone — remove them from its imports if unused.)

- [ ] **Step 3: Wire `EntryFormModal` into `MediaTracker.tsx`**

Replace the `ManualEntryModal` import with `EntryFormModal`:
```tsx
import { EntryDetailModal, AddCategoryModal, EntryFormModal } from "./MediaModals";
```
Add editing state in `CategoryView` (near `detailId`):
```tsx
  const [editId, setEditId] = useState<string | null>(null);
  const editEntry = entries.find((e) => e.id === editId) ?? null;
```
Swap the Steam/TMDB/manual "Add" buttons to open the add form (they currently set `addingManual`). Keep `addingManual` as the add trigger. Replace the render block at the bottom of `CategoryView`:
```tsx
      {addingManual && (
        <EntryFormModal
          category={category}
          onClose={() => setAddingManual(false)}
          onSave={(entry) => {
            dispatch({ type: "media/add", entry });
            setAddingManual(false);
          }}
        />
      )}

      {editEntry && (
        <EntryFormModal
          category={category}
          entry={editEntry}
          onClose={() => setEditId(null)}
          onSave={(entry) => {
            dispatch({ type: "media/update", entry });
            setEditId(null);
          }}
        />
      )}
```
Pass an `onEdit` handler to `MediaCard` in the map:
```tsx
            onEdit={() => setEditId(e.id)}
```

- [ ] **Step 4: Swap install detection to the helper and add the edit button in `MediaCard`**

At the top of `MediaTracker.tsx` add:
```tsx
import { isEntryInstalled, statusesFor, groupByStatus } from "../lib/media";
```
In `CategoryView`, replace the local `isInstalled`:
```tsx
  const isInstalled = (e: MediaEntry) => isEntryInstalled(e, installed);
```
(The `installed` state Set and the `installedSteamAppIds` effect stay.) Note the install filter's `visible` computation already calls `isInstalled` — no change needed there.

In `MediaCard`, add `onEdit: () => void;` to the props type, and add an edit button in the `media-foot` (before the focus button):
```tsx
          <button
            className="btn ghost icon"
            title="Edit entry"
            onClick={onEdit}
          >
            {IC.edit}
          </button>
```

- [ ] **Step 5: Add CSS for the form checkbox in `MediaTracker.css`**

```css
.entry-form-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--rp-subtle);
  margin: 0.2rem 0 0.6rem;
  cursor: pointer;
}

.entry-form-check input {
  width: auto;
}
```

- [ ] **Step 6: Verify typecheck and build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both succeed.

- [ ] **Step 7: Manual smoke**

`pnpm tauri dev`: Games tab -> add a manual game with a cover URL and "Installed" checked -> shows installed dot, matches "installed" filter. Edit a Steam game's title + hours -> persists, still launches. Edit a movie's title -> persists. Close dev.

- [ ] **Step 8: Commit**

```bash
git add src/lib/icons.ts src/components/MediaModals.tsx src/components/MediaTracker.tsx src/components/MediaTracker.css
git commit -m "Add entry editing, manual installed flag, and game hours field"
```

---

### Task 5: Manage-category modal (custom statuses + guard)

**Files:**
- Modify: `src/components/MediaModals.tsx` (add `ManageCategoryModal`)
- Modify: `src/components/MediaTracker.tsx` (gear button + wiring)
- Modify: `src/components/MediaTracker.css`

**Interfaces:**
- Consumes: `canCustomizeStatuses`, `statusesFor` (Task 1); `category/update`, `category/delete` (Task 2).
- Produces: `ManageCategoryModal` with props `{ category: MediaCategory; onClose: () => void; onSave: (c: MediaCategory) => void; onDelete: () => void }`.

- [ ] **Step 1: Add `ManageCategoryModal` to `MediaModals.tsx`**

Add `canCustomizeStatuses` to the media-helper import, and add:
```tsx
export function ManageCategoryModal({
  category,
  onClose,
  onSave,
  onDelete,
}: {
  category: MediaCategory;
  onClose: () => void;
  onSave: (c: MediaCategory) => void;
  onDelete: () => void;
}) {
  const editable = canCustomizeStatuses(category.source);
  const deletable = category.source === "manual";
  const [name, setName] = useState(category.name);
  const [statuses, setStatuses] = useState<string[]>(statusesFor(category));
  const [newStatus, setNewStatus] = useState("");

  const rename = (i: number, value: string) =>
    setStatuses((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  const remove = (i: number) =>
    setStatuses((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setStatuses((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const add = () => {
    const v = newStatus.trim();
    if (!v || statuses.includes(v)) return;
    setStatuses((prev) => [...prev, v]);
    setNewStatus("");
  };

  const save = () => {
    const cleaned = statuses.map((s) => s.trim()).filter(Boolean);
    onSave({
      ...category,
      name: name.trim() || category.name,
      statuses: editable && cleaned.length ? cleaned : category.statuses,
    });
  };

  return (
    <Modal title="Manage category" onClose={onClose}>
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Statuses</label>
        {!editable && (
          <p className="manage-note">
            These statuses are fixed — they sync with AniList / TMDB.
          </p>
        )}
        <div className="manage-status-list">
          {statuses.map((s, i) => (
            <div key={i} className="manage-status-row">
              <input
                className="input"
                value={s}
                disabled={!editable}
                onChange={(e) => rename(i, e.target.value)}
              />
              {editable && (
                <>
                  <button
                    className="btn ghost icon"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    {IC.next}
                  </button>
                  <button
                    className="btn ghost icon"
                    title="Move down"
                    disabled={i === statuses.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    {IC.next}
                  </button>
                  <button
                    className="btn ghost icon danger"
                    title="Remove"
                    disabled={statuses.length <= 1}
                    onClick={() => remove(i)}
                  >
                    {IC.close}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <div className="manage-status-add">
            <input
              className="input"
              placeholder="Add a status... (Enter)"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <button className="btn" disabled={!newStatus.trim()} onClick={add}>
              {IC.plus} Add
            </button>
          </div>
        )}
      </div>
      <div className="modal-actions">
        {deletable && (
          <button
            className="btn ghost danger"
            onClick={() => {
              if (confirm(`Delete category "${category.name}" and its entries?`))
                onDelete();
            }}
          >
            Delete category
          </button>
        )}
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
```
Note: the up/down buttons reuse `IC.next` (a chevron); rotate the "up" one via the `manage-up` class added in Step 3.

- [ ] **Step 2: Wire the gear button into `MediaTracker.tsx`**

Import it:
```tsx
import { EntryDetailModal, AddCategoryModal, EntryFormModal, ManageCategoryModal } from "./MediaModals";
```
In the `MediaTracker` component (the top-level one with the tab row), add state:
```tsx
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = categories.find((c) => c.id === managingId) ?? null;
```
Add a gear button in the `media-tabs` row, right after the add-category `+` button:
```tsx
        <button
          className="btn ghost icon"
          title={`Manage ${active.name}`}
          onClick={() => setManagingId(active.id)}
        >
          {IC.gear}
        </button>
```
Add the modal render near `AddCategoryModal` at the bottom of `MediaTracker`:
```tsx
      {managing && (
        <ManageCategoryModal
          category={managing}
          onClose={() => setManagingId(null)}
          onSave={(c) => {
            dispatch({ type: "category/update", category: c });
            setManagingId(null);
          }}
          onDelete={() => {
            dispatch({ type: "category/delete", id: managing.id });
            if (activeId === managing.id) setActiveId(categories[0]?.id);
            setManagingId(null);
          }}
        />
      )}
```

- [ ] **Step 3: Add CSS in `MediaTracker.css`**

```css
.manage-note {
  font-size: 0.8rem;
  color: var(--rp-gold);
  margin: 0 0 0.4rem;
}

.manage-status-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.manage-status-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.manage-status-row .input {
  flex: 1;
  min-width: 0;
}

.manage-status-row .btn.icon {
  flex-shrink: 0;
}

.manage-status-add {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.manage-status-add .input {
  flex: 1;
  min-width: 0;
}

.manage-up {
  transform: rotate(-90deg);
}
```
Apply the rotate: on the "Move up" button add `manage-up` and on "Move down" rotate the chevron 90deg. Update the two buttons in Step 1 to:
`className="btn ghost icon manage-up"` (up) and add a `manage-down` class + `.manage-down { transform: rotate(90deg); }` (down). Both chevrons then point the right way.

- [ ] **Step 4: Verify typecheck and build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both succeed.

- [ ] **Step 5: Manual smoke**

`pnpm tauri dev`: On Games, open the gear -> remove "planning", add "Backlog", reorder, Save -> dropdowns reflect the new list; a game that had "planning" shows under "Other" and can be re-statused. On Anime, open the gear -> status inputs are disabled with the sync note; renaming the category name still works. Delete a manual category via the gear. Close dev.

- [ ] **Step 6: Commit**

```bash
git add src/components/MediaModals.tsx src/components/MediaTracker.tsx src/components/MediaTracker.css
git commit -m "Add manage-category modal with guarded custom statuses"
```

---

### Task 6: Group entries by status

**Files:**
- Modify: `src/components/MediaTracker.tsx` (CategoryView render)
- Modify: `src/components/MediaTracker.css`

**Interfaces:**
- Consumes: `groupByStatus`, `statusesFor` (Task 1).

- [ ] **Step 1: Replace the flat grid with grouped sections in `CategoryView`**

Currently `CategoryView` computes `current`/`rest` and renders `[...current, ...rest].map(...)` inside `<div className="media-grid-wrap">`. Replace the `current`/`rest` lines (~275-276) with:
```tsx
  const groups = groupByStatus(visible, statusesFor(category));
```
Replace the grid render block:
```tsx
      <div className="media-grid-wrap">
        {visible.length === 0 && (
          <p className="media-empty">
            {/* keep the existing empty-state expression unchanged */}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.status} className="media-group">
            <h3 className="media-group-head">{group.status.toLowerCase()}</h3>
            <div className="media-grid">
              {group.entries.map((e) => (
                <MediaCard
                  key={e.id}
                  entry={e}
                  hoursMode={isGames}
                  movie={isMovie}
                  installed={isGames ? isInstalled(e) : undefined}
                  onBump={() => bump(e)}
                  onLaunch={() => launch(e)}
                  onStatus={(s) => setStatus(e, s)}
                  onRate={(score) => rate(e, score)}
                  onToggleTask={(itemId) => toggleTask(e, itemId)}
                  onDetails={() => setDetailId(e.id)}
                  onEdit={() => setEditId(e.id)}
                  onDelete={() => dispatch({ type: "media/delete", id: e.id })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
```
(Keep the existing empty-state `<p className="media-empty">...</p>` content exactly as it is.)

- [ ] **Step 2: Update `MediaTracker.css` — split the scroll container from the grid**

The old `.media-grid-wrap` was itself the grid. Change it to a vertical scroll container and add the grid + group styles:
```css
.media-grid-wrap {
  overflow-y: auto;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-content: start;
}

.media-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.media-group-head {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--rp-muted);
  margin: 0;
  padding-bottom: 0.15rem;
  border-bottom: 1px solid var(--glass-border);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 0.6rem;
  align-content: start;
}
```
(The prior `grid-template-columns`/`gap` that lived on `.media-grid-wrap` now lives on `.media-grid`. The `.media-empty { grid-column: 1 / -1; }` rule can stay; the empty state now renders in the flex container and still centers fine.)

- [ ] **Step 3: Verify typecheck and build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both succeed.

- [ ] **Step 4: Manual smoke**

`pnpm tauri dev`: each tab shows labeled status sections; empty statuses are hidden; changing an entry's status moves it to the right section; the Games install filter still narrows results before grouping. Close dev.

- [ ] **Step 5: Commit**

```bash
git add src/components/MediaTracker.tsx src/components/MediaTracker.css
git commit -m "Group media entries into status sections"
```

---

### Task 7: Multi-select + bulk actions

**Files:**
- Modify: `src/components/MediaTracker.tsx` (select mode state, checkboxes, bulk bar)
- Modify: `src/components/MediaTracker.css`

**Interfaces:**
- Consumes: `statusesFor` (Task 1); `media/update`, `media/delete` (reducer).

- [ ] **Step 1: Add selection state and handlers to `CategoryView`**

Near the other `useState` hooks:
```tsx
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(visible.map((e) => e.id)));

  const bulkStatus = (status: string) => {
    for (const e of visible) {
      if (selected.has(e.id)) dispatch({ type: "media/update", entry: { ...e, status } });
    }
    clearSelection();
  };
  const bulkInstalled = (installedFlag: boolean) => {
    for (const e of visible) {
      if (selected.has(e.id))
        dispatch({ type: "media/update", entry: { ...e, installed: installedFlag || undefined } });
    }
    clearSelection();
  };
  const bulkDelete = () => {
    if (!confirm(`Delete ${selected.size} selected?`)) return;
    for (const id of selected) dispatch({ type: "media/delete", id });
    clearSelection();
  };
```

- [ ] **Step 2: Add the Select toggle to the toolbar**

At the end of `media-toolbar` (after the source-specific controls), add:
```tsx
        <button
          className={`btn ghost ${selectMode ? "active" : ""}`}
          title="Select multiple"
          onClick={() => {
            setSelectMode((v) => !v);
            clearSelection();
          }}
        >
          {IC.check} Select
        </button>
```

- [ ] **Step 3: Add the bulk action bar above the grid**

Immediately before `<div className="media-grid-wrap">`, add:
```tsx
      {selectMode && selected.size > 0 && (
        <div className="media-bulk-bar">
          <span>{selected.size} selected</span>
          <select
            className="input media-bulk-status"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkStatus(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Set status...
            </option>
            {statusesFor(category).map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
          {isGames && (
            <>
              <button className="btn ghost" onClick={() => bulkInstalled(true)}>
                Mark installed
              </button>
              <button className="btn ghost" onClick={() => bulkInstalled(false)}>
                Mark not installed
              </button>
            </>
          )}
          <button className="btn ghost danger" onClick={bulkDelete}>
            Delete
          </button>
          <button className="btn ghost" onClick={selectAll}>
            Select all
          </button>
          <button className="btn ghost" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}
```

- [ ] **Step 4: Render a selection checkbox on each card**

Pass select props into `MediaCard` in the map (Task 6's `<MediaCard ... />`):
```tsx
                  selectMode={selectMode}
                  selected={selected.has(e.id)}
                  onToggleSelected={() => toggleSelected(e.id)}
```
Add to `MediaCard`'s props type:
```tsx
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
```
At the very start of the `MediaCard` return, inside the root `div`, add the overlay checkbox and reflect the selected state on the root className:
```tsx
  return (
    <div className={`media-card status-${entry.status.toLowerCase()} ${selected ? "selected" : ""}`}>
      {selectMode && (
        <label className="media-card-select">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={onToggleSelected}
          />
        </label>
      )}
      <div className="media-card-main">
```
(The existing `media-card-main` block and the rest of the card stay unchanged.)

- [ ] **Step 5: Add CSS in `MediaTracker.css`**

```css
.media-bulk-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--rp-iris) 12%, var(--rp-overlay));
  border: 1px solid color-mix(in srgb, var(--rp-iris) 30%, transparent);
  font-size: 0.85rem;
}

.media-bulk-status {
  width: auto;
}

.media-card {
  position: relative;
}

.media-card.selected {
  border-color: var(--rp-iris);
  box-shadow: 0 0 0 1px var(--rp-iris);
}

.media-card-select {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  z-index: 2;
}

.media-card-select input {
  width: 1.1rem;
  height: 1.1rem;
  cursor: pointer;
}
```

- [ ] **Step 6: Verify typecheck and build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both succeed.

- [ ] **Step 7: Manual smoke**

`pnpm tauri dev`: click Select -> checkboxes appear; select several entries -> bulk bar shows the count; set a status -> all move to that group and selection clears; on Games, mark installed/not works; delete removes them; toggling Select off clears checkboxes. Close dev.

- [ ] **Step 8: Commit**

```bash
git add src/components/MediaTracker.tsx src/components/MediaTracker.css
git commit -m "Add multi-select bulk actions to media tracker"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `pnpm exec vitest run`
Expected: all suites in `media.test.ts` and `reducer.test.ts` PASS.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: both clean.

- [ ] **Step 3: End-to-end smoke against the spec's checklist**

`pnpm tauri dev`, then verify in one sitting:
1. Existing data intact; every tab renders grouped by status.
2. Add a manual game, mark installed -> installed dot + matches "installed" filter.
3. Edit a Steam game's title, cover, and hours -> persists; still launches.
4. Manage Games: remove "planning", add a custom status -> reflected in dropdowns; an old "planning" game appears under "Other" and can be re-statused.
5. Manage Anime and Movies -> status list read-only with the sync note.
6. Multi-select several entries -> bulk set status / delete / (games) installed all work.
7. Restart the app -> `installed`, custom `statuses`, and edits persist in `data.json`.

Note any failures and fix in the relevant task's files before proceeding.

- [ ] **Step 4: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "Finalize media tracker customization"
```

---

## Self-Review Notes

- **Spec coverage:** Feature 1 (installed) -> Task 1 helper + Task 4 UI; Feature 2 (edit) -> Task 4; Feature 3 (group by status) -> Task 1 helper + Task 6; Feature 4 (custom statuses) -> Task 1 helper + Task 2 action + Task 5 modal; Feature 5 (guard) -> Task 1 `canCustomizeStatuses` + Task 5; Feature 6 (hours) -> Task 4; Feature 7 (bulk) -> Task 7; refactor -> Tasks 2 and 3.
- **Type consistency:** `EntryFormModal` prop `{ category, entry?, onClose, onSave }` used identically in Tasks 4-6; `ManageCategoryModal` prop shape matches its Task 5 wiring; `MediaCard` gains `onEdit` (Task 4) then `selectMode`/`selected`/`onToggleSelected` (Task 7); `groupByStatus`/`statusesFor`/`isEntryInstalled`/`canCustomizeStatuses` signatures are fixed in Task 1 and consumed unchanged later.
- **Guard:** `canCustomizeStatuses` returns true only for `games`/`manual`; enforced in `ManageCategoryModal` (disabled inputs) and preserved in `save` (keeps `category.statuses` for locked sources).
