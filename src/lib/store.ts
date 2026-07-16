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
  return next;
}

export async function loadData(): Promise<AppData> {
  const s = await getStore();
  const existing = await s.get<AppData>("data");
  const data = rollStreak(migrate(existing ?? defaultData()));
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
