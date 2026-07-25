import type { AppData, FocusRef, Note, Todo } from "./types";
import { migrateScheduling } from "./schedule";

/** Add anything newer app versions expect that older data files lack. */
export function migrate(data: AppData): AppData {
  let next = data;
  if (!next.media.categories.some((c) => c.source === "games")) {
    next = {
      ...next,
      media: {
        ...next.media,
        categories: [
          ...next.media.categories,
          { id: "games", name: "Games", source: "games" },
        ],
      },
    };
  }
  if (!next.todos) {
    next = { ...next, todos: [] };
  }
  if (!next.notes) {
    next = { ...next, notes: [] };
  }
  if (!next.tags) {
    next = { ...next, tags: [] };
  }
  if (!next.focus) {
    next = { ...next, focus: { next: [] } };
  }
  if (!next.time) {
    next = { ...next, time: {} };
  }
  // Impulses merged into notes — each impulse becomes a titled note.
  const legacy = (next as { impulses?: { id: string; text: string; createdAt: string }[] })
    .impulses;
  if (legacy?.length) {
    const migrated: typeof next.notes = legacy.map((i) => ({
      id: i.id,
      title: i.text,
      body: "",
      createdAt: i.createdAt,
      updatedAt: i.createdAt,
    }));
    const copy = { ...next, notes: [...migrated, ...next.notes] };
    delete (copy as Record<string, unknown>).impulses;
    next = copy;
  } else if ("impulses" in next) {
    const copy = { ...next };
    delete (copy as Record<string, unknown>).impulses;
    next = copy;
  }
  // Movies/TV moved from manual entry to TMDB-backed search.
  const needsTmdb = next.media.categories.some(
    (c) => (c.id === "movies" || c.id === "tv") && c.source === "manual",
  );
  if (needsTmdb) {
    next = {
      ...next,
      media: {
        ...next.media,
        categories: next.media.categories.map((c) => {
          if (c.id === "movies" && c.source === "manual")
            return { ...c, source: "tmdb-movie" as const };
          if (c.id === "tv" && c.source === "manual")
            return { ...c, source: "tmdb-tv" as const };
          return c;
        }),
      },
    };
  }
  // The dopamine menu was removed; drop its stale key from old data files.
  if ("dopamine" in next) {
    const copy = { ...next };
    delete (copy as Record<string, unknown>).dopamine;
    next = copy;
  }
  // Older todos predate the recurrence field.
  if (next.todos.some((t) => t.recurrence === undefined)) {
    next = {
      ...next,
      todos: next.todos.map((t) =>
        t.recurrence === undefined ? { ...t, recurrence: "none" as const } : t,
      ),
    };
  }
  // Per-todo early-warning fields moved to one global setting.
  next = migrateScheduling(next);
  // Multi-tag items collapse to one tag (first wins) — tags v2.
  type LegacyTagged = { tagIds?: string[] };
  const collapse = <T extends Todo | Note>(item: T): T => {
    const legacyItem = item as T & LegacyTagged;
    if (!legacyItem.tagIds) return item;
    const { tagIds, ...rest } = legacyItem;
    const first = item.tagId ?? tagIds[0];
    return (first ? { ...rest, tagId: first } : rest) as T;
  };
  if (
    next.todos.some((t) => (t as LegacyTagged).tagIds) ||
    next.notes.some((n) => (n as LegacyTagged).tagIds)
  ) {
    next = {
      ...next,
      todos: next.todos.map(collapse),
      notes: next.notes.map(collapse),
    };
  }
  // The single `next` focus slot became an ordered queue.
  const legacyNext = (next.focus as { next?: FocusRef | FocusRef[] }).next;
  if (!Array.isArray(legacyNext)) {
    next = {
      ...next,
      focus: { ...next.focus, next: legacyNext ? [legacyNext] : [] },
    };
  }
  return next;
}
