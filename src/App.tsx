import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./lib/state";
import { LauncherBar } from "./components/LauncherBar";
import { ImpulseLot } from "./components/ImpulseLot";
import { NowNextCard } from "./components/NowNextCard";
import { MediaTracker } from "./components/MediaTracker";
import { TodoPanel } from "./components/TodoPanel";
import { HyperfocusTimer } from "./components/HyperfocusTimer";
import { DopamineMenu } from "./components/DopamineMenu";
import { GitHubGraph } from "./components/GitHubGraph";
import { StatsBar } from "./components/StatsBar";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

function Dashboard() {
  const { data, hydrated } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      <LauncherBar onOpenSettings={() => setSettingsOpen(true)} />
      <ImpulseLot />
      <main className="dash-main">
        <NowNextCard />
        <MediaTracker />
      </main>
      <aside className="dash-rail">
        <TodoPanel />
        <HyperfocusTimer />
        <DopamineMenu />
        <GitHubGraph />
      </aside>
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
