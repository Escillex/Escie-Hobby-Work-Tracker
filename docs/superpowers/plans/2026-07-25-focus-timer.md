# Focus Timer and Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## In plain terms

**What you'll be able to do when this is done:**

Click the focus button on anything — a task, a note, a game, a checklist item — and a
timer starts on its own. You don't press start. The Hyperfocus panel shows the item's
name, how long this sitting has lasted, and how much time you've put into that thing
in total across every time you've focused it.

Your non-Steam games finally get an hours number. Steam games already show hours
because Steam tells us; games you added yourself have always sat at "0 h". Now they
fill in from the time you actually spend focused on them.

If you walk away, hit Pause so the clock stops without losing your focus. Nothing stops
on its own — you said you'd rather it kept counting, so it will. If a number ends up
wrong because you left it running overnight, you can click it and type the right value.

The queue gets fixed too. Right now there's no way to put something in "Next" on
purpose — it only catches whatever you were focused on before. After this there's a
second button next to the focus button that means "do this after", and Next becomes a
proper list you can add to, remove from, and click to jump to.

**One thing that changes that you might not expect:** focusing something new will no
longer shove the old thing into Next. Right now it does, silently. Once you're building
the queue yourself, having it stuffed with everything you happen to click makes it
useless — so from now on, focusing something just switches to it. If you want to keep
the old one, queue it.

**What this does not do:** no history or per-day breakdown, just lifetime totals per
item. Nothing gets sent to Steam. Queued items don't accumulate time — only the thing
you're actually focused on does. Time doesn't count while the app is closed.

---

## Technical plan

**Goal:** Focusing an item accumulates time against it in a persistent ledger, surfaced
in the Hyperfocus panel and as playtime for non-Steam games; `focus.next` becomes a real
queue with a deliberate add control.

**Architecture:** A single `AppData.time` ledger maps a key derived from the `FocusRef`
to accumulated seconds, so one code path serves all four focus kinds. All decisions live
in a new pure `src/lib/time.ts`; the ticking and dispatching stay in component glue.
`focus.next` widens from `FocusRef?` to `FocusRef[]`, and `focus/set` is replaced by four
explicit actions.

**Tech Stack:** TypeScript, React 19, Vitest. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-focus-timer-design.md`.
- **Never add `Co-Authored-By` trailers to commits.** Global user rule.
- `pnpm build` (tsc + vite) is the only static check; there is no linter.
- `pnpm test` runs Vitest. Tests are colocated `*.test.ts` in `src/lib/` and cover pure
  logic only. Do not write component tests.
- **The build will fail after Tasks 1 and 5** — they change `AppData`'s shape before the
  consumers are updated. It must pass from Task 3 onward and at the end of every later
  task. This is expected; do not "fix" it by reverting the shape change.
- Any `AppData` shape change needs a matching step in `migrate()` (`src/lib/migrate.ts`).
  User data files persist across versions.
- Controls must not be hidden until a precondition is met. Render them disabled with a
  title explaining why, per the established preference in this codebase.
- Commit after every task.
- Do not run `pnpm tauri dev` against the user's real data. Use `.claude/skills/verify`'s
  seeded `XDG_DATA_HOME` recipe if runtime verification is needed.

---

### Task 1: Queue data shape and migration

**Files:**
- Modify: `src/lib/types.ts` (the `AppData.focus` field, `defaultData()`)
- Modify: `src/lib/migrate.ts`
- Test: `src/lib/migrate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AppData["focus"]` is `{ now?: FocusRef; next: FocusRef[] }`. `sameRef(a, b)`
  moves to `types.ts` with signature `(a?: FocusRef, b?: FocusRef) => boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/migrate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/migrate.test.ts`
Expected: FAIL — `out.focus.next` is the bare object `{ kind: "note", id: "b" }`, not an array.

- [ ] **Step 3: Widen the type**

In `src/lib/types.ts`, change the `focus` field on `AppData`:

```ts
  focus: { now?: FocusRef; next: FocusRef[] };
```

In `defaultData()`, change `focus: {},` to:

```ts
    focus: { next: [] },
```

Also move `sameRef` here from `focus.ts` — the reducer needs it in Task 2 and must not
import from `focus.ts`, which pulls in React context. Add at the end of `types.ts`:

```ts
/** Two focus pointers reference the same item. */
export const sameRef = (a?: FocusRef, b?: FocusRef): boolean =>
  a != null &&
  b != null &&
  a.kind === b.kind &&
  a.id === b.id &&
  a.parentId === b.parentId;
```

In `src/lib/focus.ts`, delete the local `sameRef` definition and re-export the moved one
so existing importers keep working. Change the import line to:

```ts
import type { AppData, FocusRef } from "./types";
import { sameRef } from "./types";
import { useApp } from "./state";

export { sameRef };
```

- [ ] **Step 4: Add the migration step**

In `src/lib/migrate.ts`, change the existing focus guard from `focus: {}` to:

```ts
  if (!next.focus) {
    next = { ...next, focus: { next: [] } };
  }
```

Then add this step immediately before the `return next;` at the end:

```ts
  // The single `next` focus slot became an ordered queue.
  const legacyNext = (next.focus as { next?: FocusRef | FocusRef[] }).next;
  if (!Array.isArray(legacyNext)) {
    next = {
      ...next,
      focus: { ...next.focus, next: legacyNext ? [legacyNext] : [] },
    };
  }
```

Add `FocusRef` to the type import at the top of the file:

```ts
import type { AppData, FocusRef, Note, Todo } from "./types";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/migrate.test.ts`
Expected: PASS, all cases including the pre-existing tags-v2 ones.

- [ ] **Step 6: Commit**

`pnpm build` fails here — `reducer.ts` and `NowNextCard.tsx` still use the old shape.
That is expected and is fixed in Tasks 2 and 3.

```bash
git add src/lib/types.ts src/lib/migrate.ts src/lib/migrate.test.ts src/lib/focus.ts
git commit -m "Widen the focus queue to an ordered list"
```

---

### Task 2: Queue reducer actions

**Files:**
- Modify: `src/lib/reducer.ts` (the `Action` union, the `focus/set` case)
- Test: `src/lib/reducer.test.ts`

**Interfaces:**
- Consumes: `sameRef` from `./types` (Task 1).
- Produces: actions `{ type: "focus/now"; ref?: FocusRef }`,
  `{ type: "focus/queue"; ref: FocusRef }`, `{ type: "focus/unqueue"; ref: FocusRef }`,
  `{ type: "focus/advance" }`. `focus/set` no longer exists.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/reducer.test.ts`:

```ts
describe("focus queue", () => {
  const a = { kind: "todo" as const, id: "a" };
  const b = { kind: "note" as const, id: "b" };
  const c = { kind: "task" as const, id: "c", parentId: "m1" };

  it("queue appends in order", () => {
    let s = reducer(defaultData(), { type: "focus/queue", ref: a });
    s = reducer(s, { type: "focus/queue", ref: b });
    expect(s.focus.next).toEqual([a, b]);
  });

  it("queue ignores a ref already queued", () => {
    let s = reducer(defaultData(), { type: "focus/queue", ref: a });
    s = reducer(s, { type: "focus/queue", ref: { ...a } });
    expect(s.focus.next).toEqual([a]);
  });

  it("queue ignores the ref already focused", () => {
    const base = reducer(defaultData(), { type: "focus/now", ref: a });
    const s = reducer(base, { type: "focus/queue", ref: a });
    expect(s.focus.next).toEqual([]);
  });

  it("queue distinguishes checklist items by parent", () => {
    let s = reducer(defaultData(), { type: "focus/queue", ref: c });
    s = reducer(s, { type: "focus/queue", ref: { ...c, parentId: "m2" } });
    expect(s.focus.next).toHaveLength(2);
  });

  it("unqueue removes only the matching ref", () => {
    let s = reducer(defaultData(), { type: "focus/queue", ref: a });
    s = reducer(s, { type: "focus/queue", ref: b });
    s = reducer(s, { type: "focus/unqueue", ref: a });
    expect(s.focus.next).toEqual([b]);
  });

  it("advance promotes the head and shortens the queue", () => {
    let s = reducer(defaultData(), { type: "focus/queue", ref: a });
    s = reducer(s, { type: "focus/queue", ref: b });
    s = reducer(s, { type: "focus/advance" });
    expect(s.focus.now).toEqual(a);
    expect(s.focus.next).toEqual([b]);
  });

  it("advance on an empty queue clears now", () => {
    const base = reducer(defaultData(), { type: "focus/now", ref: a });
    const s = reducer(base, { type: "focus/advance" });
    expect(s.focus.now).toBeUndefined();
    expect(s.focus.next).toEqual([]);
  });

  it("focus/now replaces now without touching the queue", () => {
    let s = reducer(defaultData(), { type: "focus/queue", ref: b });
    s = reducer(s, { type: "focus/now", ref: a });
    s = reducer(s, { type: "focus/now", ref: c });
    expect(s.focus.now).toEqual(c);
    expect(s.focus.next).toEqual([b]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/reducer.test.ts`
Expected: FAIL — the action types do not exist, and unknown actions hit `default` and
return state unchanged.

- [ ] **Step 3: Replace the action and the case**

In `src/lib/reducer.ts`, replace the `focus/set` line in the `Action` union with:

```ts
  | { type: "focus/now"; ref?: FocusRef }
  | { type: "focus/queue"; ref: FocusRef }
  | { type: "focus/unqueue"; ref: FocusRef }
  | { type: "focus/advance" }
```

Add `sameRef` to the value import from `./types`:

```ts
import { localDate, sameRef } from "./types";
```

Replace the `case "focus/set":` block with:

```ts
    case "focus/now":
      return { ...state, focus: { ...state.focus, now: action.ref } };
    case "focus/queue": {
      const { now, next } = state.focus;
      if (sameRef(now, action.ref) || next.some((r) => sameRef(r, action.ref))) {
        return state;
      }
      return { ...state, focus: { ...state.focus, next: [...next, action.ref] } };
    }
    case "focus/unqueue":
      return {
        ...state,
        focus: {
          ...state.focus,
          next: state.focus.next.filter((r) => !sameRef(r, action.ref)),
        },
      };
    case "focus/advance":
      return {
        ...state,
        focus: { now: state.focus.next[0], next: state.focus.next.slice(1) },
      };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`pnpm build` still fails — `NowNextCard.tsx` and `focus.ts` dispatch `focus/set`. Fixed
in Task 3.

```bash
git add src/lib/reducer.ts src/lib/reducer.test.ts
git commit -m "Replace focus/set with explicit queue actions"
```

---

### Task 3: Focus hook and the Next card

**Files:**
- Modify: `src/lib/focus.ts` (`useFocusActions`)
- Modify: `src/components/NowNextCard.tsx`
- Modify: `src/components/NowNextCard.css`

**Interfaces:**
- Consumes: the four actions from Task 2.
- Produces: `useFocusActions()` returns
  `{ focusNow, queue, isNow, isQueued, isFocused }`, each taking a `FocusRef`. `queue`
  and `focusNow` return `void`; the three predicates return `boolean`.

- [ ] **Step 1: Rewrite the hook**

Replace the body of `useFocusActions` in `src/lib/focus.ts` with:

```ts
/** Focus actions shared by every place that can set the current focus. */
export function useFocusActions() {
  const { data, dispatch } = useApp();
  const focus = data.focus;

  /** Make `ref` the NOW focus. Any previous NOW is simply dropped — the queue
   *  is curated deliberately, so nothing is demoted into it automatically. */
  const focusNow = (ref: FocusRef) => {
    if (sameRef(focus.now, ref)) return;
    dispatch({ type: "focus/now", ref });
    dispatch({ type: "focus/unqueue", ref });
  };

  const queue = (ref: FocusRef) => dispatch({ type: "focus/queue", ref });

  const isNow = (ref: FocusRef) => sameRef(focus.now, ref);
  const isQueued = (ref: FocusRef) => focus.next.some((r) => sameRef(r, ref));
  const isFocused = (ref: FocusRef) => isNow(ref) || isQueued(ref);

  return { focusNow, queue, isNow, isQueued, isFocused };
}
```

- [ ] **Step 2: Rewrite the Next card**

Replace `src/components/NowNextCard.tsx` in full:

```tsx
import { useApp } from "../lib/state";
import { resolveFocus } from "../lib/focus";
import type { FocusRef } from "../lib/types";
import { IC } from "../lib/icons";
import "./NowNextCard.css";

export function NowNextCard() {
  const { data, dispatch } = useApp();

  const nowRef = data.focus.now;
  const queue = data.focus.next;
  const now = nowRef ? resolveFocus(data, nowRef) : null;

  // Complete the underlying item (for todos/tasks), then pull the queue head up.
  const finishNow = () => {
    if (nowRef && now?.completable) completeItem(nowRef);
    dispatch({ type: "focus/advance" });
  };

  const completeItem = (ref: FocusRef) => {
    if (ref.kind === "todo") {
      const t = data.todos.find((x) => x.id === ref.id);
      if (t) dispatch({ type: "todo/update", todo: { ...t, done: true, lastDone: t.recurrence !== "none" ? new Date().toISOString().slice(0, 10) : undefined } });
    } else if (ref.kind === "task") {
      const m = data.media.entries.find((x) => x.id === ref.parentId);
      if (m) {
        dispatch({
          type: "media/update",
          entry: {
            ...m,
            checklist: (m.checklist ?? []).map((c) =>
              c.id === ref.id
                ? {
                    ...c,
                    done: true,
                    lastDone:
                      c.recurrence && c.recurrence !== "none"
                        ? new Date().toISOString().slice(0, 10)
                        : c.lastDone,
                  }
                : c,
            ),
          },
        });
      }
    }
  };

  const promote = (ref: FocusRef) => {
    dispatch({ type: "focus/now", ref });
    dispatch({ type: "focus/unqueue", ref });
  };

  return (
    <section className="now-next">
      <div className="now-card glass">
        <div className="panel-title">
          <span className="now-dot" /> Now
        </div>
        {now ? (
          <>
            <p className="now-text">{now.label}</p>
            {now.sublabel && <p className="now-sub">{now.sublabel}</p>}
            <div className="now-actions">
              <button className="btn primary" onClick={finishNow}>
                {IC.check} {now.completable ? "Done" : "Clear"}
                {queue.length > 0 ? " → pull next" : ""}
              </button>
              {now.completable && (
                <button className="btn ghost" onClick={() => dispatch({ type: "focus/advance" })}>
                  Clear
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="now-empty">
            One thing at a time. Set a focus with the {IC.target} button on any
            game, show, to-do, or note.
          </p>
        )}
      </div>
      <div className="next-card glass">
        <div className="panel-title">Next</div>
        {queue.length > 0 ? (
          <ul className="next-list">
            {queue.map((ref, i) => {
              const item = resolveFocus(data, ref);
              if (!item) return null;
              return (
                <li className="next-item" key={`${ref.kind}:${ref.parentId ?? ""}:${ref.id}`}>
                  <button
                    className="next-item-label"
                    title="Focus on this now"
                    onClick={() => promote(ref)}
                  >
                    <span className="next-item-pos">{i + 1}</span>
                    {item.label}
                  </button>
                  <button
                    className="btn ghost icon danger"
                    title="Remove from queue"
                    onClick={() => dispatch({ type: "focus/unqueue", ref })}
                  >
                    {IC.close}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="now-empty">
            Queue is clear. Add with the {IC.next} button on any item.
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add the list styles**

Replace the `.next-text` rule in `src/components/NowNextCard.css` with:

```css
.next-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  overflow-y: auto;
}

.next-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.next-item-label {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0.4rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--rp-subtle);
  font-size: 0.92rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.next-item-label:hover {
  background: var(--glass-overlay);
  color: var(--rp-text);
}

.next-item-pos {
  flex-shrink: 0;
  width: 1.15rem;
  height: 1.15rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--rp-highlight-med);
  color: var(--rp-muted);
  font-size: 0.68rem;
  font-weight: 700;
}
```

- [ ] **Step 4: Verify the build passes**

Run: `pnpm build`
Expected: PASS. This is the first task that restores a clean build.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/focus.ts src/components/NowNextCard.tsx src/components/NowNextCard.css
git commit -m "Show the focus queue as a list with promote and remove"
```

---

### Task 4: Queue buttons on every focusable item

**Files:**
- Modify: `src/components/TasksWidget.tsx:80-86` and `:109-115`
- Modify: `src/components/NotesWidget.tsx:76-82`
- Modify: `src/components/NotesView.tsx:198-206`
- Modify: `src/components/TasksView.tsx:406-412`
- Modify: `src/components/MediaTracker.tsx:716-722` and `:746-754`
- Modify: `src/components/MediaModals.tsx:166-174`

**Interfaces:**
- Consumes: `useFocusActions()` from Task 3.
- Produces: no new exports.

Each of the seven sites follows one pattern: destructure `queue`, `isNow`, `isQueued`
from the hook, and add a queue button immediately after the existing focus button. The
button is always rendered and goes `disabled` when the ref is already Now or already
queued, so the no-op is visible rather than mysterious.

- [ ] **Step 1: TasksWidget — both rows**

In `src/components/TasksWidget.tsx`, change line 15 to:

```tsx
  const { focusNow, queue, isFocused, isNow, isQueued } = useFocusActions();
```

After **each** of the two focus buttons (after the one at line 86 and the one at line
115), insert:

```tsx
              <button
                className="btn ghost icon tw-focus"
                title={
                  isNow({ kind: "todo", id: t.id })
                    ? "Already focused"
                    : isQueued({ kind: "todo", id: t.id })
                      ? "Already queued"
                      : "Do this next"
                }
                disabled={isNow({ kind: "todo", id: t.id }) || isQueued({ kind: "todo", id: t.id })}
                onClick={() => queue({ kind: "todo", id: t.id })}
              >
                {IC.next}
              </button>
```

- [ ] **Step 2: NotesWidget**

In `src/components/NotesWidget.tsx`, change line 14 to:

```tsx
  const { focusNow, queue, isFocused, isNow, isQueued } = useFocusActions();
```

After the focus button ending at line 82, insert:

```tsx
              <button
                className="btn ghost icon"
                title={
                  isNow({ kind: "note", id: n.id })
                    ? "Already focused"
                    : isQueued({ kind: "note", id: n.id })
                      ? "Already queued"
                      : "Do this next"
                }
                disabled={isNow({ kind: "note", id: n.id }) || isQueued({ kind: "note", id: n.id })}
                onClick={() => queue({ kind: "note", id: n.id })}
              >
                {IC.next}
              </button>
```

- [ ] **Step 3: NotesView**

In `src/components/NotesView.tsx`, change line 15 to:

```tsx
  const { focusNow, queue, isFocused, isNow, isQueued } = useFocusActions();
```

After the focus button ending at line 206, insert:

```tsx
                <button
                  className="btn ghost icon note-item-focus"
                  title={
                    isNow({ kind: "note", id: n.id })
                      ? "Already focused"
                      : isQueued({ kind: "note", id: n.id })
                        ? "Already queued"
                        : "Do this next"
                  }
                  disabled={isNow({ kind: "note", id: n.id }) || isQueued({ kind: "note", id: n.id })}
                  onClick={() => queue({ kind: "note", id: n.id })}
                >
                  {IC.next}
                </button>
```

- [ ] **Step 4: TasksView**

In `src/components/TasksView.tsx`, change line 359 to:

```tsx
  const { focusNow, queue, isFocused, isNow, isQueued } = useFocusActions();
```

After the focus button ending at line 412, insert:

```tsx
      <button
        className="btn ghost icon task-focus"
        title={
          isNow({ kind: "todo", id: todo.id })
            ? "Already focused"
            : isQueued({ kind: "todo", id: todo.id })
              ? "Already queued"
              : "Do this next"
        }
        disabled={isNow({ kind: "todo", id: todo.id }) || isQueued({ kind: "todo", id: todo.id })}
        onClick={() => queue({ kind: "todo", id: todo.id })}
      >
        {IC.next}
      </button>
```

- [ ] **Step 5: MediaTracker — entry row and checklist item**

In `src/components/MediaTracker.tsx`, change line 634 to:

```tsx
  const { focusNow, queue, isFocused, isNow, isQueued } = useFocusActions();
```

After the media focus button ending at line 722, insert:

```tsx
          <button
            className="btn ghost icon"
            title={
              isNow({ kind: "media", id: entry.id })
                ? "Already focused"
                : isQueued({ kind: "media", id: entry.id })
                  ? "Already queued"
                  : "Do this next"
            }
            disabled={isNow({ kind: "media", id: entry.id }) || isQueued({ kind: "media", id: entry.id })}
            onClick={() => queue({ kind: "media", id: entry.id })}
          >
            {IC.next}
          </button>
```

After the checklist focus button ending at line 754, insert:

```tsx
              <button
                className="btn ghost icon media-task-focus"
                title={
                  isNow({ kind: "task", id: c.id, parentId: entry.id })
                    ? "Already focused"
                    : isQueued({ kind: "task", id: c.id, parentId: entry.id })
                      ? "Already queued"
                      : "Do this next"
                }
                disabled={
                  isNow({ kind: "task", id: c.id, parentId: entry.id }) ||
                  isQueued({ kind: "task", id: c.id, parentId: entry.id })
                }
                onClick={() => queue({ kind: "task", id: c.id, parentId: entry.id })}
              >
                {IC.next}
              </button>
```

- [ ] **Step 6: MediaModals checklist item**

In `src/components/MediaModals.tsx`, change line 28 to:

```tsx
  const { focusNow, queue, isFocused, isNow, isQueued } = useFocusActions();
```

After the focus button ending at line 174, insert:

```tsx
              <button
                className="btn ghost icon"
                title={
                  isNow({ kind: "task", id: c.id, parentId: entry.id })
                    ? "Already focused"
                    : isQueued({ kind: "task", id: c.id, parentId: entry.id })
                      ? "Already queued"
                      : "Do this next"
                }
                disabled={
                  isNow({ kind: "task", id: c.id, parentId: entry.id }) ||
                  isQueued({ kind: "task", id: c.id, parentId: entry.id })
                }
                onClick={() => queue({ kind: "task", id: c.id, parentId: entry.id })}
              >
                {IC.next}
              </button>
```

- [ ] **Step 7: Verify the build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/
git commit -m "Add a deliberate queue button beside every focus button"
```

---

### Task 5: Time ledger shape and the pure time module

**Files:**
- Create: `src/lib/time.ts`
- Create: `src/lib/time.test.ts`
- Modify: `src/lib/types.ts` (`AppData.time`, `defaultData()`)
- Modify: `src/lib/migrate.ts`
- Modify: `src/lib/store.ts` (`loadData`)
- Test: `src/lib/migrate.test.ts`

**Interfaces:**
- Consumes: `FocusRef`, `MediaEntry`, `AppData` from `./types`.
- Produces:
  - `refKey(ref: FocusRef): string`
  - `formatDuration(secs: number): string`
  - `parseDuration(input: string): number | null`
  - `gameHours(entry: MediaEntry, ledger: Record<string, number>): number`
  - `purgeOrphans(data: AppData): Record<string, number>`
  - `AppData["time"]` is `Record<string, number>` (seconds).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/time.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/time.test.ts`
Expected: FAIL — `Cannot find module './time'`.

- [ ] **Step 3: Write the module**

Create `src/lib/time.ts`:

```ts
import type { AppData, FocusRef, MediaEntry } from "./types";

/** Ledger key for a focus pointer. The parent segment keeps two checklist
 *  items that share an id, under different media entries, apart. */
export function refKey(ref: FocusRef): string {
  return `${ref.kind}:${ref.parentId ?? ""}:${ref.id}`;
}

/** Human-readable duration: "1h 20m", "45m", "30s". */
export function formatDuration(secs: number): string {
  if (secs <= 0) return "0m";
  if (secs < 60) return `${Math.floor(secs)}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Parse "2h 30m", "90m", "1.5h", or a bare number of minutes. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const compound = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?$/);
  if (compound && (compound[1] != null || compound[2] != null)) {
    const h = Number(compound[1] ?? 0);
    const m = Number(compound[2] ?? 0);
    return Math.round(h * 3600 + m * 60);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  return null;
}

/** Hours to show for a game. Steam entries keep Steam's own number; a
 *  re-sync overwrites `progress`, so focus time is never written there. */
export function gameHours(
  entry: MediaEntry,
  ledger: Record<string, number>,
): number {
  if (entry.steamAppId != null) return entry.progress;
  return Math.floor((ledger[refKey({ kind: "media", id: entry.id })] ?? 0) / 3600);
}

/** Ledger with entries for deleted items removed. Run on load: a full scan
 *  is simpler and more self-healing than hooking every delete action. */
export function purgeOrphans(data: AppData): Record<string, number> {
  const live = new Set<string>();
  for (const t of data.todos) live.add(refKey({ kind: "todo", id: t.id }));
  for (const n of data.notes) live.add(refKey({ kind: "note", id: n.id }));
  for (const e of data.media.entries) {
    live.add(refKey({ kind: "media", id: e.id }));
    for (const c of e.checklist ?? []) {
      live.add(refKey({ kind: "task", id: c.id, parentId: e.id }));
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.time)) {
    if (live.has(k)) out[k] = v;
  }
  return out;
}
```

- [ ] **Step 4: Add the field and its migration**

In `src/lib/types.ts`, add to `AppData` immediately after the `focus` field:

```ts
  time: Record<string, number>; // seconds focused, keyed by refKey()
```

In `defaultData()`, add immediately after the `focus` line:

```ts
    time: {},
```

In `src/lib/migrate.ts`, add beside the other guards (after the `focus` guard):

```ts
  if (!next.time) {
    next = { ...next, time: {} };
  }
```

Append to `src/lib/migrate.test.ts`:

```ts
describe("migrate time ledger", () => {
  it("adds an empty ledger to an older file", () => {
    const data = { ...defaultData() } as Partial<AppData>;
    delete data.time;
    expect(migrate(data as AppData).time).toEqual({});
  });

  it("leaves an existing ledger alone", () => {
    const data = { ...defaultData(), time: { "todo::a": 60 } } as AppData;
    expect(migrate(data).time).toEqual({ "todo::a": 60 });
  });
});
```

- [ ] **Step 5: Purge orphans on load**

In `src/lib/store.ts`, add the import:

```ts
import { purgeOrphans } from "./time";
```

Replace the body of `loadData`'s third line with:

```ts
  const migrated = resetRecurring(rollStreak(migrate(existing ?? defaultData())));
  const data = { ...migrated, time: purgeOrphans(migrated) };
```

so the function reads:

```ts
export async function loadData(): Promise<AppData> {
  const s = await getStore();
  const existing = await s.get<AppData>("data");
  const migrated = resetRecurring(rollStreak(migrate(existing ?? defaultData())));
  const data = { ...migrated, time: purgeOrphans(migrated) };
  await s.set("data", data);
  return data;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, including the new `time.test.ts` and `migrate.test.ts` cases.

- [ ] **Step 7: Commit**

```bash
git add src/lib/time.ts src/lib/time.test.ts src/lib/types.ts src/lib/migrate.ts src/lib/migrate.test.ts src/lib/store.ts
git commit -m "Add the focus time ledger and its pure helpers"
```

---

### Task 6: Bank time from the Hyperfocus panel

**Files:**
- Modify: `src/lib/reducer.ts` (the `Action` union, new cases)
- Modify: `src/components/HyperfocusTimer.tsx`
- Modify: `src/components/HyperfocusTimer.css`
- Test: `src/lib/reducer.test.ts`

**Interfaces:**
- Consumes: `refKey`, `formatDuration`, `parseDuration` from `./time`; `resolveFocus`
  from `./focus`.
- Produces: actions `{ type: "time/bank"; key: string; seconds: number }` and
  `{ type: "time/set"; key: string; seconds: number }`.

- [ ] **Step 1: Write the failing reducer tests**

Append to `src/lib/reducer.test.ts`:

```ts
describe("time ledger", () => {
  it("bank adds to an existing total", () => {
    let s = reducer(defaultData(), { type: "time/bank", key: "todo::a", seconds: 30 });
    s = reducer(s, { type: "time/bank", key: "todo::a", seconds: 45 });
    expect(s.time["todo::a"]).toBe(75);
  });

  it("bank starts from zero for an unseen key", () => {
    const s = reducer(defaultData(), { type: "time/bank", key: "note::n", seconds: 10 });
    expect(s.time["note::n"]).toBe(10);
  });

  it("set overwrites rather than adding", () => {
    let s = reducer(defaultData(), { type: "time/bank", key: "todo::a", seconds: 900 });
    s = reducer(s, { type: "time/set", key: "todo::a", seconds: 60 });
    expect(s.time["todo::a"]).toBe(60);
  });

  it("set clamps negatives to zero", () => {
    const s = reducer(defaultData(), { type: "time/set", key: "todo::a", seconds: -5 });
    expect(s.time["todo::a"]).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/reducer.test.ts -t "time ledger"`
Expected: FAIL — the actions do not exist, so state is returned unchanged and
`s.time["todo::a"]` is `undefined`.

- [ ] **Step 3: Add the reducer cases**

In `src/lib/reducer.ts`, add to the `Action` union after the focus actions:

```ts
  | { type: "time/bank"; key: string; seconds: number }
  | { type: "time/set"; key: string; seconds: number }
```

Add the cases before `case "settings/update":`:

```ts
    case "time/bank":
      return {
        ...state,
        time: {
          ...state.time,
          [action.key]: (state.time[action.key] ?? 0) + action.seconds,
        },
      };
    case "time/set":
      return {
        ...state,
        time: { ...state.time, [action.key]: Math.max(0, Math.round(action.seconds)) },
      };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the timer component**

Replace `src/components/HyperfocusTimer.tsx` in full:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../lib/state";
import { resolveFocus } from "../lib/focus";
import { refKey, formatDuration, parseDuration } from "../lib/time";
import { notify } from "../lib/notify";
import { IC } from "../lib/icons";
import "./HyperfocusTimer.css";

const NUDGES: [number, string][] = [
  [60, "1 hour in — quick stretch? The hyperfocus will survive it."],
  [120, "2 hours deep. Genuinely impressive. Stand up, drink water, come back."],
];

/** How often accrued time is written into the ledger. A crash costs at most this. */
const BANK_EVERY_MS = 30_000;

export function HyperfocusTimer() {
  const { data, dispatch } = useApp();
  const nowRef = data.focus.now;
  const focused = nowRef ? resolveFocus(data, nowRef) : null;
  const key = nowRef ? refKey(nowRef) : null;

  const [manualStart, setManualStart] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [alarmMin, setAlarmMin] = useState("");
  const [alarmEnd, setAlarmEnd] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const notified = useRef<Set<number>>(new Set());

  /** Start of the stretch not yet written to the ledger. */
  const anchor = useRef<number>(Date.now());
  const sessionStart = useRef<number | null>(null);
  const bankedKey = useRef<string | null>(null);

  const total = key ? (data.time[key] ?? 0) : 0;

  const bank = useCallback(
    (target: string | null) => {
      if (!target) return;
      const secs = Math.floor((Date.now() - anchor.current) / 1000);
      anchor.current = Date.now();
      if (secs > 0) dispatch({ type: "time/bank", key: target, seconds: secs });
    },
    [dispatch],
  );

  // A new focus banks the old one and restarts the session clock at zero.
  useEffect(() => {
    if (bankedKey.current === key) return;
    bank(bankedKey.current);
    bankedKey.current = key;
    anchor.current = Date.now();
    sessionStart.current = key ? Date.now() : null;
    setElapsed(0);
    setPaused(false);
    notified.current.clear();
  }, [key, bank]);

  // Bank whatever is pending when the panel goes away.
  useEffect(() => () => bank(bankedKey.current), [bank]);

  useEffect(() => {
    const running = (key != null && !paused) || manualStart != null;
    if (!running && alarmEnd == null) return;
    const tick = window.setInterval(() => {
      const start = key != null && !paused ? sessionStart.current : manualStart;
      if (start != null) {
        const secs = Math.floor((Date.now() - start) / 1000);
        setElapsed(secs);
        const mins = Math.floor(secs / 60);
        for (const [at, msg] of NUDGES) {
          if (mins >= at && !notified.current.has(at)) {
            notified.current.add(at);
            notify("Hyperfocus check-in", msg);
          }
        }
        if (key != null && !paused && Date.now() - anchor.current >= BANK_EVERY_MS) {
          bank(key);
        }
      }
      if (alarmEnd != null && Date.now() >= alarmEnd) {
        setAlarmEnd(null);
        notify("Timer done", "Your countdown just finished.");
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [key, paused, manualStart, alarmEnd, bank]);

  const togglePause = () => {
    if (!key) return;
    if (paused) {
      sessionStart.current = Date.now() - elapsed * 1000;
      anchor.current = Date.now();
      setPaused(false);
    } else {
      bank(key);
      setPaused(true);
    }
  };

  const commitEdit = () => {
    if (editing == null || !key) return setEditing(null);
    const secs = parseDuration(editing);
    if (secs != null) {
      bank(key);
      dispatch({ type: "time/set", key, seconds: secs });
    }
    setEditing(null);
  };

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  };

  const minutes = Math.floor(elapsed / 60);
  const running = (key != null && !paused) || manualStart != null;
  const nudge = running
    ? [...NUDGES].reverse().find(([m]) => minutes >= m)?.[1]
    : undefined;

  return (
    <div className="hf-timer glass">
      <div className="panel-title">{IC.clock} Hyperfocus</div>
      {focused && <p className="hf-subject">{focused.label}</p>}
      <div className={`hf-display ${running ? "running" : ""}`}>{fmt(elapsed)}</div>
      {key && (
        <div className="hf-total">
          {editing != null ? (
            <input
              className="input hf-total-input"
              autoFocus
              value={editing}
              placeholder="2h 30m"
              onChange={(e) => setEditing(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <button
              className="hf-total-btn"
              title="Click to correct the total"
              onClick={() => setEditing(formatDuration(total))}
            >
              {formatDuration(total)} total
            </button>
          )}
        </div>
      )}
      <div className="hf-actions">
        {key ? (
          <button className="btn" onClick={togglePause}>
            {paused ? IC.play : IC.stop} {paused ? "Resume" : "Pause"}
          </button>
        ) : manualStart == null ? (
          <button
            className="btn primary"
            onClick={() => {
              setElapsed(0);
              notified.current.clear();
              setManualStart(Date.now());
            }}
          >
            {IC.play} Start session
          </button>
        ) : (
          <button className="btn" onClick={() => setManualStart(null)}>
            {IC.stop} End ({fmt(elapsed)})
          </button>
        )}
      </div>
      <div className="hf-alarm">
        {alarmEnd == null ? (
          <>
            <input
              className="input"
              type="number"
              min="1"
              placeholder="min"
              value={alarmMin}
              onChange={(e) => setAlarmMin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && Number(alarmMin) > 0) {
                  setAlarmEnd(Date.now() + Number(alarmMin) * 60_000);
                  setAlarmMin("");
                }
              }}
            />
            <button
              className="btn"
              disabled={!(Number(alarmMin) > 0)}
              title="System notification when time is up"
              onClick={() => {
                setAlarmEnd(Date.now() + Number(alarmMin) * 60_000);
                setAlarmMin("");
              }}
            >
              Remind me
            </button>
          </>
        ) : (
          <button className="btn ghost hf-alarm-active" onClick={() => setAlarmEnd(null)}>
            {IC.clock} rings {new Date(alarmEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — cancel
          </button>
        )}
      </div>
      {nudge && <p className="hf-nudge">{nudge}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Add the styles**

Append to `src/components/HyperfocusTimer.css`:

```css
.hf-subject {
  margin: 0;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--rp-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hf-total {
  display: flex;
  justify-content: center;
  margin-top: -0.35rem;
}

.hf-total-btn {
  border: none;
  background: transparent;
  color: var(--rp-subtle);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border-radius: var(--radius-sm);
  transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.hf-total-btn:hover {
  background: var(--glass-overlay);
  color: var(--rp-text);
}

.hf-total-input {
  width: 7rem;
  text-align: center;
  font-size: 0.82rem;
}
```

- [ ] **Step 7: Verify the build and tests**

Run: `pnpm build && pnpm test`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/reducer.ts src/lib/reducer.test.ts src/components/HyperfocusTimer.tsx src/components/HyperfocusTimer.css
git commit -m "Drive the Hyperfocus timer from the current focus and bank its time"
```

---

### Task 7: Surface totals on the Now card, game rows, and the detail modal

**Files:**
- Modify: `src/components/NowNextCard.tsx`
- Modify: `src/components/NowNextCard.css`
- Modify: `src/components/MediaTracker.tsx:666-672` (the `media-progress` block)
- Modify: `src/components/MediaModals.tsx` (`EntryDetailModal`)

**Interfaces:**
- Consumes: `refKey`, `formatDuration`, `parseDuration`, `gameHours` from `./time`.
- Produces: no new exports.

- [ ] **Step 1: Show the total on the Now card**

In `src/components/NowNextCard.tsx`, add the import:

```tsx
import { refKey, formatDuration } from "../lib/time";
```

Immediately after the `const now = ...` line, add:

```tsx
  const nowTotal = nowRef ? (data.time[refKey(nowRef)] ?? 0) : 0;
```

Then, directly after the `{now.sublabel && ...}` line inside the `now` branch, add:

```tsx
            <p className="now-time">{formatDuration(nowTotal)} spent</p>
```

- [ ] **Step 2: Style it**

Append to `src/components/NowNextCard.css`:

```css
.now-time {
  margin: 0;
  font-size: 0.78rem;
  color: var(--rp-gold);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Show ledger hours on non-Steam game rows**

In `src/components/MediaTracker.tsx`, add the import (`useApp` is already imported at
line 13; do not add it again):

```tsx
import { gameHours } from "../lib/time";
```

The row is the `MediaCard` component (signature near line 599); it receives `entry`,
`hoursMode`, and `movie` as props and already calls `useFocusActions()` near line 634.
It needs the ledger from `useApp()`. Add this line right after the `useFocusActions()`
call:

```tsx
  const { data } = useApp();
```

Replace the progress `<span>` (lines 667-672) with:

```tsx
          {!movie && (
            <span title={hoursMode && entry.steamAppId == null ? "Hours focused in this app" : undefined}>
              {hoursMode ? gameHours(entry, data.time) : entry.progress}
              {entry.total != null ? ` / ${entry.total}` : hoursMode ? " h" : ""}
            </span>
          )}
```

- [ ] **Step 4: Add the editable Time spent row to the detail modal**

In `src/components/MediaModals.tsx`, add the imports:

```tsx
import { useApp } from "../lib/state";
import { refKey, formatDuration, parseDuration } from "../lib/time";
```

In `EntryDetailModal`, after the `const checklist = ...` line, add:

```tsx
  const { data, dispatch } = useApp();
  const timeKey = refKey({ kind: "media", id: entry.id });
  const [timeEdit, setTimeEdit] = useState<string | null>(null);

  const commitTime = () => {
    if (timeEdit == null) return;
    const secs = parseDuration(timeEdit);
    if (secs != null) dispatch({ type: "time/set", key: timeKey, seconds: secs });
    setTimeEdit(null);
  };
```

Then, immediately after the "Your rating" `<div className="field">` block in the returned
JSX, add:

```tsx
      <div className="field">
        <label>Time spent</label>
        {timeEdit != null ? (
          <input
            className="input"
            autoFocus
            value={timeEdit}
            placeholder="2h 30m"
            onChange={(e) => setTimeEdit(e.target.value)}
            onBlur={commitTime}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTime();
              if (e.key === "Escape") setTimeEdit(null);
            }}
          />
        ) : (
          <button
            className="btn ghost"
            title="Click to correct the total"
            onClick={() => setTimeEdit(formatDuration(data.time[timeKey] ?? 0))}
          >
            {formatDuration(data.time[timeKey] ?? 0)}
          </button>
        )}
      </div>
```

- [ ] **Step 5: Verify the build and tests**

Run: `pnpm build && pnpm test`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "Show focus totals on the Now card, game rows, and entry details"
```

---

## Final verification

- [ ] Run `pnpm build` — passes.
- [ ] Run `pnpm test` — passes.
- [ ] Verify at runtime with the `.claude/skills/verify` seeded-`XDG_DATA_HOME` recipe,
      never against the real `data.json`. Seed a data file that still uses the old shape
      (`focus: { now: {...}, next: {...} }`, no `time` key) and confirm on launch that:
      the queue migrated to a list, the Hyperfocus panel names the focused item and
      counts up on its own, the queue button adds to Next and then goes disabled, and a
      non-Steam game's hours rise after a focus session.
