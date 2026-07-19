# Tags v2: single tag, colors, manage mode

**Date:** 2026-07-20
**Status:** Approved design

## Goal

Make tags visually scannable and manageable in place. Each todo/note holds at
most one tag; the tag's color appears as a left edge bar on rows; tags are
created, renamed, recolored, and deleted from the filter row itself via a
combined "Manage" mode; the filter row is collapsible.

## Data model

- `Todo.tagIds?: string[]` → `Todo.tagId?: string`
- `Note.tagIds?: string[]` → `Note.tagId?: string`
- `Tag` unchanged: `{ id, name, color: RosePineColor }` — color finally gets UI.
- `Settings.tagRowCollapsed?: boolean` — persisted collapse state, shared by
  the tasks and notes views.
- `migrate()` step: each item's `tagIds` becomes `tagId = tagIds[0]`; the
  `tagIds` key is deleted. Items with empty/absent `tagIds` get no `tagId`.

## Reducer actions

- `tag/add`, `tag/update`, `tag/delete`, `tag/complete`, `tag/purge` keep
  their names; item-facing logic switches from `tagIds` arrays to the single
  `tagId` (delete/purge clear or match `tagId`).
- `todo/tag-many` / `note/tag-many` set (replace) `tagId` on the given ids.
  Bulk Tag in the bulk bar therefore *replaces* the tag on selected items.
- `todo/update` / `note/patch` carry `tagId` like any other field for
  single-item assignment.

## Tag picker (assignment only)

- Radio behavior: clicking a chip assigns that tag (replacing the current
  one); clicking the item's active chip clears it.
- The "New tag…" row gains the six Rosé Pine swatches (reuse `ColorPicker`);
  creating a tag uses the chosen color and assigns it to the item.
- No editing UI in the picker — editing lives on the filter row.

## Row visual

- Task rows and note list items show a 3px left edge bar in the tag's color.
- Inline name chips (`TagChips`) are removed from rows; the tag name is
  available as a tooltip on the row.
- Overdue tasks keep the existing red (love) left bar; overdue wins over the
  tag color when both apply.

## Filter row

- Chips: `all | <tag> | <tag>`, as today, with each chip in its tag's color.
- **Collapsible:** a small toggle at the row's left end hides the chips.
  Collapsed with an active filter, the toggle shows a dot in the active tag's
  color. State persists via `settings.tagRowCollapsed`.
- With zero tags the row keeps the discoverability hint (added earlier) when
  expanded.

## Manage mode

- The ✓ Select button (tasks header, notes header) is renamed **Manage**.
- Toggling it on:
  - shows selection checkboxes on rows and the bulk bar (`N selected ·
    Delete · Tag`), as select mode does today;
  - switches the filter row into manage state: the `all` chip becomes a
    **+** button (create: name input + swatches in a popover), and a single
    click on a chip opens the tag editor instead of filtering;
  - temporarily expands the filter row if it was collapsed.
- **Tag editor popover** (anchored to the chip, portaled like the tag
  picker): name input, six color swatches, Delete, Save. Delete untags items
  but never deletes them (`tag/delete`); `tag/purge` stays reducer-only.
- **Double-click shortcut:** outside manage mode, double-clicking a chip
  opens the same editor. Single click still filters; when a double-click is
  detected, the filter state from before the first click is restored so
  opening the editor never changes the active filter.

## Testing

- Reducer tests: single-tag assign/replace/clear, `tag/delete` clearing
  `tagId`, bulk `tag-many` replace semantics, `tag/update` color change.
- Migration test for `tagIds → tagId` (multi-tag items keep the first).
- UI (popover, collapse, manage mode) stays untested per project convention.

## Out of scope

- Tags on media entries.
- Multi-tag support (removed deliberately).
- Settings-panel tag management (superseded by manage mode).
