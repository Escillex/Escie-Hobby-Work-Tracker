# Media Tracker Customization — Design

Date: 2026-07-16

## Context

Hyperfocus Dash's Media Tracker (`src/components/MediaTracker.tsx`) shows
category tabs (Anime, Manga, Movies, TV, Games, plus user-added ones). Each tab
lists `MediaEntry` cards with a cover, progress, rating, a status dropdown, and a
notes/checklist detail modal. Entries come from AniList (anime/manga), TMDB
(movies/tv), Steam (games), or manual entry.

Current gaps this design fills:

1. Only Steam-detected games can show as "installed" — manually added games can't.
2. There is no way to edit an entry after adding it (fix a wrong title, set a
   custom cover image, adjust total, etc.).
3. Entries render as one flat grid — no grouping.
4. The status set is the global `MEDIA_STATUSES` for every category; a game tab
   still offers "planning", which the user doesn't want.
5. Statuses can't be customized per category, and there's no guard keeping the
   AniList-synced categories on their required status set.
6. Game hours are stored (Steam auto-fills `progress = playtime/60`) and
   displayed, but can't be edited by hand.
7. No way to act on several entries at once (e.g. mark five games completed).

`MediaTracker.tsx` is already ~1,100 lines; this work extracts the modals and
shared helpers so the additions don't bloat one file.

## Data model (`src/lib/types.ts`)

- `MediaEntry.installed?: boolean` — manual "installed on this machine" override.
- `MediaCategory.statuses?: string[]` — ordered, per-category status list. When
  unset, the category falls back to the canonical `MEDIA_STATUSES`.
- `MediaEntry.status` widens from `MediaStatus` to `string`. Custom statuses are
  free-form labels. `MEDIA_STATUSES` remains the canonical set used by locked
  categories, add-defaults, and the AniList/TMDB sync boundary.
- Hours: **no new field** — games already store hours in `progress`.

No migration beyond the additive type changes. Existing data keeps working via
the canonical-status fallback; nothing is seeded (avoids orphaned statuses on
load and avoids hardcoded personal defaults).

## Shared helpers (`src/lib/media.ts`, new)

- `statusesFor(category: MediaCategory): string[]` → `category.statuses ?? MEDIA_STATUSES`.
- `canCustomizeStatuses(source: CategorySource): boolean` →
  `source === "games" || source === "manual"`. Only these lack a status-relevant
  external sync. AniList (anime/manga) pushes the status field; TMDB (movies/tv)
  maps status to its watchlist/rated state in `tmdbSyncPull` — so all four are
  locked to the canonical set.
- `isEntryInstalled(entry, detected: Set<number> | null): boolean` →
  `entry.installed === true || (entry.steamAppId != null && (detected?.has(entry.steamAppId) ?? false))`.
- `groupByStatus(entries, statuses): { status: string; entries: MediaEntry[] }[]`
  — sections in `statuses` order, empty sections dropped, any entry whose status
  is not in `statuses` collected into a trailing `"Other"` section so nothing
  disappears.

## Feature 1 — Installed for custom games

`CategoryView` uses `isEntryInstalled` in place of its local `isInstalled`, so a
manually toggled `installed` flag counts alongside Steam detection. The existing
all / installed / not filter and the `installed-dot` on the card both pick it up.
The toggle itself lives in the edit modal (Feature 2) and bulk bar (Feature 7).

## Feature 2 — Edit an entry

Generalize `ManualEntryModal` into an add/edit `EntryFormModal`:

- Opened for **add** (empty) from the toolbar's Add button, or for **edit** from
  a new pencil button on each card.
- Fields: title, cover URL (custom picture), total, status (from
  `statusesFor(category)`), and — for games — launch command, hours, installed.
- Edit mode dispatches `media/update`, preserving `id`, `anilistId`,
  `tmdbId`/`tmdbType`, `steamAppId`, `seasons`, `notes`, `checklist`, `score`.
  Edits are local only — no push to AniList/TMDB/Steam.
- Works for any entry regardless of source (a Steam game with a wrong scraped
  title, an AniList entry you want a custom cover on, etc.).

## Feature 3 — Group by status

Replace the flat `[...current, ...rest]` grid with `groupByStatus`. Each non-empty
status becomes a labeled section (header styled like the status pills, lowercased)
followed by that status's cards in existing order. For Games the install filter
runs first, then grouping. The old CURRENT/REPEATING-first behavior is subsumed
(CURRENT leads the canonical order already).

## Feature 4 — Custom statuses per category

`statusesFor(category)` drives every status dropdown (card + edit modal + bulk
bar), the grouping order, and the default status of newly added entries
(`statusesFor(category)[0]`).

New **Manage category** modal, opened from a gear button on the active tab:

- Rename the category's display name (cosmetic, allowed for any category).
- Edit the status list: add, remove, rename, reorder (up/down). Editable only
  when `canCustomizeStatuses(category.source)` (Games and manual categories).
- Delete the category (with its entries) — manual categories only, matching the
  existing right-click delete, which stays as a shortcut.

Assigning a status to an entry is always available (the card/edit/bulk status
dropdowns), including for synced categories — only the status *definitions* are
locked there.

Robustness:

- A card's status `<select>` always includes the entry's own current value even
  if it was removed from the category's list, so an orphaned entry stays
  changeable (and also shows in the grouping's "Other" section).
- The reducer's `COMPLETED → completedAt` stamping still keys on the canonical
  `"COMPLETED"` label. Custom status sets without a `COMPLETED` simply don't
  auto-stamp — acceptable for hours-based games with no `total`.

Reducer gains `category/update` (`{ type: "category/update"; category: MediaCategory }`).

## Feature 5 — Guard (sync-backed categories lock status definitions)

Any category with a relevant sync function keeps the canonical `MEDIA_STATUSES`
and cannot have its status definitions edited:

- Anime, Manga (`anilist-*`) — status is pushed to AniList, which requires the
  exact status set.
- Movies, TV (`tmdb-*`) — `tmdbSyncPull` maps status to TMDB watchlist/rated
  (rated → COMPLETED, watchlist → PLANNING), so renaming/removing those would
  break the round-trip.

The Manage modal renders their status list read-only with a short note ("These
statuses are fixed — they sync with AniList / TMDB."). Only **Games** and manual
categories get add/remove/rename/reorder of statuses. Assigning a status to an
individual entry stays available everywhere.

## Feature 6 — Game hours

Add a manual **hours** field (games only) to `EntryFormModal`, editing `progress`.
Steam auto-fill on import and the `N h` card display already exist and are
unchanged. No auto-complete for games (no `total`).

## Feature 7 — Multi-select + bulk actions

- A **Select** toggle in the toolbar puts the tab into selection mode; each card
  shows a checkbox. Selection is a `Set<string>` in `CategoryView` state,
  ephemeral (not persisted), and scoped to the active tab.
- When ≥1 entry is selected, a **bulk action bar** appears with: count, a change-
  status dropdown (from `statusesFor(category)`, applied to all selected via
  `media/update`), delete selected, set installed / not (Games only), select-all,
  and clear.
- Because statuses are per-category, selection resets when the tab changes
  (component is keyed by category id already).

## Structure / refactor

Extract from `MediaTracker.tsx` to keep files focused:

- `src/components/MediaModals.tsx` — `EntryFormModal`, `EntryDetailModal`,
  `AddCategoryModal`, `ManageCategoryModal`.
- `src/lib/media.ts` — the helpers listed above.

`MediaTracker.tsx` keeps `MediaTracker`, `CategoryView`, `MediaCard`, the search
boxes, and the new bulk bar / select wiring. CSS additions go in
`MediaTracker.css`.

## Verification

1. `pnpm exec tsc --noEmit` clean; `pnpm exec vite build` clean.
2. `pnpm tauri dev` — app launches, existing data intact, all tabs render.
3. Add a manual game, mark it installed → it shows the installed dot and matches
   the "installed" filter.
4. Edit a Steam game's title and cover → persists, Steam link/hours preserved.
5. Games tab renders grouped by status; remove "planning" from the Games status
   list in Manage category → planning is gone from dropdowns; a game that still
   had it appears under "Other" and can be re-statused.
6. Manage category on Anime and on Movies → status list is read-only with the
   note; Games and a manual category allow full status editing.
7. Edit a game's hours by hand → persists and displays as `N h`.
8. Select several entries, bulk-set a status → all move to that group; bulk delete
   removes them.
9. Restart the app → `installed` flags, custom `statuses`, and edits persist in
   `data.json`.

## Out of scope

- Pushing edited titles/covers/statuses back to AniList/TMDB (edits stay local).
- Seeding game-specific default status sets (user customizes per taste).
- Persisting selection or sort/group preferences across restarts.
