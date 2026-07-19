# Tags for Tasks and Notes — Design

Date: 2026-07-19
Status: Approved

## Goal

Tag todos and notes with managed, colored labels ("class schedule") so a whole
group can be filtered day to day and bulk-completed or bulk-deleted when its
lifetime ends (a semester's subjects changing).

## Decisions (from brainstorming)

- **Scope:** todos and notes. Media entries keep categories/statuses; no tags.
- **Tag model:** managed tags — first-class objects created once and picked
  from a list, not free-form strings.
- **Multi-tag:** items carry an array of tag IDs; an item may have several tags.
- **Actions:** filter both views by tag; manage tags (rename, recolor); bulk
  complete all tagged todos; delete the tag alone; delete the tag with all its
  items.
- **Bulk selection:** a select mode in the Tasks and Notes views (mirroring
  the media tracker's bulk edit) for deleting or tagging many items at once,
  independent of tags.
- **Vault safety:** bulk deletion must not resurrect vault-linked notes. The
  app never deletes vault files; deleted linked notes get their paths archived
  so reconcile never re-imports them. Single `note/delete` gets the same fix —
  today a deleted linked note's file is re-imported on the next reconcile.

## Data model (`src/lib/types.ts`)

```ts
export interface Tag {
  id: string;
  name: string;
  color: RosePineColor;
}
```

- `AppData.tags: Tag[]` — new top-level list.
- `Todo.tagIds?: string[]` and `Note.tagIds?: string[]` — absent/empty means
  untagged. IDs reference `AppData.tags`; rename/recolor never touches items.
- Migration in `migrate()` (`src/lib/store.ts`): seed `tags: []` when absent,
  following the existing `!next.todos` inline pattern.

## Reducer actions (`src/lib/reducer.ts`)

- `{ type: "tag/add"; tag: Tag }` — append.
- `{ type: "tag/update"; tag: Tag }` — replace by ID (rename/recolor).
- `{ type: "tag/delete"; id: string }` — remove the tag and strip its ID from
  every todo's and note's `tagIds`. Items survive.
- `{ type: "tag/complete"; id: string; today: string }` — mark every tagged todo done:
  one-offs get `done: true`; recurring todos get `done: true, lastDone: today`
  (the action carries `today` so the reducer stays pure). Notes untouched.
- `{ type: "tag/purge"; id: string }` — remove the tag, delete every todo and
  note whose `tagIds` includes it, and append the `vaultFile` paths of deleted
  linked notes to `vaultArchived` (deduplicated). Items carrying other tags in
  addition to this one are still deleted — the tag marks them as belonging to
  the purged group.
- `note/delete` change: when the deleted note has a `vaultFile`, append that
  path to `vaultArchived` (deduplicated), closing the resurrect-on-reconcile
  gap for single deletes.
- `{ type: "todo/delete-many"; ids: string[] }` and
  `{ type: "note/delete-many"; ids: string[] }` — bulk deletion; the note
  variant archives vault paths exactly like `tag/purge`.
- `{ type: "todo/tag-many"; ids: string[]; tagId: string }` and
  `{ type: "note/tag-many"; ids: string[]; tagId: string }` — add the tag to
  every selected item's `tagIds` (deduplicated), for retro-tagging existing
  items in bulk.

All logic is pure and covered in `src/lib/reducer.test.ts`.

## UI

### Assigning tags

- A tag picker popover, one shared component (`src/components/TagPicker.tsx`):
  lists existing tags as colored chips with membership toggles, plus a
  "+ new tag" inline text input that creates a tag with a default color
  (`iris`) and immediately assigns it.
- Opened from: a small tag button in the Tasks add-row (tags applied to the
  todo being created), a tag button on each task row (edits that todo's
  `tagIds`), and a tag button in the note editor (edits that note's `tagIds`).

### Displaying and filtering

- Task rows and note list entries show their tags as small colored chips.
- A filter chip row — "all" plus one chip per tag — sits above the Tasks
  view lists and the Notes view list. Clicking a chip shows only items
  carrying that tag; "all" resets. Filter state is local `useState`, not
  persisted. The dashboard TasksWidget does not filter (space).

### Bulk selection

- A "Select" toggle in the Tasks view and Notes view headers (same pattern as
  the media tracker's bulk edit). In select mode each row/card shows a
  checkbox; a floating action bar shows the count plus two actions:
  - **Delete (n)** — inline confirm, then dispatches the matching
    `*/delete-many`.
  - **Tag** — opens the shared `TagPicker`; choosing a tag dispatches
    `*/tag-many` for the selection.
- Leaving select mode clears the selection. Selection state is local
  `useState`, never persisted.

### Managing (SettingsPanel, "Tags" section)

Each tag row: name input (rename on blur), the existing `ColorPicker`, and
three actions:

- **Complete all** — dispatches `tag/complete`; shows the count of affected
  todos in the button title.
- **Delete tag** — dispatches `tag/delete`; items keep living untagged.
- **Delete tag + items** — shows an inline confirm stating how many todos and
  notes will be deleted (and that vault files stay in Obsidian); on confirm
  dispatches `tag/purge`.

Plus an "add tag" input at the bottom of the section.

## Error handling

- Stale `tagIds` (tag no longer exists) render as nothing and are ignored by
  filters; `tag/delete`/`tag/purge` strip them so they don't accumulate.
- Creating a tag with an empty or whitespace name is a no-op.
- `tag/complete` with zero tagged todos is a harmless no-op.

## Testing (`src/lib/reducer.test.ts`)

- `tag/add`, `tag/update` basics.
- `tag/delete`: tag gone, IDs stripped from todos and notes, items intact.
- `tag/complete`: one-off marked done; recurring gets `lastDone`; already-done
  and untagged items untouched.
- `tag/purge`: tagged todos and notes deleted, untagged survive, multi-tagged
  items deleted, vault paths of deleted linked notes appended to
  `vaultArchived` without duplicates.
- `note/delete`: linked note's path archived; unlinked note leaves
  `vaultArchived` unchanged.
- `todo/delete-many` / `note/delete-many`: listed items gone, others intact,
  note variant archives linked paths; unknown IDs ignored.
- `todo/tag-many` / `note/tag-many`: tag added once, existing tags kept, no
  duplicate IDs when an item already has the tag.
