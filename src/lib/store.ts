import { load, type Store } from "@tauri-apps/plugin-store";
import type { AppData } from "./types";
import { defaultData, localDate } from "./types";
import type { ContributionData } from "./github";
import { migrate } from "./migrate";
import { purgeOrphans } from "./time";

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


/** Whether a recurring item completed on `lastDone` is due to reappear. */
function recurrenceStale(
  recurrence: "daily" | "weekly",
  lastDone: string | undefined,
  today: string,
): boolean {
  if (lastDone === today) return false;
  return recurrence === "daily"
    ? true
    : lastDone == null ||
        (Date.now() - new Date(lastDone).getTime()) / 86_400_000 >= 7;
}

/** Re-open recurring tasks whose completion is stale (a new day for daily,
 *  seven-plus days for weekly), so habits reappear on schedule. Applies to
 *  both scheduled todos and recurring checklist items on media entries. */
function resetRecurring(data: AppData): AppData {
  const today = localDate();
  const todos = data.todos.map((t) => {
    if (t.recurrence === "none" || !t.done) return t;
    return recurrenceStale(t.recurrence, t.lastDone, today)
      ? { ...t, done: false }
      : t;
  });
  const entries = data.media.entries.map((e) => {
    if (!e.checklist?.some((c) => c.recurrence && c.recurrence !== "none" && c.done)) {
      return e;
    }
    return {
      ...e,
      checklist: e.checklist.map((c) =>
        c.recurrence && c.recurrence !== "none" && c.done &&
        recurrenceStale(c.recurrence, c.lastDone, today)
          ? { ...c, done: false }
          : c,
      ),
    };
  });
  return { ...data, todos, media: { ...data.media, entries } };
}

export async function loadData(): Promise<AppData> {
  const s = await getStore();
  const existing = await s.get<AppData>("data");
  const migrated = resetRecurring(rollStreak(migrate(existing ?? defaultData())));
  const data = { ...migrated, time: purgeOrphans(migrated) };
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
