import type { AppData, Todo } from "./types";
import { localDate } from "./types";

/** Display names indexed by scheduleDay (Sunday = 0). */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Parse strict "HH:MM" 24h. Undefined for anything malformed. */
function parseTime(time: string): { h: number; m: number } | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return undefined;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h > 23 || m > 59 ? undefined : { h, m };
}

/** This cycle's occurrence of a scheduled recurring todo: today at
 *  scheduleTime for daily, this week's scheduleDay (Sunday-start week
 *  containing `now`) for weekly. May be past or future relative to `now`.
 *  Undefined when the todo has no usable schedule. */
export function currentOccurrence(todo: Todo, now: Date): Date | undefined {
  if (todo.recurrence === "none" || !todo.scheduleTime) return undefined;
  const t = parseTime(todo.scheduleTime);
  if (!t) return undefined;
  const d = new Date(now);
  d.setHours(t.h, t.m, 0, 0);
  if (todo.recurrence === "weekly") {
    const day = todo.scheduleDay;
    if (day == null || !Number.isInteger(day) || day < 0 || day > 6) {
      return undefined;
    }
    d.setDate(d.getDate() - d.getDay() + day);
  }
  return d;
}

/** Unified due moment: dueAt for one-offs, the current occurrence for
 *  scheduled recurring todos. */
export function dueTarget(todo: Todo, now: Date): Date | undefined {
  if (todo.recurrence === "none") {
    return todo.dueAt ? new Date(todo.dueAt) : undefined;
  }
  return currentOccurrence(todo, now);
}

/** Whether the todo counts as completed for the given occurrence. For
 *  recurring todos the done flag only counts if lastDone is on or after
 *  the occurrence's day. */
export function doneForOccurrence(todo: Todo, occurrence: Date): boolean {
  if (todo.recurrence === "none") return todo.done;
  return todo.done && (todo.lastDone ?? "") >= localDate(occurrence);
}

/** Derived, never stored: the due moment has passed and the todo is not
 *  done for it. */
export function isOverdue(todo: Todo, now: Date): boolean {
  const target = dueTarget(todo, now);
  if (!target) return false;
  return now.getTime() >= target.getTime() && !doneForOccurrence(todo, target);
}

/** Whether a recurring todo should surface on the given local day
 *  (YYYY-MM-DD key). Daily recurs every day; weekly recurs on its
 *  scheduleDay, or every day when no weekday was chosen (so a reminder-less
 *  weekly todo isn't lost). One-off todos never match here — they surface
 *  via dueAt. A missing reminder time is fine: it is not required to show. */
export function recurringOnDay(todo: Todo, dayKey: string): boolean {
  if (todo.recurrence === "none") return false;
  if (todo.recurrence === "daily") return true;
  if (todo.scheduleDay == null) return true;
  return new Date(`${dayKey}T00:00`).getDay() === todo.scheduleDay;
}

/** One-time data upgrade: per-todo earlyMinutes becomes the global
 *  settings.earlyWarningMinutes, and the notified booleans become
 *  occurrence-keyed fields (key = the dueAt instant for one-offs). */
export function migrateScheduling(data: AppData): AppData {
  let next = data;
  if (next.settings.earlyWarningMinutes == null) {
    next = { ...next, settings: { ...next.settings, earlyWarningMinutes: 10 } };
  }
  const isLegacy = (t: Todo) =>
    "earlyMinutes" in t || "notifiedEarly" in t || "notifiedDue" in t;
  if (next.todos.some(isLegacy)) {
    next = {
      ...next,
      todos: next.todos.map((t) => {
        if (!isLegacy(t)) return t;
        const copy: Todo = { ...t };
        const legacy = copy as unknown as Record<string, unknown>;
        if (t.recurrence === "none" && t.dueAt) {
          const key = new Date(t.dueAt).toISOString();
          if (legacy.notifiedEarly === true) copy.notifiedEarlyFor = key;
          if (legacy.notifiedDue === true) copy.notifiedDueFor = key;
        }
        delete legacy.earlyMinutes;
        delete legacy.notifiedEarly;
        delete legacy.notifiedDue;
        return copy;
      }),
    };
  }
  return next;
}
