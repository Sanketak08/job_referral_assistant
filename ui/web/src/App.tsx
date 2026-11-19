import type { AppInfo, StoredEvent, TabId } from '@jobhunt/shared';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from './api/client.ts';
import { Header } from './components/Header.tsx';
import { Sidebar, type TodayUsage } from './components/Sidebar.tsx';
import { useHashRoute } from './hooks/useHashRoute.ts';
import { useLive } from './hooks/useLive.ts';
import { useOutputs } from './hooks/useOutputs.ts';
import { useTheme } from './hooks/useTheme.ts';
import { groupRuns, tabStatus, type RunView, type TabStatus } from './tabs/runs.ts';
import { newJobCount, resultsFor } from './tabs/results.tsx';
import { TabView } from './tabs/TabView.tsx';

export function App() {
  const [app, setApp] = useState<AppInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, navigate] = useHashRoute('search');
  const [theme, cycleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { events, sessions, connected, outputsVersion } = useLive();
  const outputs = useOutputs(outputsVersion);

  useEffect(() => {
    api
      .app()
      .then(setApp)
      .catch((err: unknown) => setLoadError(errorMessage(err)));
  }, []);

  const runsByTab = useMemo(() => groupByTab(events), [events]);
  const statuses = useMemo(() => {
    const out: Partial<Record<TabId, TabStatus>> = {};
    for (const tab of app?.tabs ?? []) out[tab.id] = tabStatus(runsByTab.get(tab.id)?.at(-1));
    return out;
  }, [app, runsByTab]);
  const today = useMemo(() => todayUsage(events), [events]);

  const go = (next: string): void => {
    navigate(next);
    setMenuOpen(false);
  };

  const activeTab = app?.tabs.find((tab) => tab.id === view) ?? app?.tabs[0];

  return (
    <div className={menuOpen ? 'layout menu-open' : 'layout'}>
      <Sidebar
        tabs={app?.tabs ?? []}
        statuses={statuses}
        counts={{ search: newJobCount(outputs) }}
        view={activeTab?.id ?? view}
        onNavigate={go}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        today={today}
      />
      <div className="scrim" onClick={() => setMenuOpen(false)} />
      <main className="main">
        <Header
          userName={app?.userName ?? null}
          connected={connected}
          theme={theme}
          onCycleTheme={cycleTheme}
          onOpenMenu={() => setMenuOpen(true)}
        />
        {loadError && <div className="alert">{loadError}</div>}
        {activeTab && (
          <TabView
            key={activeTab.id}
            info={activeTab}
            runs={runsByTab.get(activeTab.id) ?? []}
            sessionId={sessions[activeTab.id] ?? null}
            results={resultsFor(activeTab.id, outputs)}
          />
        )}
      </main>
    </div>
  );
}

function groupByTab(events: StoredEvent[]): Map<TabId, RunView[]> {
  const byTab = new Map<TabId, StoredEvent[]>();
  for (const e of events) {
    const list = byTab.get(e.tab);
    if (list) list.push(e);
    else byTab.set(e.tab, [e]);
  }
  return new Map([...byTab].map(([tab, list]) => [tab, groupRuns(list)]));
}

function todayUsage(events: StoredEvent[]): TodayUsage {
  const today = new Date().toDateString();
  let runs = 0;
  let costUsd = 0;
  for (const { at, event } of events) {
    if (event.type !== 'run_finished' || new Date(at).toDateString() !== today) continue;
    runs++;
    costUsd += event.costUsd ?? 0;
  }
  return { runs, costUsd };
}
