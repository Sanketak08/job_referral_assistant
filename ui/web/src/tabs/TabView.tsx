import type { TabInfo } from '@jobhunt/shared';
import { useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { Composer } from '../components/Composer.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { EventStream } from '../components/EventStream.tsx';
import { Icon } from '../components/Icon.tsx';
import { RunMenu } from '../components/RunMenu.tsx';
import { Banner } from './Banner.tsx';
import { tabStatus, type RunView } from './runs.ts';

interface Props {
  info: TabInfo;
  runs: RunView[];
  sessionId: string | null;
}

const STATUS_TEXT = {
  idle: 'Idle',
  running: 'Running',
  needs_reply: 'Waiting for your reply',
  done: 'Idle',
  failed: 'Last run failed',
  stopped: 'Stopped',
} as const;

/** One component for every pipeline tab; the differences come from TabInfo. */
export function TabView({ info, runs, sessionId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const latest = runs.at(-1);
  const status = tabStatus(latest);
  const busy = status === 'running';
  const contextTokens = sessionId ? (latest?.contextTokens ?? null) : null;

  /** Runs an API call, showing its error in the tab. Rethrows so callers can react. */
  const act = async <T,>(call: () => Promise<T>): Promise<T> => {
    setError(null);
    try {
      return await call();
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  };
  const fire = (call: () => Promise<unknown>) => () => void act(call).catch(() => {});

  return (
    <div className="card tab-card">
      <div className="card-toolbar">
        <span className={`pill pill-${status}`}>
          {busy ? <span className="spinner" /> : <span className="status-dot" />}
          {STATUS_TEXT[status]}
        </span>
        <div className="toolbar-actions">
          <button
            className="btn"
            disabled={busy || !sessionId}
            onClick={fire(() => api.newSession(info.id))}
            title="Clear context: the next message starts a new Claude session"
          >
            <Icon name="plus" size={15} /> <span className="btn-text">New session</span>
          </button>
          <button
            className="btn"
            disabled={busy || !sessionId}
            onClick={fire(() => api.compact(info.id))}
            title="Summarise the session with /compact to free up context"
          >
            <Icon name="compress" size={15} /> <span className="btn-text">Compact</span>
          </button>
          {busy && (
            <button className="btn btn-danger" onClick={fire(() => api.stop(info.id))}>
              <Icon name="stop" size={13} /> Stop
            </button>
          )}
          <RunMenu
            presetLabel={info.presetLabel}
            disabled={busy}
            onPreset={fire(() => api.run(info.id))}
            onCustom={() => setCustomOpen(true)}
          />
        </div>
      </div>

      <Banner info={info} status={status} latest={latest} />

      {error && (
        <div className="alert">
          <Icon name="alert" size={16} /> {error}
        </div>
      )}

      <section className="activity">
        <div className="section-head">
          <h3>Activity</h3>
        </div>
        <EventStream runs={runs} emptyText={`No runs yet. Press "${info.presetLabel}" to start.`} />
        <Composer
          busy={busy}
          sessionId={sessionId}
          contextTokens={contextTokens}
          onSend={(text) => act(() => api.message(info.id, text))}
        />
      </section>

      {customOpen && (
        <CustomRunDialog
          info={info}
          onClose={() => setCustomOpen(false)}
          onStart={(prompt) => act(() => api.run(info.id, prompt)).then(() => setCustomOpen(false))}
        />
      )}
    </div>
  );
}

function CustomRunDialog({
  info,
  onClose,
  onStart,
}: {
  info: TabInfo;
  onClose: () => void;
  onStart: (prompt: string) => Promise<unknown>;
}) {
  const [prompt, setPrompt] = useState(`${info.presetPrompt} `);
  const [starting, setStarting] = useState(false);
  const start = (): void => {
    setStarting(true);
    onStart(prompt).catch(() => setStarting(false));
  };

  return (
    <Dialog
      title="Run with custom input"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark" disabled={!prompt.trim() || starting} onClick={start}>
            <Icon name="play" size={14} /> Start run
          </button>
        </>
      }
    >
      <p className="muted">
        Starts a new session with this prompt. Keep the skill command at the start and add your
        instructions after it, for example "only Amsterdam, Java and Kafka, last 48 hours".
      </p>
      <textarea
        className="input"
        rows={5}
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
    </Dialog>
  );
}
