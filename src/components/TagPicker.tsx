import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Tag } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { IC } from "../lib/icons";
import "./shared.css";

/** Popover for toggling tag membership; parent needs .tag-picker-wrap.
 *  Portaled to <body> with fixed positioning — inside a scroll container
 *  (task/note lists have overflow-y: auto) an absolute popover gets
 *  clipped at the panel edge. */
export function TagPicker({
  value,
  onToggle,
  onClose,
}: {
  value: string[];
  onToggle: (tagId: string, on: boolean) => void;
  onClose: () => void;
}) {
  const { data, dispatch } = useApp();
  const [newName, setNewName] = useState("");
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Anchor below the .tag-picker-wrap button; flip above if the popover
  // would run past the bottom of the window. Re-runs as tags are created
  // since that changes the popover's height.
  useLayoutEffect(() => {
    const wrap = anchorRef.current?.parentElement;
    const pop = popRef.current;
    if (!wrap || !pop) return;
    const r = wrap.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + pop.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - pop.offsetHeight - 4);
    }
    setPos({ top, right: Math.max(8, window.innerWidth - r.right) });
  }, [data.tags.length]);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const tag: Tag = { id: uid(), name, color: "iris" };
    dispatch({ type: "tag/add", tag });
    onToggle(tag.id, true);
    setNewName("");
  };

  const popover = (
    <div
      ref={popRef}
      className="tag-picker glass"
      style={pos ? { top: pos.top, right: pos.right } : { visibility: "hidden" }}
    >
      {data.tags.length === 0 && <p className="tag-picker-empty">No tags yet.</p>}
      {data.tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            className={`tag-chip ${t.color} ${on ? "on" : ""}`}
            onClick={() => onToggle(t.id, !on)}
          >
            {on ? IC.check : null} {t.name}
          </button>
        );
      })}
      <div className="tag-picker-new">
        <input
          className="input"
          placeholder="New tag…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <button className="btn ghost icon" title="Create tag" onClick={create}>
          {IC.plus}
        </button>
      </div>
      <button className="btn ghost tag-picker-done" onClick={onClose}>
        Done
      </button>
    </div>
  );

  return (
    <>
      <span ref={anchorRef} style={{ display: "none" }} />
      {createPortal(popover, document.body)}
    </>
  );
}

/** Inline colored mini chips for an item's tags. */
export function TagChips({ tagIds }: { tagIds?: string[] }) {
  const { data } = useApp();
  if (!tagIds?.length) return null;
  const tags = tagIds
    .map((id) => data.tags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t);
  if (tags.length === 0) return null;
  return (
    <span className="tag-chips">
      {tags.map((t) => (
        <span key={t.id} className={`tag-chip mini ${t.color}`}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

/** "all" + one chip per tag; null = no filter. With no tags yet, shows a
 *  hint instead of disappearing so the feature stays discoverable. */
export function TagFilterRow({
  active,
  onChange,
}: {
  active: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data } = useApp();
  if (data.tags.length === 0)
    return (
      <div className="tag-filter-row">
        <span className="tag-filter-hint">
          No tags yet — use {IC.tag} to create one, then filter here.
        </span>
      </div>
    );
  return (
    <div className="tag-filter-row">
      <button
        className={`tag-chip ${active === null ? "on" : ""}`}
        onClick={() => onChange(null)}
      >
        all
      </button>
      {data.tags.map((t) => (
        <button
          key={t.id}
          className={`tag-chip ${t.color} ${active === t.id ? "on" : ""}`}
          onClick={() => onChange(active === t.id ? null : t.id)}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
