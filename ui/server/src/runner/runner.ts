import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import type { RunFinishedEvent, RunKind, TabId } from '@jobhunt/shared';
import { APPROVAL_TIMEOUT_MS, CLAUDE_BIN, REPO_ROOT, type TabPreset } from '../config.ts';
import { recordEvent as record } from '../events.ts';
import { broadcast } from '../live.ts';
import { cancelApprovals } from '../mcp/approvals.ts';
import { createParser } from '../parser/parse.ts';
import * as store from '../store/db.ts';
import { buildArgs } from './args.ts';

interface ActiveRun {
  runId: number;
  tab: TabId;
  child: ChildProcessWithoutNullStreams;
  stopRequested: boolean;
  /** The CLI's own result line. Recorded only when the process exits, so the Run button stays
   *  disabled until MCP servers have shut down. */
  result: RunFinishedEvent | null;
  stderrTail: string;
}

export interface RunOptions {
  kind: RunKind;
  prompt: string;
  /** Continue this Claude session; null starts a new one. */
  resumeSessionId: string | null;
}

const STOP_GRACE_MS = 5000;
const STDERR_TAIL_CHARS = 2000;

const active = new Map<TabId, ActiveRun>();

export function isRunning(tab: TabId): boolean {
  return active.has(tab);
}

export function startRun(tab: TabPreset, { kind, prompt, resumeSessionId }: RunOptions): number {
  if (active.has(tab.id)) throw new Error(`${tab.label} is already running`);

  const runId = store.createRun(tab.id, kind, prompt);
  record(runId, tab.id, { type: 'run_started', prompt, kind, resumedSessionId: resumeSessionId });

  const child = spawn(CLAUDE_BIN, buildArgs(tab, runId, resumeSessionId), {
    cwd: REPO_ROOT,
    env: claudeEnv(),
  });
  const run: ActiveRun = {
    runId,
    tab: tab.id,
    child,
    stopRequested: false,
    result: null,
    stderrTail: '',
  };
  active.set(tab.id, run);

  // EPIPE here means the process already exited; 'close' reports that, so don't crash on it.
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);

  const parse = createParser();
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    for (const event of parse(line)) {
      if (event.type === 'run_finished') {
        run.result = event;
        continue;
      }
      if (event.type === 'session') {
        store.setRunSession(runId, event.sessionId);
        setTabSession(tab.id, event.sessionId);
      }
      record(runId, tab.id, event);
    }
  });

  readline.createInterface({ input: child.stderr }).on('line', (line) => {
    run.stderrTail = `${run.stderrTail}${line}\n`.slice(-STDERR_TAIL_CHARS);
    record(runId, tab.id, { type: 'log', text: line });
  });

  child.on('error', (err) => {
    run.stderrTail += `Could not start ${CLAUDE_BIN}: ${err.message}`;
    // A process that never spawned emits no 'close', so finish here.
    if (child.pid === undefined) finish(run, null);
  });
  child.on('close', (code) => finish(run, code));

  return runId;
}

/** Interrupts the run like Ctrl+C. The Claude session stays on disk and can be resumed. */
export function stopRun(tab: TabId): boolean {
  const run = active.get(tab);
  if (!run) return false;
  run.stopRequested = true;
  run.child.kill('SIGINT');
  setTimeout(() => {
    if (active.get(tab) === run) run.child.kill('SIGKILL');
  }, STOP_GRACE_MS).unref();
  return true;
}

export function setTabSession(tab: TabId, sessionId: string | null): void {
  store.setTabSession(tab, sessionId);
  broadcast({ type: 'session', tab, sessionId });
}

function finish(run: ActiveRun, exitCode: number | null): void {
  if (active.get(run.tab) !== run) return;
  active.delete(run.tab);
  cancelApprovals(run.runId);

  const event: RunFinishedEvent = run.stopRequested
    ? { ...emptyResult(), ...run.result, status: 'stopped' }
    : (run.result ?? {
        ...emptyResult(),
        status: 'error',
        result: run.stderrTail.trim() || `${CLAUDE_BIN} exited with code ${exitCode}`,
      });

  store.finishRun(run.runId, event.status, event.costUsd);
  record(run.runId, run.tab, event);
}

function emptyResult(): RunFinishedEvent {
  return {
    type: 'run_finished',
    status: 'error',
    result: null,
    costUsd: null,
    durationMs: null,
    numTurns: null,
  };
}

function claudeEnv(): NodeJS.ProcessEnv {
  // With ANTHROPIC_API_KEY set, Claude Code bills the API instead of the Max plan.
  const env: NodeJS.ProcessEnv = { ...process.env, MCP_TOOL_TIMEOUT: String(APPROVAL_TIMEOUT_MS) };
  delete env.ANTHROPIC_API_KEY;
  return env;
}
