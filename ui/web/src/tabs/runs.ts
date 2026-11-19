import type {
  ApprovalOutcome,
  RunEvent,
  RunFinishedEvent,
  RunKind,
  StoredEvent,
} from '@jobhunt/shared';

export type PermissionRequest = Extract<RunEvent, { type: 'permission_request' }>;

export interface RunView {
  runId: number;
  startedAt: string;
  prompt: string;
  kind: RunKind;
  /** True when this run started a fresh Claude session (no --resume). */
  newSession: boolean;
  sessionId: string | null;
  events: StoredEvent[];
  finished: RunFinishedEvent | null;
  contextTokens: number | null;
  /** Latest text or tool call, for status lines. */
  lastActivity: string | null;
  lastText: string | null;
  /** Outcome per permission request id; null while it waits for a click. */
  approvals: Map<string, ApprovalOutcome | null>;
  /** The oldest request still waiting, if any. */
  pendingApproval: PermissionRequest | null;
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
        kind: 'preset',
        newSession: true,
        sessionId: null,
        events: [],
        finished: null,
        contextTokens: null,
        lastActivity: null,
        lastText: null,
        approvals: new Map(),
        pendingApproval: null,
      };
      runs.set(stored.runId, run);
    }
    const { event } = stored;
    switch (event.type) {
      case 'run_started':
        run.prompt = event.prompt;
        // Runs stored before sessions existed have neither field.
        run.kind = event.kind ?? 'preset';
        run.newSession = !event.resumedSessionId;
        break;
      case 'session':
        run.sessionId = event.sessionId;
        break;
      case 'usage':
        run.contextTokens = event.contextTokens;
        break;
      case 'text':
        run.lastText = event.text;
        run.lastActivity = firstLine(event.text);
        break;
      case 'tool_use':
        run.lastActivity = `${toolLabel(event.name)}${event.summary ? ` · ${event.summary}` : ''}`;
        break;
      case 'permission_request':
        run.approvals.set(event.requestId, null);
        break;
      case 'permission_decided':
        run.approvals.set(event.requestId, event.outcome);
        break;
      case 'run_finished':
        run.finished = event;
        break;
    }
    run.events.push(stored);
  }
  for (const run of runs.values()) run.pendingApproval = oldestPending(run);
  return [...runs.values()];
}

function oldestPending(run: RunView): PermissionRequest | null {
  for (const { event } of run.events) {
    if (event.type === 'permission_request' && run.approvals.get(event.requestId) === null) {
      return event;
    }
  }
  return null;
}

export type TabStatus =
  'idle' | 'running' | 'needs_approval' | 'needs_reply' | 'done' | 'failed' | 'stopped';

/** Statuses that wait for the user; shown as an alert badge in the sidebar. */
export const WAITING: readonly TabStatus[] = ['needs_approval', 'needs_reply'];

export function tabStatus(latest: RunView | undefined): TabStatus {
  if (!latest) return 'idle';
  const { finished } = latest;
  if (!finished) return latest.pendingApproval ? 'needs_approval' : 'running';
  if (finished.status === 'stopped') return 'stopped';
  if (finished.status !== 'success') return 'failed';
  return latest.kind !== 'compact' && asksQuestion(latest.lastText) ? 'needs_reply' : 'done';
}

/** Claude was told to end its turn with the question, so a trailing "?" means it is waiting. */
function asksQuestion(text: string | null): boolean {
  return !!text && /\?\s*\**\s*$/.test(text.trim());
}

/** mcp__playwright__browser_click → "browser_click (playwright)". */
export function toolLabel(name: string): string {
  const [prefix, server, tool] = name.split('__');
  if (prefix !== 'mcp' || !server || !tool) return name;
  return `${tool} (${server.replace(/^claude_ai_/, '')})`;
}

export function firstLine(text: string, max = 140): string {
  const line =
    text
      .trim()
      .split('\n')
      .find((l) => l.trim()) ?? '';
  const clean = line.replace(/[#*`>|]/g, '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

export function formatCost(usd: number): string {
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
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

export function shortId(id: string): string {
  return id.slice(0, 8);
}
