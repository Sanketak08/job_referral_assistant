// Types shared by the server and the web app. Types only, so nothing here exists at runtime.

export type TabId = 'search' | 'apply' | 'referral';

/** What the web app needs to know about a tab. The full preset lives in server/src/config.ts. */
export interface TabInfo {
  id: TabId;
  label: string;
  model: string;
  presetLabel: string;
  presetPrompt: string;
  /** One line shown in the banner while the tab is idle. */
  description: string;
  /** MCP servers this tab loads, for display. */
  mcpServers: string[];
  /** Jobs from the Matches table can be sent here. */
  acceptsJobs: boolean;
}

export interface AppInfo {
  tabs: TabInfo[];
  /** First name from input/profile.yaml, for the greeting. */
  userName: string | null;
}

/**
 * preset: the tab's main button. custom: Run with custom input. handoff: jobs sent from the
 * Matches table. All three start a new session.
 * message: chat box, continues the current session. compact: /compact on the current session.
 */
export type RunKind = 'preset' | 'custom' | 'handoff' | 'message' | 'compact';

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
  | { type: 'run_started'; prompt: string; kind: RunKind; resumedSessionId: string | null }
  | { type: 'session'; sessionId: string; model: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolUseId: string; name: string; summary: string; input: string }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError: boolean;
      /** Screenshots and other images as data: URLs. Missing on runs stored before images. */
      images?: string[];
    }
  /** Tokens Claude currently holds in context (latest main-agent API call). */
  | { type: 'usage'; contextTokens: number }
  /** /compact finished; token counts exclude the system prompt and tool definitions. */
  | { type: 'compacted'; preTokens: number; postTokens: number }
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

/** The Claude session a tab's chat box continues; null after "New session". */
export type TabSessions = Partial<Record<TabId, string | null>>;

/** Messages on the single WebSocket channel (/ws), server to browser only. */
export type ServerMessage =
  | { type: 'snapshot'; events: StoredEvent[]; sessions: TabSessions }
  | { type: 'event'; event: StoredEvent }
  | { type: 'session'; tab: TabId; sessionId: string | null }
  /** A file in output/ changed; refetch /api/outputs. */
  | { type: 'outputs_changed' };

/** A row of the latest output/daily_jobs_*.csv, marked with what already happened to it. */
export interface JobRow {
  title: string;
  company: string;
  location: string;
  /** As written by the search skill, usually YYYY-MM-DD. */
  datePosted: string;
  matchScore: number | null;
  ranking: number | null;
  source: string;
  link: string;
  /** The link is in applied_jobs.csv. */
  applied: boolean;
  /** Someone at this company is in contacted_people.csv. */
  contacted: boolean;
}

export interface AppliedRow {
  link: string;
  company: string;
  title: string;
  appliedAt: string;
}

export interface ContactRow {
  email: string;
  company: string;
  contactedAt: string;
}

export interface Outputs {
  /** File name of the newest daily_jobs CSV, or null when there is none. */
  jobsFile: string | null;
  jobs: JobRow[];
  applied: AppliedRow[];
  contacted: ContactRow[];
}

export interface RunRequest {
  /** Custom input. Without it (and without jobs) the tab's preset prompt runs. */
  prompt?: string;
  /** Jobs handed over from the Matches table. */
  jobs?: JobRef[];
}

export interface JobRef {
  title: string;
  company: string;
  link: string;
}

export interface MessageRequest {
  text: string;
}

export interface ApiError {
  error: string;
}
