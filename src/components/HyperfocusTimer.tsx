import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../lib/state";
import { resolveFocus } from "../lib/focus";
import { refKey, formatDuration, parseDuration } from "../lib/time";
import { notify } from "../lib/notify";
import { IC } from "../lib/icons";
import "./HyperfocusTimer.css";

const NUDGES: [number, string][] = [
  [60, "1 hour in — quick stretch? The hyperfocus will survive it."],
  [120, "2 hours deep. Genuinely impressive. Stand up, drink water, come back."],
];

/** How often accrued time is written into the ledger. A crash costs at most this. */
const BANK_EVERY_MS = 30_000;

export function HyperfocusTimer() {
  const { data, dispatch } = useApp();
  const nowRef = data.focus.now;
  const focused = nowRef ? resolveFocus(data, nowRef) : null;
  const key = nowRef ? refKey(nowRef) : null;

  const [manualStart, setManualStart] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [alarmMin, setAlarmMin] = useState("");
  const [alarmEnd, setAlarmEnd] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const notified = useRef<Set<number>>(new Set());

  /** Start of the stretch not yet written to the ledger. */
  const anchor = useRef<number>(Date.now());
  const sessionStart = useRef<number | null>(null);
  const bankedKey = useRef<string | null>(null);

  const total = key ? (data.time[key] ?? 0) : 0;

  const bank = useCallback(
    (target: string | null) => {
      if (!target) return;
      const secs = Math.floor((Date.now() - anchor.current) / 1000);
      anchor.current = Date.now();
      if (secs > 0) dispatch({ type: "time/bank", key: target, seconds: secs });
    },
    [dispatch],
  );

  // A new focus banks the old one and restarts the session clock at zero.
  useEffect(() => {
    if (bankedKey.current === key) return;
    bank(bankedKey.current);
    bankedKey.current = key;
    anchor.current = Date.now();
    sessionStart.current = key ? Date.now() : null;
    setElapsed(0);
    setPaused(false);
    notified.current.clear();
  }, [key, bank]);

  // Bank whatever is pending when the panel goes away.
  useEffect(() => () => bank(bankedKey.current), [bank]);

  useEffect(() => {
    const running = (key != null && !paused) || manualStart != null;
    if (!running && alarmEnd == null) return;
    const tick = window.setInterval(() => {
      const start = key != null && !paused ? sessionStart.current : manualStart;
      if (start != null) {
        const secs = Math.floor((Date.now() - start) / 1000);
        setElapsed(secs);
        const mins = Math.floor(secs / 60);
        for (const [at, msg] of NUDGES) {
          if (mins >= at && !notified.current.has(at)) {
            notified.current.add(at);
            notify("Hyperfocus check-in", msg);
          }
        }
        if (key != null && !paused && Date.now() - anchor.current >= BANK_EVERY_MS) {
          bank(key);
        }
      }
      if (alarmEnd != null && Date.now() >= alarmEnd) {
        setAlarmEnd(null);
        notify("Timer done", "Your countdown just finished.");
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [key, paused, manualStart, alarmEnd, bank]);

  const togglePause = () => {
    if (!key) return;
    if (paused) {
      sessionStart.current = Date.now() - elapsed * 1000;
      anchor.current = Date.now();
      setPaused(false);
    } else {
      bank(key);
      setPaused(true);
    }
  };

  const commitEdit = () => {
    if (editing == null || !key) return setEditing(null);
    const secs = parseDuration(editing);
    if (secs != null) {
      bank(key);
      dispatch({ type: "time/set", key, seconds: secs });
    }
    setEditing(null);
  };

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  };

  const minutes = Math.floor(elapsed / 60);
  const running = (key != null && !paused) || manualStart != null;
  const nudge = running
    ? [...NUDGES].reverse().find(([m]) => minutes >= m)?.[1]
    : undefined;

  return (
    <div className="hf-timer glass">
      <div className="panel-title">{IC.clock} Hyperfocus</div>
      {focused && <p className="hf-subject">{focused.label}</p>}
      <div className={`hf-display ${running ? "running" : ""}`}>{fmt(elapsed)}</div>
      {key && (
        <div className="hf-total">
          {editing != null ? (
            <input
              className="input hf-total-input"
              autoFocus
              value={editing}
              placeholder="2h 30m"
              onChange={(e) => setEditing(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <button
              className="hf-total-btn"
              title="Click to correct the total"
              onClick={() => setEditing(formatDuration(total))}
            >
              {formatDuration(total)} total
            </button>
          )}
        </div>
      )}
      <div className="hf-actions">
        {key ? (
          <button className="btn" onClick={togglePause}>
            {paused ? IC.play : IC.stop} {paused ? "Resume" : "Pause"}
          </button>
        ) : manualStart == null ? (
          <button
            className="btn primary"
            onClick={() => {
              setElapsed(0);
              notified.current.clear();
              setManualStart(Date.now());
            }}
          >
            {IC.play} Start session
          </button>
        ) : (
          <button className="btn" onClick={() => setManualStart(null)}>
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
