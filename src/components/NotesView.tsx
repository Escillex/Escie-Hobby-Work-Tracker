import { useRef, useState } from "react";
import { marked } from "marked";
import type { Note } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { useFocusActions } from "../lib/focus";
import { saveNoteToVault, openNoteInObsidian, overwriteNoteFile } from "../lib/obsidian";
import { IC } from "../lib/icons";
import { ObsidianPanel } from "./ObsidianPanel";
import { TagFilterRow, TagPicker } from "./TagPicker";
import "./NotesView.css";

export function NotesView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data, dispatch } = useApp();
  const { focusNow, isFocused } = useFocusActions();
  const [selectedId, setSelectedId] = useState<string | null>(data.notes[0]?.id ?? null);
  const [preview, setPreview] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNotesIds, setSelectedNotesIds] = useState<Set<string>>(new Set());
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState<string | null>(null);

  const toggleSelectedNote = (id: string) =>
    setSelectedNotesIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const notes = data.notes.filter(
    (n) => tagFilter === null || n.tagId === tagFilter,
  );
  const autosaveTimers = useRef(new Map<string, number>());

  const selected = data.notes.find((n) => n.id === selectedId) ?? null;

  const newNote = () => {
    const note: Note = {
      id: uid(),
      title: "",
      body: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: "note/add", note });
    setSelectedId(note.id);
    setPreview(false);
  };

  const patch = (p: Partial<Note>) => {
    if (!selected) return;
    const next = { ...selected, ...p, updatedAt: new Date().toISOString() };
    dispatch({ type: "note/update", note: next });
    // Linked notes auto-save body edits to their file. Deliberately writes
    // to the current vaultFile even while a title edit is pending — the
    // rename applies on blur, not per keystroke.
    if (next.vaultFile && p.body !== undefined) {
      const path = next.vaultFile;
      const body = next.body;
      const timers = autosaveTimers.current;
      window.clearTimeout(timers.get(path));
      timers.set(
        path,
        window.setTimeout(() => {
          timers.delete(path);
          overwriteNoteFile(path, body).catch((e) => flash(`Vault write failed: ${e}`));
        }, 1500),
      );
    }
  };

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const toVault = async () => {
    if (!selected) return;
    try {
      const path = await saveNoteToVault(data.settings, selected);
      dispatch({
        type: "note/patch",
        id: selected.id,
        patch: { vaultFile: path, vaultTitle: selected.title },
      });
      await openNoteInObsidian(path);
      flash("Saved to vault and opened in Obsidian");
    } catch (e) {
      flash(`${e}`);
    }
  };

  return (
    <div className="notes-view">
      <aside className="notes-side">
        <ObsidianPanel onOpenSettings={onOpenSettings} />
        <div className="notes-list glass">
          <div className="panel-title">
            {IC.note} Notes
            <button className="btn ghost icon" title="New note" onClick={newNote}>
              {IC.plus}
            </button>
            <button
              className={`btn icon ${selectMode ? "primary" : "ghost"}`}
              title="Select multiple"
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedNotesIds(new Set());
                setBulkPickerOpen(false);
                setBulkTag(null);
              }}
            >
              {IC.check}
            </button>
          </div>
          <TagFilterRow active={tagFilter} onChange={setTagFilter} />
          {selectMode && (
            <div className="bulk-bar">
              <span>{selectedNotesIds.size} selected</span>
              <button
                className="btn ghost danger"
                disabled={selectedNotesIds.size === 0}
                onClick={() => {
                  if (!confirm(`Delete ${selectedNotesIds.size} selected notes? Vault files stay in Obsidian.`)) return;
                  dispatch({ type: "note/delete-many", ids: [...selectedNotesIds] });
                  setSelectedNotesIds(new Set());
                  setSelectedId(null);
                  setBulkPickerOpen(false);
                  setBulkTag(null);
                }}
              >
                Delete
              </button>
              <div className="tag-picker-wrap">
                <button
                  className="btn ghost"
                  disabled={selectedNotesIds.size === 0}
                  onClick={() => setBulkPickerOpen((v) => !v)}
                >
                  {IC.tag} Tag
                </button>
                {bulkPickerOpen && (
                  <TagPicker
                    active={bulkTag ?? undefined}
                    onPick={(id) => {
                      if (!id) return;
                      dispatch({ type: "note/tag-many", ids: [...selectedNotesIds], tagId: id });
                      setBulkTag(id);
                    }}
                    onClose={() => {
                      setBulkPickerOpen(false);
                      setSelectedNotesIds(new Set());
                      setBulkTag(null);
                    }}
                  />
                )}
              </div>
            </div>
          )}
          <div className="notes-list-items">
            {notes.length === 0 && (
              <p className="notes-empty">
                {data.notes.length === 0 ? "No notes yet." : "No notes match this tag."}
              </p>
            )}
            {notes.map((n) => {
              const tag = n.tagId ? data.tags.find((t) => t.id === n.tagId) : undefined;
              return (
              <div
                key={n.id}
                className={`notes-list-item ${n.id === selectedId ? "active" : ""} ${tag ? "tagged" : ""}`}
                style={tag ? ({ "--tag-color": `var(--rp-${tag.color})` } as React.CSSProperties) : undefined}
                title={tag ? `tag: ${tag.name}` : undefined}
              >
                {selectMode && (
                  <button
                    className={`check-box ${selectedNotesIds.has(n.id) ? "checked" : ""}`}
                    title="Select"
                    onClick={() => toggleSelectedNote(n.id)}
                  >
                    {selectedNotesIds.has(n.id) ? IC.check : null}
                  </button>
                )}
                <button
                  className="note-item-open"
                  onClick={() => {
                    setSelectedId(n.id);
                    setPreview(false);
                    setTagPickerOpen(false);
                  }}
                >
                  <span className="note-item-title">{n.title || "Untitled"}</span>
                  <span className="note-item-preview">
                    {n.body.replace(/[#*`>\-\n]/g, " ").trim().slice(0, 42) || "empty"}
                  </span>
                </button>
                <button
                  className={`btn ghost icon note-item-focus ${
                    isFocused({ kind: "note", id: n.id }) ? "focused" : ""
                  }`}
                  title="Focus on this"
                  onClick={() => focusNow({ kind: "note", id: n.id })}
                >
                  {IC.target}
                </button>
              </div>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="notes-editor glass">
        {selected ? (
          <>
            <div className="editor-toolbar">
              <input
                className="editor-title"
                placeholder="Untitled"
                value={selected.title}
                onChange={(e) => patch({ title: e.target.value })}
                onBlur={async () => {
                  if (!selected.vaultFile || selected.title === selected.vaultTitle) return;
                  const oldPath = selected.vaultFile;
                  try {
                    const path = await saveNoteToVault(data.settings, selected);
                    dispatch({
                      type: "note/patch",
                      id: selected.id,
                      patch: { vaultFile: path, vaultTitle: selected.title },
                    });
                    dispatch({
                      type: "vault/set-archived",
                      paths: [...(data.vaultArchived ?? []), oldPath],
                    });
                  } catch (e) {
                    flash(`${e}`);
                  }
                }}
              />
              <div className="editor-actions">
                <button
                  className={`btn ghost ${!preview ? "active-mode" : ""}`}
                  onClick={() => setPreview(false)}
                >
                  Edit
                </button>
                <button
                  className={`btn ghost ${preview ? "active-mode" : ""}`}
                  onClick={() => setPreview(true)}
                >
                  Preview
                </button>
                <button className="btn" onClick={toVault} title="Save to your Obsidian vault">
                  {IC.external} To vault
                </button>
                <div className="tag-picker-wrap">
                  <button
                    className="btn ghost icon"
                    title="Edit tags"
                    onClick={() => setTagPickerOpen((v) => !v)}
                  >
                    {IC.tag}
                  </button>
                  {tagPickerOpen && (
                    <TagPicker
                      active={selected.tagId}
                      onPick={(id) =>
                        dispatch({
                          type: "note/patch",
                          id: selected.id,
                          patch: { tagId: id ?? undefined },
                        })
                      }
                      onClose={() => setTagPickerOpen(false)}
                    />
                  )}
                </div>
                <button
                  className="btn ghost icon danger"
                  title="Delete note"
                  onClick={() => {
                    dispatch({ type: "note/delete", id: selected.id });
                    setSelectedId(notes.find((n) => n.id !== selected.id)?.id ?? null);
                  }}
                >
                  {IC.close}
                </button>
              </div>
            </div>
            {notice && <div className="editor-notice">{notice}</div>}
            {preview ? (
              <div
                className="editor-preview markdown"
                dangerouslySetInnerHTML={{ __html: renderMd(selected.body) }}
              />
            ) : (
              <textarea
                className="editor-body"
                placeholder="Write in markdown…"
                value={selected.body}
                onChange={(e) => patch({ body: e.target.value })}
              />
            )}
          </>
        ) : (
          <div className="editor-blank">
            <p>Pick a note, or start a new one.</p>
            <button className="btn primary" onClick={newNote}>
              {IC.plus} New note
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function renderMd(body: string): string {
  return marked.parse(body, { async: false }) as string;
}
