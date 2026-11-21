import type {
  AppliedRow,
  ContactRow,
  JobRef,
  JobRow,
  Outputs,
  TabId,
  TabInfo,
} from '@jobhunt/shared';
import { DataTable, type Column } from '../components/DataTable.tsx';
import { Icon } from '../components/Icon.tsx';
import { shortDateTime } from './dates.ts';
import { MatchesTable } from './MatchesTable.tsx';
import type { ResultsView } from './TabView.tsx';

/** Sends jobs from the Matches table to another tab and switches to it. */
export type Handoff = (tab: TabId, jobs: JobRef[]) => void;

/** The table each tab shows next to Activity, built from the output/ CSVs. */
export interface ResultsContext {
  outputs: Outputs;
  tabs: TabInfo[];
  handoff: Handoff;
  /** The daily_jobs CSV picked in the Matches dropdown; null means the newest. */
  jobsFile: string | null;
  onSelectJobsFile: (name: string | null) => void;
}

export function resultsFor(tab: TabId, ctx: ResultsContext): ResultsView | undefined {
  const { outputs, tabs, handoff } = ctx;
  switch (tab) {
    case 'search': {
      const targets = tabs.filter((t) => t.acceptsJobs);
      return {
        label: 'Matches',
        count: outputs.jobs.length,
        content: (
          <MatchesTable
            jobs={outputs.jobs}
            jobsFile={outputs.jobsFile}
            files={outputs.jobsFiles}
            selectedFile={ctx.jobsFile}
            onSelectFile={ctx.onSelectJobsFile}
            selectionActions={(jobs, clear) =>
              targets.map((t) => (
                <button
                  key={t.id}
                  className="btn btn-sm btn-dark"
                  onClick={() => {
                    handoff(t.id, jobs.map(toRef));
                    clear();
                  }}
                >
                  <Icon name={t.id === 'apply' ? 'send' : 'users'} size={14} />
                  {t.id === 'apply' ? 'Apply to selected' : 'Get referrals'}
                </button>
              ))
            }
            rowActions={(job) =>
              targets.map((t) => ({
                label: t.id === 'apply' ? 'Apply to this job' : 'Get referrals',
                icon: t.id === 'apply' ? 'send' : 'users',
                onClick: () => handoff(t.id, [toRef(job)]),
              }))
            }
          />
        ),
      };
    }
    case 'apply':
      return {
        label: 'Applied',
        count: outputs.applied.length,
        content: (
          <div className="results">
            <DataTable
              rows={outputs.applied}
              columns={APPLIED_COLUMNS}
              rowKey={(r) => `${r.link}|${r.appliedAt}`}
              emptyText="Nothing in output/applied_jobs.csv yet."
              initialSort={{ key: 'when', dir: 'desc' }}
            />
          </div>
        ),
      };
    case 'referral':
      return {
        label: 'Contacted',
        count: outputs.contacted.length,
        content: (
          <div className="results">
            <DataTable
              rows={outputs.contacted}
              columns={CONTACT_COLUMNS}
              rowKey={(r) => `${r.email}|${r.contactedAt}`}
              emptyText="Nothing in output/contacted_people.csv yet."
              initialSort={{ key: 'when', dir: 'desc' }}
            />
          </div>
        ),
      };
  }
}

function toRef(job: JobRow): JobRef {
  return { title: job.title, company: job.company, link: job.link };
}

const APPLIED_COLUMNS: Column<AppliedRow>[] = [
  {
    key: 'job',
    label: 'Job',
    sortValue: (r) => r.title || r.link,
    render: (r) => (
      <div className="cell-main">
        <a href={r.link} target="_blank" rel="noreferrer">
          {r.title || hostAndPath(r.link)}
        </a>
        {r.title && <span className="cell-sub">{hostAndPath(r.link)}</span>}
      </div>
    ),
  },
  {
    key: 'company',
    label: 'Company',
    sortValue: (r) => r.company,
    render: (r) => r.company || '–',
  },
  {
    key: 'when',
    label: 'Applied',
    sortValue: (r) => r.appliedAt,
    render: (r) => <span className="cell-time">{shortDateTime(r.appliedAt)}</span>,
  },
];

const CONTACT_COLUMNS: Column<ContactRow>[] = [
  {
    key: 'email',
    label: 'Email',
    sortValue: (r) => r.email,
    render: (r) => <a href={`mailto:${r.email}`}>{r.email}</a>,
  },
  { key: 'company', label: 'Company', sortValue: (r) => r.company, render: (r) => r.company },
  {
    key: 'when',
    label: 'Contacted',
    sortValue: (r) => r.contactedAt,
    render: (r) => <span className="cell-time">{shortDateTime(r.contactedAt)}</span>,
  },
];

function hostAndPath(link: string): string {
  try {
    const url = new URL(link);
    const text = `${url.host}${url.pathname}`;
    return text.length > 70 ? `${text.slice(0, 70)}…` : text;
  } catch {
    return link;
  }
}
