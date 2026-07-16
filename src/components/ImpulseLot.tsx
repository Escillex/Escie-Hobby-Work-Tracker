import { useState } from "react";
import { useApp } from "../lib/state";
import { appendToInbox, promoteToNote, openVault } from "../lib/obsidian";
import { IC } from "../lib/icons";
import "./ImpulseLot.css";

export function ImpulseLot() {
  const { data, dispatch } = useApp();
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const vaultSet = Boolean(data.settings.vaultPath);
  const parked = data.impulses.filter((i) => i.status === "parked");
  const done = data.impulses.filter((i) => i.status === "done");

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const capture = () => {
    const t = text.trim();
    if (!t) return;
    dispatch({ type: "impulse/add", text: t });
    setText("");
    if (vaultSet) {
      appendToInbox(data.settings, t).catch((e) => flash(`Vault sync failed: ${e}`));
    }
  };

  const toNote = async (id: string) => {
    const impulse = data.impulses.find((i) => i.id === id);
    if (!impulse) return;
    try {
      await promoteToNote(data.settings, impulse);
      flash("Note created in vault");
    } catch (e) {
      flash(`${e}`);
    }
  };

  return (
    <aside className="impulse-lot glass">
      <div className="panel-title">
        {IC.bulb} Impulse parking lot
        {vaultSet && (
          <button
            className="btn ghost icon vault-btn"
            title="Open vault in Obsidian"
            onClick={() => openVault(data.settings)}
          >
            {IC.book}
          </button>
        )}
      </div>
      <input
        className="input impulse-input"
        placeholder="Park a thought before it escapes…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") capture();
        }}
      />
      {notice && <span className="impulse-notice">{notice}</span>}
      <div className="impulse-list">
        {parked.length === 0 && (
          <p className="impulse-empty">Nothing parked. Brain quiet? Suspicious.</p>
        )}
        {parked.map((i) => (
          <div key={i.id} className="impulse-item pop-in">
            <span className="impulse-text">{i.text}</span>
            <div className="impulse-actions">
              <button
                className="btn ghost icon"
                title="Do it NOW"
                onClick={() =>
                  dispatch({ type: "impulse/setStatus", id: i.id, status: "now" })
                }
              >
                {IC.play}
              </button>
              <button
                className="btn ghost icon"
                title="Queue as NEXT"
                onClick={() =>
                  dispatch({ type: "impulse/setStatus", id: i.id, status: "next" })
                }
              >
                {IC.next}
              </button>
              {vaultSet && (
                <button
                  className="btn ghost icon"
                  title="Turn into an Obsidian note"
                  onClick={() => toNote(i.id)}
                >
                  {IC.note}
                </button>
              )}
              <button
                className="btn ghost icon"
                title="Mark done"
                onClick={() =>
                  dispatch({ type: "impulse/setStatus", id: i.id, status: "done" })
                }
              >
                {IC.check}
              </button>
              <button
                className="btn ghost icon danger"
                title="Delete"
                onClick={() => dispatch({ type: "impulse/delete", id: i.id })}
              >
                {IC.close}
              </button>
            </div>
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <div className="impulse-done">
          <button className="btn ghost done-toggle" onClick={() => setShowDone(!showDone)}>
            {showDone ? "▾" : "▸"} done ({done.length})
          </button>
          {showDone &&
            done.map((i) => (
              <div key={i.id} className="impulse-item done fade-up">
                <span className="impulse-text">{i.text}</span>
                <button
                  className="btn ghost icon danger"
                  title="Delete"
                  onClick={() => dispatch({ type: "impulse/delete", id: i.id })}
                >
                  {IC.close}
                </button>
              </div>
            ))}
        </div>
      )}
    </aside>
  );
}
