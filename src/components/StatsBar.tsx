import { useApp } from "../lib/state";
import { localDate } from "../lib/types";
import "./StatsBar.css";

export function StatsBar() {
  const { data } = useApp();

  const weekAgo = Date.now() - 7 * 86_400_000;
  const capturedThisWeek = data.impulses.filter(
    (i) => new Date(i.createdAt).getTime() >= weekAgo,
  ).length;

  const thisMonth = localDate().slice(0, 7); // YYYY-MM
  const finishedThisMonth = data.media.entries.filter(
    (e) => e.status === "COMPLETED" && e.completedAt?.startsWith(thisMonth),
  ).length;

  return (
    <footer className="stats-bar glass">
      <span title="Days in a row you've opened the dash">
        🔥 {data.stats.streak} day{data.stats.streak === 1 ? "" : "s"}
      </span>
      <span title="Impulses captured in the last 7 days">
        🧠 {capturedThisWeek} captured this week
      </span>
      <span title="Media completed this month">
        ✅ {finishedThisMonth} finished this month
      </span>
    </footer>
  );
}
