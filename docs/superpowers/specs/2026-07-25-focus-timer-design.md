# Focus timer — time spent per item

Date: 2026-07-25

## Problem

Focusing an item (the 🎯 button) sets `focus.now`, but nothing measures how long you
stay on it. The `HyperfocusTimer` panel already counts a session, yet it is wired to
nothing: it is local component state, started by hand, discarded on restart.

The gap is sharpest for games. Steam games arrive from `GetOwnedGames` with
`playtime_forever` stored as `progress` (hours), so a game row renders `42 h`.
Non-Steam games have no such source and sit at `0 h` forever.

## Goal

Focusing an item starts a timer. Each item accumulates a lifetime total across every
focus session, so you can see how much time you have spent on it. Non-Steam games get
a real playtime number.

## Data model

One new field on `AppData`:

```ts
time: Record<string, number>; // ledger: ref key -> seconds accumulated
```

The key is derived from the focus pointer, so one ledger serves all four focus kinds
(`todo`, `note`, `media`, `task`):

```
refKey(ref) === `${ref.kind}:${ref.parentId ?? ""}:${ref.id}`
// "todo::abc123", "task:mediaId:itemId", "media::xyz"
```

A ledger was chosen over a `timeSpent` field on each of `Todo` / `Note` / `MediaEntry`
/ `ChecklistItem` because banking time on a checklist item would otherwise mean
rebuilding its parent media entry's nested array every 30 seconds, and because it
collapses four display and edit code paths into one.

`migrate()` adds `time: {}` when absent.

### Session state is not persisted

The start of the current session lives in the timer component, not in `AppData`.
Consequences, all intended:

- Reopening the app with something focused begins a fresh session at `0` while the
  lifetime total carries over.
- Time while the app was closed is never counted.

## Banking

A 30-second tick dispatches `time/bank` with the current focus's key and the seconds
elapsed since the previous bank. Time is also banked immediately when the focus
changes, when the timer is paused, and on unmount.

A hard crash therefore loses at most 30 seconds.

There is no idle detection and no auto-stop: a session left running counts until it is
paused or the focus is cleared. This is a deliberate choice — "everything should get
caught". The 1h/2h check-in nudges and the manual Pause control are the counterweight,
along with an editable total for repairing a session left running overnight.

## Reducer actions

```ts
| { type: "time/bank"; key: string; seconds: number }  // add to the total
| { type: "time/set"; key: string; seconds: number }   // overwrite, for the edit field
```

Orphans (ledger keys whose item was deleted) are dropped by `purgeOrphans()` during
`loadData()`, rather than by hooking all four delete actions. A full scan on load is
simpler and self-healing, matching the vault reconcile's philosophy.

## New module: `src/lib/time.ts`

All decision-making is pure and directly tested, per the repo convention; the ticking
and dispatching stay in thin untested component glue.

| Function | Behaviour |
| --- | --- |
| `refKey(ref)` | Ledger key for a `FocusRef`. |
| `formatDuration(secs)` | `"1h 20m"`, `"45m"`, `"30s"`; `"0m"` at zero. |
| `parseDuration(input)` | `"2h 30m"`, `"90m"`, `"1.5h"`, `"45"` (bare = minutes) → seconds; `null` when unparseable. |
| `gameHours(entry, ledger)` | Steam's `progress` when `steamAppId` is set, otherwise ledger seconds as whole hours, rounded down (matching Steam's integer-hours display). |
| `purgeOrphans(data)` | Ledger with keys for missing items removed. |

## UI

### Hyperfocus panel

Becomes focus-aware and is the universal display and edit surface for time, since
todos and checklist items have no edit modal of their own.

- **Focused** — shows the item's label, the live session clock, and the lifetime total
  beside it (`12:04 · 1h 20m total`). Runs automatically; no Start press needed.
- **Nothing focused** — the current manual "Start session" behaviour, untethered. An
  untethered session has no ref, so it is displayed but banked nowhere.
- **Pause** — new toggle, shown only while focused. Banks pending time and stops the
  clock without giving up the focus, for stepping away. Per the visible-affordance
  preference it is rendered whenever a focus exists, not conditionally hidden.
  Pause is component state, not persisted; focusing a different item clears it and the
  new item's session starts running.
- The total is click-to-edit, accepting `parseDuration` input and dispatching
  `time/set`.
- The 1h/2h nudges and the countdown alarm are unchanged.

### Now card

Shows the focused item's lifetime total under its label as static text.

### Media detail modal

`EntryDetailModal` gains a "Time spent" row, editable, for the entry's ledger total.
Games are the headline case, so this is where a game's number is corrected.

### Game rows

A game without `steamAppId` renders its ledger hours in the same `N h` slot that Steam
games use for `progress` (the `hoursMode` branch in `MediaTracker`).

The ledger never writes to `progress`. A Steam re-sync overwrites `progress` wholesale
via `media/replaceCategory`, so anything stored there would be silently wiped.

## Testing

`src/lib/time.test.ts`, covering:

- `refKey` — distinct keys per kind; a checklist item's parent is part of its key.
- `formatDuration` — hours/minutes/seconds boundaries and zero.
- `parseDuration` — each accepted form, plus `null` for garbage.
- `gameHours` — Steam entry returns `progress`; non-Steam returns ledger hours; an
  untracked non-Steam entry returns 0.
- `purgeOrphans` — drops keys for deleted items, keeps live ones including checklist
  items reached through their parent.

`migrate.test.ts` gains a case asserting `time` is added to an older data file and that
an existing ledger is left alone.

## Out of scope

- Per-day or per-week history. The ledger stores lifetime totals only; a session log
  would grow `data.json` without being asked for.
- Idle detection and auto-stop, explicitly declined.
- Writing focus time back to Steam or AniList.
- Time on the `next` focus slot — only `now` accumulates.
