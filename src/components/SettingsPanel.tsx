import { useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useApp } from "../lib/state";
import { authUrl, fetchViewer } from "../lib/anilist";
import { tmdbCreateRequestToken, tmdbApproveUrl, tmdbCreateSession } from "../lib/tmdb";
import { Modal } from "./Modal";

const FONT_CANDIDATES = [
  "RecMonoCasual Nerd Font",
  "RecMonoCasual Nerd Font Propo",
  "RecMonoDuotone Nerd Font",
  "RecMonoLinear Nerd Font",
  "RecMonoSmCasual Nerd Font",
  "JetBrainsMono Nerd Font",
  "FiraCode Nerd Font",
  "Hack Nerd Font",
  "Iosevka Nerd Font",
  "CaskaydiaCove Nerd Font",
  "MesloLGS Nerd Font",
  "SauceCodePro Nerd Font",
  "UbuntuMono Nerd Font",
  "RobotoMono Nerd Font",
  "Mononoki Nerd Font",
  "VictorMono Nerd Font",
  "Maple Mono NF",
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { data, dispatch } = useApp();
  const s = data.settings;
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState(s.anilistToken ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [tmdbToken, setTmdbToken] = useState<string | null>(null);
  const [tmdbStatus, setTmdbStatus] = useState<string | null>(null);

  const set = (patch: Partial<typeof s>) =>
    dispatch({ type: "settings/update", settings: patch });

  const installedFonts = useMemo(
    () => FONT_CANDIDATES.filter((f) => document.fonts.check(`12px "${f}"`)),
    [],
  );

  const connect = async () => {
    const t = token.trim();
    if (!t) return;
    setStatus("Verifying token…");
    try {
      const viewer = await fetchViewer(t);
      set({ anilistToken: t, anilistUserId: viewer.id, anilistUserName: viewer.name });
      setStatus(`Connected as ${viewer.name}`);
    } catch (e) {
      setStatus(`Failed: ${e}`);
    }
  };

  const tmdbAuthorize = async () => {
    if (!s.tmdbApiKey) {
      setTmdbStatus("Enter a TMDB API key first");
      return;
    }
    try {
      const rt = await tmdbCreateRequestToken(s.tmdbApiKey);
      setTmdbToken(rt);
      await openUrl(tmdbApproveUrl(rt));
      setTmdbStatus("Approve in the browser, then click Connect");
    } catch (e) {
      setTmdbStatus(`${e}`);
    }
  };

  const tmdbConnect = async () => {
    if (!s.tmdbApiKey || !tmdbToken) return;
    setTmdbStatus("Connecting…");
    try {
      const { sessionId, accountId, username } = await tmdbCreateSession(s.tmdbApiKey, tmdbToken);
      set({ tmdbSessionId: sessionId, tmdbAccountId: accountId, tmdbUsername: username });
      setTmdbStatus(`Connected as ${username}`);
    } catch (e) {
      setTmdbStatus(`${e}`);
    }
  };

  const pickVault = async () => {
    const dir = await openDialog({ directory: true, title: "Pick your Obsidian vault" });
    if (typeof dir === "string") set({ vaultPath: dir });
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="panel-title">AniList</div>
      {s.anilistUserName ? (
        <p style={{ margin: 0, color: "var(--rp-foam)" }}>Connected as {s.anilistUserName}</p>
      ) : (
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--rp-subtle)" }}>
          1. Create an API client at anilist.co/settings/developer (pin redirect).
          2. Enter its ID and Authorize. 3. Paste the token AniList shows you.
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
            Authorize
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

      <div className="panel-title" style={{ marginTop: "0.5rem" }}>GitHub</div>
      <div className="field">
        <label>Username (public contributions)</label>
        <input
          className="input"
          defaultValue={s.githubUser}
          onBlur={(e) => set({ githubUser: e.target.value.trim() })}
        />
      </div>

      <div className="panel-title" style={{ marginTop: "0.5rem" }}>Games</div>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--rp-subtle)" }}>
        Game search uses Steam's public catalog — no key needed. The two keys
        below are only for importing your owned Steam library with playtimes.
      </p>
      <div className="field">
        <label>Steam Web API key (steamcommunity.com/dev/apikey)</label>
        <input
          className="input"
          type="password"
          defaultValue={s.steamApiKey ?? ""}
          onBlur={(e) => set({ steamApiKey: e.target.value.trim() || undefined })}
        />
      </div>
      <div className="field">
        <label>SteamID64 (17 digits, see steamid.io)</label>
        <input
          className="input"
          defaultValue={s.steamId ?? ""}
          placeholder="7656119…"
          onBlur={(e) => set({ steamId: e.target.value.trim() || undefined })}
        />
      </div>

      <div className="panel-title" style={{ marginTop: "0.5rem" }}>Movies &amp; TV</div>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--rp-subtle)" }}>
        Free key from themoviedb.org/settings/api enables search. Connecting your
        account (below) syncs ratings and your rated/watchlist items.
      </p>
      <div className="field">
        <label>TMDB API key</label>
        <input
          className="input"
          type="password"
          defaultValue={s.tmdbApiKey ?? ""}
          onBlur={(e) => set({ tmdbApiKey: e.target.value.trim() || undefined })}
        />
      </div>
      {s.tmdbUsername ? (
        <p style={{ margin: 0, color: "var(--rp-foam)" }}>Connected as {s.tmdbUsername}</p>
      ) : (
        <div className="field">
          <label>Connect account (for rating sync)</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn" disabled={!s.tmdbApiKey} onClick={tmdbAuthorize}>
              Authorize
            </button>
            <button className="btn primary" disabled={!tmdbToken} onClick={tmdbConnect}>
              Connect
            </button>
          </div>
        </div>
      )}
      {tmdbStatus && <p style={{ margin: 0, fontSize: "0.82rem" }}>{tmdbStatus}</p>}

      <div className="panel-title" style={{ marginTop: "0.5rem" }}>Obsidian</div>
      <div className="field">
        <label>Vault folder</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            className="input"
            value={s.vaultPath ?? ""}
            placeholder="pick or paste a path"
            onChange={(e) => set({ vaultPath: e.target.value || undefined })}
          />
          <button className="btn" onClick={pickVault}>
            Browse
          </button>
        </div>
      </div>
      <div className="field">
        <label>Notes folder (captured thoughts and exported notes land here)</label>
        <input
          className="input"
          defaultValue={s.vaultNotesFolder ?? ""}
          placeholder="Hyperfocus"
          onBlur={(e) => set({ vaultNotesFolder: e.target.value.trim() || undefined })}
        />
      </div>

      <div className="panel-title" style={{ marginTop: "0.5rem" }}>Appearance</div>
      <div className="field">
        <label>Font family {installedFonts.length > 0 && "(detected Nerd Fonts listed)"}</label>
        <input
          className="input"
          list="font-options"
          defaultValue={s.fontFamily ?? ""}
          placeholder="system default"
          onBlur={(e) => set({ fontFamily: e.target.value.trim() || undefined })}
        />
        <datalist id="font-options">
          {installedFonts.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
    </Modal>
  );
}
