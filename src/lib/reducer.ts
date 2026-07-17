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
  | { type: "note/patch"; id: string; patch: Partial<Note> }
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
    case "note/patch":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, ...action.patch } : n,
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
