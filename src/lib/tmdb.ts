import { fetch } from "@tauri-apps/plugin-http";
import type { MediaEntry, SeasonProgress, Settings } from "./types";
import { uid } from "./types";

const API = "https://api.themoviedb.org/3";

/** Poster image URL for a TMDB poster_path. Loads via <img> (CSP is null). */
export const tmdbImg = (path: string | null): string | undefined =>
  path ? `https://image.tmdb.org/t/p/w342${path}` : undefined;

export interface TmdbResult {
  id: number;
  title: string;
  year: string;
  poster?: string;
}

interface RawSearchItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
}

/** Search TMDB for movies or TV shows. */
export async function tmdbSearch(
  apiKey: string,
  query: string,
  type: "movie" | "tv",
): Promise<TmdbResult[]> {
  const res = await fetch(
    `${API}/search/${type}?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&include_adult=false`,
  );
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid TMDB key — check settings");
    throw new Error(`TMDB search failed (${res.status})`);
  }
  const json: { results: RawSearchItem[] } = await res.json();
  return json.results.slice(0, 8).map((r) => {
    const date = r.release_date ?? r.first_air_date ?? "";
    return {
      id: r.id,
      title: r.title ?? r.name ?? "Untitled",
      year: date ? date.slice(0, 4) : "",
      poster: tmdbImg(r.poster_path),
    };
  });
}

interface RawSeason {
  season_number: number;
  name: string;
  episode_count: number;
}

/** Fetch a TV show's seasons (excluding season 0 "Specials"). */
export async function tmdbTvSeasons(apiKey: string, id: number): Promise<SeasonProgress[]> {
  const res = await fetch(`${API}/tv/${id}?api_key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`TMDB details failed (${res.status})`);
  const json: { seasons?: RawSeason[] } = await res.json();
  return (json.seasons ?? [])
    .filter((s) => s.season_number >= 1 && s.episode_count > 0)
    .map((s) => ({
      season: s.season_number,
      name: s.name || `Season ${s.season_number}`,
      episodes: s.episode_count,
      watched: 0,
    }));
}

/** Recompute the aggregate progress/total from per-season counts, and
 *  auto-complete when every episode is watched. */
export function recomputeAggregate(entry: MediaEntry): MediaEntry {
  if (!entry.seasons?.length) return entry;
  const total = entry.seasons.reduce((n, s) => n + s.episodes, 0);
  const progress = entry.seasons.reduce((n, s) => n + s.watched, 0);
  const status =
    total > 0 && progress >= total
      ? "COMPLETED"
      : entry.status === "COMPLETED"
        ? "CURRENT"
        : entry.status;
  return { ...entry, total, progress, status };
}

/** Set one season's watched count (clamped) and recompute the aggregate. */
export function setSeasonWatched(
  entry: MediaEntry,
  season: number,
  watched: number,
): MediaEntry {
  const seasons = (entry.seasons ?? []).map((s) =>
    s.season === season
      ? { ...s, watched: Math.max(0, Math.min(watched, s.episodes)) }
      : s,
  );
  return recomputeAggregate({ ...entry, seasons });
}

/** Advance the first not-finished season by one episode. */
export function bumpCurrentSeason(entry: MediaEntry): MediaEntry {
  const seasons = entry.seasons ?? [];
  const target = seasons.find((s) => s.watched < s.episodes);
  if (!target) return entry;
  return setSeasonWatched(entry, target.season, target.watched + 1);
}

/* ---------- Account sync (session-based v3 auth) ---------- */

/** Step 1: request a token to authorize. */
export async function tmdbCreateRequestToken(apiKey: string): Promise<string> {
  const res = await fetch(`${API}/authentication/token/new?api_key=${encodeURIComponent(apiKey)}`);
  const json = await res.json();
  if (!res.ok || !json.request_token) throw new Error("Could not start TMDB auth — check your key");
  return json.request_token;
}

/** Step 2: the URL the user opens to approve the token in a browser. */
export const tmdbApproveUrl = (requestToken: string) =>
  `https://www.themoviedb.org/authenticate/${requestToken}`;

/** Step 3: exchange an approved token for a session id + account info. */
export async function tmdbCreateSession(
  apiKey: string,
  requestToken: string,
): Promise<{ sessionId: string; accountId: number; username: string }> {
  const s = await fetch(
    `${API}/authentication/session/new?api_key=${encodeURIComponent(apiKey)}&request_token=${encodeURIComponent(requestToken)}`,
  );
  const sJson = await s.json();
  if (!s.ok || !sJson.session_id)
    throw new Error("Approve the token in your browser first, then Connect");
  const sessionId: string = sJson.session_id;
  const a = await fetch(
    `${API}/account?api_key=${encodeURIComponent(apiKey)}&session_id=${encodeURIComponent(sessionId)}`,
  );
  const aJson = await a.json();
  return { sessionId, accountId: aJson.id, username: aJson.username };
}

/** Push (or clear, when score is undefined) a rating to TMDB. */
export async function tmdbRate(
  settings: Settings,
  type: "movie" | "tv",
  id: number,
  score: number | undefined,
): Promise<void> {
  const { tmdbApiKey, tmdbSessionId } = settings;
  if (!tmdbApiKey || !tmdbSessionId) throw new Error("Connect TMDB in settings to sync ratings");
  const url = `${API}/${type}/${id}/rating?api_key=${encodeURIComponent(tmdbApiKey)}&session_id=${encodeURIComponent(tmdbSessionId)}`;
  const res = await fetch(url, {
    method: score == null ? "DELETE" : "POST",
    headers: { "Content-Type": "application/json;charset=utf-8" },
    body: score == null ? undefined : JSON.stringify({ value: Math.max(0.5, score) }),
  });
  if (!res.ok) throw new Error(`TMDB rating push failed (${res.status})`);
}

interface AccountItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  rating?: number;
}

async function fetchAllPages(baseUrl: string): Promise<AccountItem[]> {
  const items: AccountItem[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetch(`${baseUrl}&page=${page}`);
    if (!res.ok) throw new Error(`TMDB sync failed (${res.status})`);
    const json: { results: AccountItem[]; total_pages: number } = await res.json();
    items.push(...json.results);
    totalPages = json.total_pages;
    page++;
  } while (page <= totalPages && page <= 20);
  return items;
}

/** Pull the user's rated + watchlist items for one media type into entries.
 *  Rated items carry their score; watchlist-only items become PLANNING. */
export async function tmdbSyncPull(
  settings: Settings,
  type: "movie" | "tv",
  categoryId: string,
): Promise<MediaEntry[]> {
  const { tmdbApiKey, tmdbSessionId, tmdbAccountId } = settings;
  if (!tmdbApiKey || !tmdbSessionId || tmdbAccountId == null)
    throw new Error("Connect TMDB in settings first");
  const key = `api_key=${encodeURIComponent(tmdbApiKey)}&session_id=${encodeURIComponent(tmdbSessionId)}`;
  const plural = type === "movie" ? "movies" : "tv";
  const [rated, watch] = await Promise.all([
    fetchAllPages(`${API}/account/${tmdbAccountId}/rated/${plural}?${key}`),
    fetchAllPages(`${API}/account/${tmdbAccountId}/watchlist/${plural}?${key}`),
  ]);

  const byId = new Map<number, { item: AccountItem; rated: boolean }>();
  for (const item of watch) byId.set(item.id, { item, rated: false });
  for (const item of rated) byId.set(item.id, { item, rated: true });

  const entries = await Promise.all(
    [...byId.values()].map(async ({ item, rated: isRated }) => {
      const base: MediaEntry = {
        id: uid(),
        categoryId,
        title: item.title ?? item.name ?? "Untitled",
        coverUrl: tmdbImg(item.poster_path),
        progress: 0,
        total: type === "movie" ? null : 0,
        status: isRated ? "COMPLETED" : "PLANNING",
        score: item.rating,
        tmdbId: item.id,
        tmdbType: type,
      };
      if (type === "movie") return base;
      try {
        const seasons = await tmdbTvSeasons(tmdbApiKey, item.id);
        const total = seasons.reduce((n, s) => n + s.episodes, 0);
        return { ...base, seasons, total };
      } catch {
        return base;
      }
    }),
  );
  return entries;
}
