import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Launcher, RosePineColor } from "../lib/types";
import { uid } from "../lib/types";
import { useApp } from "../lib/state";
import { Modal } from "./Modal";
import { ColorPicker } from "./ColorPicker";
import { IC } from "../lib/icons";
import "./LauncherBar.css";

export function LauncherBar({
  view,
  onView,
  onOpenSettings,
}: {
  view: "dashboard" | "tasks";
  onView: (v: "dashboard" | "tasks") => void;
  onOpenSettings: () => void;
}) {
  const { data, dispatch } = useApp();
  const [editing, setEditing] = useState<Launcher | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const launch = async (l: Launcher) => {
    setError(null);
    try {
      await invoke("launch_app", { command: l.command });
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <header className="launcher-bar glass">
      <h1 className="app-title">
        hyper<span>focus</span>
      </h1>
      <nav className="view-nav">
        <button
          className={`view-tab ${view === "dashboard" ? "active" : ""}`}
          onClick={() => onView("dashboard")}
        >
          {IC.bolt} Dashboard
        </button>
        <button
          className={`view-tab ${view === "tasks" ? "active" : ""}`}
          onClick={() => onView("tasks")}
        >
          {IC.check} Tasks
        </button>
      </nav>
      <div className="launcher-buttons">
        {data.launchers.map((l) => (
          <button
            key={l.id}
            className="launcher-btn"
            style={{ "--accent": `var(--rp-${l.color})` } as React.CSSProperties}
            onClick={() => launch(l)}
            onContextMenu={(e) => {
              e.preventDefault();
              setEditing(l);
            }}
            title={`${l.command}\n(right-click to edit)`}
          >
            {l.name}
          </button>
        ))}
        <button className="btn ghost icon" onClick={() => setEditing("new")} title="Add launcher">
          {IC.plus}
        </button>
      </div>
      {error && <span className="launcher-error">{error}</span>}
      <button className="btn ghost icon settings-btn" onClick={onOpenSettings} title="Settings">
        {IC.gear}
      </button>

      {editing && (
        <LauncherModal
          launcher={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(l) => {
            dispatch(
              editing === "new"
                ? { type: "launcher/add", launcher: l }
                : { type: "launcher/update", launcher: l },
            );
            setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : () => {
                  dispatch({ type: "launcher/delete", id: editing.id });
                  setEditing(null);
                }
          }
        />
      )}
    </header>
  );
}

function LauncherModal({
  launcher,
  onClose,
  onSave,
  onDelete,
}: {
  launcher: Launcher | null;
  onClose: () => void;
  onSave: (l: Launcher) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(launcher?.name ?? "");
  const [command, setCommand] = useState(launcher?.command ?? "");
  const [color, setColor] = useState<RosePineColor>(launcher?.color ?? "iris");

  const valid = name.trim() && command.trim();

  return (
    <Modal title={launcher ? "Edit launcher" : "Add launcher"} onClose={onClose}>
      <div className="field">
        <label>App name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Zen Browser"
          autoFocus
        />
      </div>
      <div className="field">
        <label>Terminal command</label>
        <input
          className="input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="zen-browser"
        />
      </div>
      <div className="field">
        <label>Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="modal-actions">
        {onDelete && (
          <button className="btn danger" onClick={onDelete}>
            Delete
          </button>
        )}
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() =>
            onSave({
              id: launcher?.id ?? uid(),
              name: name.trim(),
              command: command.trim(),
              color,
            })
          }
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
