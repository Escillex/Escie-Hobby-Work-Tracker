import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChecklistItem, MediaCategory, MediaEntry, MediaStatus } from "../lib/types";
import { MEDIA_STATUSES, uid, localDate } from "../lib/types";
import { useApp } from "../lib/state";
import { searchMedia, saveEntry, fetchList, type AniListMedia } from "../lib/anilist";
import {
  steamStoreSearch,
  steamOwnedGames,
  steamCover,
  steamLaunch,
  installedSteamAppIds,
  type GameResult,
} from "../lib/games";
import { IC } from "../lib/icons";
import { Modal } from "./Modal";
import "./MediaTracker.css";

export function MediaTracker() {
  const { data, dispatch } = useApp();
  const categories = data.media.categories;
  const [activeId, setActiveId] = useState(categories[0]?.id);
  const [addingCategory, setAddingCategory] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const active =
    categories.find((c) => c.id === activeId) ?? categories[0];

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!active) return null;

  const entries = data.media.entries.filter((e) => e.categoryId === active.id);

  return (
    <section className="media-tracker glass">
      <div className="media-tabs">
        {categories.map((c) => (
          <button
            key={c.id}
            className={`media-tab ${c.id === active.id ? "active" : ""}`}
            onClick={() => setActiveId(c.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (c.source === "manual" && confirm(`Delete category “${c.name}” and its entries?`)) {
                dispatch({ type: "category/delete", id: c.id });
              }
            }}
          >
            {c.name}
          </button>
        ))}
        <button className="btn ghost icon" title="Add category" onClick={() => setAddingCategory(true)}>
          {IC.plus}
        </button>
        {notice && <span className="media-notice">{notice}</span>}
      </div>

      <CategoryView key={active.id} category={active} entries={entries} onNotice={setNotice} />

      {addingCategory && (
        <AddCategoryModal
          onClose={() => setAddingCategory(false)}
          onSave={(name) => {
            const category: MediaCategory = { id: uid(), name, source: "manual" };
            dispatch({ type: "category/add", category });
            setActiveId(category.id);
            setAddingCategory(false);
          }}
        />
      )}
    </section>
  );
}

function CategoryView({
  category,
  entries,
  onNotice,
}: {
  category: MediaCategory;
  entries: MediaEntry[];
  onNotice: (msg: string) => void;
}) {
  const { data, dispatch } = useApp();
  const isAniList = category.source === "anilist-anime" || category.source === "anilist-manga";
  const isGames = category.source === "games";
  const aniType = category.source === "anilist-anime" ? "ANIME" : "MANGA";
  const token = data.settings.anilistToken;
  const [syncing, setSyncing] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEntry = entries.find((e) => e.id === detailId) ?? null;
  const [installed, setInstalled] = useState<Set<number> | null>(null);
  const [installFilter, setInstallFilter] = useState<"all" | "installed" | "not">("all");

  // Detect locally-installed Steam games when the Games tab is shown.
  useEffect(() => {
    if (!isGames) return;
    installedSteamAppIds()
      .then(setInstalled)
      .catch(() => setInstalled(new Set()));
  }, [isGames]);

  const sync = async () => {
    if (!token || !data.settings.anilistUserId) {
      onNotice("Connect AniList in settings first");
      return;
    }
    setSyncing(true);
    try {
      const fresh = await fetchList(token, data.settings.anilistUserId, aniType, category.id);
      dispatch({ type: "media/replaceCategory", categoryId: category.id, entries: fresh });
      onNotice(`Synced ${fresh.length} ${category.name.toLowerCase()} entries`);
    } catch (e) {
      onNotice(`Sync failed: ${e}`);
    } finally {
      setSyncing(false);
    }
  };

  const importSteam = async () => {
    const { steamApiKey, steamId } = data.settings;
    if (!steamApiKey || !steamId) {
      onNotice("Add your Steam API key and SteamID64 in settings first");
      return;
    }
    setSyncing(true);
    try {
      const steam = await steamOwnedGames(steamApiKey, steamId, category.id);
      // Keep manually added / RAWG games; replace previous Steam imports.
      const kept = entries.filter((e) => e.steamAppId == null);
      dispatch({
        type: "media/replaceCategory",
        categoryId: category.id,
        entries: [...kept, ...steam],
      });
      onNotice(`Imported ${steam.length} Steam games`);
    } catch (e) {
      onNotice(`${e}`);
    } finally {
      setSyncing(false);
    }
  };

  const bump = async (entry: MediaEntry) => {
    const progress = entry.progress + 1;
    const completed = entry.total != null && progress >= entry.total;
    const status: MediaStatus = completed ? "COMPLETED" : entry.status;
    dispatch({ type: "media/update", entry: { ...entry, progress, status } });
    if (isAniList && token && entry.anilistId) {
      try {
        await saveEntry(token, { mediaId: entry.anilistId, progress, status });
      } catch (e) {
        onNotice(`AniList push failed: ${e}`);
      }
    }
  };

  const setStatus = async (entry: MediaEntry, status: MediaStatus) => {
    dispatch({ type: "media/update", entry: { ...entry, status } });
    if (isAniList && token && entry.anilistId) {
      try {
        await saveEntry(token, { mediaId: entry.anilistId, status });
      } catch (e) {
        onNotice(`AniList push failed: ${e}`);
      }
    }
  };

  const launch = async (entry: MediaEntry) => {
    if (!entry.launchCommand) return;
    try {
      await invoke("launch_app", { command: entry.launchCommand });
    } catch (e) {
      onNotice(`${e}`);
    }
  };

  const isInstalled = (e: MediaEntry) =>
    e.steamAppId != null && (installed?.has(e.steamAppId) ?? false);

  const visible =
    isGames && installFilter !== "all"
      ? entries.filter((e) =>
          installFilter === "installed" ? isInstalled(e) : !isInstalled(e),
        )
      : entries;

  const current = visible.filter((e) => e.status === "CURRENT" || e.status === "REPEATING");
  const rest = visible.filter((e) => e.status !== "CURRENT" && e.status !== "REPEATING");

  return (
    <div className="media-body">
      <div className="media-toolbar">
        {isAniList && (
          <>
            <AniListSearch category={category} type={aniType} onNotice={onNotice} />
            <button className="btn" onClick={sync} disabled={syncing}>
              {IC.refresh} {syncing ? "Syncing…" : "Sync"}
            </button>
          </>
        )}
        {isGames && (
          <>
            <GameSearchBox category={category} onNotice={onNotice} />
            <button className="btn" onClick={importSteam} disabled={syncing} title="Import Steam library">
              {IC.download} {syncing ? "Importing…" : "Steam"}
            </button>
            <button className="btn" onClick={() => setAddingManual(true)}>
              {IC.plus} Add
            </button>
            <div className="install-filter">
              {(["all", "installed", "not"] as const).map((f) => (
                <button
                  key={f}
                  className={`install-tab ${installFilter === f ? "active" : ""}`}
                  onClick={() => setInstallFilter(f)}
                  title={
                    f === "installed"
                      ? "Only games installed on this machine"
                      : f === "not"
                        ? "Only games not currently installed"
                        : "All games"
                  }
                >
                  {f === "not" ? "not installed" : f}
                </button>
              ))}
            </div>
          </>
        )}
        {!isAniList && !isGames && (
          <button className="btn" onClick={() => setAddingManual(true)}>
            {IC.plus} Add {category.name.replace(/s$/, "").toLowerCase()}
          </button>
        )}
      </div>

      <div className="media-grid-wrap">
        {visible.length === 0 && (
          <p className="media-empty">
            {isAniList
              ? "Search above to add something, or hit Sync to pull your AniList."
              : isGames
                ? entries.length > 0
                  ? "No games match this filter."
                  : "Search games, import your Steam library, or add one manually."
                : "Nothing here yet — add your first one."}
          </p>
        )}
        {[...current, ...rest].map((e) => (
          <MediaCard
            key={e.id}
            entry={e}
            hoursMode={isGames}
            installed={isGames ? isInstalled(e) : undefined}
            onBump={() => bump(e)}
            onLaunch={() => launch(e)}
            onStatus={(s) => setStatus(e, s)}
            onDetails={() => setDetailId(e.id)}
            onDelete={() => dispatch({ type: "media/delete", id: e.id })}
          />
        ))}
      </div>

      {addingManual && (
        <ManualEntryModal
          categoryId={category.id}
          withLaunch={isGames}
          onClose={() => setAddingManual(false)}
          onSave={(entry) => {
            dispatch({ type: "media/add", entry });
            setAddingManual(false);
          }}
        />
      )}

      {detailEntry && (
        <EntryDetailModal
          entry={detailEntry}
          onClose={() => setDetailId(null)}
          onUpdate={(entry) => dispatch({ type: "media/update", entry })}
        />
      )}
    </div>
  );
}

function EntryDetailModal({
  entry,
  onClose,
  onUpdate,
}: {
  entry: MediaEntry;
  onClose: () => void;
  onUpdate: (e: MediaEntry) => void;
}) {
  const [newItem, setNewItem] = useState("");
  const checklist = entry.checklist ?? [];

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    const item: ChecklistItem = { id: uid(), text, done: false };
    onUpdate({ ...entry, checklist: [...checklist, item] });
    setNewItem("");
  };

  const toggle = (id: string) =>
    onUpdate({
      ...entry,
      checklist: checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    });

  const remove = (id: string) =>
    onUpdate({ ...entry, checklist: checklist.filter((c) => c.id !== id) });

  const openCount = checklist.filter((c) => !c.done).length;

  return (
    <Modal title={entry.title} onClose={onClose}>
      <div className="field">
        <label>Notes</label>
        <textarea
          className="input detail-notes"
          rows={5}
          placeholder="Anything worth remembering — where you left off, a boss strategy, a link…"
          defaultValue={entry.notes ?? ""}
          onBlur={(e) => {
            const notes = e.target.value.trim();
            if (notes !== (entry.notes ?? "")) onUpdate({ ...entry, notes: notes || undefined });
          }}
        />
      </div>
      <div className="field">
        <label>
          Checklist{checklist.length > 0 ? ` (${openCount} left)` : ""}
        </label>
        <div className="detail-checklist">
          {checklist.map((c) => (
            <div key={c.id} className={`detail-check ${c.done ? "done" : ""}`}>
              <button
                className={`check-box ${c.done ? "checked" : ""}`}
                title={c.done ? "Mark undone" : "Mark done"}
                onClick={() => toggle(c.id)}
              >
                {c.done ? IC.check : null}
              </button>
              <span className="detail-check-text">{c.text}</span>
              <button
                className="btn ghost icon danger"
                title="Remove"
                onClick={() => remove(c.id)}
              >
                {IC.close}
              </button>
            </div>
          ))}
          <div className="detail-check-add">
            <input
              className="input"
              placeholder="Add a task… (Enter)"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
              }}
            />
            <button className="btn" disabled={!newItem.trim()} onClick={addItem}>
              {IC.plus}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MediaCard({
  entry,
  hoursMode,
  installed,
  onBump,
  onLaunch,
  onStatus,
  onDetails,
  onDelete,
}: {
  entry: MediaEntry;
  hoursMode: boolean;
  installed?: boolean;
  onBump: () => void;
  onLaunch: () => void;
  onStatus: (s: MediaStatus) => void;
  onDetails: () => void;
  onDelete: () => void;
}) {
  const openTasks = entry.checklist?.filter((c) => !c.done).length ?? 0;
  const hasNotes = Boolean(entry.notes?.trim());
  const annotated = hasNotes || (entry.checklist?.length ?? 0) > 0;

  return (
    <div className={`media-card status-${entry.status.toLowerCase()}`}>
      {entry.coverUrl ? (
        <img
          className="media-cover"
          src={entry.coverUrl}
          alt=""
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <div className="media-cover placeholder">{entry.title.slice(0, 1)}</div>
      )}
      <div className="media-info">
        <span className="media-title" title={entry.title}>
          {installed && <span className="installed-dot" title="Installed" />}
          {entry.title}
        </span>
        <div className="media-progress">
          <span>
            {entry.progress}
            {entry.total != null ? ` / ${entry.total}` : hoursMode ? " h" : ""}
          </span>
          {!hoursMode && entry.status !== "COMPLETED" && (
            <button className="btn icon bump" title="+1" onClick={onBump}>
              +1
            </button>
          )}
          {entry.launchCommand && (
            <button className="btn icon bump" title={entry.launchCommand} onClick={onLaunch}>
              {IC.play}
            </button>
          )}
        </div>
        <div className="media-foot">
          <select
            className="input media-status"
            value={entry.status}
            onChange={(e) => onStatus(e.target.value as MediaStatus)}
          >
            {MEDIA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
          <button
            className={`btn ghost icon detail-btn ${annotated ? "annotated" : ""}`}
            title="Notes & checklist"
            onClick={onDetails}
          >
            {IC.note}
            {openTasks > 0 && <span className="detail-badge">{openTasks}</span>}
          </button>
          <button className="btn ghost icon danger" title="Remove" onClick={onDelete}>
            {IC.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function AniListSearch({
  category,
  type,
  onNotice,
}: {
  category: MediaCategory;
  type: "ANIME" | "MANGA";
  onNotice: (msg: string) => void;
}) {
  const { data, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AniListMedia[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<number>(undefined);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      try {
        const media = await searchMedia(query.trim(), type);
        setResults(media);
        setOpen(true);
      } catch (e) {
        onNotice(`Search failed: ${e}`);
      }
    }, 350);
    return () => window.clearTimeout(debounce.current);
  }, [query, type, onNotice]);

  const add = async (m: AniListMedia) => {
    setOpen(false);
    setQuery("");
    const entry: MediaEntry = {
      id: uid(),
      categoryId: category.id,
      title: m.title.userPreferred,
      coverUrl: m.coverImage.large,
      progress: 0,
      total: type === "ANIME" ? m.episodes : m.chapters,
      status: "CURRENT",
      anilistId: m.id,
    };
    dispatch({ type: "media/add", entry });
    const token = data.settings.anilistToken;
    if (token) {
      try {
        const listId = await saveEntry(token, { mediaId: m.id, status: "CURRENT" });
        dispatch({ type: "media/update", entry: { ...entry, anilistMediaListId: listId } });
      } catch (e) {
        onNotice(`Added locally, AniList push failed: ${e}`);
      }
    }
  };

  return (
    <div className="ani-search">
      <input
        className="input"
        placeholder={`Search AniList ${type.toLowerCase()}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="ani-results glass">
          {results.map((m) => (
            <button key={m.id} className="ani-result" onMouseDown={() => add(m)}>
              <img src={m.coverImage.large} alt="" loading="lazy" />
              <span>{m.title.userPreferred}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GameSearchBox({
  category,
  onNotice,
}: {
  category: MediaCategory;
  onNotice: (msg: string) => void;
}) {
  const { dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<number>(undefined);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      try {
        const games = await steamStoreSearch(query.trim());
        setResults(games);
        setOpen(true);
      } catch (e) {
        onNotice(`${e}`);
      }
    }, 350);
    return () => window.clearTimeout(debounce.current);
  }, [query, onNotice]);

  const add = (g: GameResult) => {
    setOpen(false);
    setQuery("");
    dispatch({
      type: "media/add",
      entry: {
        id: uid(),
        categoryId: category.id,
        title: g.name,
        coverUrl: steamCover(g.appid),
        progress: 0,
        total: null,
        status: "PLANNING",
        steamAppId: g.appid,
        launchCommand: steamLaunch(g.appid),
      },
    });
  };

  return (
    <div className="ani-search">
      <input
        className="input"
        placeholder="Search games…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="ani-results glass">
          {results.map((g) => (
            <button key={g.appid} className="ani-result" onMouseDown={() => add(g)}>
              {g.thumb && <img src={g.thumb} alt="" loading="lazy" />}
              <span>{g.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddCategoryModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal title="Add category" onClose={onClose}>
      <div className="field">
        <label>Category name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Books, Podcasts, …"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSave(name.trim());
          }}
        />
      </div>
      <div className="modal-actions">
        <button className="btn primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
          Add
        </button>
      </div>
    </Modal>
  );
}

function ManualEntryModal({
  categoryId,
  withLaunch,
  onClose,
  onSave,
}: {
  categoryId: string;
  withLaunch: boolean;
  onClose: () => void;
  onSave: (e: MediaEntry) => void;
}) {
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [launchCommand, setLaunchCommand] = useState("");
  const [status, setStatus] = useState<MediaStatus>("PLANNING");

  return (
    <Modal title="Add entry" onClose={onClose}>
      <div className="field">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>{withLaunch ? "Total (optional)" : "Total episodes / parts (optional)"}</label>
        <input
          className="input"
          type="number"
          min="1"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Cover image URL (optional)</label>
        <input
          className="input"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      {withLaunch && (
        <div className="field">
          <label>Launch command (optional)</label>
          <input
            className="input"
            value={launchCommand}
            onChange={(e) => setLaunchCommand(e.target.value)}
            placeholder="hydra, xdg-open steam://rungameid/…, an-anime-game-launcher"
          />
        </div>
      )}
      <div className="field">
        <label>Status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as MediaStatus)}>
          {MEDIA_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="modal-actions">
        <button
          className="btn primary"
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              id: uid(),
              categoryId,
              title: title.trim(),
              progress: 0,
              total: total ? Number(total) : null,
              coverUrl: coverUrl.trim() || undefined,
              launchCommand: launchCommand.trim() || undefined,
              status,
              completedAt: status === "COMPLETED" ? localDate() : undefined,
            })
          }
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
