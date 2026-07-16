import { fetch } from "@tauri-apps/plugin-http";
import type { MediaEntry, MediaStatus } from "./types";
import { uid } from "./types";

const API = "https://graphql.anilist.co";

/** Register a client at https://anilist.co/settings/developer to get an ID.
 *  With response_type=token AniList shows the token for copy-paste (pin flow). */
export const authUrl = (clientId: string) =>
  `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(clientId)}&response_type=token`;

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message ?? `AniList error (${res.status})`);
  }
  return json.data as T;
}

export interface AniListMedia {
  id: number;
  title: { userPreferred: string };
  episodes: number | null;
  chapters: number | null;
  coverImage: { large: string };
}

export async function fetchViewer(token: string): Promise<{ id: number; name: string }> {
  const data = await gql<{ Viewer: { id: number; name: string } }>(
    `query { Viewer { id name } }`,
    {},
    token,
  );
  return data.Viewer;
}

export async function searchMedia(
  search: string,
  type: "ANIME" | "MANGA",
): Promise<AniListMedia[]> {
  const data = await gql<{ Page: { media: AniListMedia[] } }>(
    `query ($search: String, $type: MediaType) {
      Page(perPage: 8) {
        media(search: $search, type: $type, sort: SEARCH_MATCH) {
          id
          title { userPreferred }
          episodes
          chapters
          coverImage { large }
        }
      }
    }`,
    { search, type },
  );
  return data.Page.media;
}

interface RawListEntry {
  id: number;
  status: MediaStatus;
  progress: number;
  score: number;
  completedAt: { year: number | null; month: number | null; day: number | null };
  media: AniListMedia;
}

/** Pull the user's full list for one media type, mapped to local MediaEntry shape. */
export async function fetchList(
  token: string,
  userId: number,
  type: "ANIME" | "MANGA",
  categoryId: string,
): Promise<MediaEntry[]> {
  const data = await gql<{
    MediaListCollection: { lists: { entries: RawListEntry[] }[] };
  }>(
    `query ($userId: Int, $type: MediaType) {
      MediaListCollection(userId: $userId, type: $type) {
        lists {
          entries {
            id
            status
            progress
            score(format: POINT_10)
            completedAt { year month day }
            media {
              id
              title { userPreferred }
              episodes
              chapters
              coverImage { large }
            }
          }
        }
      }
    }`,
    { userId, type },
    token,
  );

  const entries = data.MediaListCollection.lists.flatMap((l) => l.entries);
  return entries.map((e) => ({
    id: uid(),
    categoryId,
    title: e.media.title.userPreferred,
    coverUrl: e.media.coverImage.large,
    progress: e.progress ?? 0,
    total: type === "ANIME" ? e.media.episodes : e.media.chapters,
    status: e.status,
    score: e.score || undefined,
    completedAt:
      e.completedAt?.year != null
        ? `${e.completedAt.year}-${String(e.completedAt.month ?? 1).padStart(2, "0")}-${String(e.completedAt.day ?? 1).padStart(2, "0")}`
        : undefined,
    anilistId: e.media.id,
    anilistMediaListId: e.id,
  }));
}

/** Create or update a list entry on AniList; returns the media-list id.
 *  `scoreRaw` is 0-100 (format-independent), so a 0-10 app rating maps as x10. */
export async function saveEntry(
  token: string,
  args: { mediaId: number; status?: MediaStatus; progress?: number; scoreRaw?: number },
): Promise<number> {
  const data = await gql<{ SaveMediaListEntry: { id: number } }>(
    `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) {
        id
      }
    }`,
    args,
    token,
  );
  return data.SaveMediaListEntry.id;
}
