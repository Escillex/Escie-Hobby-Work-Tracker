# Media Filters — Design

Date: 2026-07-17

## Context

The media tracker groups each tab's entries into labeled status sections, and
Games has an all/installed/not-installed filter. There is no way to narrow the
view further: to one status, to titles matching a search, or by rating. The
user wants all three.

Decisions from brainstorming:

- Status filter is a **dropdown** (scales to custom status lists), not pills.
- Filters are **per-tab and ephemeral** — plain component state in
  `CategoryView` (which is keyed by category id), reset on tab switch, never
  persisted. No data-model changes.
- Filters combine with **AND** semantics and run **before grouping**, in the
  same pipeline as the install filter.

## Pipeline

```
entries -> install filter (Games only) -> status/search/rating filter -> groupByStatus
```

Section headers therefore always reflect what is visible, the existing
empty-state paragraph covers "filters matched nothing", and bulk-select's
"Select all" (which reads `visible`) only grabs filtered entries — consistent
with how the install filter already behaves.

## Pure helper (`src/lib/media.ts`)

```ts
export interface MediaFilter {
  status: string | null;   // null = all; "Other" = statuses outside the category list
  query: string;           // "" = no title filter
  minRating: number | null; // null = any; 0 = unrated only; 1-5 = score >= n
}

export function filterEntries(
  entries: MediaEntry[],
  filter: MediaFilter,
  statuses: string[],       // statusesFor(category), used to resolve "Other"
): MediaEntry[]
```

- `status`: keep entries whose `status` equals the value; the special value
  `"Other"` keeps entries whose status is **not** in `statuses` (mirrors
  `groupByStatus`'s trailing section).
- `query`: case-insensitive substring match on `entry.title` (trimmed; empty
  string disables).
- `minRating`: `0` keeps entries with no `score`; `1`-`5` keeps
  `score != null && score >= n`.
- Imports only from `./types`; covered by vitest.

## UI (`src/components/MediaTracker.tsx` + `.css`)

A `media-filter-row` under the toolbar (rendered whenever the tab has
entries), holding:

- **Status dropdown** — options: "all statuses", each of
  `statusesFor(category)` lowercased, and "other" only when at least one entry
  has a status outside the list.
- **Search input** — placeholder "Filter by title", value bound to state.
- **Rating dropdown** — "any rating", "5", "4+", "3+", "2+", "1+", "unrated".

State: `const [filter, setFilter] = useState<MediaFilter>({ status: null, query: "", minRating: null })`.
`visible` becomes `filterEntries(installFiltered, filter, statuses)`.

The row reuses existing `input`/`btn` styling; CSS adds only the flex-row
layout and compact widths.

## Testing

- Vitest for `filterEntries`: each filter alone, AND combination, "Other"
  resolution, unrated (`minRating: 0`), case-insensitive query.
- Manual smoke: pick a status -> only that section renders; type a title
  fragment -> cards narrow; 4+ -> low/unrated cards vanish; combined filters;
  "Select all" while filtered only selects visible entries.

## Out of scope

- Persisting filters across restarts or tab switches.
- Sorting controls (grouping order already follows the status list).
