import { useEffect, useState } from 'react';

/** The current view lives in the URL hash (#/search), so reloads and the back button work. */
export function useHashRoute(fallback: string): [string, (view: string) => void] {
  const read = (): string => location.hash.replace(/^#\/?/, '') || fallback;
  const [view, setView] = useState(read);

  useEffect(() => {
    const onChange = (): void => setView(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
    // read only depends on fallback, which is a constant per App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [view, (next) => (location.hash = `/${next}`)];
}
