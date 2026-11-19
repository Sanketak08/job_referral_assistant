import type { RunFinishedEvent, StoredEvent } from '@jobhunt/shared';

export interface RunView {
  runId: number;
  startedAt: string;
  prompt: string;
  sessionId: string | null;
  events: StoredEvent[];
  finished: RunFinishedEvent | null;
  contextTokens: number | null;
}

/** Groups a tab's flat event list into runs, oldest first. */
export function groupRuns(events: StoredEvent[]): RunView[] {
  const runs = new Map<number, RunView>();
  for (const stored of events) {
    let run = runs.get(stored.runId);
    if (!run) {
      run = {
        runId: stored.runId,
        startedAt: stored.at,
        prompt: '',
        sessionId: null,
        events: [],
        finished: null,
        contextTokens: null,
      };
      runs.set(stored.runId, run);
    }
    const { event } = stored;
    if (event.type === 'run_started') run.prompt = event.prompt;
    else if (event.type === 'session') run.sessionId = event.sessionId;
    else if (event.type === 'usage') run.contextTokens = event.contextTokens;
    else if (event.type === 'run_finished') run.finished = event;
    run.events.push(stored);
  }
  return [...runs.values()];
}

export function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

export function formatCost(usd: number): string {
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
