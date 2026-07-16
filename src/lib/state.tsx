import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
  type Dispatch,
} from "react";
import type {
  AppData,
  Launcher,
  Impulse,
  ImpulseStatus,
  MediaCategory,
  MediaEntry,
  DopamineItem,
  Todo,
  Settings,
} from "./types";
import { localDate, uid } from "./types";
import { loadData, saveData } from "./store";

export type Action =
  | { type: "hydrate"; data: AppData }
  | { type: "launcher/add"; launcher: Launcher }
  | { type: "launcher/update"; launcher: Launcher }
  | { type: "launcher/delete"; id: string }
  | { type: "impulse/add"; text: string }
  | { type: "impulse/setStatus"; id: string; status: ImpulseStatus }
  | { type: "impulse/delete"; id: string }
  | { type: "category/add"; category: MediaCategory }
  | { type: "category/delete"; id: string }
  | { type: "media/replaceCategory"; categoryId: string; entries: MediaEntry[] }
  | { type: "media/add"; entry: MediaEntry }
  | { type: "media/update"; entry: MediaEntry }
  | { type: "media/delete"; id: string }
  | { type: "dopamine/add"; item: DopamineItem }
  | { type: "dopamine/delete"; id: string }
  | { type: "todo/add"; todo: Todo }
  | { type: "todo/update"; todo: Todo }
  | { type: "todo/delete"; id: string }
  | { type: "settings/update"; settings: Partial<Settings> };

function reducer(state: AppData, action: Action): AppData {
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
    case "impulse/add": {
      const impulse: Impulse = {
        id: uid(),
        text: action.text,
        createdAt: new Date().toISOString(),
        status: "parked",
      };
      return { ...state, impulses: [impulse, ...state.impulses] };
    }
    case "impulse/setStatus":
      return {
        ...state,
        impulses: state.impulses.map((i) => {
          if (i.id === action.id) {
            return {
              ...i,
              status: action.status,
              completedAt:
                action.status === "done" ? new Date().toISOString() : undefined,
            };
          }
          // NOW and NEXT are single slots — demote any current holder back to parked.
          if (
            (action.status === "now" || action.status === "next") &&
            i.status === action.status
          ) {
            return { ...i, status: "parked" };
          }
          return i;
        }),
      };
    case "impulse/delete":
      return {
        ...state,
        impulses: state.impulses.filter((i) => i.id !== action.id),
      };
    case "category/add":
      return {
        ...state,
        media: {
          ...state.media,
          categories: [...state.media.categories, action.category],
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
    case "dopamine/add":
      return { ...state, dopamine: [...state.dopamine, action.item] };
    case "dopamine/delete":
      return {
        ...state,
        dopamine: state.dopamine.filter((d) => d.id !== action.id),
      };
    case "todo/add":
      return { ...state, todos: [...state.todos, action.todo] };
    case "todo/update":
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === action.todo.id ? action.todo : t)),
      };
    case "todo/delete":
      return { ...state, todos: state.todos.filter((t) => t.id !== action.id) };
    case "settings/update":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    default:
      return state;
  }
}

interface Ctx {
  data: AppData;
  dispatch: Dispatch<Action>;
  hydrated: boolean;
}

const AppContext = createContext<Ctx | null>(null);

const EMPTY: AppData = {
  launchers: [],
  impulses: [],
  media: { categories: [], entries: [] },
  dopamine: [],
  todos: [],
  stats: { lastOpenedDate: localDate(), streak: 0 },
  settings: { githubUser: "" },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, EMPTY);
  const hydrated = useRef(false);
  const saveTimer = useRef<number>(undefined);

  useEffect(() => {
    loadData().then((d) => {
      dispatch({ type: "hydrate", data: d });
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveData(data).catch(console.error);
    }, 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [data]);

  return (
    <AppContext.Provider
      value={{ data, dispatch, hydrated: hydrated.current }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
