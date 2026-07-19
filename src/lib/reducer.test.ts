import { describe, it, expect } from "vitest";
import { reducer } from "./reducer";
import { defaultData } from "./types";
import type { MediaCategory, MediaEntry, Note, Tag, Todo } from "./types";

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

const tag: Tag = { id: "tg1", name: "class schedule", color: "foam" };

const todoFx = (over: Partial<Todo> = {}): Todo => ({
  id: "td1",
  text: "homework",
  createdAt: "2026-07-01T00:00:00.000Z",
  recurrence: "none",
  done: false,
  ...over,
});

const noteFx = (over: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "lecture",
  body: "",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

describe("tag basics", () => {
  it("adds and updates tags", () => {
    const added = reducer(defaultData(), { type: "tag/add", tag });
    expect(added.tags).toEqual([tag]);
    const recolored = reducer(added, {
      type: "tag/update",
      tag: { ...tag, name: "school", color: "love" },
    });
    expect(recolored.tags[0]).toEqual({ id: "tg1", name: "school", color: "love" });
  });

  it("tag/delete removes the tag and strips it from items, keeping the items", () => {
    const base = {
      ...defaultData(),
      tags: [tag],
      todos: [todoFx({ tagIds: ["tg1", "other"] })],
      notes: [noteFx({ tagIds: ["tg1"] })],
    };
    const next = reducer(base, { type: "tag/delete", id: "tg1" });
    expect(next.tags).toEqual([]);
    expect(next.todos[0].tagIds).toEqual(["other"]);
    expect(next.notes[0].tagIds).toEqual([]);
    expect(next.todos).toHaveLength(1);
    expect(next.notes).toHaveLength(1);
  });
});
