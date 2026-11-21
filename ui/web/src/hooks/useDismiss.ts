import { useEffect, type RefObject } from 'react';

type Refs = RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[];

/**
 * Calls `close` on a click outside `refs` (e.g. a button and its portalled menu), on Escape,
 * and on scroll while `open` is true.
 */
export function useDismiss(refs: Refs, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const list = Array.isArray(refs) ? refs : [refs];
    const onDown = (e: MouseEvent): void => {
      if (!list.some((r) => r.current?.contains(e.target as Node))) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
    // `refs` is a new array each render; the elements it points at are what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}
