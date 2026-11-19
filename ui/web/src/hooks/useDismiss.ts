import { useEffect, type RefObject } from 'react';

/** Calls `close` on a click outside `ref`, on Escape, and on scroll while `open` is true. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) close();
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
  }, [ref, open, close]);
}
