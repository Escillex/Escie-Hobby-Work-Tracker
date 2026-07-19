import { useState } from "react";
import type { Todo } from "../lib/types";
import { uid, localDate } from "../lib/types";
import { useApp } from "../lib/state";
import { useFocusActions } from "../lib/focus";
import { IC } from "../lib/icons";
import { Calendar, type DotKind } from "./Calendar";
import "./TasksView.css";

type TodoMode = "scheduled" | "someday" | "daily" | "weekly";

const dueDay = (iso: string) => localDate(new Date(iso));

export function TasksView() {
  const { data, dispatch } = useApp();
  const today = localDate();
  const [selected, setSelected] = useState(today);
  const [text, setText] = useState("");
  const [time, setTime] = useState("09:00");
  const [mode, setMode] = useState<TodoMode>("scheduled");

  const dated = data.todos.filter((t) => t.recurrence === "none" && t.dueAt);
  const someday = data.todos.filter((t) => t.recurrence === "none" && !t.dueAt);
  const recurring = data.todos.filter((t) => t.recurrence !== "none");
  const dayTodos = dated
    .filter((t) => dueDay(t.dueAt!) === selected)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));

  // Highest-priority dot per day: overdue > pending > done.
  const dots = new Map<string, DotKind>();
  const rank = { done: 0, pending: 1, overdue: 2 } as const;
  for (const t of dated) {
    const key = dueDay(t.dueAt!);
    const overdue = !t.done && new Date(t.dueAt!).getTime() < Date.now();
    const kind: DotKind = t.done ? "done" : overdue ? "overdue" : "pending";
    const cur = dots.get(key);
    if (!cur || rank[kind] > rank[cur]) dots.set(key, kind);
  }

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const todo: Todo = {
      id: uid(),
      text: t,
      createdAt: new Date().toISOString(),
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

  const complete = (t: Todo) =>
    dispatch({
      type: "todo/update",
      todo:
        t.recurrence === "none"
          ? { ...t, done: !t.done }
          : { ...t, done: true, lastDone: today },
    });

  return (
    <div className="tasks-view">
      <div className="tasks-cal-col glass">
        <Calendar selected={selected} onSelect={setSelected} dots={dots} />
        <div className="cal-legend">
          <span>
            <i className="dot foam" /> scheduled
          </span>
          <span>
            <i className="dot love" /> overdue
          </span>
          <span>
            <i className="dot muted" /> done
          </span>
        </div>
      </div>

      <div className="tasks-day-col glass">
        <div className="tasks-day-header">
          <h2>{prettyDay(selected, today)}</h2>
          <span className="tasks-day-count">
            {dayTodos.length} task{dayTodos.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="tasks-add">
          <input
            className="input"
            placeholder={
              mode === "scheduled"
                ? `Add a task for ${prettyDay(selected, today)}…`
                : mode === "someday"
                  ? "Add a someday / anytime task…"
                  : `Add a ${mode} repeating task…`
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <div className="tasks-add-row">
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
              <input
                className="input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
            <button className="btn primary" disabled={!text.trim()} onClick={add}>
              {IC.plus} Add
            </button>
          </div>
        </div>

        <div className="tasks-lists">
          <Section label={prettyDay(selected, today)}>
            {dayTodos.length === 0 && <p className="tasks-empty">Nothing scheduled for this day.</p>}
            {dayTodos.map((t) => (
              <TaskRow
                key={t.id}
                todo={t}
                label={new Date(t.dueAt!).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                onDone={() => complete(t)}
                onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
              />
            ))}
          </Section>

          {someday.length > 0 && (
            <Section label={`Someday (${someday.length})`}>
              {someday.map((t) => (
                <TaskRow
                  key={t.id}
                  todo={t}
                  onDone={() => complete(t)}
                  onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
                />
              ))}
            </Section>
          )}

          {recurring.length > 0 && (
            <Section label={`${IC.refresh} Repeating (${recurring.length})`}>
              {recurring.map((t) => (
                <TaskRow
                  key={t.id}
                  todo={t}
                  label={t.recurrence}
                  onDone={() => complete(t)}
                  onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
                />
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tasks-section">
      <div className="tasks-section-label">{label}</div>
      {children}
    </div>
  );
}

function TaskRow({
  todo,
  label,
  onDone,
  onDelete,
}: {
  todo: Todo;
  label?: string;
  onDone: () => void;
  onDelete: () => void;
}) {
  const { focusNow, isFocused } = useFocusActions();
  const overdue =
    todo.recurrence === "none" &&
    todo.dueAt != null &&
    !todo.done &&
    new Date(todo.dueAt).getTime() < Date.now();

  return (
    <div className={`task-row ${overdue ? "overdue" : ""} ${todo.done ? "done" : ""}`}>
      <button
        className={`check-box ${todo.done ? "checked" : ""}`}
        title={todo.done ? "Mark undone" : "Mark done"}
        onClick={onDone}
      >
        {todo.done ? IC.check : null}
      </button>
      <span className="task-text">{todo.text}</span>
      {label && <span className="task-label">{label}</span>}
      <button
        className={`btn ghost icon task-focus ${isFocused({ kind: "todo", id: todo.id }) ? "focused" : ""}`}
        title="Focus on this"
        onClick={() => focusNow({ kind: "todo", id: todo.id })}
      >
        {IC.target}
      </button>
      <button className="btn ghost icon danger" title="Delete" onClick={onDelete}>
        {IC.close}
      </button>
    </div>
  );
}

function prettyDay(key: string, today: string): string {
  if (key === today) return "Today";
  const d = new Date(`${key}T00:00`);
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
