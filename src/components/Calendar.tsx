import { useState } from "react";
import { localDate } from "../lib/types";
import "./Calendar.css";

export type DotKind = "pending" | "overdue" | "done";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function Calendar({
  selected,
  onSelect,
  dots,
}: {
  selected: string;
  onSelect: (day: string) => void;
  dots: Map<string, DotKind>;
}) {
  const today = localDate();
  const [view, setView] = useState(() => {
    const d = new Date(`${selected}T00:00`);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const cells = buildMonthGrid(view.year, view.month);

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="btn ghost icon" onClick={() => setView(shiftMonth(view, -1))}>
          ‹
        </button>
        <span className="cal-title">
          {MONTHS[view.month]} {view.year}
        </span>
        <button className="btn ghost icon" onClick={() => setView(shiftMonth(view, 1))}>
          ›
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="cal-dow">
            {w}
          </span>
        ))}
        {cells.map((cell, i) =>
          cell === null ? (
            <span key={i} className="cal-cell empty" />
          ) : (
            <button
              key={i}
              className={`cal-cell ${cell === today ? "today" : ""} ${
                cell === selected ? "selected" : ""
              }`}
              onClick={() => onSelect(cell)}
            >
              {Number(cell.slice(-2))}
              {dots.has(cell) && <span className={`cal-dot ${dots.get(cell)}`} />}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** Array of whole weeks — null for padding, else a YYYY-MM-DD key. */
function buildMonthGrid(year: number, month: number): (string | null)[] {
  const startPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(localDate(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(v: { year: number; month: number }, delta: number) {
  const d = new Date(v.year, v.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
