import { useEffect, useRef, useState } from "react";
import type { MediaCategory, MediaEntry, MediaStatus } from "../lib/types";
import { MEDIA_STATUSES, uid, localDate } from "../lib/types";
import { useApp } from "../lib/state";
import { searchMedia, saveEntry, fetchList, type AniListMedia } from "../lib/anilist";
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
          ＋
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
  const isAniList = category.source !== "manual";
  const aniType = category.source === "anilist-anime" ? "ANIME" : "MANGA";
  const token = data.settings.anilistToken;
  const [syncing, setSyncing] = useState(false);
  const [addingManual, setAddingManual] = useState(false);

  const sync = async () => {
    if (!token || !data.settings.anilistUserId) {
      onNotice("Connect AniList in settings (⚙) first");
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

  const current = entries.filter((e) => e.status === "CURRENT" || e.status === "REPEATING");
  const rest = entries.filter((e) => e.status !== "CURRENT" && e.status !== "REPEATING");

  return (
    <div className="media-body">
      <div className="media-toolbar">
        {isAniList ? (
          <>
            <AniListSearch category={category} type={aniType} onNotice={onNotice} />
            <button className="btn" onClick={sync} disabled={syncing}>
              {syncing ? "Syncing…" : "⟳ Sync"}
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => setAddingManual(true)}>
            ＋ Add {category.name.replace(/s$/, "").toLowerCase()}
          </button>
        )}
      </div>

      <div className="media-grid-wrap">
        {entries.length === 0 && (
          <p className="media-empty">
            {isAniList
              ? "Search above to add something, or hit Sync to pull your AniList."
              : "Nothing here yet — add your first one."}
          </p>
        )}
        {[...current, ...rest].map((e) => (
          <MediaCard
            key={e.id}
            entry={e}
            onBump={() => bump(e)}
            onStatus={(s) => setStatus(e, s)}
            onDelete={() => dispatch({ type: "media/delete", id: e.id })}
          />
        ))}
      </div>

      {addingManual && (
        <ManualEntryModal
          categoryId={category.id}
          onClose={() => setAddingManual(false)}
          onSave={(entry) => {
            dispatch({ type: "media/add", entry });
            setAddingManual(false);
          }}
        />
      )}
    </div>
  );
}

function MediaCard({
  entry,
  onBump,
  onStatus,
  onDelete,
}: {
  entry: MediaEntry;
  onBump: () => void;
  onStatus: (s: MediaStatus) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`media-card status-${entry.status.toLowerCase()}`}>
      {entry.coverUrl ? (
        <img className="media-cover" src={entry.coverUrl} alt="" loading="lazy" />
      ) : (
        <div className="media-cover placeholder">{entry.title.slice(0, 1)}</div>
      )}
      <div className="media-info">
        <span className="media-title" title={entry.title}>
          {entry.title}
        </span>
        <div className="media-progress">
          <span>
            {entry.progress}
            {entry.total != null ? ` / ${entry.total}` : ""}
          </span>
          {entry.status !== "COMPLETED" && (
            <button className="btn icon bump" title="+1" onClick={onBump}>
              +1
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
          <button className="btn ghost icon danger" title="Remove" onClick={onDelete}>
            ✕
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
          placeholder="Games, Books, …"
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
  onClose,
  onSave,
}: {
  categoryId: string;
  onClose: () => void;
  onSave: (e: MediaEntry) => void;
}) {
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [status, setStatus] = useState<MediaStatus>("PLANNING");

  return (
    <Modal title="Add entry" onClose={onClose}>
      <div className="field">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Total episodes / parts (optional)</label>
        <input
          className="input"
          type="number"
          min="1"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </div>
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
