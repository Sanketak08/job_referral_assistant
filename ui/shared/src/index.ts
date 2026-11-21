// Types shared by the server and the web app. Types only, so nothing here exists at runtime.

/** 'editor' runs "Edit with Claude" requests; it is not a pipeline tab. */
export type TabId = 'search' | 'apply' | 'referral' | 'editor';

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
  /** The skill this tab runs, editable with "Edit skill". */
  skill: string | null;
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
export type RunKind = 'preset' | 'custom' | 'handoff' | 'message' | 'compact' | 'edit';

export type RunStatus = 'success' | 'error' | 'stopped' | 'interrupted';

/** cancelled: the run ended or Claude stopped waiting before anyone answered. */
export type ApprovalOutcome = 'allowed' | 'denied' | 'cancelled';

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
  | {
      type: 'run_started';
      prompt: string;
      kind: RunKind;
      resumedSessionId: string | null;
      /** What the UI shows instead of the full prompt (e.g. just the user's edit request). */
      display?: string;
    }
  | { type: 'session'; sessionId: string; model: string }
  | { type: 'text'; text: string }
  /** A chat message sent while the run was already working. */
  | { type: 'user_message'; text: string }
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
  /** Claude wants a tool that needs permission; answer with POST /api/approvals/:requestId. */
  | { type: 'permission_request'; requestId: string; toolName: string; input: string }
  | { type: 'permission_decided'; requestId: string; outcome: ApprovalOutcome }
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
  | { type: 'outputs_changed' }
  /** input/profile.yaml changed on disk (saved here, or edited by Claude). */
  | { type: 'profile_changed' };

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

export interface JobsFileInfo {
  name: string;
  count: number;
}

export interface Outputs {
  /** The daily_jobs CSV the jobs come from (the newest unless another was asked for). */
  jobsFile: string | null;
  /** Every daily_jobs CSV, newest first. */
  jobsFiles: JobsFileInfo[];
  jobs: JobRow[];
  /** Jobs in the newest CSV not applied to yet, for the sidebar badge. */
  newInLatest: number;
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

/** "Edit with Claude": change the profile or a pipeline tab's skill. */
export interface EditRequest {
  target: 'profile' | TabId;
  request: string;
}

export interface ApprovalRequest {
  allow: boolean;
}

export interface MessageRequest {
  text: string;
}

/**
 * new_run: started a run that continues the session. sent: handed to the running Claude.
 * queued: Claude was finishing its turn; the message starts the next run automatically.
 */
export interface MessageResult {
  runId: number;
  delivery: 'new_run' | 'sent' | 'queued';
}

/** One row of the run history. */
export interface RunSummary {
  id: number;
  tab: TabId;
  kind: RunKind;
  prompt: string;
  /** 'running' or a RunStatus. */
  status: RunStatus | 'running';
  sessionId: string | null;
  costUsd: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface ProfileFile {
  text: string;
  /** File modification time (ms), sent back on save to detect edits made in the meantime. */
  modifiedAt: number;
}

export interface SaveProfileRequest {
  text: string;
  baseModifiedAt: number;
}

export interface ApiError {
  error: string;
}
