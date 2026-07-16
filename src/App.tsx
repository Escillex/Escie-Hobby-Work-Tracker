import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./lib/state";
import { useTodoScheduler } from "./lib/useTodoScheduler";
import { LauncherBar } from "./components/LauncherBar";
import { ImpulseLot } from "./components/ImpulseLot";
import { NowNextCard } from "./components/NowNextCard";
import { MediaTracker } from "./components/MediaTracker";
import { TasksView } from "./components/TasksView";
import { HyperfocusTimer } from "./components/HyperfocusTimer";
import { GitHubGraph } from "./components/GitHubGraph";
import { StatsBar } from "./components/StatsBar";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type View = "dashboard" | "tasks";

function Dashboard() {
  const { data, hydrated } = useApp();
  const [view, setView] = useState<View>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useTodoScheduler();

  // Apply the chosen font family live; fall back to the CSS default.
  useEffect(() => {
    const font = data.settings.fontFamily?.trim();
    document.documentElement.style.setProperty(
      "--app-font",
      font
        ? `"${font}", "Symbols Nerd Font", system-ui, sans-serif`
        : `"RecMonoCasual Nerd Font", "Symbols Nerd Font", system-ui, "Segoe UI", sans-serif`,
    );
  }, [data.settings.fontFamily]);

  if (!hydrated) return null;

  return (
    <div className="dash-grid">
      <LauncherBar
        view={view}
        onView={setView}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {view === "dashboard" ? (
        <>
          <ImpulseLot />
          <main className="dash-main">
            <NowNextCard />
            <MediaTracker />
          </main>
          <aside className="dash-rail">
            <HyperfocusTimer />
            <GitHubGraph />
          </aside>
        </>
      ) : (
        <TasksView />
      )}
      <StatsBar />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}
