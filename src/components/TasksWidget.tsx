import { useEffect, useMemo, useState } from "react";
import type { Todo } from "../lib/types";
import { localDate } from "../lib/types";
import { useApp } from "../lib/state";
import { isOverdue } from "../lib/schedule";
import { useFocusActions } from "../lib/focus";
import { IC } from "../lib/icons";
import "./TasksWidget.css";

const dueDay = (iso: string) => localDate(new Date(iso));

// Shift a YYYY-MM-DD key by whole days, staying in local time.
const shiftDay = (key: string, delta: number): string => {
  const d = new Date(`${key}T00:00`);
  d.setDate(d.getDate() + delta);
  return localDate(d);
};

// "all" shows everything, "untagged" shows tagless todos, otherwise a tag id.
type TabId = "all" | "untagged" | string;

export function TasksWidget({ onOpen }: { onOpen: () => void }) {
  const { data, dispatch } = useApp();
  const { focusNow, queue, isFocused, isNow, isQueued } = useFocusActions();
  const today = localDate();
  const [selected, setSelected] = useState(today);
  const [tab, setTab] = useState<TabId>("all");

  // Live clock — tick once a minute so the header time stays current.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const matchesTab = (t: Todo) =>
    tab === "all" ? true : tab === "untagged" ? t.tagId == null : t.tagId === tab;

  const dated = data.todos.filter((t) => t.recurrence === "none" && t.dueAt);
  const dayTodos = dated
    .filter((t) => dueDay(t.dueAt!) === selected)
    .filter(matchesTab)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  const selectedDow = new Date(`${selected}T00:00`).getDay();
  const recurringForDay = data.todos
    .filter(
      (t) =>
        t.recurrence !== "none" &&
        t.scheduleTime != null &&
        (t.recurrence === "daily" || t.scheduleDay === selectedDow),
    )
    .filter(matchesTab);

  // Tabs: All + Untagged are always present; the rest come from defined tags.
  const tabs = useMemo(
    () => [
      { id: "all" as TabId, name: "All", color: undefined as string | undefined },
      { id: "untagged" as TabId, name: "Untagged", color: undefined as string | undefined },
      ...data.tags.map((t) => ({ id: t.id as TabId, name: t.name, color: t.color })),
    ],
    [data.tags],
  );

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

      <div className="tw-datebar">
        <button
          className="btn ghost icon"
          title="Previous day"
          onClick={() => setSelected((s) => shiftDay(s, -1))}
        >
          {IC.chevronLeft}
        </button>
        <button
          className="tw-date-label"
          title={selected === today ? "Showing today" : "Jump to today"}
          onClick={() => setSelected(today)}
        >
          {selected === today ? "Today" : prettyDay(selected)}
        </button>
        <button
          className="btn ghost icon"
          title="Next day"
          onClick={() => setSelected((s) => shiftDay(s, 1))}
        >
          {IC.chevronRight}
        </button>
        <span className="tw-clock">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="tw-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tw-tab ${tab === t.id ? "active" : ""}`}
            style={
              t.color
                ? ({ "--tab-color": `var(--rp-${t.color})` } as React.CSSProperties)
                : undefined
            }
            onClick={() => setTab(t.id)}
          >
            {t.color && <i className="tw-tab-dot" />}
            {t.name}
          </button>
        ))}
      </div>

      <div className="tw-list">
        {dayTodos.length === 0 && recurringForDay.length === 0 && (
          <p className="tw-empty">Nothing here.</p>
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
