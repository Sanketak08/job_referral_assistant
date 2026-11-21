import type { EditRequest } from '@jobhunt/shared';
import { useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { tabStatus, type RunView } from '../tabs/runs.ts';
import { Composer } from './Composer.tsx';
import { Dialog } from './Dialog.tsx';
import { EventStream } from './EventStream.tsx';
import { Icon } from './Icon.tsx';

/** The editor runner's runs and session, shared by every "Edit with Claude" panel. */
export interface EditorState {
  runs: RunView[];
  sessionId: string | null;
}

interface Props {
  title: string;
  intro: ReactNode;
  target: EditRequest['target'];
  /** Starting points; tapping one fills the request box. */
  examples: string[];
  editor: EditorState;
  onClose: () => void;
}

const WORKING = ['running', 'needs_approval'];

/**
 * Describe a change in plain words and Claude makes it (profile.yaml or a skill). After the
 * first request the panel becomes a small chat with that edit session, so Claude can ask back.
 */
export function EditWithClaude({ title, intro, target, examples, editor, onClose }: Props) {
  const [request, setRequest] = useState('');
  const [firstRunId, setFirstRunId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const mine = firstRunId === null ? [] : editor.runs.filter((r) => r.runId >= firstRunId);
  const latest = mine.at(-1);
  const working = latest !== undefined && WORKING.includes(tabStatus(latest));
  // Another panel's edit is still running; the editor handles one edit at a time.
  const otherEditRunning = firstRunId === null && WORKING.includes(tabStatus(editor.runs.at(-1)));

  const guard = async <T,>(call: () => Promise<T>): Promise<T> => {
    setError(null);
    try {
      return await call();
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  };

  const start = (): void => {
    setStarting(true);
    guard(() => api.edit(target, request))
      .then(({ runId }) => setFirstRunId(runId))
      .catch(() => {})
      .finally(() => setStarting(false));
  };

  const footer =
    firstRunId === null ? (
      <>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-dark"
          disabled={!request.trim() || starting || otherEditRunning}
          onClick={start}
        >
          <Icon name="sparkle" size={14} /> Ask Claude
        </button>
      </>
    ) : (
      <>
        {working && (
          <button
            className="btn btn-danger"
            onClick={() => void guard(() => api.stop('editor')).catch(() => {})}
          >
            <Icon name="stop" size={13} /> Stop
          </button>
        )}
        <button className="btn btn-dark" onClick={onClose}>
          {working ? 'Close (keeps working)' : 'Done'}
        </button>
      </>
    );

  return (
    <Dialog title={title} wide onClose={onClose} footer={footer}>
      {error && (
        <div className="alert">
          <Icon name="alert" size={16} /> {error}
        </div>
      )}
      {firstRunId === null ? (
        <div className="edit-start">
          <div className="muted edit-intro">{intro}</div>
          {otherEditRunning && (
            <div className="alert">
              Claude is still finishing another edit. Try again in a moment.
            </div>
          )}
          <textarea
            className="input"
            rows={4}
            autoFocus
            placeholder="Describe the change in plain words…"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && request.trim()) start();
            }}
          />
          <div className="chips">
            {examples.map((example) => (
              <button key={example} className="chip" onClick={() => setRequest(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="dialog-stream edit-stream">
          <EventStream
            runs={mine}
            emptyText="Starting Claude…"
            onDecide={(requestId, allow) => guard(() => api.approve(requestId, allow))}
          />
          <Composer
            running={working}
            sessionId={editor.sessionId}
            contextTokens={null}
            onSend={(text) => guard(() => api.message('editor', text))}
          />
        </div>
      )}
    </Dialog>
  );
}
