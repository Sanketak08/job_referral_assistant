const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-11-18" → "Posted yesterday". Falls back to the raw text when it is not a date. */
export function postedAgo(date: string): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
  if (Number.isNaN(parsed.getTime())) return date || '–';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(parsed);
  day.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / DAY_MS);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  return `Posted ${days} days ago`;
}

/** ISO timestamp → "Nov 18, 23:32". */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '–';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
