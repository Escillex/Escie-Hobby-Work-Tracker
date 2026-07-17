import { useState } from "react";
import type { Note } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { useFocusActions } from "../lib/focus";
import { saveNoteToVault } from "../lib/obsidian";
import { IC } from "../lib/icons";
import "./NotesWidget.css";

/** Dashboard capture widget: rapid-fire note titles + recent list.
 *  Managing (editing bodies) happens in the Notes tab. */
export function NotesWidget({ onOpen }: { onOpen: () => void }) {
  const { data, dispatch } = useApp();
  const { focusNow, isFocused } = useFocusActions();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const capture = () => {
    const t = text.trim();
    if (!t) return;
    const note: Note = {
      id: uid(),
      title: t,
      body: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: "note/add", note });
    setText("");
    if (data.settings.vaultPath) {
      saveNoteToVault(data.settings, note)
        .then((path) =>
          dispatch({
            type: "note/patch",
            id: note.id,
            patch: { vaultFile: path, vaultTitle: note.title },
          }),
        )
        .catch((e) => flash(`Vault sync failed: ${e}`));
    }
  };

  return (
    <aside className="notes-widget glass">
      <div className="panel-title" onDoubleClick={onOpen} title="Double-click to open Notes">
        {IC.bulb} Notes
        <button className="btn ghost icon vault-btn" title="Open Notes tab" onClick={onOpen}>
          {IC.external}
        </button>
      </div>
      <input
        className="input"
        placeholder="Capture a thought before it escapes…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") capture();
        }}
      />
      {notice && <span className="nw-notice">{notice}</span>}
      <div className="nw-list">
        {data.notes.length === 0 && (
          <p className="nw-empty">Nothing captured. Brain quiet? Suspicious.</p>
        )}
        {data.notes.slice(0, 12).map((n) => (
          <div key={n.id} className="nw-item pop-in">
            <button className="nw-item-title" title="Open in Notes" onClick={onOpen}>
              {n.title || "Untitled"}
            </button>
            <div className="nw-item-actions">
              <button
                className={`btn ghost icon ${isFocused({ kind: "note", id: n.id }) ? "focused" : ""}`}
                title="Focus on this"
                onClick={() => focusNow({ kind: "note", id: n.id })}
              >
                {IC.target}
              </button>
              <button
                className="btn ghost icon danger"
                title="Delete"
                onClick={() => dispatch({ type: "note/delete", id: n.id })}
              >
                {IC.close}
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
