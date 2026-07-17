import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
  type Dispatch,
} from "react";
import type { AppData } from "./types";
import { localDate } from "./types";
import { loadData, saveData } from "./store";
import { reducer, type Action } from "./reducer";

export type { Action } from "./reducer";

interface Ctx {
  data: AppData;
  dispatch: Dispatch<Action>;
  hydrated: boolean;
}

const AppContext = createContext<Ctx | null>(null);

const EMPTY: AppData = {
  launchers: [],
  media: { categories: [], entries: [] },
  todos: [],
  notes: [],
  focus: {},
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
