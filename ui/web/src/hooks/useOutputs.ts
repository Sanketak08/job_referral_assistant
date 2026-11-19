import type { Outputs } from '@jobhunt/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';

const EMPTY: Outputs = { jobsFile: null, jobs: [], applied: [], contacted: [] };

/** The CSV tables, refetched whenever `version` changes (output/ was written). */
export function useOutputs(version: number): Outputs {
  const [outputs, setOutputs] = useState<Outputs>(EMPTY);

  useEffect(() => {
    if (version === 0) return; // not connected yet
    let current = true;
    api
      .outputs()
      .then((data) => current && setOutputs(data))
      .catch((err: unknown) => console.error('Could not load output files', err));
    return () => {
      current = false;
    };
  }, [version]);

  return outputs;
}
