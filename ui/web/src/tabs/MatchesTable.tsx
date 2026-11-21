import type { JobRow, JobsFileInfo } from '@jobhunt/shared';
import { useState, type ReactNode } from 'react';
import { DataTable, type Column, type RowAction } from '../components/DataTable.tsx';
import { Icon } from '../components/Icon.tsx';
import { jobsFileLabel, postedAgo } from './dates.ts';

interface Props {
  jobs: JobRow[];
  /** The CSV the rows come from. */
  jobsFile: string | null;
  /** Every daily_jobs CSV, newest first. */
  files: JobsFileInfo[];
  /** The file picked in the dropdown; null follows the newest CSV as new ones appear. */
  selectedFile: string | null;
  onSelectFile: (name: string | null) => void;
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
        {j.contacted && <span className="tag tag-accent">Contacted</span>}
        {!j.applied && !j.contacted && <span className="tag tag-new">New</span>}
      </span>
    ),
  },
];

export function MatchesTable(props: Props) {
  const { jobs, jobsFile, files, selectedFile, onSelectFile, selectionActions, rowActions } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideApplied, setHideApplied] = useState(false);

  const rows = hideApplied ? jobs.filter((j) => !j.applied) : jobs;
  const selectedJobs = jobs.filter((j) => selected.has(j.link));
  const clear = (): void => setSelected(new Set());

  return (
    <div className="results">
      <div className="results-bar">
        {files.length > 0 ? (
          <label className="results-file">
            <span className="muted results-file-label">Jobs from</span>
            <select
              className="select"
              value={selectedFile ?? ''}
              onChange={(e) => onSelectFile(e.target.value || null)}
              title={jobsFile ?? undefined}
            >
              {files.map((file, i) => (
                <option key={file.name} value={i === 0 ? '' : file.name}>
                  {i === 0 ? 'Latest · ' : ''}
                  {jobsFileLabel(file.name)} · {file.count} {file.count === 1 ? 'job' : 'jobs'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="muted results-file">No daily_jobs CSV yet</span>
        )}
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
    <span className="badge badge-partial">{rounded}% Match</span>
  );
}
