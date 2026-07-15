import { useState } from "react";
import { AppProvider, useApp } from "./lib/state";
import { LauncherBar } from "./components/LauncherBar";
import { ImpulseLot } from "./components/ImpulseLot";
import { NowNextCard } from "./components/NowNextCard";
import { MediaTracker } from "./components/MediaTracker";
import { HyperfocusTimer } from "./components/HyperfocusTimer";
import { DopamineMenu } from "./components/DopamineMenu";
import { GitHubGraph } from "./components/GitHubGraph";
import { StatsBar } from "./components/StatsBar";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

function Dashboard() {
  const { hydrated } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
