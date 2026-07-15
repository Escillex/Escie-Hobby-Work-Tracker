import { fetch } from "@tauri-apps/plugin-http";

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ContributionData {
  total: number;
  days: ContributionDay[];
  fetchedAt: string;
}

/** Public contribution calendar for the last year — no token needed. */
export async function fetchContributions(user: string): Promise<ContributionData> {
  const res = await fetch(
    `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(user)}?y=last`,
  );
  if (!res.ok) throw new Error(`GitHub contributions fetch failed (${res.status})`);
  const json: {
    total: Record<string, number>;
    contributions: ContributionDay[];
  } = await res.json();
  return {
    total: Object.values(json.total).reduce((a, b) => a + b, 0),
    days: json.contributions,
    fetchedAt: new Date().toISOString(),
  };
}
