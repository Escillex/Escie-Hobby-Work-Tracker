export type RosePineColor = "love" | "gold" | "rose" | "pine" | "foam" | "iris";

export const ROSE_PINE_COLORS: RosePineColor[] = [
  "love",
  "gold",
  "rose",
  "pine",
  "foam",
  "iris",
];

export interface Launcher {
  id: string;
  name: string;
  command: string;
  color: RosePineColor;
}

export interface Tag {
  id: string;
  name: string;
  color: RosePineColor;
}

export type FocusKind = "media" | "todo" | "task" | "note";

/** A pointer to whatever you're currently focusing on. `parentId` is the
 *  owning media entry when kind is "task" (a game/show checklist item). */
export interface FocusRef {
  kind: FocusKind;
  id: string;
  parentId?: string;
}

export type CategorySource =
  | "anilist-anime"
  | "anilist-manga"
  | "games"
  | "tmdb-movie"
  | "tmdb-tv"
  | "manual";

export interface MediaCategory {
  id: string;
  name: string;
  source: CategorySource;
  statuses?: string[]; // custom ordered status list; falls back to MEDIA_STATUSES
}

export type MediaStatus =
  | "CURRENT"
  | "PLANNING"
  | "COMPLETED"
  | "PAUSED"
  | "DROPPED"
  | "REPEATING";

export const MEDIA_STATUSES: MediaStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "PAUSED",
  "DROPPED",
  "REPEATING",
];

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  recurrence?: Recurrence; // undefined/"none" = a one-off task
  lastDone?: string; // YYYY-MM-DD a recurring item was last completed
}

export interface SeasonProgress {
  season: number;
  name: string;
  episodes: number;
  watched: number;
}

export interface MediaEntry {
  id: string;
  categoryId: string;
  title: string;
  coverUrl?: string;
  progress: number;
  total?: number | null;
  status: string; // canonical MediaStatus for synced categories; free-form otherwise
  installed?: boolean; // manual "installed on this machine" override (games)
  score?: number;
  completedAt?: string;
  anilistId?: number;
  anilistMediaListId?: number;
  steamAppId?: number;
  launchCommand?: string;
  tmdbId?: number;
  tmdbType?: "movie" | "tv";
  seasons?: SeasonProgress[];
  notes?: string;
  checklist?: ChecklistItem[];
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  vaultFile?: string; // vault path this note was last written to
  vaultTitle?: string; // title the vault file was last written under
  tagId?: string; // Tag id; absent = untagged
}

export type Recurrence = "none" | "daily" | "weekly";

export interface Todo {
  id: string;
  text: string;
  createdAt: string; // ISO
  dueAt?: string; // ISO, optional — undated todos are allowed
  recurrence: Recurrence;
  scheduleTime?: string; // "HH:MM" local — reminder time for a recurring todo
  scheduleDay?: number; // 0-6 (Sunday = 0) — weekday of a scheduled weekly todo
  lastDone?: string; // YYYY-MM-DD a recurring task was last completed
  notifiedEarlyFor?: string; // occurrence ISO the early warning fired for
  notifiedDueFor?: string; // occurrence ISO the due notification fired for
  done: boolean;
  tagId?: string; // Tag id; absent = untagged
}

export interface Stats {
  lastOpenedDate: string; // YYYY-MM-DD (local)
  streak: number;
}

export interface Settings {
  anilistToken?: string;
  anilistUserId?: number;
  anilistUserName?: string;
  githubUser: string;
  steamApiKey?: string;
  steamId?: string;
  tmdbApiKey?: string;
  tmdbSessionId?: string;
  tmdbAccountId?: number;
  tmdbUsername?: string;
  vaultPath?: string;
  vaultNotesFolder?: string;
  fontFamily?: string;
  earlyWarningMinutes?: number; // minutes of heads-up before any due time (default 10)
  tagRowCollapsed?: boolean; // tag filter row collapsed (shared by tasks/notes views)
}

export interface AppData {
  launchers: Launcher[];
  media: {
    categories: MediaCategory[];
    entries: MediaEntry[];
  };
  todos: Todo[];
  notes: Note[];
  tags: Tag[];
  vaultArchived?: string[]; // vault files released by app-side renames; never re-imported, never deleted
  focus: { now?: FocusRef; next: FocusRef[] };
  stats: Stats;
  settings: Settings;
}

export const uid = (): string => crypto.randomUUID();

export const localDate = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function defaultData(): AppData {
  return {
    launchers: [
      { id: uid(), name: "Zen", command: "zen-browser", color: "iris" },
      { id: uid(), name: "Steam", command: "steam", color: "foam" },
    ],
    media: {
      categories: [
        { id: "anime", name: "Anime", source: "anilist-anime" },
        { id: "manga", name: "Manga", source: "anilist-manga" },
        { id: "movies", name: "Movies", source: "tmdb-movie" },
        { id: "tv", name: "TV Shows", source: "tmdb-tv" },
        { id: "games", name: "Games", source: "games" },
      ],
      entries: [],
    },
    todos: [],
    notes: [],
    tags: [],
    focus: { next: [] },
    stats: { lastOpenedDate: localDate(), streak: 1 },
    settings: { githubUser: "" },
  };
}

/** Two focus pointers reference the same item. */
export const sameRef = (a?: FocusRef, b?: FocusRef): boolean =>
  a != null &&
  b != null &&
  a.kind === b.kind &&
  a.id === b.id &&
  a.parentId === b.parentId;
