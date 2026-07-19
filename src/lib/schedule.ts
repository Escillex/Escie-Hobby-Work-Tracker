import type { Todo } from "./types";
import { localDate } from "./types";

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
