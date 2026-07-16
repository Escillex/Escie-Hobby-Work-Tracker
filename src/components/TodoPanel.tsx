import { useEffect, useState } from "react";
import type { Todo } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { notify } from "../lib/notify";
import { IC } from "../lib/icons";
import "./TodoPanel.css";

const EARLY_CHOICES = [5, 15, 30, 60];

function fmtDue(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function TodoPanel() {
  const { data, dispatch } = useApp();
  const [text, setText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [early, setEarly] = useState(30);
  const [expanded, setExpanded] = useState(false);

  // Notification scheduler: check every 20s for todos crossing their
  // early-warning or due thresholds. Flags persist so restarts don't re-fire.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const t of data.todos) {
        if (t.done || !t.dueAt) continue;
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

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const todo: Todo = {
      id: uid(),
      text: t,
      createdAt: new Date().toISOString(),
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      earlyMinutes: early,
      done: false,
    };
    dispatch({ type: "todo/add", todo });
    setText("");
    setDueAt("");
    setExpanded(false);
  };

  const pending = [...data.todos]
    .filter((t) => !t.done)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const doneCount = data.todos.filter((t) => t.done).length;

  return (
    <div className="todo-panel glass">
      <div className="panel-title">
        {IC.check} To-dos
        {doneCount > 0 && (
          <button
            className="btn ghost clear-done"
            title="Clear finished to-dos"
            onClick={() =>
              data.todos.filter((t) => t.done).forEach((t) =>
                dispatch({ type: "todo/delete", id: t.id }),
              )
            }
          >
            clear {doneCount} done
          </button>
        )}
      </div>
      <input
        className="input"
        placeholder="Add a to-do… (Enter)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
      />
      {expanded && (
        <div className="todo-schedule fade-up">
          <input
            className="input"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
          <select
            className="input"
            value={early}
            title="Heads-up notification this long before it's due"
            onChange={(e) => setEarly(Number(e.target.value))}
          >
            {EARLY_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m}m early
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="todo-list">
        {pending.length === 0 && <p className="todo-empty">Nothing scheduled.</p>}
        {pending.map((t) => {
          const overdue = t.dueAt != null && new Date(t.dueAt).getTime() < Date.now();
          return (
            <div key={t.id} className={`todo-item ${overdue ? "overdue" : ""}`}>
              <button
                className="btn ghost icon todo-check"
                title="Mark done"
                onClick={() => dispatch({ type: "todo/update", todo: { ...t, done: true } })}
              >
                {IC.check}
              </button>
              <div className="todo-body">
                <span className="todo-text">{t.text}</span>
                {t.dueAt && (
                  <span className="todo-due">
                    {IC.clock} {fmtDue(t.dueAt)}
                  </span>
                )}
              </div>
              <button
                className="btn ghost icon danger"
                title="Delete"
                onClick={() => dispatch({ type: "todo/delete", id: t.id })}
              >
                {IC.close}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
