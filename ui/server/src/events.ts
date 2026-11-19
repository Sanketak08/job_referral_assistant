import type { RunEvent, TabId } from '@jobhunt/shared';
import { broadcast } from './live.ts';
import { addEvent } from './store/db.ts';

/** Stores an event and pushes it to every open browser. */
export function recordEvent(runId: number, tab: TabId, event: RunEvent): void {
  broadcast({ type: 'event', event: addEvent(runId, tab, event) });
}
