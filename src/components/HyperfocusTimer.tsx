import { useEffect, useRef, useState } from "react";
import { notify } from "../lib/notify";
import { IC } from "../lib/icons";
import "./HyperfocusTimer.css";

const NUDGES: [number, string][] = [
  [60, "1 hour in — quick stretch? The hyperfocus will survive it."],
  [120, "2 hours deep. Genuinely impressive. Stand up, drink water, come back."],
];

export function HyperfocusTimer() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [alarmMin, setAlarmMin] = useState("");
  const [alarmEnd, setAlarmEnd] = useState<number | null>(null);
  const notified = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (startedAt == null && alarmEnd == null) return;
    const tick = window.setInterval(() => {
      if (startedAt != null) {
        const secs = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(secs);
        const mins = Math.floor(secs / 60);
        for (const [at, msg] of NUDGES) {
          if (mins >= at && !notified.current.has(at)) {
            notified.current.add(at);
            notify("Hyperfocus check-in", msg);
          }
        }
      }
      if (alarmEnd != null && Date.now() >= alarmEnd) {
        setAlarmEnd(null);
        notify("Timer done", "Your countdown just finished.");
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [startedAt, alarmEnd]);

  const minutes = Math.floor(elapsed / 60);
  const nudge =
    startedAt != null
      ? [...NUDGES].reverse().find(([m]) => minutes >= m)?.[1]
      : undefined;

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
      <div className="panel-title">{IC.clock} Hyperfocus</div>
      <div className={`hf-display ${startedAt != null ? "running" : ""}`}>{fmt(elapsed)}</div>
      <div className="hf-actions">
        {startedAt == null ? (
          <button
            className="btn primary"
            onClick={() => {
              setElapsed(0);
              notified.current.clear();
              setStartedAt(Date.now());
            }}
          >
            {IC.play} Start session
          </button>
        ) : (
          <button className="btn" onClick={() => setStartedAt(null)}>
            {IC.stop} End ({fmt(elapsed)})
          </button>
        )}
      </div>
      <div className="hf-alarm">
        {alarmEnd == null ? (
          <>
            <input
              className="input"
              type="number"
              min="1"
              placeholder="min"
              value={alarmMin}
              onChange={(e) => setAlarmMin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && Number(alarmMin) > 0) {
                  setAlarmEnd(Date.now() + Number(alarmMin) * 60_000);
                  setAlarmMin("");
                }
              }}
            />
            <button
              className="btn"
              disabled={!(Number(alarmMin) > 0)}
              title="System notification when time is up"
              onClick={() => {
                setAlarmEnd(Date.now() + Number(alarmMin) * 60_000);
                setAlarmMin("");
              }}
            >
              Remind me
            </button>
          </>
        ) : (
          <button className="btn ghost hf-alarm-active" onClick={() => setAlarmEnd(null)}>
            {IC.clock} rings {new Date(alarmEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — cancel
          </button>
        )}
      </div>
      {nudge && <p className="hf-nudge">{nudge}</p>}
    </div>
  );
}
