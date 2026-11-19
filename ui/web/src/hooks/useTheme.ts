import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'jobhunt.theme';
const ORDER: ThemePref[] = ['system', 'light', 'dark'];

function load(): ThemePref {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** System, light or dark. Stored per browser; the CSS reads it from <html data-theme>. */
export function useTheme(): [ThemePref, () => void] {
  const [pref, setPref] = useState<ThemePref>(load);

  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') delete root.dataset.theme;
    else root.dataset.theme = pref;
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // Private mode or blocked storage: the choice just won't persist.
    }
  }, [pref]);

  const cycle = (): void =>
    setPref((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length] ?? 'system');
  return [pref, cycle];
}
