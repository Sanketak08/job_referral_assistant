import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RunEvent, RunKind, RunStatus, StoredEvent, TabId } from '@jobhunt/shared';
import { DB_PATH } from '../config.ts';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY,
    tab         TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'preset',
    prompt      TEXT NOT NULL,
    status      TEXT NOT NULL,   -- 'running' or a RunStatus
    session_id  TEXT,
    cost_usd    REAL,
    started_at  TEXT NOT NULL,
    ended_at    TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY,
    run_id  INTEGER NOT NULL REFERENCES runs(id),
    tab     TEXT NOT NULL,
    at      TEXT NOT NULL,
    data    TEXT NOT NULL        -- RunEvent as JSON
  );
  CREATE INDEX IF NOT EXISTS events_by_run ON events(run_id, id);
  -- The session each tab's chat box continues. A NULL session_id means "start a new one".
  CREATE TABLE IF NOT EXISTS tab_sessions (
    tab         TEXT PRIMARY KEY,
    session_id  TEXT
  );
`);

// Databases created before runs.kind existed.
const runColumns = db.prepare('PRAGMA table_info(runs)').all() as unknown as { name: string }[];
if (!runColumns.some((c) => c.name === 'kind')) {
  db.exec(`ALTER TABLE runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'preset'`);
}

interface EventRow {
  id: number;
  run_id: number;
  tab: TabId;
  at: string;
  data: string;
}

const now = (): string => new Date().toISOString();

export function createRun(tab: TabId, kind: RunKind, prompt: string): number {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO runs (tab, kind, prompt, status, started_at) VALUES (?, ?, ?, 'running', ?)`,
    )
    .run(tab, kind, prompt, now());
  return Number(lastInsertRowid);
}

export function setRunSession(runId: number, sessionId: string): void {
  db.prepare('UPDATE runs SET session_id = ? WHERE id = ?').run(sessionId, runId);
}

export function finishRun(runId: number, status: RunStatus, costUsd: number | null): void {
  db.prepare('UPDATE runs SET status = ?, cost_usd = ?, ended_at = ? WHERE id = ?').run(
    status,
    costUsd,
    now(),
    runId,
  );
}

export function addEvent(runId: number, tab: TabId, event: RunEvent): StoredEvent {
  const at = now();
  const { lastInsertRowid } = db
    .prepare('INSERT INTO events (run_id, tab, at, data) VALUES (?, ?, ?, ?)')
    .run(runId, tab, at, JSON.stringify(event));
  return { id: Number(lastInsertRowid), runId, tab, at, event };
}

/** All events of the tab's latest runs, oldest first. */
export function recentEvents(tab: TabId, runLimit: number): StoredEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM events WHERE run_id IN
         (SELECT id FROM runs WHERE tab = ? ORDER BY id DESC LIMIT ?)
       ORDER BY id`,
    )
    .all(tab, runLimit) as unknown as EventRow[];
  return rows.map(toStoredEvent);
}

function toStoredEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    runId: row.run_id,
    tab: row.tab,
    at: row.at,
    event: JSON.parse(row.data) as RunEvent,
  };
}

export function getTabSession(tab: TabId): string | null {
  const row = db.prepare('SELECT session_id FROM tab_sessions WHERE tab = ?').get(tab) as
    { session_id: string | null } | undefined;
  return row?.session_id ?? null;
}

export function setTabSession(tab: TabId, sessionId: string | null): void {
  db.prepare(
    `INSERT INTO tab_sessions (tab, session_id) VALUES (?, ?)
     ON CONFLICT(tab) DO UPDATE SET session_id = excluded.session_id`,
  ).run(tab, sessionId);
}

/** Runs still marked running belong to a previous server process; close them. */
export function closeInterruptedRuns(): void {
  const rows = db.prepare(`SELECT id, tab FROM runs WHERE status = 'running'`).all() as unknown as {
    id: number;
    tab: TabId;
  }[];
  for (const { id, tab } of rows) {
    addEvent(id, tab, {
      type: 'run_finished',
      status: 'interrupted',
      result: 'The server stopped while this run was in progress.',
      costUsd: null,
      durationMs: null,
      numTurns: null,
    });
    finishRun(id, 'interrupted', null);
  }
}
