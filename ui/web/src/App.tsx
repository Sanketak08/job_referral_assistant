import type { TabId, TabInfo } from '@jobhunt/shared';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api/client.ts';
import { useLive } from './hooks/useLive.ts';
import { TabView } from './tabs/TabView.tsx';

export function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeId, setActiveId] = useState<TabId>('search');
  const [loadError, setLoadError] = useState<string | null>(null);
  const { events, connected } = useLive();

  useEffect(() => {
    api
      .tabs()
      .then(setTabs)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeId);
  const tabEvents = useMemo(() => events.filter((e) => e.tab === activeId), [events, activeId]);

  return (
    <div className="app">
      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeId ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <span className={connected ? 'conn conn-on' : 'conn conn-off'}>
          {connected ? 'connected' : 'reconnecting…'}
        </span>
      </nav>
      {loadError && <div className="banner-error">{loadError}</div>}
      {activeTab && <TabView key={activeTab.id} info={activeTab} events={tabEvents} />}
    </div>
  );
}
