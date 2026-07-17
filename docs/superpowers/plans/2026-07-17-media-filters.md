# Media Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each media tab narrow its visible entries by status, title substring, and rating, AND-combined, applied before status grouping.

**Architecture:** A pure `filterEntries` helper in `src/lib/media.ts` (vitest-covered) does all predicate work; `CategoryView` in `MediaTracker.tsx` holds ephemeral `MediaFilter` state and renders a filter row of two dropdowns and a search input between the toolbar and the bulk bar. The filter slots into the existing pipeline: install filter -> `filterEntries` -> `groupByStatus`.

**Tech Stack:** React 19 + TypeScript (strict, `noUnusedLocals: true`), vitest (Node env, pure logic only), plain CSS.

Spec: `docs/superpowers/specs/2026-07-17-media-filters-design.md`

## Global Constraints

- NO emojis anywhere: code, UI copy, commit messages.
- NO `Co-Authored-By` trailer on commits.
- No hardcoded personal defaults or seed data.
- `pnpm exec tsc --noEmit` and `pnpm exec vite build` must pass after every task.
- Filters are ephemeral per-tab component state — no persistence, no new fields in `src/lib/types.ts`.
- The special status filter value `"Other"` matches `groupByStatus`'s trailing section label exactly (capital O).

---

### Task 1: `filterEntries` pure helper + tests

**Files:**
- Modify: `src/lib/media.ts` (append at end of file)
- Test: `src/lib/media.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `MediaEntry` from `./types` (already imported in `media.ts`).
- Produces: `interface MediaFilter { status: string | null; query: string; minRating: number | null }` and `function filterEntries(entries: MediaEntry[], filter: MediaFilter, statuses: string[]): MediaEntry[]` — Task 2 imports both from `../lib/media`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/media.test.ts` (it already has `entry()`/`cat()` factories at the top — reuse `entry`). Add `filterEntries` to the existing `./media` import at the top of the file, and add this describe block at the end:

```ts
describe("filterEntries", () => {
  const all = { status: null, query: "", minRating: null };
  const es = [
    entry({ id: "1", title: "Hades", status: "Playing", score: 5 }),
    entry({ id: "2", title: "Hollow Knight", status: "Backlog", score: 3 }),
    entry({ id: "3", title: "Celeste", status: "WEIRD" }),
  ];
  const statuses = ["Playing", "Backlog"];

  it("passes everything through with the empty filter", () => {
    expect(filterEntries(es, all, statuses)).toHaveLength(3);
  });
  it("filters by exact status", () => {
    const r = filterEntries(es, { ...all, status: "Playing" }, statuses);
    expect(r.map((e) => e.id)).toEqual(["1"]);
  });
  it("resolves Other to statuses outside the category list", () => {
    const r = filterEntries(es, { ...all, status: "Other" }, statuses);
    expect(r.map((e) => e.id)).toEqual(["3"]);
  });
  it("matches title case-insensitively as a substring", () => {
    const r = filterEntries(es, { ...all, query: "  hOLLoW " }, statuses);
    expect(r.map((e) => e.id)).toEqual(["2"]);
  });
  it("filters by minimum rating and treats 0 as unrated-only", () => {
    expect(
      filterEntries(es, { ...all, minRating: 4 }, statuses).map((e) => e.id),
    ).toEqual(["1"]);
    expect(
      filterEntries(es, { ...all, minRating: 0 }, statuses).map((e) => e.id),
    ).toEqual(["3"]);
  });
  it("ANDs filters together", () => {
    const r = filterEntries(
      es,
      { status: "Playing", query: "hades", minRating: 5 },
      statuses,
    );
    expect(r.map((e) => e.id)).toEqual(["1"]);
    expect(
      filterEntries(es, { status: "Backlog", query: "hades", minRating: null }, statuses),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/media.test.ts`
Expected: FAIL — `filterEntries` is not exported from `./media`.

- [ ] **Step 3: Implement `filterEntries`**

Append to `src/lib/media.ts`:

```ts
export interface MediaFilter {
  /** null = all statuses; "Other" = statuses outside the category's list. */
  status: string | null;
  /** Case-insensitive title substring; empty disables. */
  query: string;
  /** null = any; 0 = unrated only; 1-5 = score >= n. */
  minRating: number | null;
}

/** Narrow entries by status, title substring, and rating (AND-combined). */
export function filterEntries(
  entries: MediaEntry[],
  filter: MediaFilter,
  statuses: string[],
): MediaEntry[] {
  const q = filter.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (filter.status != null) {
      if (filter.status === "Other") {
        if (statuses.includes(e.status)) return false;
      } else if (e.status !== filter.status) {
        return false;
      }
    }
    if (q && !e.title.toLowerCase().includes(q)) return false;
    if (filter.minRating != null) {
      if (filter.minRating === 0) {
        if (e.score != null) return false;
      } else if (e.score == null || e.score < filter.minRating) {
        return false;
      }
    }
    return true;
  });
}
```

- [ ] **Step 4: Run the full suite to verify green**

Run: `pnpm exec vitest run`
Expected: all tests pass (12 existing + 6 new).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm exec tsc --noEmit` — expected clean.

```bash
git add src/lib/media.ts src/lib/media.test.ts
git commit -m "Add filterEntries helper for media view filters"
```

---

### Task 2: Filter row UI in CategoryView

**Files:**
- Modify: `src/components/MediaTracker.tsx`
- Modify: `src/components/MediaTracker.css`

**Interfaces:**
- Consumes: `filterEntries`, `MediaFilter` from `../lib/media` (Task 1); existing `statusesFor`, `groupByStatus` already imported in `MediaTracker.tsx`.
- Produces: nothing consumed later.

- [ ] **Step 1: Add filter state and rework the visible pipeline**

In `CategoryView`, next to the other `useState` hooks (after the `selected` Set state, ~line 142):

```tsx
  const [filter, setFilter] = useState<MediaFilter>({
    status: null,
    query: "",
    minRating: null,
  });
```

Add `filterEntries` and the `MediaFilter` type to the existing `../lib/media` import:

```tsx
import {
  toggleChecklistItem,
  isEntryInstalled,
  groupByStatus,
  statusesFor,
  filterEntries,
  type MediaFilter,
} from "../lib/media";
```

Replace the current pipeline (`MediaTracker.tsx:306-314`):

```tsx
  const visible =
    isGames && installFilter !== "all"
      ? entries.filter((e) =>
          installFilter === "installed" ? isInstalled(e) : !isInstalled(e),
        )
      : entries;

  const statuses = statusesFor(category);
  const groups = groupByStatus(visible, statuses);
```

with:

```tsx
  const installFiltered =
    isGames && installFilter !== "all"
      ? entries.filter((e) =>
          installFilter === "installed" ? isInstalled(e) : !isInstalled(e),
        )
      : entries;

  const statuses = statusesFor(category);
  const hasOther = installFiltered.some((e) => !statuses.includes(e.status));
  const visible = filterEntries(installFiltered, filter, statuses);
  const groups = groupByStatus(visible, statuses);
```

`visible` keeps its name so `selectAll`, the bulk handlers, and the grid all keep working against the filtered set unchanged.

- [ ] **Step 2: Render the filter row**

Immediately after the closing `</div>` of `media-toolbar` and before the `{selectMode && selected.size > 0 && (` bulk-bar block, add:

```tsx
      {entries.length > 0 && (
        <div className="media-filter-row">
          <select
            className="input media-filter-status"
            value={filter.status ?? ""}
            onChange={(e) => setFilter({ ...filter, status: e.target.value || null })}
          >
            <option value="">all statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
            {hasOther && <option value="Other">other</option>}
          </select>
          <input
            className="input media-filter-query"
            placeholder="Filter by title"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
          <select
            className="input media-filter-rating"
            value={filter.minRating == null ? "" : String(filter.minRating)}
            onChange={(e) =>
              setFilter({
                ...filter,
                minRating: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          >
            <option value="">any rating</option>
            <option value="5">5</option>
            <option value="4">4+</option>
            <option value="3">3+</option>
            <option value="2">2+</option>
            <option value="1">1+</option>
            <option value="0">unrated</option>
          </select>
        </div>
      )}
```

- [ ] **Step 3: Generalize the empty-state message**

The empty-state paragraph (`MediaTracker.tsx:429-440`) currently special-cases only Games for "no matches". Replace its inner expression so any tab with entries that filters hid shows a filter message:

```tsx
        {visible.length === 0 && (
          <p className="media-empty">
            {entries.length > 0
              ? "Nothing matches the current filters."
              : isAniList
                ? "Search above to add something, or hit Sync to pull your AniList."
                : isGames
                  ? "Search games, import your Steam library, or add one manually."
                  : isTmdb
                    ? `Search for a ${isMovie ? "movie" : "show"} above, or add one manually.`
                    : "Nothing here yet — add your first one."}
          </p>
        )}
```

(The old games-only `entries.length > 0 ? "No games match this filter." : ...` branch is subsumed by the general first case — note the install filter also routes through this message now, which is correct.)

- [ ] **Step 4: Add CSS**

Append to `src/components/MediaTracker.css`:

```css
.media-filter-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.media-filter-status,
.media-filter-rating {
  width: auto;
}

.media-filter-query {
  flex: 1;
  min-width: 8rem;
  max-width: 16rem;
}
```

- [ ] **Step 5: Verify typecheck, build, tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build && pnpm exec vitest run`
Expected: all clean, 18/18 tests.

- [ ] **Step 6: Manual smoke**

`pnpm tauri dev`: filter row appears on tabs with entries; picking a status shows only that section; typing narrows titles live; "4+" hides low/unrated; combined filters AND together; with filters active, Select-all only grabs visible cards; clearing filters restores everything; switching tabs resets filters. (If you cannot drive the GUI in this session, skip and note it — verify via typecheck/build instead.)

- [ ] **Step 7: Commit**

```bash
git add src/components/MediaTracker.tsx src/components/MediaTracker.css
git commit -m "Add status, title, and rating filters to media tabs"
```
