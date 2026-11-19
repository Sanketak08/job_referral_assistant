import type { StoredEvent, TabInfo } from '@jobhunt/shared';
import { useMemo, useState } from 'react';
import { api } from '../api/client.ts';
import { EventStream } from '../components/EventStream.tsx';
import { formatTokens, groupRuns } from './runs.ts';

/** One component for every tab; the differences come from TabInfo. */
export function TabView({ info, events }: { info: TabInfo; events: StoredEvent[] }) {
  const runs = useMemo(() => groupRuns(events), [events]);
  const [error, setError] = useState<string | null>(null);

  const latest = runs.at(-1);
  const running = latest !== undefined && latest.finished === null;
  const contextTokens = latest?.contextTokens ?? null;

  const call = (action: () => Promise<unknown>) => () => {
    setError(null);
    action().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className="tab">
      <div className="toolbar">
        <button className="primary" disabled={running} onClick={call(() => api.run(info.id))}>
          ▶ {info.presetLabel}
        </button>
        <button disabled={!running} onClick={call(() => api.stop(info.id))}>
          ■ Stop
        </button>
        <span className="toolbar-info muted">
          {info.model}
          {contextTokens !== null && ` · ctx ${formatTokens(contextTokens)}`}
        </span>
      </div>
      {error && <div className="banner-error">{error}</div>}
      <EventStream runs={runs} />
    </div>
  );
}
