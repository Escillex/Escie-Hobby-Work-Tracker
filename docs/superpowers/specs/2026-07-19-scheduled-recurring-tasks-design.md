# Scheduled Recurring Tasks — Design

Date: 2026-07-19
Status: Approved

## Goal

Let recurring todos carry a schedule time — "daily at 8:00", "weekly on Monday at
7:00" — so they notify at that time and show as due/overdue until completed.
Also move the early-warning lead time from a per-task field to a single global
setting.

## Decisions (from brainstorming)

- **Behavior at the scheduled time:** system notification (with early warning)
  plus a due/overdue state in the UI until the task is done.
- **Expressiveness:** time-of-day for daily; time-of-day plus one weekday for
  weekly. No day sets, no monthly, no multiple times per day.
- **Optionality:** the schedule is optional. A recurring todo without a time
  behaves exactly as today (startup reset, no notifications).
- **Missed occurrences:** if the app was closed at the scheduled time, the task
  shows overdue on launch but no catch-up notification fires.
- **Early warning:** one global "warn N minutes before" setting, replacing the
  per-task `earlyMinutes` field everywhere, including dated one-off todos.
- **Scope:** todos only. Media checklist items keep their existing recurrence
  behavior and get no schedules or notifications.

## Data model (`src/lib/types.ts`)

`Todo` changes:

- Add `scheduleTime?: string` — local time of day, `"HH:MM"` (24h). Only
  meaningful when `recurrence` is `"daily"` or `"weekly"`.
- Add `scheduleDay?: number` — weekday `0`–`6` (Sunday = 0), required for a
  scheduled weekly todo, unused for daily.
- Remove `earlyMinutes`.
- Replace `notifiedEarly?: boolean` / `notifiedDue?: boolean` with
  `notifiedEarlyFor?: string` / `notifiedDueFor?: string`. Each holds the
  occurrence timestamp (ISO) the notification fired for. One mechanism covers
  both kinds of todo: for a dated one-off the key is `dueAt`; for a scheduled
  recurring todo it is the current occurrence. A new occurrence produces a new
  key, so notification state self-resets with no extra reset logic.

`AppData.settings` changes:

- Add `earlyWarningMinutes: number` (default 10). Used for every early-warning
  notification.

## Pure logic — new `src/lib/schedule.ts`

All decision-making is pure and tested; the hook stays thin glue.

- `currentOccurrence(todo, now: Date): Date | undefined`
  - `undefined` when the todo has no usable schedule (`recurrence === "none"`,
    missing `scheduleTime`, or weekly without `scheduleDay`).
  - Daily: today's date at `scheduleTime` (local).
  - Weekly: the `scheduleDay` of the current week (week containing `now`,
    Sunday-start to match `scheduleDay = 0`) at `scheduleTime`. This may be in
    the past or the future within the week; callers compare against `now`.
- `dueTarget(todo, now): Date | undefined` — unified due time: parsed `dueAt`
  for one-off todos, `currentOccurrence` for scheduled recurring todos.
- `isOverdue(todo, now): boolean` — the due target has passed and the todo is
  not done for it (for recurring: `done` is false, or `lastDone` predates the
  occurrence date). Derived only; never stored.

Times are computed in local time via plain `Date` construction, matching the
existing `localDate()` convention.

## Scheduler (`src/lib/useTodoScheduler.ts`)

One unified loop over all todos (the current `recurrence !== "none"` skip goes
away):

1. Compute `target = dueTarget(todo, now)`; skip if `undefined` or the todo is
   done for that occurrence.
2. Early warning: when `now >= target − earlyWarningMinutes` and
   `notifiedEarlyFor !== key(target)`, notify "In N min" and record the key.
3. Due: when `now >= target` and `notifiedDueFor !== key(target)`, notify only
   if `now − target < 2 minutes` (grace window). Past the window — e.g. the app
   launched hours after the scheduled time — record the key silently; the task
   just shows overdue. The early key is recorded alongside so no stale "In N
   min" fires after the due moment.

`key(target)` is the occurrence ISO string. The 20-second poll interval stays.

## UI

- **Task editor** (`TasksView`): daily and weekly stay as modes in the
  existing dropdown, but the schedule inputs sit behind an on/off reminder
  toggle rather than always showing. Toggle on reveals the time input (plus a
  weekday picker for weekly); toggle off means no schedule — the todo behaves
  like today's recurring todos. The per-task early-minutes input is removed.
- **Settings panel**: one numeric "Early warning (minutes)" field bound to
  `settings.earlyWarningMinutes`.
- **Tasks view and widget**: scheduled recurring todos past their occurrence
  and not done render with the same overdue treatment dated todos use.

## Migration (`migrate()` in `src/lib/store.ts`)

Following the existing in-place upgrade pattern:

- Seed `settings.earlyWarningMinutes = 10` when absent.
- Drop `earlyMinutes` from every todo.
- Convert legacy booleans: `notifiedEarly: true` on a dated todo becomes
  `notifiedEarlyFor = dueAt` (same for due); booleans on recurring todos are
  simply dropped. Remove the boolean fields.

`resetRecurring()` keeps un-completing stale recurring todos at startup,
unchanged, minus the now-gone notified-flag resets.

## Error handling

- Malformed `scheduleTime` or out-of-range `scheduleDay` make
  `currentOccurrence` return `undefined` — the todo silently behaves as
  unscheduled rather than crashing the scheduler.
- `earlyWarningMinutes` is clamped to a sane minimum of 0 in the settings UI.

## Testing (vitest, colocated)

- `schedule.test.ts`: daily and weekly occurrence math, week boundaries
  (Sunday/Saturday), missing/invalid schedule fields, `isOverdue` against
  `done`/`lastDone`, `dueTarget` for one-offs.
- Migration currently has no test file; extract the new migration step as a
  pure function and cover it in a new colocated test: seeding the setting,
  dropping `earlyMinutes`, boolean-to-key conversion.
- Notification firing stays untested glue, per the repo convention.
