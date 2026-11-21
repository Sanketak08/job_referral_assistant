import type {
  ApiError,
  AppInfo,
  ApprovalRequest,
  EditRequest,
  MessageRequest,
  MessageResult,
  Outputs,
  ProfileFile,
  RunRequest,
  RunSummary,
  SaveProfileRequest,
  StoredEvent,
} from '@jobhunt/shared';
import { Router, type Request, type Response } from 'express';
import {
  COMPACT_PROMPT,
  EDITOR_TAB,
  editPrompt,
  findTab,
  HISTORY_LIMIT,
  TABS,
  type TabPreset,
} from '../config.ts';
import { readOutputs } from '../files/outputs.ts';
import {
  backupProfile,
  ProfileConflictError,
  readFirstName,
  readProfile,
  writeProfile,
} from '../files/profile.ts';
import { decide } from '../mcp/approvals.ts';
import { isRunning, sendToRun, setTabSession, startRun, stopRun } from '../runner/runner.ts';
import { getTabSession, listRuns, runEvents } from '../store/db.ts';

export const apiRouter = Router();

type Reply<T> = Response<T | ApiError>;

apiRouter.get('/app', (_req, res: Response<AppInfo>) => {
  res.json({
    tabs: TABS.filter((tab) => !tab.hidden).map((tab) => ({
      id: tab.id,
      label: tab.label,
      model: tab.model,
      presetLabel: tab.presetLabel,
      presetPrompt: tab.presetPrompt,
      description: tab.description,
      mcpServers: [...tab.mcpServers],
      acceptsJobs: !!tab.handoffPrompt,
      skill: tab.skill ?? null,
    })),
    userName: readFirstName(),
  });
});

apiRouter.get('/outputs', (req: Request, res: Response<Outputs>) => {
  const file = typeof req.query.jobsFile === 'string' ? req.query.jobsFile : undefined;
  res.json(readOutputs(file));
});

/** Resolves :tab and rejects when it is unknown or (for starting runs) busy. */
function tabFor(req: Request<{ tab: string }>, res: Reply<never>, idle: boolean): TabPreset | null {
  const tab = findTab(req.params.tab);
  if (!tab) {
    res.status(404).json({ error: `Unknown tab: ${req.params.tab}` });
    return null;
  }
  if (idle && isRunning(tab.id)) {
    res.status(409).json({ error: `${tab.label} is already running. Stop it or wait.` });
    return null;
  }
  return tab;
}

/** Preset or custom input. Always a new session, like a fresh terminal. */
apiRouter.post(
  '/tabs/:tab/run',
  (req: Request<{ tab: string }, unknown, RunRequest>, res: Reply<{ runId: number }>) => {
    const tab = tabFor(req, res, true);
    if (!tab) return;
    const { prompt, jobs } = req.body;
    if (jobs?.length && !tab.handoffPrompt) {
      return void res.status(400).json({ error: `${tab.label} does not take jobs` });
    }
    const custom = prompt?.trim();
    const runId = startRun(tab, {
      ...(jobs?.length && tab.handoffPrompt
        ? { kind: 'handoff', prompt: tab.handoffPrompt(jobs) }
        : custom
          ? { kind: 'custom', prompt: custom }
          : { kind: 'preset', prompt: tab.presetPrompt }),
      resumeSessionId: null,
    });
    res.status(202).json({ runId });
  },
);

/** Chat box: talks to the running Claude, or continues the tab's session (new after "New session"). */
apiRouter.post(
  '/tabs/:tab/message',
  (req: Request<{ tab: string }, unknown, MessageRequest>, res: Reply<MessageResult>) => {
    const tab = tabFor(req, res, false);
    if (!tab) return;
    const text = req.body.text?.trim();
    if (!text) return void res.status(400).json({ error: 'Message is empty' });
    // While a run is working, the message goes straight to it.
    const live = sendToRun(tab.id, text);
    if (live) return void res.status(202).json(live);
    const runId = startRun(tab, {
      kind: 'message',
      prompt: text,
      resumeSessionId: getTabSession(tab.id),
    });
    res.status(202).json({ runId, delivery: 'new_run' });
  },
);

apiRouter.post(
  '/tabs/:tab/compact',
  (req: Request<{ tab: string }>, res: Reply<{ runId: number }>) => {
    const tab = tabFor(req, res, true);
    if (!tab) return;
    const sessionId = getTabSession(tab.id);
    if (!sessionId) return void res.status(400).json({ error: 'There is no session to compact' });
    const runId = startRun(tab, {
      kind: 'compact',
      prompt: COMPACT_PROMPT,
      resumeSessionId: sessionId,
    });
    res.status(202).json({ runId });
  },
);

/** Clears context: the next chat message starts a new Claude session. */
apiRouter.post(
  '/tabs/:tab/new-session',
  (req: Request<{ tab: string }>, res: Reply<{ ok: true }>) => {
    const tab = tabFor(req, res, true);
    if (!tab) return;
    setTabSession(tab.id, null);
    res.json({ ok: true });
  },
);

apiRouter.post(
  '/tabs/:tab/stop',
  (req: Request<{ tab: string }>, res: Reply<{ stopped: boolean }>) => {
    const tab = tabFor(req, res, false);
    if (!tab) return;
    res.json({ stopped: stopRun(tab.id) });
  },
);

apiRouter.post(
  '/approvals/:id',
  (req: Request<{ id: string }, unknown, ApprovalRequest>, res: Reply<{ ok: true }>) => {
    const done = decide(req.params.id, req.body.allow ? 'allowed' : 'denied');
    if (!done)
      return void res
        .status(404)
        .json({ error: 'This request was already answered or has expired' });
    res.json({ ok: true });
  },
);

apiRouter.get('/runs', (_req, res: Response<RunSummary[]>) => {
  res.json(listRuns(HISTORY_LIMIT));
});

apiRouter.get('/runs/:id/events', (req: Request<{ id: string }>, res: Response<StoredEvent[]>) => {
  res.json(runEvents(Number(req.params.id)));
});

apiRouter.get('/profile', (_req, res: Reply<ProfileFile>) => {
  try {
    res.json(readProfile());
  } catch {
    res
      .status(404)
      .json({ error: 'input/profile.yaml not found. Copy profile.example.yaml first.' });
  }
});

apiRouter.put(
  '/profile',
  (req: Request<unknown, unknown, SaveProfileRequest>, res: Reply<ProfileFile>) => {
    const { text, baseModifiedAt } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
      return void res.status(400).json({ error: 'The profile cannot be empty' });
    }
    try {
      res.json(writeProfile(text, baseModifiedAt));
    } catch (err) {
      if (err instanceof ProfileConflictError)
        return void res.status(409).json({ error: err.message });
      throw err;
    }
  },
);

/** "Edit with Claude": a new editor session that changes the profile or a tab's skill. */
apiRouter.post(
  '/edit',
  (req: Request<unknown, unknown, EditRequest>, res: Reply<{ runId: number }>) => {
    const editor = findTab(EDITOR_TAB);
    const request = req.body.request?.trim();
    if (!editor) return void res.status(500).json({ error: 'Editor is not configured' });
    if (!request) return void res.status(400).json({ error: 'Describe the change you want' });
    if (isRunning(editor.id)) {
      return void res.status(409).json({ error: 'Claude is still working on another edit' });
    }

    let prompt: string;
    if (req.body.target === 'profile') {
      backupProfile();
      prompt = editPrompt({ profile: true }, request);
    } else {
      const skill = findTab(req.body.target)?.skill;
      if (!skill)
        return void res.status(400).json({ error: `Nothing to edit for ${req.body.target}` });
      prompt = editPrompt({ skill }, request);
    }

    const runId = startRun(editor, {
      kind: 'edit',
      prompt,
      display: request,
      resumeSessionId: null,
    });
    res.status(202).json({ runId });
  },
);
