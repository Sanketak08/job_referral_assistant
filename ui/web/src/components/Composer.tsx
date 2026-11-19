import type { MessageResult } from '@jobhunt/shared';
import { useState, type KeyboardEvent } from 'react';
import { formatTokens, shortId } from '../tabs/runs.ts';
import { Icon } from './Icon.tsx';

interface Props {
  /** Claude is working; a message now is read at its next step, like typing in the terminal. */
  running: boolean;
  sessionId: string | null;
  contextTokens: number | null;
  /** Resolves with how the message was delivered; rejects with the reason otherwise. */
  onSend: (text: string) => Promise<MessageResult>;
}

/** The chat box. Enter sends, Shift+Enter adds a line. Works while Claude is running too. */
export function Composer({ running, sessionId, contextTokens, onSend }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);

  const send = (): void => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    onSend(message)
      .then((result) => {
        setText('');
        setQueued(result.delivery === 'queued');
      })
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
            running
              ? 'Add to what Claude is doing… it reads this at its next step'
              : 'Reply to Claude or ask anything…'
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          className="btn btn-primary btn-icon"
          disabled={sending || !text.trim()}
          onClick={send}
          aria-label="Send"
        >
          <Icon name="arrowUp" size={18} />
        </button>
      </div>
      <div className="composer-hint">
        {queued && running ? (
          <span className="composer-queued">
            Claude is wrapping up this turn; your message is sent right after.
          </span>
        ) : sessionId ? (
          <>
            {running ? 'Goes to the running session' : 'Continues session'}{' '}
            <code>{shortId(sessionId)}</code>
            {contextTokens !== null && <> · ctx {formatTokens(contextTokens)}</>}
          </>
        ) : running ? (
          'Goes to the running task'
        ) : (
          'Starts a new session'
        )}
        <span className="composer-keys">Enter to send · Shift+Enter for a new line</span>
      </div>
    </div>
  );
}
