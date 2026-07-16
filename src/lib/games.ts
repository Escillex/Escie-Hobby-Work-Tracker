import { fetch } from "@tauri-apps/plugin-http";
import type { MediaEntry } from "./types";
import { uid } from "./types";

export interface RawgGame {
  id: number;
  name: string;
  background_image: string | null;
  released: string | null;
}

/** Search the RAWG games database. Free key from https://rawg.io/apidocs */
export async function rawgSearch(apiKey: string, query: string): Promise<RawgGame[]> {
  const res = await fetch(
    `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(query)}&page_size=8`,
  );
  if (!res.ok) throw new Error(`RAWG search failed (${res.status})`);
  const json: { results: RawgGame[] } = await res.json();
  return json.results;
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
      coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
      // For games, progress doubles as hours played.
      progress: Math.round(g.playtime_forever / 60),
      total: null,
      status: g.playtime_forever > 0 ? ("CURRENT" as const) : ("PLANNING" as const),
      steamAppId: g.appid,
      launchCommand: `xdg-open steam://rungameid/${g.appid}`,
    }));
}
