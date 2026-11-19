import { useEffect, useState } from 'react';

/** Current time in ms, refreshed every second while `ticking` is true (for elapsed timers). */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  return now;
}
