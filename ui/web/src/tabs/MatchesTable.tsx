import type { JobRow } from '@jobhunt/shared';
import { useState, type ReactNode } from 'react';
import { DataTable, type Column, type RowAction } from '../components/DataTable.tsx';
import { Icon } from '../components/Icon.tsx';
import { postedAgo } from './dates.ts';

interface Props {
  jobs: JobRow[];
  jobsFile: string | null;
  /** Buttons shown when rows are selected; gets the selected jobs and a reset callback. */
  selectionActions?: (jobs: JobRow[], clear: () => void) => ReactNode;
  /** Extra entries for a row's "⋯" menu. */
  rowActions?: (job: JobRow) => RowAction[];
}

/** Score at or above which a match is shown in green, like a strong match. */
const STRONG_MATCH = 85;

const COLUMNS: Column<JobRow>[] = [
  {
    key: 'title',
    label: 'Job',
    sortValue: (j) => j.title,
    render: (j) => (
      <div className="cell-main">
        <a href={j.link} target="_blank" rel="noreferrer">
          {j.title}
        </a>
        {j.location && <span className="cell-sub">{j.location}</span>}
      </div>
    ),
  },
  { key: 'company', label: 'Company', sortValue: (j) => j.company, render: (j) => j.company },
  {
    key: 'source',
    label: 'Source',
    sortValue: (j) => j.source,
    render: (j) => j.source && <span className="tag">{j.source}</span>,
  },
  {
    key: 'match',
    label: 'Match',
    sortValue: (j) => j.matchScore ?? -1,
    render: (j) => <MatchBadge score={j.matchScore} />,
  },
  {
    key: 'posted',
    label: 'Posted',
    sortValue: (j) => j.datePosted,
    render: (j) => <span className="cell-time">{postedAgo(j.datePosted)}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    sortValue: (j) => (j.applied ? 2 : 0) + (j.contacted ? 1 : 0),
    render: (j) => (
      <span className="tags">
        {j.applied && <span className="tag tag-ok">Applied</span>}
        {j.contacted && <span className="tag tag-blue">Contacted</span>}
        {!j.applied && !j.contacted && <span className="muted">New</span>}
      </span>
    ),
  },
];

export function MatchesTable({ jobs, jobsFile, selectionActions, rowActions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideApplied, setHideApplied] = useState(false);

  const rows = hideApplied ? jobs.filter((j) => !j.applied) : jobs;
  const selectedJobs = jobs.filter((j) => selected.has(j.link));
  const clear = (): void => setSelected(new Set());

  return (
    <div className="results">
      <div className="results-bar">
        <span className="muted results-file">
          {jobsFile ? (
            <>
              From <code>{jobsFile}</code>
            </>
          ) : (
            'No daily_jobs CSV yet'
          )}
        </span>
        <div className="results-actions">
          {selectedJobs.length > 0 && (
            <>
              <span className="selected-count">{selectedJobs.length} selected</span>
              {selectionActions?.(selectedJobs, clear)}
              <button className="btn btn-sm btn-ghost" onClick={clear}>
                Clear
              </button>
            </>
          )}
          <button
            className={hideApplied ? 'btn btn-sm active' : 'btn btn-sm'}
            onClick={() => setHideApplied((h) => !h)}
            aria-pressed={hideApplied}
          >
            <Icon name="filter" size={14} /> {hideApplied ? 'Showing new only' : 'Hide applied'}
          </button>
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(j) => j.link}
        emptyText="No jobs in the latest search. Run the daily search to fill this table."
        initialSort={{ key: 'match', dir: 'desc' }}
        selected={selected}
        onSelectedChange={setSelected}
        rowActions={(j) => [
          { label: 'Open posting', icon: 'external', onClick: () => window.open(j.link, '_blank') },
          ...(rowActions?.(j) ?? []),
        ]}
      />
    </div>
  );
}

function MatchBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="muted">–</span>;
  const rounded = Math.round(score);
  return score >= STRONG_MATCH ? (
    <span className="badge badge-ok">
      <Icon name="check" size={12} /> {rounded}%
    </span>
  ) : (
    <span className="badge badge-blue">{rounded}% Match</span>
  );
}
