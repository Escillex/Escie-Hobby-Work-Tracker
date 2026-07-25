import type { AppData, FocusRef, MediaEntry } from "./types";

/** Ledger key for a focus pointer. The parent segment keeps two checklist
 *  items that share an id, under different media entries, apart. */
export function refKey(ref: FocusRef): string {
  return `${ref.kind}:${ref.parentId ?? ""}:${ref.id}`;
}

/** Human-readable duration: "1h 20m", "45m", "30s". */
export function formatDuration(secs: number): string {
  if (secs <= 0) return "0m";
  if (secs < 60) return `${Math.floor(secs)}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Parse "2h 30m", "90m", "1.5h", or a bare number of minutes. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const compound = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?$/);
  if (compound && (compound[1] != null || compound[2] != null)) {
    const h = Number(compound[1] ?? 0);
    const m = Number(compound[2] ?? 0);
    return Math.round(h * 3600 + m * 60);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  return null;
}

/** Hours to show for a game. Steam entries keep Steam's own number; a
 *  re-sync overwrites `progress`, so focus time is never written there. */
export function gameHours(
  entry: MediaEntry,
  ledger: Record<string, number>,
): number {
  if (entry.steamAppId != null) return entry.progress;
  return Math.floor((ledger[refKey({ kind: "media", id: entry.id })] ?? 0) / 3600);
}

/** Ledger with entries for deleted items removed. Run on load: a full scan
 *  is simpler and more self-healing than hooking every delete action. */
export function purgeOrphans(data: AppData): Record<string, number> {
  const live = new Set<string>();
  for (const t of data.todos) live.add(refKey({ kind: "todo", id: t.id }));
  for (const n of data.notes) live.add(refKey({ kind: "note", id: n.id }));
  for (const e of data.media.entries) {
    live.add(refKey({ kind: "media", id: e.id }));
    for (const c of e.checklist ?? []) {
      live.add(refKey({ kind: "task", id: c.id, parentId: e.id }));
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.time)) {
    if (live.has(k)) out[k] = v;
  }
  return out;
}
