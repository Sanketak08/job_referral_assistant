import type { RunSummary, StoredEvent, TabInfo } from '@jobhunt/shared';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { DataTable, type Column } from '../components/DataTable.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { EventStream } from '../components/EventStream.tsx';
import { Icon } from '../components/Icon.tsx';
import { shortDateTime } from '../tabs/dates.ts';
import { formatCost, formatDuration, groupRuns } from '../tabs/runs.ts';
import { TAB_ICONS } from '../tabs/tabIcons.ts';

interface Props {
  tabs: TabInfo[];
  /** Changes whenever a run starts or finishes, to refetch the list. */
  version: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_TAG: Record<RunSummary['status'], string> = {
  running: 'tag-blue',
  success: 'tag-ok',
  error: 'tag-denied',
  interrupted: 'tag-denied',
  stopped: 'tag-cancelled',
};

/** Every run across all tabs, with the full stream of any run on demand. */
export function HistoryPage({ tabs, version }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<RunSummary | null>(null);

  useEffect(() => {
    api
      .runs()
      .then(setRuns)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [version]);

  const week = useMemo(() => weekStats(runs), [runs]);
  const label = (id: string): string => tabs.find((t) => t.id === id)?.label ?? id;

  const columns: Column<RunSummary>[] = [
    { key: 'id', label: 'Run', sortValue: (r) => r.id, render: (r) => `#${r.id}` },
    {
      key: 'tab',
      label: 'Tab',
      sortValue: (r) => r.tab,
      render: (r) => (
        <span className="cell-tab">
          <Icon name={TAB_ICONS[r.tab]} size={15} /> {label(r.tab)}
        </span>
      ),
    },
    {
      key: 'prompt',
      label: 'Prompt',
      render: (r) => (
        <button className="link-button" onClick={() => setOpen(r)} title="View this run">
          {r.prompt.split('\n')[0]}
        </button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortValue: (r) => r.status,
      render: (r) => <span className={`tag ${STATUS_TAG[r.status]}`}>{r.status}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      sortValue: (r) => duration(r) ?? -1,
      render: (r) => {
        const ms = duration(r);
        return ms === null ? '–' : formatDuration(ms);
      },
    },
    {
      key: 'cost',
      label: 'Cost (API rates)',
      sortValue: (r) => r.costUsd ?? -1,
      render: (r) => (r.costUsd === null ? '–' : formatCost(r.costUsd)),
    },
    {
      key: 'started',
      label: 'Started',
      sortValue: (r) => r.startedAt,
      render: (r) => <span className="cell-time">{shortDateTime(r.startedAt)}</span>,
    },
  ];

  return (
    <div className="card page-card">
      <div className="stats">
        <Stat label="Runs this week" value={String(week.runs)} />
        <Stat
          label="Cost this week at API rates"
          value={formatCost(week.cost)}
          hint="Covered by Max"
        />
        <Stat
          label="Finished without errors"
          value={week.runs ? `${Math.round((week.ok / week.runs) * 100)}%` : '–'}
        />
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="section-title">
        <h3>Run history</h3>
        <span className="muted">Newest first · click a prompt to see the whole run</span>
      </div>
      <DataTable
        rows={runs}
        columns={columns}
        rowKey={(r) => String(r.id)}
        emptyText="No runs yet."
        initialSort={{ key: 'id', dir: 'desc' }}
        pageSize={15}
      />
      {open && (
        <RunDialog
          run={open}
          title={`Run #${open.id} · ${label(open.tab)}`}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

function RunDialog({
  run,
  title,
  onClose,
}: {
  run: RunSummary;
  title: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<StoredEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .runEvents(run.id)
      .then(setEvents)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [run.id]);

  const runs = useMemo(() => groupRuns(events ?? []), [events]);

  return (
    <Dialog
      title={title}
      wide
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      {error && <div className="alert">{error}</div>}
      {events === null && !error ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="dialog-stream">
          <EventStream
            runs={runs}
            emptyText="This run has no events."
            onDecide={(requestId, allow) => api.approve(requestId, allow)}
          />
        </div>
      )}
    </Dialog>
  );
}

function duration(run: RunSummary): number | null {
  return run.endedAt ? Date.parse(run.endedAt) - Date.parse(run.startedAt) : null;
}

function weekStats(runs: RunSummary[]): { runs: number; cost: number; ok: number } {
  const since = Date.now() - WEEK_MS;
  const recent = runs.filter((r) => Date.parse(r.startedAt) >= since && r.status !== 'running');
  return {
    runs: recent.length,
    cost: recent.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    ok: recent.filter((r) => r.status === 'success').length,
  };
}
