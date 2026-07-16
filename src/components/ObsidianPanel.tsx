import { useEffect, useState } from "react";
import { useApp } from "../lib/state";
import { openVault, obsidianStatus, type ObsidianStatus } from "../lib/obsidian";
import { IC } from "../lib/icons";
import "./ObsidianPanel.css";

export function ObsidianPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data } = useApp();
  const vault = data.settings.vaultPath;
  const [status, setStatus] = useState<ObsidianStatus | null>(null);

  useEffect(() => {
    obsidianStatus(vault)
      .then(setStatus)
      .catch(() => setStatus({ vaultExists: false, installed: false }));
  }, [vault]);

  const connected = Boolean(vault) && status?.vaultExists;

  let message: string;
  let tone: "ok" | "warn" | "off";
  if (!vault) {
    message = "No vault folder set";
    tone = "off";
  } else if (status && !status.vaultExists) {
    message = "Vault folder not found";
    tone = "warn";
  } else if (status && !status.installed) {
    message = "Connected — but Obsidian isn't installed";
    tone = "warn";
  } else {
    message = "Connected";
    tone = "ok";
  }

  return (
    <div className="obsidian-panel glass">
      <div className="panel-title">{IC.book} Obsidian</div>
      <div className={`obs-status ${tone}`}>
        <span className="obs-status-dot" />
        <span className="obs-status-text">{message}</span>
      </div>
      {vault && <div className="obs-vault-path" title={vault}>{vault}</div>}
      <button
        className="btn primary obs-open"
        disabled={!connected}
        onClick={() => openVault(data.settings)}
        title={connected ? "Open your vault in Obsidian" : "Set a valid vault folder first"}
      >
        {IC.external} Open vault in Obsidian
      </button>
      <button className="btn ghost obs-settings" onClick={onOpenSettings}>
        {IC.gear} {vault ? "Change vault" : "Set up vault"}
      </button>
    </div>
  );
}
