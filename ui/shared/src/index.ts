// Types shared by the server and the web app. Types only, so nothing here exists at runtime.

export type TabId = 'search' | 'apply' | 'referral';

/** What the web app needs to know about a tab. The full preset lives in server/src/config.ts. */
export interface TabInfo {
  id: TabId;
  label: string;
  model: string;
  presetLabel: string;
}

export type RunStatus = 'success' | 'error' | 'stopped' | 'interrupted';

export interface RunFinishedEvent {
  type: 'run_finished';
  status: RunStatus;
  /** Claude's final message, or the error text. */
  result: string | null;
  costUsd: number | null;
  durationMs: number | null;
  numTurns: number | null;
}

/** One thing that happened during a run, reduced from Claude's stream-json output. */
export type RunEvent =
  | { type: 'run_started'; prompt: string }
  | { type: 'session'; sessionId: string; model: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolUseId: string; name: string; summary: string; input: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  /** Tokens Claude currently holds in context (latest main-agent API call). */
  | { type: 'usage'; contextTokens: number }
  /** A line from stderr or stdout that was not stream-json. */
  | { type: 'log'; text: string }
  | RunFinishedEvent;

export interface StoredEvent {
  id: number;
  runId: number;
  tab: TabId;
  /** ISO timestamp. */
  at: string;
  event: RunEvent;
}

/** Messages on the single WebSocket channel (/ws), server to browser only. */
export type ServerMessage =
  { type: 'snapshot'; events: StoredEvent[] } | { type: 'event'; event: StoredEvent };

export interface ApiError {
  error: string;
}
