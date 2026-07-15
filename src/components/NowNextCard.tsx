import { useApp } from "../lib/state";
import "./NowNextCard.css";

export function NowNextCard() {
  const { data, dispatch } = useApp();

  const now = data.impulses.find((i) => i.status === "now");
  const next = data.impulses.find((i) => i.status === "next");
  const topParked = data.impulses.find((i) => i.status === "parked");

  const finishNow = () => {
    if (now) dispatch({ type: "impulse/setStatus", id: now.id, status: "done" });
    if (next) dispatch({ type: "impulse/setStatus", id: next.id, status: "now" });
  };

  const pullNext = () => {
    if (topParked)
      dispatch({ type: "impulse/setStatus", id: topParked.id, status: "next" });
  };

  return (
    <section className="now-next">
      <div className="now-card glass">
        <div className="panel-title">
          <span className="now-dot" /> Now
        </div>
        {now ? (
          <>
            <p className="now-text">{now.text}</p>
            <div className="now-actions">
              <button className="btn primary" onClick={finishNow}>
                ✓ Done{next ? " → pull next" : ""}
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  dispatch({ type: "impulse/setStatus", id: now.id, status: "parked" })
                }
              >
                Park it
              </button>
            </div>
          </>
        ) : (
          <p className="now-empty">
            One thing at a time. Promote an impulse with ▶ to start.
          </p>
        )}
      </div>
      <div className="next-card glass">
        <div className="panel-title">Next</div>
        {next ? (
          <p className="next-text">{next.text}</p>
        ) : topParked ? (
          <button className="btn ghost pull-next" onClick={pullNext}>
            Pull “{topParked.text.slice(0, 32)}
            {topParked.text.length > 32 ? "…" : ""}”
          </button>
        ) : (
          <p className="now-empty">Queue is clear.</p>
        )}
      </div>
    </section>
  );
}
