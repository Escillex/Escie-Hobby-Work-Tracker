import { useState } from "react";
import { useApp } from "../lib/state";
import "./ImpulseLot.css";

export function ImpulseLot() {
  const { data, dispatch } = useApp();
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);

  const parked = data.impulses.filter((i) => i.status === "parked");
  const done = data.impulses.filter((i) => i.status === "done");

  const capture = () => {
    const t = text.trim();
    if (!t) return;
    dispatch({ type: "impulse/add", text: t });
    setText("");
  };

  return (
    <aside className="impulse-lot glass">
      <div className="panel-title">🧠 Impulse parking lot</div>
      <input
        className="input impulse-input"
        placeholder="Park a thought before it escapes…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") capture();
        }}
      />
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
                ▶
              </button>
              <button
                className="btn ghost icon"
                title="Queue as NEXT"
                onClick={() =>
                  dispatch({ type: "impulse/setStatus", id: i.id, status: "next" })
                }
              >
                ⏭
              </button>
              <button
                className="btn ghost icon"
                title="Mark done"
                onClick={() =>
                  dispatch({ type: "impulse/setStatus", id: i.id, status: "done" })
                }
              >
                ✓
              </button>
              <button
                className="btn ghost icon danger"
                title="Delete"
                onClick={() => dispatch({ type: "impulse/delete", id: i.id })}
              >
                ✕
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
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}
    </aside>
  );
}
