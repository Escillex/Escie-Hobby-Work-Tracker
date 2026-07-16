import { load, type Store } from "@tauri-apps/plugin-store";
import type { AppData } from "./types";
import { defaultData, localDate } from "./types";
import type { ContributionData } from "./github";

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await load("data.json", { autoSave: true, defaults: {} });
  }
  return store;
}

/** Advance the open-streak: same day = unchanged, consecutive day = +1, gap = reset. */
export function rollStreak(data: AppData): AppData {
  const today = localDate();
  if (data.stats.lastOpenedDate === today) return data;

  const yesterday = localDate(new Date(Date.now() - 86_400_000));
  const streak =
    data.stats.lastOpenedDate === yesterday ? data.stats.streak + 1 : 1;
  return { ...data, stats: { lastOpenedDate: today, streak } };
}

/** Add anything newer app versions expect that older data files lack. */
function migrate(data: AppData): AppData {
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
  return next;
}

/** Re-open recurring tasks whose completion is stale (a new day for daily,
 *  seven-plus days for weekly), so habits reappear on schedule. */
function resetRecurring(data: AppData): AppData {
  const today = localDate();
  const todos = data.todos.map((t) => {
    if (t.recurrence === "none" || !t.done || t.lastDone === today) return t;
    const stale =
      t.recurrence === "daily"
        ? t.lastDone !== today
        : t.lastDone == null ||
          (Date.now() - new Date(t.lastDone).getTime()) / 86_400_000 >= 7;
    return stale
      ? { ...t, done: false, notifiedEarly: false, notifiedDue: false }
      : t;
  });
  return { ...data, todos };
}

export async function loadData(): Promise<AppData> {
  const s = await getStore();
  const existing = await s.get<AppData>("data");
  const data = resetRecurring(rollStreak(migrate(existing ?? defaultData())));
  await s.set("data", data);
  return data;
}

export async function saveData(data: AppData): Promise<void> {
  const s = await getStore();
  await s.set("data", data);
}

export async function loadGithubCache(): Promise<ContributionData | undefined> {
  const s = await getStore();
  return s.get<ContributionData>("githubCache");
}

export async function saveGithubCache(cache: ContributionData): Promise<void> {
  const s = await getStore();
  await s.set("githubCache", cache);
}
