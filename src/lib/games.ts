import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type { MediaEntry } from "./types";
import { uid } from "./types";

/** App ids of Steam games currently installed on this machine. */
export async function installedSteamAppIds(): Promise<Set<number>> {
  const ids = await invoke<number[]>("installed_steam_appids");
  return new Set(ids);
}

export const steamCover = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;

export const steamLaunch = (appid: number) => `xdg-open steam://rungameid/${appid}`;

export interface GameResult {
  appid: number;
  name: string;
  thumb: string;
}

/** Search Steam's public storefront catalog — no API key required. */
export async function steamStoreSearch(query: string): Promise<GameResult[]> {
  const res = await fetch(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`,
  );
  if (!res.ok) throw new Error(`Steam store search failed (${res.status})`);
  const json: { items?: { id: number; name: string; tiny_image?: string }[] } =
    await res.json();
  return (json.items ?? []).map((i) => ({
    appid: i.id,
    name: i.name,
    thumb: i.tiny_image ?? steamCover(i.id),
  }));
}

interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
}

/** Pull owned games (name + playtime) from the Steam Web API.
 *  Key from https://steamcommunity.com/dev/apikey, plus your SteamID64. */
export async function steamOwnedGames(
  apiKey: string,
  steamId: string,
  categoryId: string,
): Promise<MediaEntry[]> {
  const res = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1&format=json`,
  );
  if (!res.ok) throw new Error(`Steam API failed (${res.status}) — check key and SteamID64`);
  const json: { response: { games?: SteamGame[] } } = await res.json();
  const games = json.response.games ?? [];

  return games
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .map((g) => ({
      id: uid(),
      categoryId,
      title: g.name,
      coverUrl: steamCover(g.appid),
      // For games, progress doubles as hours played.
      progress: Math.round(g.playtime_forever / 60),
      total: null,
      status: g.playtime_forever > 0 ? ("CURRENT" as const) : ("PLANNING" as const),
      steamAppId: g.appid,
      launchCommand: steamLaunch(g.appid),
    }));
}
