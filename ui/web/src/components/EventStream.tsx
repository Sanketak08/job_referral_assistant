import type { RunEvent, RunFinishedEvent } from '@jobhunt/shared';
import { useEffect, useRef } from 'react';
import {
  formatCost,
  formatDuration,
  formatTime,
  formatTokens,
  toolLabel,
  type RunView,
} from '../tabs/runs.ts';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';

type ToolUse = Extract<RunEvent, { type: 'tool_use' }>;
type ToolResult = Extract<RunEvent, { type: 'tool_result' }>;

/** Distance from the bottom (px) within which new output keeps the view pinned to the end. */
const STICKY_SCROLL_PX = 120;

export function EventStream({ runs, emptyText }: { runs: RunView[]; emptyText: string }) {
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
        <RunBlock key={run.runId} run={run} />
      ))}
    </div>
  );
}

function RunBlock({ run }: { run: RunView }) {
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
          case 'tool_use':
            return (
              <ToolCall
                key={id}
                use={event}
                result={results.get(event.toolUseId)}
                running={!run.finished}
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
