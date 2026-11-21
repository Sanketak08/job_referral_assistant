import type { Outputs } from '@jobhunt/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';

const EMPTY: Outputs = {
  jobsFile: null,
  jobsFiles: [],
  jobs: [],
  newInLatest: 0,
  applied: [],
  contacted: [],
};

/** The CSV tables, refetched when output/ changes (`version`) or another jobs file is picked. */
export function useOutputs(version: number, jobsFile: string | null): Outputs {
  const [outputs, setOutputs] = useState<Outputs>(EMPTY);

  useEffect(() => {
    if (version === 0) return; // not connected yet
    let current = true;
    api
      .outputs(jobsFile)
      .then((data) => current && setOutputs(data))
      .catch((err: unknown) => console.error('Could not load output files', err));
    return () => {
      current = false;
    };
  }, [version, jobsFile]);

  return outputs;
}
