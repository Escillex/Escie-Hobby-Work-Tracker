import { describe, expect, it } from "vitest";
import type { Todo } from "./types";
import { defaultData } from "./types";
import {
  currentOccurrence,
  doneForOccurrence,
  dueTarget,
  isOverdue,
  migrateScheduling,
} from "./schedule";

const base: Todo = {
  id: "t1",
  text: "meds",
  createdAt: "2026-07-01T00:00:00.000Z",
  recurrence: "none",
  done: false,
};

const clean = base;

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

describe("migrateScheduling", () => {
  it("seeds the global early-warning setting once", () => {
    const out = migrateScheduling(defaultData());
    expect(out.settings.earlyWarningMinutes).toBe(10);
    const kept = migrateScheduling({
      ...defaultData(),
      settings: { githubUser: "", earlyWarningMinutes: 5 },
    });
    expect(kept.settings.earlyWarningMinutes).toBe(5);
  });

  it("drops per-todo earlyMinutes and converts notified booleans to keys", () => {
    const dueAt = new Date(2026, 6, 18, 9, 0).toISOString();
    // Models pre-migration data files; the legacy fields no longer exist on
    // Todo, so these literals need assertions.
    const data = {
      ...defaultData(),
      todos: [
        {
          ...clean,
          earlyMinutes: 30,
          dueAt,
          notifiedEarly: true,
          notifiedDue: true,
        } as Todo,
        {
          ...clean,
          id: "t2",
          earlyMinutes: 15,
          recurrence: "daily",
          notifiedEarly: true,
        } as Todo,
      ],
    };
    const [a, b] = migrateScheduling(data).todos;
    expect("earlyMinutes" in a).toBe(false);
    expect("notifiedEarly" in a).toBe(false);
    expect("notifiedDue" in a).toBe(false);
    expect(a.notifiedEarlyFor).toBe(dueAt);
    expect(a.notifiedDueFor).toBe(dueAt);
    // Recurring todos just lose the legacy fields; keys are per-occurrence.
    expect("earlyMinutes" in b).toBe(false);
    expect("notifiedEarly" in b).toBe(false);
    expect(b.notifiedEarlyFor).toBeUndefined();
  });

  it("leaves already-migrated todos untouched", () => {
    const data = {
      ...defaultData(),
      settings: { githubUser: "", earlyWarningMinutes: 10 },
      todos: [{ ...clean, notifiedDueFor: "2026-07-18T06:00:00.000Z" }],
    };
    expect(migrateScheduling(data)).toBe(data);
  });
});
