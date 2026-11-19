import { randomUUID } from 'node:crypto';
import type { ApprovalOutcome, TabId } from '@jobhunt/shared';
import { MAX_TOOL_TEXT } from '../config.ts';
import { recordEvent } from '../events.ts';

interface Pending {
  runId: number;
  tab: TabId;
  resolve: (outcome: ApprovalOutcome) => void;
}

/** Permission requests waiting for a click in the UI, by request id. */
const pending = new Map<string, Pending>();

export interface ApprovalRequest {
  runId: number;
  tab: TabId;
  toolName: string;
  input: unknown;
}

/** Shows an Approve/Deny card and resolves when the user decides (or the run goes away). */
export function requestApproval(req: ApprovalRequest): {
  id: string;
  decision: Promise<ApprovalOutcome>;
} {
  const id = randomUUID();
  const inputText = JSON.stringify(req.input ?? {}, null, 2);
  recordEvent(req.runId, req.tab, {
    type: 'permission_request',
    requestId: id,
    toolName: req.toolName,
    input:
      inputText.length > MAX_TOOL_TEXT * 4
        ? `${inputText.slice(0, MAX_TOOL_TEXT * 4)}…`
        : inputText,
  });
  const decision = new Promise<ApprovalOutcome>((resolve) => {
    pending.set(id, { runId: req.runId, tab: req.tab, resolve });
  });
  return { id, decision };
}

/** Records the outcome and releases the waiting tool call. False if nothing was pending. */
export function decide(id: string, outcome: ApprovalOutcome): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  recordEvent(entry.runId, entry.tab, { type: 'permission_decided', requestId: id, outcome });
  entry.resolve(outcome);
  return true;
}

/** Called when a run ends: nobody can answer its open requests any more. */
export function cancelApprovals(runId: number): void {
  for (const [id, entry] of pending) {
    if (entry.runId === runId) decide(id, 'cancelled');
  }
}
