import { useState, type KeyboardEvent } from 'react';
import { formatTokens, shortId } from '../tabs/runs.ts';
import { Icon } from './Icon.tsx';

interface Props {
  busy: boolean;
  sessionId: string | null;
  contextTokens: number | null;
  /** Resolves when the server accepted the message; rejects with the reason otherwise. */
  onSend: (text: string) => Promise<unknown>;
}

/** The chat box. Enter sends, Shift+Enter adds a line. */
export function Composer({ busy, sessionId, contextTokens, onSend }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = (): void => {
    const message = text.trim();
    if (!message || busy || sending) return;
    setSending(true);
    onSend(message)
      .then(() => setText(''))
      .catch(() => {
        // The tab shows the error; keep the text so it can be sent again.
      })
      .finally(() => setSending(false));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          value={text}
          rows={1}
          placeholder={
            busy
              ? 'Claude is working. Stop the run to send a new message.'
              : 'Reply to Claude or ask anything…'
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          className="btn btn-primary btn-icon"
          disabled={busy || sending || !text.trim()}
          onClick={send}
          aria-label="Send"
        >
          <Icon name="arrowUp" size={18} />
        </button>
      </div>
      <div className="composer-hint">
        {sessionId ? (
          <>
            Continues session <code>{shortId(sessionId)}</code>
            {contextTokens !== null && <> · ctx {formatTokens(contextTokens)}</>}
          </>
        ) : (
          'Starts a new session'
        )}
        <span className="composer-keys">Enter to send · Shift+Enter for a new line</span>
      </div>
    </div>
  );
}
