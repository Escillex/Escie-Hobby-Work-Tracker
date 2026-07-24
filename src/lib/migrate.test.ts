import { describe, it, expect } from "vitest";
import { migrate } from "./migrate";
import { defaultData } from "./types";
import type { AppData } from "./types";

describe("migrate tags v2", () => {
  it("collapses tagIds to the first tag as tagId", () => {
    const base = defaultData();
    const data = {
      ...base,
      todos: [
        {
          id: "t1",
          text: "x",
          createdAt: "",
          recurrence: "none",
          done: false,
          tagIds: ["a", "b"],
        },
      ],
      notes: [
        { id: "n1", title: "y", body: "", createdAt: "", updatedAt: "", tagIds: [] },
      ],
    } as unknown as AppData;
    const out = migrate(data);
    expect(out.todos[0].tagId).toBe("a");
    expect("tagIds" in out.todos[0]).toBe(false);
    expect(out.notes[0].tagId).toBeUndefined();
    expect("tagIds" in out.notes[0]).toBe(false);
  });

  it("leaves already-migrated data alone", () => {
    const base = defaultData();
    const data = {
      ...base,
      todos: [
        { id: "t1", text: "x", createdAt: "", recurrence: "none", done: false, tagId: "a" },
      ],
    } as AppData;
    expect(migrate(data).todos[0].tagId).toBe("a");
  });
});

describe("migrate focus queue", () => {
  it("wraps a single next ref into an array", () => {
    const data = {
      ...defaultData(),
      focus: { now: { kind: "todo", id: "a" }, next: { kind: "note", id: "b" } },
    } as unknown as AppData;
    const out = migrate(data);
    expect(out.focus.next).toEqual([{ kind: "note", id: "b" }]);
    expect(out.focus.now).toEqual({ kind: "todo", id: "a" });
  });

  it("gives an absent next an empty array", () => {
    const data = {
      ...defaultData(),
      focus: { now: { kind: "todo", id: "a" } },
    } as unknown as AppData;
    expect(migrate(data).focus.next).toEqual([]);
  });

  it("leaves an existing queue alone", () => {
    const queue = [{ kind: "note" as const, id: "b" }];
    const data = { ...defaultData(), focus: { next: queue } } as AppData;
    expect(migrate(data).focus.next).toEqual(queue);
  });
});
