import { useApp } from "../lib/state";
import { resolveFocus } from "../lib/focus";
import type { FocusRef } from "../lib/types";
import { IC } from "../lib/icons";
import "./NowNextCard.css";

export function NowNextCard() {
  const { data, dispatch } = useApp();

  const nowRef = data.focus.now;
  const queue = data.focus.next;
  const now = nowRef ? resolveFocus(data, nowRef) : null;

  // Complete the underlying item (for todos/tasks), then pull the queue head up.
  const finishNow = () => {
    if (nowRef && now?.completable) completeItem(nowRef);
    dispatch({ type: "focus/advance" });
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
              c.id === ref.id
                ? {
                    ...c,
                    done: true,
                    lastDone:
                      c.recurrence && c.recurrence !== "none"
                        ? new Date().toISOString().slice(0, 10)
                        : c.lastDone,
                  }
                : c,
            ),
          },
        });
      }
    }
  };

  const promote = (ref: FocusRef) => {
    dispatch({ type: "focus/now", ref });
    dispatch({ type: "focus/unqueue", ref });
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
                {queue.length > 0 ? " → pull next" : ""}
              </button>
              {now.completable && (
                <button className="btn ghost" onClick={() => dispatch({ type: "focus/advance" })}>
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
        {queue.length > 0 ? (
          <ul className="next-list">
            {queue.map((ref, i) => {
              const item = resolveFocus(data, ref);
              if (!item) return null;
              return (
                <li className="next-item" key={`${ref.kind}:${ref.parentId ?? ""}:${ref.id}`}>
                  <button
                    className="next-item-label"
                    title="Focus on this now"
                    onClick={() => promote(ref)}
                  >
                    <span className="next-item-pos">{i + 1}</span>
                    {item.label}
                  </button>
                  <button
                    className="btn ghost icon danger"
                    title="Remove from queue"
                    onClick={() => dispatch({ type: "focus/unqueue", ref })}
                  >
                    {IC.close}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="now-empty">
            Queue is clear. Add with the {IC.next} button on any item.
          </p>
        )}
      </div>
    </section>
  );
}
