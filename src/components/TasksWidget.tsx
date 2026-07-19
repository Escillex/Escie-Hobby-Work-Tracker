import { useState } from "react";
import type { Todo } from "../lib/types";
import { localDate } from "../lib/types";
import { useApp } from "../lib/state";
import { isOverdue } from "../lib/schedule";
import { useFocusActions } from "../lib/focus";
import { IC } from "../lib/icons";
import { Calendar, type DotKind } from "./Calendar";
import "./TasksWidget.css";

const dueDay = (iso: string) => localDate(new Date(iso));

export function TasksWidget({ onOpen }: { onOpen: () => void }) {
  const { data, dispatch } = useApp();
  const { focusNow, isFocused } = useFocusActions();
  const today = localDate();
  const [selected, setSelected] = useState(today);

  const dated = data.todos.filter((t) => t.recurrence === "none" && t.dueAt);
  const dayTodos = dated
    .filter((t) => dueDay(t.dueAt!) === selected)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  const selectedDow = new Date(`${selected}T00:00`).getDay();
  const recurringForDay = data.todos.filter(
    (t) =>
      t.recurrence !== "none" &&
      t.scheduleTime != null &&
      (t.recurrence === "daily" || t.scheduleDay === selectedDow),
  );

  const dots = new Map<string, DotKind>();
  const rank = { done: 0, pending: 1, overdue: 2 } as const;
  for (const t of dated) {
    const key = dueDay(t.dueAt!);
    const overdue = !t.done && new Date(t.dueAt!).getTime() < Date.now();
    const kind: DotKind = t.done ? "done" : overdue ? "overdue" : "pending";
    const cur = dots.get(key);
    if (!cur || rank[kind] > rank[cur]) dots.set(key, kind);
  }

  const complete = (t: Todo) =>
    dispatch({
      type: "todo/update",
      todo:
        t.recurrence === "none"
          ? { ...t, done: !t.done }
          : { ...t, done: true, lastDone: today },
    });

  return (
    <div className="tasks-widget glass">
      <div
        className="panel-title"
        onDoubleClick={onOpen}
        title="Double-click to open Tasks"
      >
        {IC.check} Tasks
        <button className="btn ghost icon" title="Open Tasks tab" onClick={onOpen}>
          {IC.external}
        </button>
      </div>
      <Calendar selected={selected} onSelect={setSelected} dots={dots} />
      <div className="tw-day-label">{selected === today ? "Today" : prettyDay(selected)}</div>
      <div className="tw-list">
        {dayTodos.length === 0 && recurringForDay.length === 0 && (
          <p className="tw-empty">Nothing scheduled.</p>
        )}
        {dayTodos.map((t) => {
          const overdue = !t.done && new Date(t.dueAt!).getTime() < Date.now();
          return (
            <div key={t.id} className={`tw-item ${overdue ? "overdue" : ""} ${t.done ? "done" : ""}`}>
              <button
                className={`check-box ${t.done ? "checked" : ""}`}
                onClick={() => complete(t)}
                title={t.done ? "Mark undone" : "Mark done"}
              >
                {t.done ? IC.check : null}
              </button>
              <span className="tw-text">{t.text}</span>
              <button
                className={`btn ghost icon tw-focus ${isFocused({ kind: "todo", id: t.id }) ? "focused" : ""}`}
                title="Focus on this"
                onClick={() => focusNow({ kind: "todo", id: t.id })}
              >
                {IC.target}
              </button>
              <span className="tw-time">
                {new Date(t.dueAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
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
      </div>
    </div>
  );
}

function prettyDay(key: string): string {
  return new Date(`${key}T00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
