import type { Outputs, TabId } from '@jobhunt/shared';
import { MatchesTable } from './MatchesTable.tsx';
import type { ResultsView } from './TabView.tsx';

/** The table each tab shows next to Activity, built from the output/ CSVs. */
export function resultsFor(tab: TabId, outputs: Outputs): ResultsView | undefined {
  switch (tab) {
    case 'search':
      return {
        label: 'Matches',
        count: outputs.jobs.length,
        content: <MatchesTable jobs={outputs.jobs} jobsFile={outputs.jobsFile} />,
      };
    default:
      return undefined;
  }
}

/** Sidebar badge: matches you have not applied to yet. */
export function newJobCount(outputs: Outputs): number {
  return outputs.jobs.filter((job) => !job.applied).length;
}
