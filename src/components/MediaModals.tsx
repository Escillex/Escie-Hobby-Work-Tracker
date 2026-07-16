import { useState } from "react";
import type { ChecklistItem, MediaEntry, MediaStatus, Recurrence } from "../lib/types";
import { MEDIA_STATUSES, uid, localDate } from "../lib/types";
import { toggleChecklistItem, nextRecurrence, RECURRENCE_LABEL } from "../lib/media";
import { useFocusActions } from "../lib/focus";
import { setSeasonWatched } from "../lib/tmdb";
import { IC } from "../lib/icons";
import { Modal } from "./Modal";
import { StarRating } from "./StarRating";

export function EntryDetailModal({
  entry,
  onClose,
  onUpdate,
  onRate,
}: {
  entry: MediaEntry;
  onClose: () => void;
  onUpdate: (e: MediaEntry) => void;
  onRate: (score: number | undefined) => void;
}) {
  const { focusNow, isFocused } = useFocusActions();
  const [newItem, setNewItem] = useState("");
  const [newRecurrence, setNewRecurrence] = useState<Recurrence>("none");
  const checklist = entry.checklist ?? [];

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    const item: ChecklistItem = {
      id: uid(),
      text,
      done: false,
      recurrence: newRecurrence === "none" ? undefined : newRecurrence,
    };
    onUpdate({ ...entry, checklist: [...checklist, item] });
    setNewItem("");
  };

  const toggle = (id: string) =>
    onUpdate({
      ...entry,
      checklist: checklist.map((c) => (c.id === id ? toggleChecklistItem(c) : c)),
    });

  const cycleRecurrence = (id: string) =>
    onUpdate({
      ...entry,
      checklist: checklist.map((c) =>
        c.id === id ? { ...c, recurrence: nextRecurrence(c.recurrence) } : c,
      ),
    });

  const remove = (id: string) =>
    onUpdate({ ...entry, checklist: checklist.filter((c) => c.id !== id) });

  const openCount = checklist.filter((c) => !c.done).length;

  return (
    <Modal title={entry.title} onClose={onClose}>
      <div className="field">
        <label>Your rating</label>
        <StarRating value={entry.score} onChange={onRate} />
      </div>
      {entry.seasons?.length ? (
        <div className="field">
          <label>
            Seasons ({entry.progress}/{entry.total} episodes)
          </label>
          <div className="detail-seasons">
            {entry.seasons.map((s) => {
              const full = s.watched >= s.episodes;
              return (
                <div key={s.season} className={`season-row ${full ? "done" : ""}`}>
                  <span className="season-name" title={s.name}>
                    {s.name}
                  </span>
                  <div className="season-controls">
                    <button
                      className="btn ghost icon"
                      title="One fewer"
                      disabled={s.watched <= 0}
                      onClick={() => onUpdate(setSeasonWatched(entry, s.season, s.watched - 1))}
                    >
                      −
                    </button>
                    <span className="season-count">
                      {s.watched}/{s.episodes}
                    </span>
                    <button
                      className="btn ghost icon"
                      title="One more"
                      disabled={full}
                      onClick={() => onUpdate(setSeasonWatched(entry, s.season, s.watched + 1))}
                    >
                      +
                    </button>
                    <button
                      className="btn ghost season-done"
                      title={full ? "Clear season" : "Mark season watched"}
                      onClick={() =>
                        onUpdate(setSeasonWatched(entry, s.season, full ? 0 : s.episodes))
                      }
                    >
                      {full ? "clear" : "all"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="field">
        <label>Notes</label>
        <textarea
          className="input detail-notes"
          rows={5}
          placeholder="Anything worth remembering — where you left off, a boss strategy, a link…"
          defaultValue={entry.notes ?? ""}
          onBlur={(e) => {
            const notes = e.target.value.trim();
            if (notes !== (entry.notes ?? "")) onUpdate({ ...entry, notes: notes || undefined });
          }}
        />
      </div>
      <div className="field">
        <label>
          Checklist{checklist.length > 0 ? ` (${openCount} left)` : ""}
        </label>
        <div className="detail-checklist">
          {checklist.map((c) => (
            <div key={c.id} className={`detail-check ${c.done ? "done" : ""}`}>
              <button
                className={`check-box ${c.done ? "checked" : ""}`}
                title={c.done ? "Mark undone" : "Mark done"}
                onClick={() => toggle(c.id)}
              >
                {c.done ? IC.check : null}
              </button>
              <span className="detail-check-text">{c.text}</span>
              {c.recurrence && c.recurrence !== "none" && (
                <span className="detail-check-repeat">
                  {IC.refresh} {RECURRENCE_LABEL[c.recurrence]}
                </span>
              )}
              <button
                className={`btn ghost icon ${
                  c.recurrence && c.recurrence !== "none" ? "repeat-on" : ""
                }`}
                title={
                  c.recurrence && c.recurrence !== "none"
                    ? `Repeats ${RECURRENCE_LABEL[c.recurrence]} — click to change`
                    : "Make this repeat"
                }
                onClick={() => cycleRecurrence(c.id)}
              >
                {IC.refresh}
              </button>
              <button
                className={`btn ghost icon ${
                  isFocused({ kind: "task", id: c.id, parentId: entry.id }) ? "focused" : ""
                }`}
                title="Focus on this task"
                onClick={() => focusNow({ kind: "task", id: c.id, parentId: entry.id })}
              >
                {IC.target}
              </button>
              <button
                className="btn ghost icon danger"
                title="Remove"
                onClick={() => remove(c.id)}
              >
                {IC.close}
              </button>
            </div>
          ))}
          <div className="detail-check-add">
            <input
              className="input detail-check-input"
              placeholder="Add a task… (Enter)"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
              }}
            />
            <div className="detail-check-add-row">
              <select
                className="input detail-check-recur"
                value={newRecurrence}
                title="How often this task repeats"
                onChange={(e) => setNewRecurrence(e.target.value as Recurrence)}
              >
                <option value="none">once</option>
                <option value="daily">repeats daily</option>
                <option value="weekly">repeats weekly</option>
              </select>
              <button className="btn" disabled={!newItem.trim()} onClick={addItem}>
                {IC.plus} Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function AddCategoryModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal title="Add category" onClose={onClose}>
      <div className="field">
        <label>Category name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Books, Podcasts, …"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSave(name.trim());
          }}
        />
      </div>
      <div className="modal-actions">
        <button className="btn primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
          Add
        </button>
      </div>
    </Modal>
  );
}

export function ManualEntryModal({
  categoryId,
  withLaunch,
  onClose,
  onSave,
}: {
  categoryId: string;
  withLaunch: boolean;
  onClose: () => void;
  onSave: (e: MediaEntry) => void;
}) {
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [launchCommand, setLaunchCommand] = useState("");
  const [status, setStatus] = useState<MediaStatus>("PLANNING");

  return (
    <Modal title="Add entry" onClose={onClose}>
      <div className="field">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>{withLaunch ? "Total (optional)" : "Total episodes / parts (optional)"}</label>
        <input
          className="input"
          type="number"
          min="1"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Cover image URL (optional)</label>
        <input
          className="input"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      {withLaunch && (
        <div className="field">
          <label>Launch command (optional)</label>
          <input
            className="input"
            value={launchCommand}
            onChange={(e) => setLaunchCommand(e.target.value)}
            placeholder="hydra, xdg-open steam://rungameid/…, an-anime-game-launcher"
          />
        </div>
      )}
      <div className="field">
        <label>Status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as MediaStatus)}>
          {MEDIA_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="modal-actions">
        <button
          className="btn primary"
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              id: uid(),
              categoryId,
              title: title.trim(),
              progress: 0,
              total: total ? Number(total) : null,
              coverUrl: coverUrl.trim() || undefined,
              launchCommand: launchCommand.trim() || undefined,
              status,
              completedAt: status === "COMPLETED" ? localDate() : undefined,
            })
          }
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
