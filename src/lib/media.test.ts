import { describe, it, expect } from "vitest";
import {
  statusesFor,
  canCustomizeStatuses,
  isEntryInstalled,
  groupByStatus,
  filterEntries,
} from "./media";
import { MEDIA_STATUSES } from "./types";
import type { MediaCategory, MediaEntry } from "./types";

const cat = (over: Partial<MediaCategory> = {}): MediaCategory => ({
  id: "c",
  name: "C",
  source: "manual",
  ...over,
});
const entry = (over: Partial<MediaEntry> = {}): MediaEntry => ({
  id: "e",
  categoryId: "c",
  title: "t",
  progress: 0,
  status: "CURRENT",
  ...over,
});

describe("statusesFor", () => {
  it("falls back to canonical statuses when unset", () => {
    expect(statusesFor(cat())).toEqual(MEDIA_STATUSES);
  });
  it("uses the category's custom statuses when set", () => {
    expect(statusesFor(cat({ statuses: ["Playing", "Beat"] }))).toEqual([
      "Playing",
      "Beat",
    ]);
  });
});

describe("canCustomizeStatuses", () => {
  it("allows games and manual", () => {
    expect(canCustomizeStatuses("games")).toBe(true);
    expect(canCustomizeStatuses("manual")).toBe(true);
  });
  it("locks synced sources", () => {
    for (const s of [
      "anilist-anime",
      "anilist-manga",
      "tmdb-movie",
      "tmdb-tv",
    ] as const) {
      expect(canCustomizeStatuses(s)).toBe(false);
    }
  });
});

describe("isEntryInstalled", () => {
  it("true when manually flagged", () => {
    expect(isEntryInstalled(entry({ installed: true }), null)).toBe(true);
  });
  it("true when Steam app is detected", () => {
    expect(isEntryInstalled(entry({ steamAppId: 570 }), new Set([570]))).toBe(
      true,
    );
  });
  it("false when not flagged and not detected", () => {
    expect(isEntryInstalled(entry({ steamAppId: 570 }), new Set([1]))).toBe(
      false,
    );
    expect(isEntryInstalled(entry(), null)).toBe(false);
  });
});

describe("groupByStatus", () => {
  it("orders sections by the status list and drops empties", () => {
    const es = [entry({ status: "CURRENT" }), entry({ status: "COMPLETED" })];
    const g = groupByStatus(es, ["COMPLETED", "PLANNING", "CURRENT"]);
    expect(g.map((x) => x.status)).toEqual(["COMPLETED", "CURRENT"]);
  });
  it("collects unknown statuses into a trailing Other section", () => {
    const es = [entry({ status: "PLANNING" }), entry({ status: "Weird" })];
    const g = groupByStatus(es, ["PLANNING"]);
    expect(g.map((x) => x.status)).toEqual(["PLANNING", "Other"]);
    expect(g[1].entries).toHaveLength(1);
  });
});

describe("filterEntries", () => {
  const all = { status: null, query: "", minRating: null };
  const es = [
    entry({ id: "1", title: "Hades", status: "Playing", score: 5 }),
    entry({ id: "2", title: "Hollow Knight", status: "Backlog", score: 3 }),
    entry({ id: "3", title: "Celeste", status: "WEIRD" }),
  ];
  const statuses = ["Playing", "Backlog"];

  it("passes everything through with the empty filter", () => {
    expect(filterEntries(es, all, statuses)).toHaveLength(3);
  });
  it("filters by exact status", () => {
    const r = filterEntries(es, { ...all, status: "Playing" }, statuses);
    expect(r.map((e) => e.id)).toEqual(["1"]);
  });
  it("resolves Other to statuses outside the category list", () => {
    const r = filterEntries(es, { ...all, status: "Other" }, statuses);
    expect(r.map((e) => e.id)).toEqual(["3"]);
  });
  it("matches title case-insensitively as a substring", () => {
    const r = filterEntries(es, { ...all, query: "  hOLLoW " }, statuses);
    expect(r.map((e) => e.id)).toEqual(["2"]);
  });
  it("filters by minimum rating and treats 0 as unrated-only", () => {
    expect(
      filterEntries(es, { ...all, minRating: 4 }, statuses).map((e) => e.id),
    ).toEqual(["1"]);
    expect(
      filterEntries(es, { ...all, minRating: 0 }, statuses).map((e) => e.id),
    ).toEqual(["3"]);
  });
  it("ANDs filters together", () => {
    const r = filterEntries(
      es,
      { status: "Playing", query: "hades", minRating: 5 },
      statuses,
    );
    expect(r.map((e) => e.id)).toEqual(["1"]);
    expect(
      filterEntries(es, { status: "Backlog", query: "hades", minRating: null }, statuses),
    ).toHaveLength(0);
  });
});
