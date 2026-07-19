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

describe("tag/complete", () => {
  it("completes tagged todos; recurring get lastDone; others untouched", () => {
    const base = {
      ...defaultData(),
      tags: [tag],
      todos: [
        todoFx({ tagIds: ["tg1"] }),
        todoFx({ id: "td2", recurrence: "daily", tagIds: ["tg1"] }),
        todoFx({ id: "td3" }),
      ],
    };
    const next = reducer(base, { type: "tag/complete", id: "tg1", today: "2026-07-19" });
    expect(next.todos[0]).toMatchObject({ done: true });
    expect(next.todos[0].lastDone).toBeUndefined();
    expect(next.todos[1]).toMatchObject({ done: true, lastDone: "2026-07-19" });
    expect(next.todos[2].done).toBe(false);
  });
});

describe("tag/purge", () => {
  it("deletes the tag and all tagged items, archiving linked note paths", () => {
    const base = {
      ...defaultData(),
      tags: [tag],
      vaultArchived: ["old.md"],
      todos: [todoFx({ tagIds: ["tg1", "other"] }), todoFx({ id: "td3" })],
      notes: [
        noteFx({ tagIds: ["tg1"], vaultFile: "vault/lecture.md" }),
        noteFx({ id: "n2", tagIds: ["tg1"] }),
        noteFx({ id: "n3" }),
      ],
    };
    const next = reducer(base, { type: "tag/purge", id: "tg1" });
    expect(next.tags).toEqual([]);
    expect(next.todos.map((t) => t.id)).toEqual(["td3"]);
    expect(next.notes.map((n) => n.id)).toEqual(["n3"]);
    expect(next.vaultArchived).toEqual(["old.md", "vault/lecture.md"]);
  });
});

describe("note/delete vault archiving", () => {
  it("archives a linked note's path without duplicates", () => {
    const base = {
      ...defaultData(),
      vaultArchived: ["vault/a.md"],
      notes: [noteFx({ vaultFile: "vault/a.md" }), noteFx({ id: "n2" })],
    };
    const next = reducer(base, { type: "note/delete", id: "n1" });
    expect(next.vaultArchived).toEqual(["vault/a.md"]);
    const next2 = reducer(next, { type: "note/delete", id: "n2" });
    expect(next2.vaultArchived).toEqual(["vault/a.md"]);
    expect(next2.notes).toEqual([]);
  });
});
