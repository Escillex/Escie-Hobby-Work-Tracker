import { useEffect, useState } from "react";
import type { Todo } from "../lib/types";
import { uid, localDate } from "../lib/types";
import { useApp } from "../lib/state";
import { notify } from "../lib/notify";
import { IC } from "../lib/icons";
import "./TodoPanel.css";

type TodoMode = "scheduled" | "someday" | "daily" | "weekly";

const EARLY_CHOICES = [5, 15, 30, 60];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Local YYYY-MM-DD for a given date. */
const dayKey = (d: Date) => localDate(d);

/** The local date portion of an ISO due timestamp. */
const dueDay = (iso: string) => dayKey(new Date(iso));

export function TodoPanel() {
  const { data, dispatch } = useApp();
  const today = localDate();
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [text, setText] = useState("");
  const [time, setTime] = useState("09:00");
  const [early, setEarly] = useState(30);
  const [mode, setMode] = useState<TodoMode>("scheduled");

  // Notification scheduler for dated (one-off) todos.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const t of data.todos) {
        if (t.done || t.recurrence !== "none" || !t.dueAt) continue;
        const due = new Date(t.dueAt).getTime();
        if (!t.notifiedDue && now >= due) {
          notify("Due now", t.text);
          dispatch({ type: "todo/update", todo: { ...t, notifiedDue: true, notifiedEarly: true } });
        } else if (!t.notifiedEarly && now >= due - t.earlyMinutes * 60_000) {
          const mins = Math.max(1, Math.round((due - now) / 60_000));
          notify(`In ${mins} min`, t.text);
          dispatch({ type: "todo/update", todo: { ...t, notifiedEarly: true } });
        }
      }
    };
    check();
    const timer = window.setInterval(check, 20_000);
    return () => window.clearInterval(timer);
  }, [data.todos, dispatch]);

  const dated = data.todos.filter((t) => t.recurrence === "none" && t.dueAt);
  const someday = data.todos.filter((t) => t.recurrence === "none" && !t.dueAt);
  const recurring = data.todos.filter((t) => t.recurrence !== "none");
  const dayTodos = dated
    .filter((t) => dueDay(t.dueAt!) === selected)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));

  // Days in the viewed month that carry at least one dated todo.
  const dots = new Map<string, "pending" | "overdue" | "done">();
  for (const t of dated) {
    const key = dueDay(t.dueAt!);
    const overdue = !t.done && new Date(t.dueAt!).getTime() < Date.now();
    const cur = dots.get(key);
    const rank = { done: 0, pending: 1, overdue: 2 } as const;
    const next = t.done ? "done" : overdue ? "overdue" : "pending";
    if (!cur || rank[next] > rank[cur]) dots.set(key, next);
  }

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const todo: Todo = {
      id: uid(),
      text: t,
      createdAt: new Date().toISOString(),
      earlyMinutes: early,
      recurrence: mode === "daily" || mode === "weekly" ? mode : "none",
      done: false,
      dueAt:
        mode === "scheduled"
          ? new Date(`${selected}T${time || "09:00"}`).toISOString()
          : undefined,
    };
    dispatch({ type: "todo/add", todo });
    setText("");
  };

  const complete = (t: Todo) => {
    if (t.recurrence === "none") {
      dispatch({ type: "todo/update", todo: { ...t, done: true } });
    } else {
      // Recurring: tick for today; resetRecurring reopens it next period.
      dispatch({ type: "todo/update", todo: { ...t, done: true, lastDone: today } });
    }
  };

  const monthGrid = buildMonthGrid(view.year, view.month);

  return (
    <div className="todo-panel glass">
      <div className="panel-title">{IC.check} To-dos</div>

      <div className="cal">
        <div className="cal-head">
          <button className="btn ghost icon" onClick={() => setView(shiftMonth(view, -1))}>
            ‹
          </button>
          <span className="cal-title">
            {MONTHS[view.month]} {view.year}
          </span>
          <button className="btn ghost icon" onClick={() => setView(shiftMonth(view, 1))}>
            ›
          </button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="cal-dow">
              {w}
            </span>
          ))}
          {monthGrid.map((cell, i) =>
            cell === null ? (
              <span key={i} className="cal-cell empty" />
            ) : (
              <button
                key={i}
                className={`cal-cell ${cell === today ? "today" : ""} ${
                  cell === selected ? "selected" : ""
                }`}
                onClick={() => setSelected(cell)}
              >
                {Number(cell.slice(-2))}
                {dots.has(cell) && <span className={`cal-dot ${dots.get(cell)}`} />}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="todo-add">
        <input
          className="input"
          placeholder={
            mode === "scheduled"
              ? `Add for ${prettyDay(selected, today)}…`
              : mode === "someday"
                ? "Someday / anytime task…"
                : "Repeating task…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <div className="todo-add-row">
          <select
            className="input"
            value={mode}
            onChange={(e) => setMode(e.target.value as TodoMode)}
            title="When"
          >
            <option value="scheduled">scheduled</option>
            <option value="someday">someday</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
          </select>
          {mode === "scheduled" && (
            <>
              <input
                className="input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <select
                className="input"
                value={early}
                title="Heads-up before it's due"
                onChange={(e) => setEarly(Number(e.target.value))}
              >
                {EARLY_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m}m
                  </option>
                ))}
              </select>
            </>
          )}
          <button className="btn" disabled={!text.trim()} onClick={add}>
            {IC.plus}
          </button>
        </div>
      </div>

      <div className="todo-list">
        <div className="todo-section-label">{prettyDay(selected, today)}</div>
        {dayTodos.length === 0 && <p className="todo-empty">Nothing scheduled.</p>}
        {dayTodos.map((t) => (
          <TodoRow
            key={t.id}
            todo={t}
            timeLabel={new Date(t.dueAt!).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            onDone={() => complete(t)}
            onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
          />
        ))}

        {someday.length > 0 && (
          <>
            <div className="todo-section-label">Someday</div>
            {someday.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                onDone={() => complete(t)}
                onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
              />
            ))}
          </>
        )}

        {recurring.length > 0 && (
          <>
            <div className="todo-section-label">{IC.refresh} Repeating</div>
            {recurring.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                timeLabel={t.recurrence}
                onDone={() => complete(t)}
                onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  timeLabel,
  onDone,
  onDelete,
}: {
  todo: Todo;
  timeLabel?: string;
  onDone: () => void;
  onDelete: () => void;
}) {
  const overdue =
    todo.recurrence === "none" &&
    todo.dueAt != null &&
    !todo.done &&
    new Date(todo.dueAt).getTime() < Date.now();

  return (
    <div className={`todo-item ${overdue ? "overdue" : ""} ${todo.done ? "done" : ""}`}>
      <button
        className={`check-box ${todo.done ? "checked" : ""}`}
        title={todo.done ? "Done" : "Mark done"}
        onClick={onDone}
      >
        {todo.done ? IC.check : null}
      </button>
      <div className="todo-body">
        <span className="todo-text">{todo.text}</span>
        {timeLabel && (
          <span className="todo-due">
            {IC.clock} {timeLabel}
          </span>
        )}
      </div>
      <button className="btn ghost icon danger" title="Delete" onClick={onDelete}>
        {IC.close}
      </button>
    </div>
  );
}

/** Array of 42 cells (6 weeks) — null for padding, else a YYYY-MM-DD key. */
function buildMonthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(localDate(new Date(year, month, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(v: { year: number; month: number }, delta: number) {
  const d = new Date(v.year, v.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function prettyDay(key: string, today: string): string {
  if (key === today) return "Today";
  const d = new Date(`${key}T00:00`);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
