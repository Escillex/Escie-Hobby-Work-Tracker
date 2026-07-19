import type {
  AppData,
  Launcher,
  MediaCategory,
  MediaEntry,
  Todo,
  Note,
  FocusRef,
  Settings,
  Tag,
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
  | { type: "note/patch"; id: string; patch: Partial<Note> }
  | { type: "note/delete"; id: string }
  | { type: "note/delete-many"; ids: string[] }
  | { type: "vault/set-archived"; paths: string[] }
  | { type: "todo/add"; todo: Todo }
  | { type: "todo/update"; todo: Todo }
  | { type: "todo/delete"; id: string }
  | { type: "todo/delete-many"; ids: string[] }
  | { type: "tag/add"; tag: Tag }
  | { type: "tag/update"; tag: Tag }
  | { type: "tag/delete"; id: string }
  | { type: "tag/complete"; id: string; today: string }
  | { type: "tag/purge"; id: string }
  | { type: "todo/tag-many"; ids: string[]; tagId: string }
  | { type: "note/tag-many"; ids: string[]; tagId: string }
  | { type: "focus/set"; slot: "now" | "next"; ref?: FocusRef }
  | { type: "settings/update"; settings: Partial<Settings> };

/** Append the vault paths of dead linked notes so reconcile never
 *  re-imports them; the files themselves are never deleted. */
function archivePaths(
  archived: string[] | undefined,
  notes: Note[],
): string[] | undefined {
  const paths = notes.map((n) => n.vaultFile).filter((p): p is string => !!p);
  if (paths.length === 0) return archived;
  return [...new Set([...(archived ?? []), ...paths])];
}

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
    case "note/patch":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, ...action.patch } : n,
        ),
      };
    case "note/delete": {
      const dead = state.notes.find((n) => n.id === action.id);
      return {
        ...state,
        notes: state.notes.filter((n) => n.id !== action.id),
        vaultArchived: dead
          ? archivePaths(state.vaultArchived, [dead])
          : state.vaultArchived,
      };
    }
    case "note/delete-many": {
      const ids = new Set(action.ids);
      const dead = state.notes.filter((n) => ids.has(n.id));
      return {
        ...state,
        notes: state.notes.filter((n) => !ids.has(n.id)),
        vaultArchived: archivePaths(state.vaultArchived, dead),
      };
    }
    case "vault/set-archived":
      return { ...state, vaultArchived: action.paths };
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
    case "todo/delete-many": {
      const ids = new Set(action.ids);
      return { ...state, todos: state.todos.filter((t) => !ids.has(t.id)) };
    }
    case "tag/add":
      return { ...state, tags: [...state.tags, action.tag] };
    case "tag/update":
      return {
        ...state,
        tags: state.tags.map((t) => (t.id === action.tag.id ? action.tag : t)),
      };
    case "tag/delete":
      return {
        ...state,
        tags: state.tags.filter((t) => t.id !== action.id),
        todos: state.todos.map((t) =>
          t.tagIds?.includes(action.id)
            ? { ...t, tagIds: t.tagIds.filter((i) => i !== action.id) }
            : t,
        ),
        notes: state.notes.map((n) =>
          n.tagIds?.includes(action.id)
            ? { ...n, tagIds: n.tagIds.filter((i) => i !== action.id) }
            : n,
        ),
      };
    case "tag/complete":
      return {
        ...state,
        todos: state.todos.map((t) => {
          if (!t.tagIds?.includes(action.id) || t.done) return t;
          return t.recurrence === "none"
            ? { ...t, done: true }
            : { ...t, done: true, lastDone: action.today };
        }),
      };
    case "tag/purge": {
      const tagged = (ids?: string[]) => ids?.includes(action.id) ?? false;
      const deadNotes = state.notes.filter((n) => tagged(n.tagIds));
      return {
        ...state,
        tags: state.tags.filter((t) => t.id !== action.id),
        todos: state.todos.filter((t) => !tagged(t.tagIds)),
        notes: state.notes.filter((n) => !tagged(n.tagIds)),
        vaultArchived: archivePaths(state.vaultArchived, deadNotes),
      };
    }
    case "todo/tag-many": {
      const ids = new Set(action.ids);
      return {
        ...state,
        todos: state.todos.map((t) =>
          ids.has(t.id) && !t.tagIds?.includes(action.tagId)
            ? { ...t, tagIds: [...(t.tagIds ?? []), action.tagId] }
            : t,
        ),
      };
    }
    case "note/tag-many": {
      const ids = new Set(action.ids);
      return {
        ...state,
        notes: state.notes.map((n) =>
          ids.has(n.id) && !n.tagIds?.includes(action.tagId)
            ? { ...n, tagIds: [...(n.tagIds ?? []), action.tagId] }
            : n,
        ),
      };
    }
    case "focus/set":
      return { ...state, focus: { ...state.focus, [action.slot]: action.ref } };
    case "settings/update":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    default:
      return state;
  }
}
