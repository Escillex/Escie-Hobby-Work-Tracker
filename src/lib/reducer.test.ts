import { describe, it, expect } from "vitest";
import { reducer } from "./reducer";
import { defaultData } from "./types";
import type { MediaCategory, MediaEntry } from "./types";

describe("category/update", () => {
  it("replaces a category by id, leaving others untouched", () => {
    const base = defaultData();
    const games = base.media.categories.find((c) => c.id === "games")!;
    const updated: MediaCategory = {
      ...games,
      name: "Video Games",
      statuses: ["Playing", "Beat"],
    };
    const next = reducer(base, { type: "category/update", category: updated });
    expect(next.media.categories.find((c) => c.id === "games")).toEqual(updated);
    expect(next.media.categories).toHaveLength(base.media.categories.length);
  });
});

describe("media/update completedAt stamping", () => {
  const gameEntry: MediaEntry = {
    id: "x",
    categoryId: "games",
    title: "g",
    progress: 0,
    status: "CURRENT",
  };

  it("stamps completedAt when moving to canonical COMPLETED", () => {
    const added = reducer(defaultData(), { type: "media/add", entry: gameEntry });
    const done = reducer(added, {
      type: "media/update",
      entry: { ...gameEntry, status: "COMPLETED" },
    });
    expect(done.media.entries[0].completedAt).toBeTruthy();
  });

  it("does not stamp completedAt for a custom status", () => {
    const added = reducer(defaultData(), {
      type: "media/add",
      entry: { ...gameEntry, status: "Playing" },
    });
    const moved = reducer(added, {
      type: "media/update",
      entry: { ...gameEntry, status: "Beat" },
    });
    expect(moved.media.entries[0].completedAt).toBeUndefined();
  });
});
