import type { CategorySource, MediaCategory, MediaEntry } from "./types";
import { MEDIA_STATUSES } from "./types";

/** The status list a category uses — its custom set, or the canonical default. */
export function statusesFor(category: MediaCategory): string[] {
  return category.statuses ?? MEDIA_STATUSES;
}

/** Whether a category's status *definitions* may be edited. Categories that sync
 *  status to an external service (AniList push, TMDB watchlist/rated) stay locked
 *  to the canonical set; only Games and manual categories are free-form. */
export function canCustomizeStatuses(source: CategorySource): boolean {
  return source === "games" || source === "manual";
}

/** Whether an entry counts as installed: a manual override, or Steam detection. */
export function isEntryInstalled(
  entry: MediaEntry,
  detected: Set<number> | null,
): boolean {
  return (
    entry.installed === true ||
    (entry.steamAppId != null && (detected?.has(entry.steamAppId) ?? false))
  );
}

export interface StatusGroup {
  status: string;
  entries: MediaEntry[];
}

/** Group entries into sections following `statuses` order. Empty sections are
 *  dropped; any entry whose status is not in the list lands in a trailing
 *  "Other" section so nothing disappears from view. */
export function groupByStatus(
  entries: MediaEntry[],
  statuses: string[],
): StatusGroup[] {
  const groups: StatusGroup[] = statuses.map((status) => ({
    status,
    entries: [],
  }));
  const byStatus = new Map(groups.map((g) => [g.status, g]));
  const other: MediaEntry[] = [];
  for (const e of entries) {
    const group = byStatus.get(e.status);
    if (group) group.entries.push(e);
    else other.push(e);
  }
  const result = groups.filter((g) => g.entries.length > 0);
  if (other.length) result.push({ status: "Other", entries: other });
  return result;
}
