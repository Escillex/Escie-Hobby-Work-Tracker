import { useState } from "react";
import { marked } from "marked";
import type { Note } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { useFocusActions } from "../lib/focus";
import { saveNoteToVault, openNoteInObsidian } from "../lib/obsidian";
import { IC } from "../lib/icons";
import { ObsidianPanel } from "./ObsidianPanel";
import "./NotesView.css";

export function NotesView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data, dispatch } = useApp();
  const { focusNow, isFocused } = useFocusActions();
  const notes = data.notes;
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

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
    dispatch({
      type: "note/update",
      note: { ...selected, ...p, updatedAt: new Date().toISOString() },
    });
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
          </div>
          <div className="notes-list-items">
            {notes.length === 0 && <p className="notes-empty">No notes yet.</p>}
            {notes.map((n) => (
              <div
                key={n.id}
                className={`notes-list-item ${n.id === selectedId ? "active" : ""}`}
              >
                <button
                  className="note-item-open"
                  onClick={() => {
                    setSelectedId(n.id);
                    setPreview(false);
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
            ))}
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
