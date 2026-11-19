import type { ApprovalOutcome, RunEvent, RunFinishedEvent } from '@jobhunt/shared';
import { useEffect, useRef, useState } from 'react';
import {
  formatCost,
  formatDuration,
  formatTime,
  formatTokens,
  toolLabel,
  type PermissionRequest,
  type RunView,
} from '../tabs/runs.ts';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';

type ToolUse = Extract<RunEvent, { type: 'tool_use' }>;
type ToolResult = Extract<RunEvent, { type: 'tool_result' }>;

/** Distance from the bottom (px) within which new output keeps the view pinned to the end. */
const STICKY_SCROLL_PX = 120;

/** Answers a permission request; rejects with the reason if the server refused. */
export type DecideApproval = (requestId: string, allow: boolean) => Promise<unknown>;

interface Props {
  runs: RunView[];
  emptyText: string;
  onDecide: DecideApproval;
}

export function EventStream({ runs, emptyText, onDecide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Follow new output only while the user is at the bottom, so reading older output is not
  // interrupted.
  const pinned = useRef(true);
  const eventCount = runs.reduce((n, run) => n + run.events.length, 0);

  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [eventCount]);

  const onScroll = (): void => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_SCROLL_PX;
  };

  return (
    <div className="stream" ref={ref} onScroll={onScroll}>
      {runs.length === 0 && (
        <div className="empty">
          <Icon name="sparkle" size={22} />
          <p>{emptyText}</p>
        </div>
      )}
      {runs.map((run) => (
        <RunBlock key={run.runId} run={run} onDecide={onDecide} />
      ))}
    </div>
  );
}

function RunBlock({ run, onDecide }: { run: RunView; onDecide: DecideApproval }) {
  const results = new Map<string, ToolResult>();
  for (const { event } of run.events) {
    if (event.type === 'tool_result') results.set(event.toolUseId, event);
  }

  return (
    <section className="run">
      {run.newSession && (
        <div className="divider">
          <span>New session · {formatTime(run.startedAt)}</span>
        </div>
      )}
      <RunPrompt run={run} />
      {run.events.map(({ id, event }) => {
        switch (event.type) {
          case 'text':
            return (
              <div key={id} className="msg-claude">
                <Markdown text={event.text} />
              </div>
            );
          case 'tool_use': {
            const result = results.get(event.toolUseId);
            return (
              <div key={id}>
                <ToolCall use={event} result={result} running={!run.finished} />
                {!!result?.images?.length && <Screenshots images={result.images} />}
              </div>
            );
          }
          case 'permission_request':
            return (
              <ApprovalCard
                key={id}
                request={event}
                outcome={run.approvals.get(event.requestId) ?? null}
                onDecide={onDecide}
              />
            );
          case 'compacted':
            return (
              <div key={id} className="note">
                <Icon name="compress" size={14} /> Context compacted:{' '}
                {formatTokens(event.preTokens)} → {formatTokens(event.postTokens)} tokens of
                conversation
              </div>
            );
          case 'user_message':
            return (
              <div key={id} className="msg-user">
                <span className="msg-label">Sent while Claude was working</span>
                {event.text}
              </div>
            );
          case 'log':
            return (
              <div key={id} className="log">
                {event.text}
              </div>
            );
          default:
            return null;
        }
      })}
      {run.finished ? (
        <RunFooter finished={run.finished} contextTokens={run.contextTokens} />
      ) : (
        <div className="working">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Claude is working…
        </div>
      )}
    </section>
  );
}

function RunPrompt({ run }: { run: RunView }) {
  if (run.kind === 'compact') {
    return (
      <div className="note">
        <Icon name="compress" size={14} /> Compacting context…
      </div>
    );
  }
  if (run.kind === 'preset') {
    return (
      <div className="msg-user preset">
        <Icon name="play" size={12} /> <code>{run.prompt}</code>
      </div>
    );
  }
  return (
    <div className="msg-user">
      {run.kind === 'custom' && <span className="msg-label">Custom run</span>}
      {run.kind === 'handoff' && <span className="msg-label">Sent from Matches</span>}
      {run.prompt}
    </div>
  );
}

function ToolCall({
  use,
  result,
  running,
}: {
  use: ToolUse;
  result: ToolResult | undefined;
  running: boolean;
}) {
  const state = result ? (result.isError ? 'error' : 'done') : running ? 'pending' : 'unanswered';
  return (
    <details className={`tool tool-${state}`}>
      <summary>
        <span className="tool-icon">
          {state === 'pending' ? <span className="spinner" /> : <Icon name="terminal" size={13} />}
        </span>
        <span className="tool-name">{toolLabel(use.name)}</span>
        {use.summary && <span className="tool-summary">{use.summary}</span>}
      </summary>
      <pre>{use.input}</pre>
      {result && <pre className="tool-result">{result.content || '(no output)'}</pre>}
    </details>
  );
}

/** Screenshots stay visible outside the collapsed tool row, so a form can be reviewed at once. */
function Screenshots({ images }: { images: string[] }) {
  // Browsers block opening data: URLs in a new tab, so tapping enlarges the image in place.
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={expanded ? 'shots expanded' : 'shots'}>
      {images.map((src, i) => (
        <button
          key={i}
          onClick={() => setExpanded((e) => !e)}
          title={expanded ? 'Shrink' : 'Show full size'}
        >
          <img src={src} alt={`Screenshot ${i + 1}`} loading="lazy" />
        </button>
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<RunFinishedEvent['status'], string> = {
  success: 'Finished',
  error: 'Failed',
  stopped: 'Stopped',
  interrupted: 'Interrupted',
};

function RunFooter({
  finished,
  contextTokens,
}: {
  finished: RunFinishedEvent;
  contextTokens: number | null;
}) {
  const details = [
    finished.durationMs !== null && formatDuration(finished.durationMs),
    finished.numTurns !== null &&
      `${finished.numTurns} ${finished.numTurns === 1 ? 'turn' : 'turns'}`,
    finished.costUsd !== null && `${formatCost(finished.costUsd)} at API rates`,
    contextTokens !== null && `ctx ${formatTokens(contextTokens)}`,
  ].filter(Boolean);

  return (
    <footer className={`run-footer status-${finished.status}`}>
      <span className="status-dot" />
      <strong>{STATUS_LABEL[finished.status]}</strong>
      {details.length > 0 && <span> · {details.join(' · ')}</span>}
      {/* A stopped run's result is just Claude's last message, already shown above. */}
      {(finished.status === 'error' || finished.status === 'interrupted') && finished.result && (
        <pre className="run-error">{finished.result}</pre>
      )}
    </footer>
  );
}

const OUTCOME_LABEL: Record<ApprovalOutcome, string> = {
  allowed: 'Allowed',
  denied: 'Denied',
  cancelled: 'Expired',
};

function ApprovalCard({
  request,
  outcome,
  onDecide,
}: {
  request: PermissionRequest;
  outcome: ApprovalOutcome | null;
  onDecide: DecideApproval;
}) {
  const [sending, setSending] = useState(false);
  const decide = (allow: boolean) => () => {
    setSending(true);
    onDecide(request.requestId, allow).catch(() => setSending(false));
  };

  return (
    <div className={`approval approval-${outcome ?? 'pending'}`}>
      <div className="approval-head">
        <Icon name="shield" size={16} />
        <strong>Claude wants to use {toolLabel(request.toolName)}</strong>
        {outcome && <span className={`tag tag-${outcome}`}>{OUTCOME_LABEL[outcome]}</span>}
      </div>
      <dl className="approval-fields">
        {inputFields(request.input).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {outcome === null && (
        <div className="approval-actions">
          <button className="btn btn-sm" disabled={sending} onClick={decide(false)}>
            <Icon name="x" size={14} /> Deny
          </button>
          <button className="btn btn-sm btn-primary" disabled={sending} onClick={decide(true)}>
            <Icon name="check" size={14} /> Allow
          </button>
        </div>
      )}
    </div>
  );
}

/** The tool input as label/value pairs, e.g. to_email, subject, body for an email. */
function inputFields(input: string): [string, string][] {
  try {
    const value: unknown = JSON.parse(input);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).map(([k, v]) => [
        k.replace(/_/g, ' '),
        typeof v === 'string' ? v : JSON.stringify(v, null, 2),
      ]);
    }
  } catch {
    // Truncated or not JSON: show it as is.
  }
  return [['input', input]];
}
