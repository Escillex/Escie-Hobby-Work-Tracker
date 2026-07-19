import { describe, expect, it } from "vitest";
import type { Todo } from "./types";
import {
  currentOccurrence,
  doneForOccurrence,
  dueTarget,
  isOverdue,
} from "./schedule";

const base: Todo = {
  id: "t1",
  text: "meds",
  createdAt: "2026-07-01T00:00:00.000Z",
  earlyMinutes: 30,
  recurrence: "none",
  done: false,
};

// Sat Jul 18 2026, 10:00 local
const now = new Date(2026, 6, 18, 10, 0);

describe("currentOccurrence", () => {
  it("returns today at scheduleTime for daily todos", () => {
    const t = { ...base, recurrence: "daily" as const, scheduleTime: "08:00" };
    expect(currentOccurrence(t, now)).toEqual(new Date(2026, 6, 18, 8, 0));
  });

  it("returns this week's scheduleDay for weekly todos, even when already past", () => {
    // Jul 18 2026 is a Saturday; Monday (1) of that week is Jul 13.
    const t = {
      ...base,
      recurrence: "weekly" as const,
      scheduleTime: "07:00",
      scheduleDay: 1,
    };
    expect(currentOccurrence(t, now)).toEqual(new Date(2026, 6, 13, 7, 0));
  });

  it("returns a later weekday of the same week when still upcoming", () => {
    const wed = new Date(2026, 6, 15, 10, 0); // Wednesday
    const t = {
      ...base,
      recurrence: "weekly" as const,
      scheduleTime: "19:00",
      scheduleDay: 5, // Friday Jul 17
    };
    expect(currentOccurrence(t, wed)).toEqual(new Date(2026, 6, 17, 19, 0));
  });

  it("is undefined without a usable schedule", () => {
    expect(currentOccurrence(base, now)).toBeUndefined();
    expect(
      currentOccurrence({ ...base, recurrence: "daily" }, now),
    ).toBeUndefined();
    expect(
      currentOccurrence(
        { ...base, recurrence: "daily", scheduleTime: "8:00" },
        now,
      ),
    ).toBeUndefined();
    expect(
      currentOccurrence(
        { ...base, recurrence: "daily", scheduleTime: "25:00" },
        now,
      ),
    ).toBeUndefined();
    expect(
      currentOccurrence(
        { ...base, recurrence: "weekly", scheduleTime: "07:00" },
        now,
      ),
    ).toBeUndefined();
    expect(
      currentOccurrence(
        { ...base, recurrence: "weekly", scheduleTime: "07:00", scheduleDay: 7 },
        now,
      ),
    ).toBeUndefined();
  });
});

describe("dueTarget", () => {
  it("uses dueAt for one-off todos", () => {
    const t = { ...base, dueAt: "2026-07-18T15:30:00.000Z" };
    expect(dueTarget(t, now)).toEqual(new Date("2026-07-18T15:30:00.000Z"));
    expect(dueTarget(base, now)).toBeUndefined();
  });

  it("uses the current occurrence for scheduled recurring todos", () => {
    const t = { ...base, recurrence: "daily" as const, scheduleTime: "08:00" };
    expect(dueTarget(t, now)).toEqual(new Date(2026, 6, 18, 8, 0));
  });
});

describe("doneForOccurrence / isOverdue", () => {
  const daily = { ...base, recurrence: "daily" as const, scheduleTime: "08:00" };

  it("recurring todo done today is done for today's occurrence", () => {
    const t = { ...daily, done: true, lastDone: "2026-07-18" };
    expect(doneForOccurrence(t, new Date(2026, 6, 18, 8, 0))).toBe(true);
    expect(isOverdue(t, now)).toBe(false);
  });

  it("recurring todo done yesterday is overdue after today's time", () => {
    const t = { ...daily, done: true, lastDone: "2026-07-17" };
    expect(isOverdue(t, now)).toBe(true);
  });

  it("not overdue before the scheduled time", () => {
    expect(isOverdue(daily, new Date(2026, 6, 18, 7, 59))).toBe(false);
    expect(isOverdue(daily, new Date(2026, 6, 18, 8, 0))).toBe(true);
  });

  it("one-off todos: overdue when dueAt passed and not done", () => {
    const t = { ...base, dueAt: new Date(2026, 6, 18, 9, 0).toISOString() };
    expect(isOverdue(t, now)).toBe(true);
    expect(isOverdue({ ...t, done: true }, now)).toBe(false);
  });

  it("unscheduled todos are never overdue", () => {
    expect(isOverdue(base, now)).toBe(false);
    expect(isOverdue({ ...base, recurrence: "daily" }, now)).toBe(false);
  });
});
