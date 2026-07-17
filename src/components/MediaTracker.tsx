import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaCategory, MediaEntry, MediaStatus } from "../lib/types";
import { uid } from "../lib/types";
import {
  toggleChecklistItem,
  isEntryInstalled,
  groupByStatus,
  statusesFor,
  filterEntries,
  type MediaFilter,
} from "../lib/media";
import { useApp } from "../lib/state";
import { useFocusActions } from "../lib/focus";
import { searchMedia, saveEntry, fetchList, type AniListMedia } from "../lib/anilist";
import {
  steamStoreSearch,
  steamOwnedGames,
  steamCover,
  steamLaunch,
  installedSteamAppIds,
  type GameResult,
} from "../lib/games";
import {
  tmdbSearch,
  tmdbTvSeasons,
  tmdbRate,
  tmdbSyncPull,
  bumpCurrentSeason,
  type TmdbResult,
} from "../lib/tmdb";
import { IC } from "../lib/icons";
import { StarRating } from "./StarRating";
import { EntryDetailModal, AddCategoryModal, EntryFormModal, ManageCategoryModal } from "./MediaModals";
import "./MediaTracker.css";

export function MediaTracker() {
  const { data, dispatch } = useApp();
  const categories = data.media.categories;
  const [activeId, setActiveId] = useState(categories[0]?.id);
  const [addingCategory, setAddingCategory] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active =
    categories.find((c) => c.id === activeId) ?? categories[0];
  const managing = categories.find((c) => c.id === managingId) ?? null;

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
        <button
          className="btn ghost icon"
          title={`Manage ${active.name}`}
          onClick={() => setManagingId(active.id)}
        >
          {IC.gear}
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

      {managing && (
        <ManageCategoryModal
          category={managing}
          onClose={() => setManagingId(null)}
          onSave={(c) => {
            dispatch({ type: "category/update", category: c });
            setManagingId(null);
          }}
          onDelete={() => {
            dispatch({ type: "category/delete", id: managing.id });
            if (activeId === managing.id) setActiveId(categories[0]?.id);
            setManagingId(null);
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
  const isMovie = category.source === "tmdb-movie";
  const isTv = category.source === "tmdb-tv";
  const isTmdb = isMovie || isTv;
  const aniType = category.source === "anilist-anime" ? "ANIME" : "MANGA";
  const token = data.settings.anilistToken;
  const [syncing, setSyncing] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEntry = entries.find((e) => e.id === detailId) ?? null;
  const [editId, setEditId] = useState<string | null>(null);
  const editEntry = entries.find((e) => e.id === editId) ?? null;
  const [installed, setInstalled] = useState<Set<number> | null>(null);
  const [installFilter, setInstallFilter] = useState<"all" | "installed" | "not">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<MediaFilter>({
    status: null,
    query: "",
    minRating: null,
  });

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(visible.map((e) => e.id)));

  const bulkStatus = (status: string) => {
    for (const e of visible) {
      if (selected.has(e.id)) dispatch({ type: "media/update", entry: { ...e, status } });
    }
    clearSelection();
  };
  const bulkInstalled = (installedFlag: boolean) => {
    for (const e of visible) {
      if (selected.has(e.id))
        dispatch({ type: "media/update", entry: { ...e, installed: installedFlag || undefined } });
    }
    clearSelection();
  };
  const bulkDelete = () => {
    if (!confirm(`Delete ${selected.size} selected?`)) return;
    for (const id of selected) dispatch({ type: "media/delete", id });
    clearSelection();
  };

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
    if (entry.seasons?.length) {
      dispatch({ type: "media/update", entry: bumpCurrentSeason(entry) });
      return;
    }
    const progress = entry.progress + 1;
    const completed = entry.total != null && progress >= entry.total;
    const status: string = completed ? "COMPLETED" : entry.status;
    dispatch({ type: "media/update", entry: { ...entry, progress, status } });
    if (isAniList && token && entry.anilistId) {
      try {
        await saveEntry(token, {
          mediaId: entry.anilistId,
          progress,
          status: status as MediaStatus,
        });
      } catch (e) {
        onNotice(`AniList push failed: ${e}`);
      }
    }
  };

  const setStatus = async (entry: MediaEntry, status: string) => {
    dispatch({ type: "media/update", entry: { ...entry, status } });
    if (isAniList && token && entry.anilistId) {
      try {
        await saveEntry(token, { mediaId: entry.anilistId, status: status as MediaStatus });
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

  const tmdbSync = async () => {
    if (!data.settings.tmdbSessionId) {
      onNotice("Connect TMDB in settings first");
      return;
    }
    setSyncing(true);
    try {
      const fresh = await tmdbSyncPull(data.settings, isMovie ? "movie" : "tv", category.id);
      dispatch({ type: "media/replaceCategory", categoryId: category.id, entries: fresh });
      onNotice(`Synced ${fresh.length} from TMDB`);
    } catch (e) {
      onNotice(`${e}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleTask = (entry: MediaEntry, itemId: string) => {
    const checklist = (entry.checklist ?? []).map((c) =>
      c.id === itemId ? toggleChecklistItem(c) : c,
    );
    dispatch({ type: "media/update", entry: { ...entry, checklist } });
  };

  const rate = async (entry: MediaEntry, score: number | undefined) => {
    dispatch({ type: "media/update", entry: { ...entry, score } });
    if (isAniList && token && entry.anilistId) {
      try {
        await saveEntry(token, { mediaId: entry.anilistId, scoreRaw: (score ?? 0) * 10 });
      } catch (e) {
        onNotice(`AniList rating push failed: ${e}`);
      }
    } else if (isTmdb && entry.tmdbId && entry.tmdbType) {
      try {
        await tmdbRate(data.settings, entry.tmdbType, entry.tmdbId, score);
      } catch (e) {
        onNotice(`${e}`);
      }
    }
  };

  const isInstalled = (e: MediaEntry) => isEntryInstalled(e, installed);

  const installFiltered =
    isGames && installFilter !== "all"
      ? entries.filter((e) =>
          installFilter === "installed" ? isInstalled(e) : !isInstalled(e),
        )
      : entries;

  const statuses = statusesFor(category);
  const hasOther = installFiltered.some((e) => !statuses.includes(e.status));
  const visible = filterEntries(installFiltered, filter, statuses);
  const groups = groupByStatus(visible, statuses);

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
        {isTmdb && (
          <>
            <TmdbSearch category={category} type={isMovie ? "movie" : "tv"} onNotice={onNotice} />
            {data.settings.tmdbSessionId && (
              <button className="btn" onClick={tmdbSync} disabled={syncing} title="Pull rated + watchlist from TMDB">
                {IC.refresh} {syncing ? "Syncing…" : "Sync"}
              </button>
            )}
            <button className="btn" onClick={() => setAddingManual(true)}>
              {IC.plus} Add
            </button>
          </>
        )}
        {!isAniList && !isGames && !isTmdb && (
          <button className="btn" onClick={() => setAddingManual(true)}>
            {IC.plus} Add {category.name.replace(/s$/, "").toLowerCase()}
          </button>
        )}
        <button
          className={`btn ghost ${selectMode ? "active" : ""}`}
          title="Select multiple"
          onClick={() => {
            setSelectMode((v) => !v);
            clearSelection();
          }}
        >
          {IC.check} Select
        </button>
      </div>

      {entries.length > 0 && (
        <div className="media-filter-row">
          <select
            className="input media-filter-status"
            value={filter.status ?? ""}
            onChange={(e) => setFilter({ ...filter, status: e.target.value || null })}
          >
            <option value="">all statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
            {hasOther && <option value="Other">other</option>}
          </select>
          <input
            className="input media-filter-query"
            placeholder="Filter by title"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
          <select
            className="input media-filter-rating"
            value={filter.minRating == null ? "" : String(filter.minRating)}
            onChange={(e) =>
              setFilter({
                ...filter,
                minRating: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          >
            <option value="">any rating</option>
            <option value="5">5</option>
            <option value="4">4+</option>
            <option value="3">3+</option>
            <option value="2">2+</option>
            <option value="1">1+</option>
            <option value="0">unrated</option>
          </select>
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div className="media-bulk-bar">
          <span>{selected.size} selected</span>
          <select
            className="input media-bulk-status"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkStatus(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Set status...
            </option>
            {statusesFor(category).map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
          {isGames && (
            <>
              <button className="btn ghost" onClick={() => bulkInstalled(true)}>
                Mark installed
              </button>
              <button className="btn ghost" onClick={() => bulkInstalled(false)}>
                Mark not installed
              </button>
            </>
          )}
          <button className="btn ghost danger" onClick={bulkDelete}>
            Delete
          </button>
          <button className="btn ghost" onClick={selectAll}>
            Select all
          </button>
          <button className="btn ghost" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}

      <div className="media-grid-wrap">
        {visible.length === 0 && (
          <p className="media-empty">
            {entries.length > 0
              ? "Nothing matches the current filters."
              : isAniList
                ? "Search above to add something, or hit Sync to pull your AniList."
                : isGames
                  ? "Search games, import your Steam library, or add one manually."
                  : isTmdb
                    ? `Search for a ${isMovie ? "movie" : "show"} above, or add one manually.`
                    : "Nothing here yet — add your first one."}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.status} className="media-group">
            <h3 className="media-group-head">{group.status.toLowerCase()}</h3>
            <div className="media-grid">
              {group.entries.map((e) => (
                <MediaCard
                  key={e.id}
                  entry={e}
                  statuses={statuses}
                  hoursMode={isGames}
                  movie={isMovie}
                  installed={isGames ? isInstalled(e) : undefined}
                  onBump={() => bump(e)}
                  onLaunch={() => launch(e)}
                  onStatus={(s) => setStatus(e, s)}
                  onRate={(score) => rate(e, score)}
                  onToggleTask={(itemId) => toggleTask(e, itemId)}
                  onDetails={() => setDetailId(e.id)}
                  onEdit={() => setEditId(e.id)}
                  onDelete={() => dispatch({ type: "media/delete", id: e.id })}
                  selectMode={selectMode}
                  selected={selected.has(e.id)}
                  onToggleSelected={() => toggleSelected(e.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {addingManual && (
        <EntryFormModal
          category={category}
          onClose={() => setAddingManual(false)}
          onSave={(entry) => {
            dispatch({ type: "media/add", entry });
            setAddingManual(false);
          }}
        />
      )}

      {editEntry && (
        <EntryFormModal
          category={category}
          entry={editEntry}
          onClose={() => setEditId(null)}
          onSave={(entry) => {
            dispatch({ type: "media/update", entry });
            setEditId(null);
          }}
        />
      )}

      {detailEntry && (
        <EntryDetailModal
          entry={detailEntry}
          onClose={() => setDetailId(null)}
          onUpdate={(entry) => dispatch({ type: "media/update", entry })}
          onRate={(score) => rate(detailEntry, score)}
        />
      )}
    </div>
  );
}

function MediaCard({
  entry,
  statuses,
  hoursMode,
  movie,
  installed,
  onBump,
  onLaunch,
  onStatus,
  onRate,
  onToggleTask,
  onDetails,
  onEdit,
  onDelete,
  selectMode,
  selected,
  onToggleSelected,
}: {
  entry: MediaEntry;
  statuses: string[];
  hoursMode: boolean;
  movie?: boolean;
  installed?: boolean;
  onBump: () => void;
  onLaunch: () => void;
  onStatus: (s: string) => void;
  onRate: (score: number | undefined) => void;
  onToggleTask: (itemId: string) => void;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
}) {
  const { focusNow, isFocused } = useFocusActions();
  const open = entry.checklist?.filter((c) => !c.done) ?? [];
  const openTasks = open.length;
  const hasNotes = Boolean(entry.notes?.trim());
  const annotated = hasNotes || (entry.checklist?.length ?? 0) > 0;

  return (
    <div className={`media-card status-${entry.status.toLowerCase()} ${selected ? "selected" : ""}`}>
      {selectMode && (
        <label className="media-card-select">
          <input type="checkbox" checked={selected ?? false} onChange={onToggleSelected} />
        </label>
      )}
      <div className="media-card-main">
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
          {!movie && (
            <span>
              {entry.progress}
              {entry.total != null ? ` / ${entry.total}` : hoursMode ? " h" : ""}
            </span>
          )}
          {!movie && !hoursMode && entry.status !== "COMPLETED" && (
            <button className="btn icon bump" title="+1 episode" onClick={onBump}>
              +1
            </button>
          )}
          {entry.launchCommand && (
            <button className="btn icon bump" title={entry.launchCommand} onClick={onLaunch}>
              {IC.play}
            </button>
          )}
        </div>
        <div className="media-rating">
          <StarRating value={entry.score} onChange={onRate} size="sm" />
        </div>
        <div className="media-foot">
          <select
            className="input media-status"
            value={entry.status}
            onChange={(e) => onStatus(e.target.value)}
          >
            {(statuses.includes(entry.status) ? statuses : [entry.status, ...statuses]).map(
              (s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ),
            )}
          </select>
          <button
            className={`btn ghost icon detail-btn ${annotated ? "annotated" : ""}`}
            title="Notes & checklist"
            onClick={onDetails}
          >
            {IC.note}
            {openTasks > 0 && <span className="detail-badge">{openTasks}</span>}
          </button>
          <button
            className="btn ghost icon"
            title="Edit entry"
            onClick={onEdit}
          >
            {IC.edit}
          </button>
          <button
            className={`btn ghost icon ${isFocused({ kind: "media", id: entry.id }) ? "focused" : ""}`}
            title="Focus on this"
            onClick={() => focusNow({ kind: "media", id: entry.id })}
          >
            {IC.target}
          </button>
          <button className="btn ghost icon danger" title="Remove" onClick={onDelete}>
            {IC.close}
          </button>
        </div>
      </div>
      </div>
      {openTasks > 0 && (
        <div className="media-tasks-preview">
          {open.slice(0, 3).map((c) => (
            <div key={c.id} className="media-task-line">
              <button
                className="media-task-toggle"
                title={c.recurrence && c.recurrence !== "none" ? `Mark done (repeats ${c.recurrence})` : "Mark done"}
                onClick={() => onToggleTask(c.id)}
              >
                <span className="check-box" />
                <span className="media-task-text">{c.text}</span>
                {c.recurrence && c.recurrence !== "none" && (
                  <span className="media-task-repeat" title={`Repeats ${c.recurrence}`}>
                    {IC.refresh}
                  </span>
                )}
              </button>
              <button
                className={`btn ghost icon media-task-focus ${
                  isFocused({ kind: "task", id: c.id, parentId: entry.id }) ? "focused" : ""
                }`}
                title="Focus on this task"
                onClick={() => focusNow({ kind: "task", id: c.id, parentId: entry.id })}
              >
                {IC.target}
              </button>
            </div>
          ))}
          {openTasks > 3 && (
            <button className="media-task-more" onClick={onDetails}>
              +{openTasks - 3} more
            </button>
          )}
        </div>
      )}
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

function TmdbSearch({
  category,
  type,
  onNotice,
}: {
  category: MediaCategory;
  type: "movie" | "tv";
  onNotice: (msg: string) => void;
}) {
  const { data, dispatch } = useApp();
  const apiKey = data.settings.tmdbApiKey;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<number>(undefined);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    if (!apiKey || query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      try {
        const found = await tmdbSearch(apiKey, query.trim(), type);
        setResults(found);
        setOpen(true);
      } catch (e) {
        onNotice(`${e}`);
      }
    }, 350);
    return () => window.clearTimeout(debounce.current);
  }, [query, apiKey, type, onNotice]);

  const add = async (r: TmdbResult) => {
    setOpen(false);
    setQuery("");
    const base: MediaEntry = {
      id: uid(),
      categoryId: category.id,
      title: r.title,
      coverUrl: r.poster,
      progress: 0,
      total: type === "movie" ? null : 0,
      status: "PLANNING",
      tmdbId: r.id,
      tmdbType: type,
    };
    if (type === "movie") {
      dispatch({ type: "media/add", entry: base });
      return;
    }
    try {
      const seasons = await tmdbTvSeasons(apiKey!, r.id);
      const total = seasons.reduce((n, s) => n + s.episodes, 0);
      dispatch({ type: "media/add", entry: { ...base, seasons, total } });
    } catch (e) {
      dispatch({ type: "media/add", entry: base });
      onNotice(`Added without seasons: ${e}`);
    }
  };

  return (
    <div className="ani-search">
      <input
        className="input"
        placeholder={apiKey ? `Search ${type === "movie" ? "movies" : "shows"}…` : "Add a TMDB key in settings to search"}
        disabled={!apiKey}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="ani-results glass">
          {results.map((r) => (
            <button key={r.id} className="ani-result" onMouseDown={() => add(r)}>
              {r.poster && <img src={r.poster} alt="" loading="lazy" />}
              <span>
                {r.title}
                {r.year ? ` (${r.year})` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
