import { useEffect, useRef, useState } from "react";
import "./HyperfocusTimer.css";

const NUDGES: [number, string][] = [
  [120, "2 hours deep. Genuinely impressive. Stand up, drink water, come back."],
  [60, "1 hour in — quick stretch? The hyperfocus will survive it."],
];

export function HyperfocusTimer() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<number>(undefined);

  useEffect(() => {
    if (startedAt == null) return;
    tick.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(tick.current);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const nudge = startedAt != null ? NUDGES.find(([m]) => minutes >= m)?.[1] : undefined;

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="hf-timer glass">
      <div className="panel-title">⏱ Hyperfocus</div>
      <div className={`hf-display ${startedAt != null ? "running" : ""}`}>{fmt(elapsed)}</div>
      <div className="hf-actions">
        {startedAt == null ? (
          <button
            className="btn primary"
            onClick={() => {
              setElapsed(0);
              setStartedAt(Date.now());
            }}
          >
            ▶ Start session
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => {
              setStartedAt(null);
            }}
          >
            ⏹ End ({fmt(elapsed)})
          </button>
        )}
      </div>
      {nudge && <p className="hf-nudge">{nudge}</p>}
    </div>
  );
}
