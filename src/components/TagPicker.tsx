import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RosePineColor, Tag } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { IC } from "../lib/icons";
import { ColorPicker } from "./ColorPicker";
import "./shared.css";

/** Fixed-position anchoring for popovers portaled to <body> — inside a
 *  scroll container (task/note lists have overflow-y: auto) or under a
 *  backdrop-filter ancestor, in-place positioning gets clipped. Render the
 *  returned anchorRef on a hidden span inside the .tag-picker-wrap; the
 *  popover gets popRef + style. Flips above when short on space below. */
export function usePopoverPos(heightDep: unknown = null) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
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
  }, [heightDep]);
  const style = pos
    ? { top: pos.top, right: pos.right }
    : ({ visibility: "hidden" } as const);
  return { anchorRef, popRef, style };
}

/** Radio-style popover assigning at most one tag; parent needs
 *  .tag-picker-wrap. Clicking the active chip clears the tag; creating a
 *  tag assigns it immediately with the chosen color. */
export function TagPicker({
  active,
  onPick,
  onClose,
}: {
  active?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const { data, dispatch } = useApp();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<RosePineColor>("iris");
  const { anchorRef, popRef, style } = usePopoverPos(data.tags.length);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const tag: Tag = { id: uid(), name, color: newColor };
    dispatch({ type: "tag/add", tag });
    onPick(tag.id);
    setNewName("");
  };

  const popover = (
    <div ref={popRef} className="tag-picker glass" style={style}>
      {data.tags.length === 0 && <p className="tag-picker-empty">No tags yet.</p>}
      {data.tags.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            className={`tag-chip ${t.color} ${on ? "on" : ""}`}
            onClick={() => onPick(on ? null : t.id)}
          >
            {on ? IC.check : null} {t.name}
          </button>
        );
      })}
      <ColorPicker value={newColor} onChange={setNewColor} />
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

/** Rename / recolor / delete popover for one tag, anchored like TagPicker.
 *  Delete untags items but never deletes them. */
function TagEditor({ tag, onClose }: { tag: Tag; onClose: () => void }) {
  const { dispatch } = useApp();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<RosePineColor>(tag.color);
  const { anchorRef, popRef, style } = usePopoverPos();

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: "tag/update", tag: { ...tag, name: trimmed, color } });
    onClose();
  };

  const popover = (
    <div ref={popRef} className="tag-picker glass" style={style}>
      <input
        className="input"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onClose();
        }}
      />
      <ColorPicker value={color} onChange={setColor} />
      <div className="tag-editor-actions">
        <button
          className="btn ghost danger"
          onClick={() => {
            dispatch({ type: "tag/delete", id: tag.id });
            onClose();
          }}
        >
          Delete
        </button>
        <button className="btn primary" disabled={!name.trim()} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );

  return (
    <>
      <span ref={anchorRef} style={{ display: "none" }} />
      {createPortal(popover, document.body)}
    </>
  );
}

/** "all" + one chip per tag; null = no filter. Collapsible via a persisted
 *  setting shared by the tasks and notes views; manage mode forces it open,
 *  swaps "all" for a create (+) chip, and makes chips click-to-edit.
 *  Double-clicking a chip outside manage mode opens the same editor without
 *  disturbing the active filter. With no tags yet, shows a hint so the
 *  feature stays discoverable. */
export function TagFilterRow({
  active,
  onChange,
  manage = false,
}: {
  active: string | null;
  onChange: (id: string | null) => void;
  manage?: boolean;
}) {
  const { data, dispatch } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const preClick = useRef<string | null>(null);
  const collapsed = (data.settings.tagRowCollapsed ?? false) && !manage;
  const activeTag = active ? data.tags.find((t) => t.id === active) : undefined;

  const toggle = (
    <button
      className="tag-chip tag-row-toggle"
      title={collapsed ? "Show tag filter" : "Hide tag filter"}
      onClick={() =>
        dispatch({
          type: "settings/update",
          settings: { tagRowCollapsed: !(data.settings.tagRowCollapsed ?? false) },
        })
      }
    >
      {IC.tag}
      {collapsed && activeTag && (
        <i className="tag-dot" style={{ background: `var(--rp-${activeTag.color})` }} />
      )}
    </button>
  );

  if (collapsed) return <div className="tag-filter-row">{toggle}</div>;

  return (
    <div className="tag-filter-row">
      {toggle}
      {manage ? (
        <span className="tag-picker-wrap">
          <button className="tag-chip" title="New tag" onClick={() => setCreating((v) => !v)}>
            {IC.plus}
          </button>
          {creating && (
            <TagPicker
              active={undefined}
              onPick={() => setCreating(false)}
              onClose={() => setCreating(false)}
            />
          )}
        </span>
      ) : data.tags.length === 0 ? (
        <span className="tag-filter-hint">
          No tags yet — use {IC.tag} to create one, then filter here.
        </span>
      ) : (
        <button
          className={`tag-chip ${active === null ? "on" : ""}`}
          onClick={() => onChange(null)}
        >
          all
        </button>
      )}
      {data.tags.map((t) => (
        <span key={t.id} className="tag-picker-wrap">
          <button
            className={`tag-chip ${t.color} ${active === t.id ? "on" : ""}`}
            onClick={(e) => {
              if (manage) {
                setEditing(editing === t.id ? null : t.id);
                return;
              }
              if (e.detail === 1) preClick.current = active;
              onChange(active === t.id ? null : t.id);
            }}
            onDoubleClick={() => {
              if (manage) return;
              onChange(preClick.current); // restore the filter from before the first click
              setEditing(t.id);
            }}
          >
            {t.name}
          </button>
          {editing === t.id && <TagEditor tag={t} onClose={() => setEditing(null)} />}
        </span>
      ))}
    </div>
  );
}
