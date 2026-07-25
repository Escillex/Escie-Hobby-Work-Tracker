import { describe, it, expect } from "vitest";
import { refKey, formatDuration, parseDuration, gameHours, purgeOrphans } from "./time";
import { defaultData } from "./types";
import type { AppData, MediaEntry } from "./types";

describe("refKey", () => {
  it("distinguishes kinds that share an id", () => {
    expect(refKey({ kind: "todo", id: "x" })).not.toBe(refKey({ kind: "note", id: "x" }));
  });

  it("includes the parent for checklist items", () => {
    expect(refKey({ kind: "task", id: "c", parentId: "m1" })).toBe("task:m1:c");
    expect(refKey({ kind: "task", id: "c", parentId: "m2" })).toBe("task:m2:c");
  });

  it("leaves the parent segment empty when absent", () => {
    expect(refKey({ kind: "todo", id: "x" })).toBe("todo::x");
  });
});

describe("formatDuration", () => {
  it("renders zero as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-5)).toBe("0m");
  });

  it("renders sub-minute in seconds", () => {
    expect(formatDuration(30)).toBe("30s");
  });

  it("renders sub-hour in minutes", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(2700)).toBe("45m");
  });

  it("renders hours with and without minutes", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(4800)).toBe("1h 20m");
  });
});

describe("parseDuration", () => {
  it("parses compound, hour-only, minute-only and fractional forms", () => {
    expect(parseDuration("2h 30m")).toBe(9000);
    expect(parseDuration("2h")).toBe(7200);
    expect(parseDuration("90m")).toBe(5400);
    expect(parseDuration("1.5h")).toBe(5400);
  });

  it("treats a bare number as minutes", () => {
    expect(parseDuration("45")).toBe(2700);
  });

  it("returns null for unparseable input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("2x")).toBeNull();
  });
});

describe("gameHours", () => {
  const base: MediaEntry = {
    id: "g1",
    categoryId: "games",
    title: "Game",
    progress: 42,
    status: "CURRENT",
  };

  it("uses Steam's progress for a Steam entry", () => {
    const ledger = { [refKey({ kind: "media", id: "g1" })]: 7200 };
    expect(gameHours({ ...base, steamAppId: 400 }, ledger)).toBe(42);
  });

  it("uses ledger hours for a non-Steam entry", () => {
    const ledger = { [refKey({ kind: "media", id: "g1" })]: 7200 };
    expect(gameHours(base, ledger)).toBe(2);
  });

  it("floors partial hours and returns 0 when untracked", () => {
    expect(gameHours(base, { [refKey({ kind: "media", id: "g1" })]: 5400 })).toBe(1);
    expect(gameHours(base, {})).toBe(0);
  });
});

describe("purgeOrphans", () => {
  it("keeps live items and drops dead ones", () => {
    const data = {
      ...defaultData(),
      todos: [{ id: "t1", text: "x", createdAt: "", recurrence: "none", done: false }],
      notes: [{ id: "n1", title: "y", body: "", createdAt: "", updatedAt: "" }],
      media: {
        ...defaultData().media,
        entries: [
          {
            id: "m1",
            categoryId: "games",
            title: "G",
            progress: 0,
            status: "CURRENT",
            checklist: [{ id: "c1", text: "step", done: false }],
          },
        ],
      },
      time: {
        "todo::t1": 10,
        "note::n1": 20,
        "media::m1": 30,
        "task:m1:c1": 40,
        "todo::gone": 50,
        "task:m1:gone": 60,
        "task:gone:c1": 70,
      },
    } as unknown as AppData;

    expect(purgeOrphans(data)).toEqual({
      "todo::t1": 10,
      "note::n1": 20,
      "media::m1": 30,
      "task:m1:c1": 40,
    });
  });
});
