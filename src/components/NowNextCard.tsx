import { useApp } from "../lib/state";
import { resolveFocus } from "../lib/focus";
import type { FocusRef } from "../lib/types";
import { IC } from "../lib/icons";
import "./NowNextCard.css";

export function NowNextCard() {
  const { data, dispatch } = useApp();

  const nowRef = data.focus.now;
  const nextRef = data.focus.next;
  const now = nowRef ? resolveFocus(data, nowRef) : null;
  const next = nextRef ? resolveFocus(data, nextRef) : null;

  // Complete the underlying item (for todos/tasks), then pull NEXT into NOW.
  const finishNow = () => {
    if (nowRef && now?.completable) completeItem(nowRef);
    dispatch({ type: "focus/set", slot: "now", ref: nextRef });
    dispatch({ type: "focus/set", slot: "next", ref: undefined });
  };

  const completeItem = (ref: FocusRef) => {
    if (ref.kind === "todo") {
      const t = data.todos.find((x) => x.id === ref.id);
      if (t) dispatch({ type: "todo/update", todo: { ...t, done: true, lastDone: t.recurrence !== "none" ? new Date().toISOString().slice(0, 10) : undefined } });
    } else if (ref.kind === "task") {
      const m = data.media.entries.find((x) => x.id === ref.parentId);
      if (m) {
        dispatch({
          type: "media/update",
          entry: {
            ...m,
            checklist: (m.checklist ?? []).map((c) =>
              c.id === ref.id ? { ...c, done: true } : c,
            ),
          },
        });
      }
    }
  };

  const clearNow = () => {
    dispatch({ type: "focus/set", slot: "now", ref: nextRef });
    dispatch({ type: "focus/set", slot: "next", ref: undefined });
  };

  return (
    <section className="now-next">
      <div className="now-card glass">
        <div className="panel-title">
          <span className="now-dot" /> Now
        </div>
        {now ? (
          <>
            <p className="now-text">{now.label}</p>
            {now.sublabel && <p className="now-sub">{now.sublabel}</p>}
            <div className="now-actions">
              <button className="btn primary" onClick={finishNow}>
                {IC.check} {now.completable ? "Done" : "Clear"}
                {next ? " → pull next" : ""}
              </button>
              {now.completable && (
                <button className="btn ghost" onClick={clearNow}>
                  Clear
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="now-empty">
            One thing at a time. Set a focus with the {IC.target} button on any
            game, show, to-do, or note.
          </p>
        )}
      </div>
      <div className="next-card glass">
        <div className="panel-title">Next</div>
        {next ? (
          <>
            <p className="next-text">{next.label}</p>
            {next.sublabel && <p className="now-sub">{next.sublabel}</p>}
          </>
        ) : (
          <p className="now-empty">Queue is clear.</p>
        )}
      </div>
    </section>
  );
}
