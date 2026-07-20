import { useState } from "react";
import type { Todo } from "../lib/types";
import { uid, localDate } from "../lib/types";
import { useApp } from "../lib/state";
import { isOverdue, WEEKDAYS } from "../lib/schedule";
import { useFocusActions } from "../lib/focus";
import { IC } from "../lib/icons";
import { Calendar, type DotKind } from "./Calendar";
import { TagFilterRow, TagPicker } from "./TagPicker";
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
  const [schedOn, setSchedOn] = useState(false);
  const [schedTime, setSchedTime] = useState("08:00");
  const [schedDay, setSchedDay] = useState(1); // Monday
  const [addTag, setAddTag] = useState<string | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState<string | null>(null);

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const dated = data.todos.filter((t) => t.recurrence === "none" && t.dueAt);
  const someday = data.todos.filter((t) => t.recurrence === "none" && !t.dueAt);
  const recurring = data.todos.filter((t) => t.recurrence !== "none");
  const dayTodos = dated
    .filter((t) => dueDay(t.dueAt!) === selected)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));

  const byTag = (t: Todo) => tagFilter === null || t.tagId === tagFilter;
  const dayTodosShown = dayTodos.filter(byTag);
  const somedayShown = someday.filter(byTag);
  const recurringShown = recurring.filter(byTag);

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
      scheduleTime:
        (mode === "daily" || mode === "weekly") && schedOn && schedTime
          ? schedTime
          : undefined,
      scheduleDay:
        mode === "weekly" && schedOn && schedTime ? schedDay : undefined,
      tagId: addTag ?? undefined,
    };
    dispatch({ type: "todo/add", todo });
    setText("");
    setAddTag(null);
    setAddPickerOpen(false);
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
            {dayTodosShown.length} task{dayTodosShown.length === 1 ? "" : "s"}
          </span>
          <button
            className={`btn ${selectMode ? "primary" : "ghost"}`}
            title="Manage tasks & tags"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedIds(new Set());
              setBulkPickerOpen(false);
              setBulkTag(null);
            }}
          >
            {IC.check} Manage
          </button>
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
            <div className="tag-picker-wrap">
              <button
                className={`btn ${addTag !== null || addPickerOpen ? "primary" : "ghost"} icon`}
                title="Tag for this task"
                onClick={() => setAddPickerOpen((v) => !v)}
              >
                {IC.tag}
              </button>
              {addPickerOpen && (
                <TagPicker
                  active={addTag ?? undefined}
                  onPick={setAddTag}
                  onClose={() => setAddPickerOpen(false)}
                />
              )}
            </div>
            <button className="btn primary" disabled={!text.trim()} onClick={add}>
              {IC.plus} Add
            </button>
          </div>
        </div>

        <TagFilterRow active={tagFilter} onChange={setTagFilter} manage={selectMode} />

        {selectMode && (
          <div className="bulk-bar">
            <span>{selectedIds.size} selected</span>
            <button
              className="btn ghost danger"
              disabled={selectedIds.size === 0}
              onClick={() => {
                if (!confirm(`Delete ${selectedIds.size} selected tasks?`)) return;
                dispatch({ type: "todo/delete-many", ids: [...selectedIds] });
                setSelectedIds(new Set());
                setBulkPickerOpen(false);
                setBulkTag(null);
              }}
            >
              Delete
            </button>
            <div className="tag-picker-wrap">
              <button
                className="btn ghost"
                disabled={selectedIds.size === 0}
                onClick={() => setBulkPickerOpen((v) => !v)}
              >
                {IC.tag} Tag
              </button>
              {bulkPickerOpen && (
                <TagPicker
                  active={bulkTag ?? undefined}
                  onPick={(id) => {
                    if (!id) return;
                    dispatch({ type: "todo/tag-many", ids: [...selectedIds], tagId: id });
                    setBulkTag(id);
                  }}
                  onClose={() => {
                    setBulkPickerOpen(false);
                    setSelectedIds(new Set());
                    setBulkTag(null);
                  }}
                />
              )}
            </div>
          </div>
        )}

        <div className="tasks-lists">
          <Section label={prettyDay(selected, today)}>
            {dayTodosShown.length === 0 && <p className="tasks-empty">Nothing scheduled for this day.</p>}
            {dayTodosShown.map((t) => (
              <TaskRow
                key={t.id}
                todo={t}
                label={new Date(t.dueAt!).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                onDone={() => complete(t)}
                onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
                selectMode={selectMode}
                selected={selectedIds.has(t.id)}
                onToggleSelect={() => toggleSelected(t.id)}
              />
            ))}
          </Section>

          {somedayShown.length > 0 && (
            <Section label={`Someday (${somedayShown.length})`}>
              {somedayShown.map((t) => (
                <TaskRow
                  key={t.id}
                  todo={t}
                  onDone={() => complete(t)}
                  onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
                  selectMode={selectMode}
                  selected={selectedIds.has(t.id)}
                  onToggleSelect={() => toggleSelected(t.id)}
                />
              ))}
            </Section>
          )}

          {recurringShown.length > 0 && (
            <Section label={`${IC.refresh} Repeating (${recurringShown.length})`}>
              {recurringShown.map((t) => (
                <TaskRow
                  key={t.id}
                  todo={t}
                  label={recurringLabel(t)}
                  onDone={() => complete(t)}
                  onDelete={() => dispatch({ type: "todo/delete", id: t.id })}
                  selectMode={selectMode}
                  selected={selectedIds.has(t.id)}
                  onToggleSelect={() => toggleSelected(t.id)}
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
  selectMode,
  selected,
  onToggleSelect,
}: {
  todo: Todo;
  label?: string;
  onDone: () => void;
  onDelete: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { data, dispatch } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { focusNow, isFocused } = useFocusActions();
  const overdue = isOverdue(todo, new Date());
  const tag = todo.tagId ? data.tags.find((t) => t.id === todo.tagId) : undefined;

  return (
    <div
      className={`task-row ${overdue ? "overdue" : ""} ${todo.done ? "done" : ""} ${tag ? "tagged" : ""}`}
      style={tag ? ({ "--tag-color": `var(--rp-${tag.color})` } as React.CSSProperties) : undefined}
      title={tag ? `tag: ${tag.name}` : undefined}
    >
      {selectMode ? (
        <button
          className={`check-box ${selected ? "checked" : ""}`}
          title="Select"
          onClick={onToggleSelect}
        >
          {selected ? IC.check : null}
        </button>
      ) : (
        <button
          className={`check-box ${todo.done ? "checked" : ""}`}
          title={todo.done ? "Mark undone" : "Mark done"}
          onClick={onDone}
        >
          {todo.done ? IC.check : null}
        </button>
      )}
      <span className="task-text">{todo.text}</span>
      {label && <span className="task-label">{label}</span>}
      <div className="tag-picker-wrap">
        <button
          className="btn ghost icon"
          title="Edit tag"
          onClick={() => setPickerOpen((v) => !v)}
        >
          {IC.tag}
        </button>
        {pickerOpen && (
          <TagPicker
            active={todo.tagId}
            onPick={(id) =>
              dispatch({ type: "todo/update", todo: { ...todo, tagId: id ?? undefined } })
            }
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
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

function recurringLabel(t: Todo): string {
  if (!t.scheduleTime) return t.recurrence;
  const day =
    t.recurrence === "weekly" && t.scheduleDay != null
      ? `${WEEKDAYS[t.scheduleDay]} `
      : "";
  return `${t.recurrence} · ${day}${t.scheduleTime}`;
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
