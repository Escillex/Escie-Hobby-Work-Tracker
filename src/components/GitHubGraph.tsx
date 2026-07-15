import { useCallback, useEffect, useState } from "react";
import { fetchContributions, type ContributionData } from "../lib/github";
import { loadGithubCache, saveGithubCache } from "../lib/store";
import { useApp } from "../lib/state";
import "./GitHubGraph.css";

export function GitHubGraph() {
  const { data, hydrated } = useApp();
  const user = data.settings.githubUser;
  const [contrib, setContrib] = useState<ContributionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchContributions(user);
      setContrib(fresh);
      await saveGithubCache(fresh);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    loadGithubCache().then((cached) => {
      if (cached) setContrib(cached);
      // Refresh if the cache is older than 6 hours (or missing).
      const stale =
        !cached || Date.now() - new Date(cached.fetchedAt).getTime() > 6 * 3600_000;
      if (stale) refresh();
    });
  }, [hydrated, user, refresh]);

  // Trailing ~26 weeks so cells stay readable in the rail.
  const days = contrib?.days.slice(-182) ?? [];

  return (
    <div className="gh-graph glass">
      <div className="panel-title">
         {user || "github"}
        <button
          className="btn ghost icon gh-refresh"
          title="Refresh"
          onClick={refresh}
          disabled={loading}
        >
          ⟳
        </button>
      </div>
      {days.length > 0 ? (
        <>
          <div className="gh-grid">
            {days.map((d) => (
              <span
                key={d.date}
                className={`gh-cell l${d.level}`}
                title={`${d.date}: ${d.count} contribution${d.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
          <span className="gh-total">
            {contrib!.total.toLocaleString()} contributions in the last year
          </span>
        </>
      ) : (
        <p className="gh-empty">{loading ? "Loading…" : (error ?? "No data yet.")}</p>
      )}
      {error && days.length > 0 && <p className="gh-empty">offline — showing cached</p>}
    </div>
  );
}
