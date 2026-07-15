import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useApp } from "../lib/state";
import { authUrl, fetchViewer } from "../lib/anilist";
import { Modal } from "./Modal";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { data, dispatch } = useApp();
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState(data.settings.anilistToken ?? "");
  const [github, setGithub] = useState(data.settings.githubUser);
  const [status, setStatus] = useState<string | null>(null);

  const connect = async () => {
    const t = token.trim();
    if (!t) return;
    setStatus("Verifying token…");
    try {
      const viewer = await fetchViewer(t);
      dispatch({
        type: "settings/update",
        settings: {
          anilistToken: t,
          anilistUserId: viewer.id,
          anilistUserName: viewer.name,
        },
      });
      setStatus(`Connected as ${viewer.name} ✓`);
    } catch (e) {
      setStatus(`Failed: ${e}`);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="panel-title">AniList</div>
      {data.settings.anilistUserName ? (
        <p style={{ margin: 0, color: "var(--rp-foam)" }}>
          Connected as {data.settings.anilistUserName}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--rp-subtle)" }}>
          1. Create an API client at anilist.co/settings/developer (any name, pin
          redirect). 2. Enter its ID below and hit Authorize. 3. Copy the token
          AniList shows you and paste it here.
        </p>
      )}
      <div className="field">
        <label>AniList client ID</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            className="input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="12345"
          />
          <button
            className="btn"
            disabled={!clientId.trim()}
            onClick={() => openUrl(authUrl(clientId.trim()))}
          >
            Authorize ↗
          </button>
        </div>
      </div>
      <div className="field">
        <label>Access token</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            className="input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="paste token here"
          />
          <button className="btn primary" disabled={!token.trim()} onClick={connect}>
            Connect
          </button>
        </div>
      </div>
      {status && <p style={{ margin: 0, fontSize: "0.82rem" }}>{status}</p>}

      <div className="panel-title" style={{ marginTop: "0.5rem" }}>
        GitHub
      </div>
      <div className="field">
        <label>Username (public contributions)</label>
        <input
          className="input"
          value={github}
          onChange={(e) => setGithub(e.target.value)}
          onBlur={() =>
            dispatch({ type: "settings/update", settings: { githubUser: github.trim() } })
          }
        />
      </div>
    </Modal>
  );
}
