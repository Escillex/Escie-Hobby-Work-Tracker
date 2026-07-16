import { fetch } from "@tauri-apps/plugin-http";
import type { MediaEntry, SeasonProgress } from "./types";

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
