import { useState } from "react";
import type { DopamineTier } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { IC } from "../lib/icons";
import "./DopamineMenu.css";

const TIERS: DopamineTier[] = [5, 15, 30];

export function DopamineMenu() {
  const { data, dispatch } = useApp();
  const [tier, setTier] = useState<DopamineTier>(5);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [pick, setPick] = useState<string | null>(null);

  const items = data.dopamine.filter((d) => d.tier === tier);

  const surprise = () => {
    if (items.length === 0) return;
    setPick(items[Math.floor(Math.random() * items.length)].label);
  };

  const add = () => {
    const l = label.trim();
    if (!l) return;
    dispatch({ type: "dopamine/add", item: { id: uid(), label: l, tier } });
    setLabel("");
    setAdding(false);
  };

  return (
    <div className="dopamine glass">
      <div className="panel-title">
        {IC.bolt} Dopamine menu
        <button className="btn ghost icon add-dopamine" title="Add item" onClick={() => setAdding(!adding)}>
          {IC.plus}
        </button>
      </div>
      <div className="dopamine-tiers">
        {TIERS.map((t) => (
          <button
            key={t}
            className={`dopamine-tier ${t === tier ? "active" : ""}`}
            onClick={() => {
              setTier(t);
              setPick(null);
            }}
          >
            {t}m
          </button>
        ))}
        <button className="btn ghost surprise" onClick={surprise} disabled={items.length === 0}>
          {IC.random} surprise me
        </button>
      </div>
      {adding && (
        <input
          className="input"
          autoFocus
          placeholder={`Quick ${tier}-minute win…`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") setAdding(false);
          }}
        />
      )}
      {pick && <div className="dopamine-pick pop-in">→ {pick}</div>}
      <ul className="dopamine-list">
        {items.map((d) => (
          <li key={d.id}>
            <span>{d.label}</span>
            <button
              className="btn ghost icon danger"
              title="Remove"
              onClick={() => dispatch({ type: "dopamine/delete", id: d.id })}
            >
              {IC.close}
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="dopamine-empty">No {tier}-minute wins yet.</li>}
      </ul>
    </div>
  );
}
