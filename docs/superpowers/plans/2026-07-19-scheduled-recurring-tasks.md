# Scheduled Recurring Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recurring todos can carry a schedule ("daily at 08:00", "weekly Mon 07:00") that drives notifications and a derived overdue state; the per-task early-warning minutes becomes one global setting.

**Architecture:** All decision logic (occurrence math, overdue, migration) lives in a new pure module `src/lib/schedule.ts` with colocated vitest tests. `useTodoScheduler` becomes a thin unified loop over one-off and scheduled recurring todos, using occurrence-keyed notification state that self-resets each cycle. UI changes are confined to `TasksView`, `TasksWidget`, and `SettingsPanel`.

**Tech Stack:** Tauri 2 + React 19 + TypeScript, vitest, single-reducer state (`src/lib/reducer.ts` via `useApp()`).

**Spec:** `docs/superpowers/specs/2026-07-19-scheduled-recurring-tasks-design.md`

## Global Constraints

- `pnpm build` (tsc + vite) is the only static check; it must pass at the end of every task.
- `pnpm test` (vitest) must pass at the end of every task.
- Data-shape changes must be upgraded in place by `migrate()` in `src/lib/store.ts` — user data files persist across versions.
- Tests cover pure logic only; Tauri/notification glue stays untested (repo convention).
- Times are local; `scheduleTime` is strict `"HH:MM"` 24h; `scheduleDay` is 0–6, Sunday = 0.
- Commit messages: short imperative sentence, no prefix, no Co-Authored-By trailer (repo/user convention).
- Missed occurrences never fire catch-up notifications — a 2-minute grace window gates the "Due now" notification.

---

### Task 1: Pure schedule logic (`schedule.ts`)

**Files:**
- Modify: `src/lib/types.ts:110-121` (Todo), `src/lib/types.ts:128-142` (Settings) — additive only
- Create: `src/lib/schedule.ts`
- Test: `src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `Todo`, `localDate` from `./types`.
- Produces (later tasks rely on these exact signatures):
  - `currentOccurrence(todo: Todo, now: Date): Date | undefined`
  - `dueTarget(todo: Todo, now: Date): Date | undefined`
  - `doneForOccurrence(todo: Todo, occurrence: Date): boolean`
  - `isOverdue(todo: Todo, now: Date): boolean`
  - New optional Todo fields: `scheduleTime`, `scheduleDay`, `notifiedEarlyFor`, `notifiedDueFor`
  - New optional Settings field: `earlyWarningMinutes`

- [ ] **Step 1: Add the new optional fields to the types**

In `src/lib/types.ts`, change the `Todo` interface (keep the legacy fields for now — they are removed with the migration in Task 3):

```ts
export interface Todo {
  id: string;
  text: string;
  createdAt: string; // ISO
  dueAt?: string; // ISO, optional — undated todos are allowed
  earlyMinutes: number; // heads-up notification this many minutes before dueAt
  recurrence: Recurrence;
  scheduleTime?: string; // "HH:MM" local — reminder time for a recurring todo
  scheduleDay?: number; // 0-6 (Sunday = 0) — weekday of a scheduled weekly todo
  lastDone?: string; // YYYY-MM-DD a recurring task was last completed
  notifiedEarly?: boolean;
  notifiedDue?: boolean;
  notifiedEarlyFor?: string; // occurrence ISO the early warning fired for
  notifiedDueFor?: string; // occurrence ISO the due notification fired for
  done: boolean;
}
```

In the `Settings` interface, add after `fontFamily?: string;`:

```ts
  earlyWarningMinutes?: number; // minutes of heads-up before any due time (default 10)
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/schedule.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/schedule.test.ts`
Expected: FAIL — cannot resolve `./schedule`.

- [ ] **Step 4: Implement `src/lib/schedule.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/schedule.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Full check and commit**

Run: `pnpm build && pnpm test` — expected: both pass.

```bash
git add src/lib/types.ts src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "Add pure occurrence and overdue logic for scheduled recurring todos"
```

---

### Task 2: Unified notification scheduler

**Files:**
- Modify: `src/lib/useTodoScheduler.ts` (full rewrite, currently 30 lines)

**Interfaces:**
- Consumes: `dueTarget`, `doneForOccurrence` from `./schedule` (Task 1); `settings.earlyWarningMinutes`.
- Produces: nothing new — same `useTodoScheduler()` hook already mounted in `App.tsx`. Writes `notifiedEarlyFor` / `notifiedDueFor` occurrence keys (`target.toISOString()`); Task 3's migration must produce keys in the same format.

- [ ] **Step 1: Rewrite `src/lib/useTodoScheduler.ts`**

Replace the whole file with:

```ts
import { useEffect } from "react";
import { useApp } from "./state";
import { notify } from "./notify";
import { doneForOccurrence, dueTarget } from "./schedule";

/** "Due now" only fires when the moment just passed; anything older (e.g.
 *  the app launched hours late) records its key silently and the task
 *  simply shows overdue. */
const GRACE_MS = 2 * 60_000;

/** Fires early + due system notifications for dated one-off todos and
 *  scheduled recurring todos. Runs at app level so reminders work
 *  regardless of the active view. */
export function useTodoScheduler() {
  const { data, dispatch } = useApp();

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const earlyMs = (data.settings.earlyWarningMinutes ?? 10) * 60_000;
      for (const t of data.todos) {
        const target = dueTarget(t, now);
        if (!target || doneForOccurrence(t, target)) continue;
        const key = target.toISOString();
        const due = target.getTime();
        if (t.notifiedDueFor !== key && now.getTime() >= due) {
          if (now.getTime() - due < GRACE_MS) notify("Due now", t.text);
          dispatch({
            type: "todo/update",
            todo: { ...t, notifiedDueFor: key, notifiedEarlyFor: key },
          });
        } else if (t.notifiedEarlyFor !== key && now.getTime() >= due - earlyMs) {
          const mins = Math.max(1, Math.round((due - now.getTime()) / 60_000));
          notify(`In ${mins} min`, t.text);
          dispatch({ type: "todo/update", todo: { ...t, notifiedEarlyFor: key } });
        }
      }
    };
    check();
    const timer = window.setInterval(check, 20_000);
    return () => window.clearInterval(timer);
  }, [data.todos, data.settings.earlyWarningMinutes, dispatch]);
}
```

Notes for the implementer:
- The old `t.recurrence !== "none"` skip is gone on purpose — `dueTarget` returns `undefined` for unscheduled recurring todos, which `!target` filters out.
- The legacy `notifiedEarly`/`notifiedDue` booleans are intentionally no longer read or written; Task 3 migrates and removes them.

- [ ] **Step 2: Build and test**

Run: `pnpm build && pnpm test`
Expected: both pass (the removed reads of `earlyMinutes`/`notifiedEarly` don't break anything else; those fields still exist in the type until Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/lib/useTodoScheduler.ts
git commit -m "Notify for scheduled recurring todos with occurrence-keyed state"
```

---

### Task 3: Migration and legacy field removal

**Files:**
- Modify: `src/lib/schedule.ts` (add `migrateScheduling`)
- Modify: `src/lib/types.ts:110-121` (remove legacy Todo fields)
- Modify: `src/lib/store.ts:27-104` (`migrate()`), `src/lib/store.ts:122-129` (`resetRecurring()`)
- Modify: `src/components/TasksView.tsx` (drop `earlyMinutes` from `add()`, remove per-task early UI)
- Test: `src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `AppData`, `Todo` from `./types`.
- Produces: `migrateScheduling(data: AppData): AppData`, exported from `src/lib/schedule.ts`, called at the end of `migrate()` in `store.ts`.

- [ ] **Step 1: Write the failing migration tests**

Append to `src/lib/schedule.test.ts` (add `migrateScheduling` to the existing import from `./schedule`, and `defaultData` to a new import from `./types`):

```ts
import { defaultData } from "./types";
import { migrateScheduling } from "./schedule";

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
```

Also update the `base` fixture at the top of the file — remove `earlyMinutes: 30,` from it (the field leaves the type in this task; the Task 1 tests still pass without it) — and add a `clean` alias below it used by the migration tests:

```ts
const clean = base;
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run src/lib/schedule.test.ts`
Expected: FAIL — `migrateScheduling` is not exported.

- [ ] **Step 3: Remove the legacy fields from `Todo`**

In `src/lib/types.ts`, delete these three lines from `Todo`:

```ts
  earlyMinutes: number; // heads-up notification this many minutes before dueAt
  notifiedEarly?: boolean;
  notifiedDue?: boolean;
```

- [ ] **Step 4: Implement `migrateScheduling` in `src/lib/schedule.ts`**

Add `AppData` to the type import and append:

```ts
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
        const legacy = copy as Record<string, unknown>;
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
```

The key must be `new Date(t.dueAt).toISOString()` — the same normalization the scheduler applies — so migrated keys keep suppressing already-sent notifications.

- [ ] **Step 5: Wire into `migrate()` and fix compile fallout**

In `src/lib/store.ts`:
- Add `import { migrateScheduling } from "./schedule";`
- At the end of `migrate()`, just before `return next;`, add:

```ts
  // Per-todo early-warning fields moved to one global setting.
  next = migrateScheduling(next);
```

- In `resetRecurring()`, change line 127 from
  `? { ...t, done: false, notifiedEarly: false, notifiedDue: false }` to
  `? { ...t, done: false }` (occurrence keys self-reset; no flags to clear).

In `src/components/TasksView.tsx`:
- Delete `const EARLY_CHOICES = [5, 15, 30, 60];` (line 12) and the `const [early, setEarly] = useState(30);` state (line 21).
- Delete `earlyMinutes: early,` from the `add()` todo literal (line 49).
- Delete the early-minutes `<select>` block inside the `mode === "scheduled"` fragment (lines 131–142) — keep the time input.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/schedule.test.ts`
Expected: PASS.

- [ ] **Step 7: Full check and commit**

Run: `pnpm build && pnpm test` — expected: both pass, no remaining references to `earlyMinutes`/`notifiedEarly`/`notifiedDue` (`grep -rn "earlyMinutes\|notifiedEarly\b\|notifiedDue\b" src/` should only match `earlyWarningMinutes` and the `*For` fields).

```bash
git add src/lib/types.ts src/lib/schedule.ts src/lib/schedule.test.ts src/lib/store.ts src/components/TasksView.tsx
git commit -m "Migrate per-todo early warning to a global setting"
```

---

### Task 4: Schedule inputs and overdue display in TasksView

**Files:**
- Modify: `src/components/TasksView.tsx`

**Interfaces:**
- Consumes: `isOverdue` from `../lib/schedule` (Task 1); `scheduleTime`/`scheduleDay` Todo fields.
- Produces: exported `WEEKDAYS` constant from `src/lib/schedule.ts` (Task 5's widget reuses it).

- [ ] **Step 1: Add `WEEKDAYS` to `src/lib/schedule.ts`**

```ts
/** Display names indexed by scheduleDay (Sunday = 0). */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
```

- [ ] **Step 2: Add the reminder toggle and schedule inputs to the add form**

Daily/weekly stay as modes in the existing dropdown; the schedule inputs sit behind an on/off reminder toggle (spec: "toggle reveals schedule").

In `TasksView.tsx`:

Add imports:

```ts
import { isOverdue, WEEKDAYS } from "../lib/schedule";
```

Add state next to the existing `time` state:

```ts
const [schedOn, setSchedOn] = useState(false);
const [schedTime, setSchedTime] = useState("08:00");
const [schedDay, setSchedDay] = useState(1); // Monday
```

Extend the todo literal in `add()` (after the `dueAt:` entry):

```ts
      scheduleTime:
        (mode === "daily" || mode === "weekly") && schedOn && schedTime
          ? schedTime
          : undefined,
      scheduleDay:
        mode === "weekly" && schedOn && schedTime ? schedDay : undefined,
```

In the `tasks-add-row` div, after the `mode === "scheduled"` fragment, add:

```tsx
            {(mode === "daily" || mode === "weekly") && (
              <>
                <button
                  className={`btn ${schedOn ? "primary" : "ghost"} icon`}
                  title={schedOn ? "Reminder on — click to disable" : "Remind at a set time"}
                  onClick={() => setSchedOn(!schedOn)}
                >
                  {IC.clock}
                </button>
                {schedOn && mode === "weekly" && (
                  <select
                    className="input"
                    value={schedDay}
                    title="Day of week"
                    onChange={(e) => setSchedDay(Number(e.target.value))}
                  >
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}
                {schedOn && (
                  <input
                    className="input"
                    type="time"
                    value={schedTime}
                    title="Reminder time"
                    onChange={(e) => setSchedTime(e.target.value)}
                  />
                )}
              </>
            )}
```

Toggle off (or an empty time) means "no schedule" — the todo behaves exactly like today's recurring todos. `IC` is already imported in this file.

- [ ] **Step 3: Derive overdue via the shared predicate and label schedules**

In `TaskRow` (line 221), replace the `overdue` computation with:

```ts
  const overdue = isOverdue(todo, new Date());
```

(This keeps identical behavior for dated one-offs and adds it for scheduled recurring todos; the existing `.overdue`/`.done` CSS classes need no changes.)

In the Repeating section (line 187), replace `label={t.recurrence}` with `label={recurringLabel(t)}` and add next to `prettyDay` at the bottom of the file:

```ts
function recurringLabel(t: Todo): string {
  if (!t.scheduleTime) return t.recurrence;
  const day =
    t.recurrence === "weekly" && t.scheduleDay != null
      ? `${WEEKDAYS[t.scheduleDay]} `
      : "";
  return `${t.recurrence} · ${day}${t.scheduleTime}`;
}
```

- [ ] **Step 4: Build, test, commit**

Run: `pnpm build && pnpm test` — expected: both pass.

```bash
git add src/lib/schedule.ts src/components/TasksView.tsx
git commit -m "Add schedule time and weekday inputs for recurring tasks"
```

---

### Task 5: Widget display and global setting UI

**Files:**
- Modify: `src/components/TasksWidget.tsx`
- Modify: `src/components/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `isOverdue`, `WEEKDAYS` (not needed here, day filter uses `getDay()`), `scheduleTime`/`scheduleDay`, `settings.earlyWarningMinutes`, existing `settings/update` action.
- Produces: nothing consumed later.

- [ ] **Step 1: Show scheduled recurring todos in the widget's day list**

In `TasksWidget.tsx`:

Add import:

```ts
import { isOverdue } from "../lib/schedule";
```

After the `dayTodos` computation (line 21), add:

```ts
  const selectedDow = new Date(`${selected}T00:00`).getDay();
  const recurringForDay = data.todos.filter(
    (t) =>
      t.recurrence !== "none" &&
      t.scheduleTime != null &&
      (t.recurrence === "daily" || t.scheduleDay === selectedDow),
  );
```

Replace the `complete` handler (line 33) so recurring completion records `lastDone` (mirrors `TasksView`):

```ts
  const complete = (t: Todo) =>
    dispatch({
      type: "todo/update",
      todo:
        t.recurrence === "none"
          ? { ...t, done: !t.done }
          : { ...t, done: true, lastDone: today },
    });
```

Change the empty state (line 51) to account for both lists:

```tsx
        {dayTodos.length === 0 && recurringForDay.length === 0 && (
          <p className="tw-empty">Nothing scheduled.</p>
        )}
```

After the `dayTodos.map(...)` block, add a second list for the recurring todos:

```tsx
        {recurringForDay.map((t) => {
          const overdue = selected === today && isOverdue(t, new Date());
          const checked = t.done && t.lastDone === today;
          return (
            <div
              key={t.id}
              className={`tw-item ${overdue ? "overdue" : ""} ${checked ? "done" : ""}`}
            >
              <button
                className={`check-box ${checked ? "checked" : ""}`}
                onClick={() => complete(t)}
                title={checked ? "Done today" : "Mark done"}
              >
                {checked ? IC.check : null}
              </button>
              <span className="tw-text">{t.text}</span>
              <button
                className={`btn ghost icon tw-focus ${isFocused({ kind: "todo", id: t.id }) ? "focused" : ""}`}
                title="Focus on this"
                onClick={() => focusNow({ kind: "todo", id: t.id })}
              >
                {IC.target}
              </button>
              <span className="tw-time">{t.scheduleTime}</span>
            </div>
          );
        })}
```

- [ ] **Step 2: Add the global early-warning field to Settings**

In `SettingsPanel.tsx`, directly after the Font family field's closing `</div>` (the last `.field` before the modal content ends, around line 240), add:

```tsx
      <div className="panel-title">Notifications</div>
      <div className="field">
        <label>Early warning (minutes before a task is due)</label>
        <input
          className="input"
          type="number"
          min={0}
          value={s.earlyWarningMinutes ?? 10}
          onChange={(e) =>
            set({ earlyWarningMinutes: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </div>
```

- [ ] **Step 3: Build, test, commit**

Run: `pnpm build && pnpm test` — expected: both pass.

```bash
git add src/components/TasksWidget.tsx src/components/SettingsPanel.tsx
git commit -m "Show scheduled recurring tasks in the widget and expose the early warning setting"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Static checks**

Run: `pnpm build && pnpm test`
Expected: tsc clean, vitest all green.

- [ ] **Step 2: Drive the real app**

Run `pnpm tauri dev` and verify by hand (or via the `verify` skill):

1. Add a daily task with a time 2 minutes from now → early warning is skipped (already inside the window is fine), "Due now" notification fires at the time, the row turns overdue.
2. Complete it → overdue clears; the checkbox shows done.
3. Add a weekly task for today's weekday with a time in the past → it shows overdue immediately, and no notification fired for it (grace window).
4. Add a daily task with no time → behaves like before: no notification, no overdue.
5. Open Settings → change Early warning to 5 → confirm it persists after an app restart (`data.json` gains `earlyWarningMinutes`).
6. Restart with a pre-existing data file → no crash, old todos lost `earlyMinutes` (check `~/.local/share/com.hyperfocus.dash/data.json`).

- [ ] **Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch — merge/PR decision belongs to the user.
