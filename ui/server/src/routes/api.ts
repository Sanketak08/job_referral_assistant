import type { ApiError, AppInfo, MessageRequest, RunRequest } from '@jobhunt/shared';
import { Router, type Request, type Response } from 'express';
import { COMPACT_PROMPT, findTab, TABS, type TabPreset } from '../config.ts';
import { readFirstName } from '../files/profile.ts';
import { isRunning, setTabSession, startRun, stopRun } from '../runner/runner.ts';
import { getTabSession } from '../store/db.ts';

export const apiRouter = Router();

type Reply<T> = Response<T | ApiError>;

apiRouter.get('/app', (_req, res: Response<AppInfo>) => {
  res.json({
    tabs: TABS.map(({ id, label, model, presetLabel, presetPrompt, description, mcpServers }) => ({
      id,
      label,
      model,
      presetLabel,
      presetPrompt,
      description,
      mcpServers: [...mcpServers],
    })),
    userName: readFirstName(),
  });
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
    const custom = req.body.prompt?.trim();
    const runId = startRun(tab, {
      kind: custom ? 'custom' : 'preset',
      prompt: custom || tab.presetPrompt,
      resumeSessionId: null,
    });
    res.status(202).json({ runId });
  },
);

/** Chat box: continues the tab's current session, or starts one after "New session". */
apiRouter.post(
  '/tabs/:tab/message',
  (req: Request<{ tab: string }, unknown, MessageRequest>, res: Reply<{ runId: number }>) => {
    const tab = tabFor(req, res, true);
    if (!tab) return;
    const text = req.body.text?.trim();
    if (!text) return void res.status(400).json({ error: 'Message is empty' });
    const runId = startRun(tab, {
      kind: 'message',
      prompt: text,
      resumeSessionId: getTabSession(tab.id),
    });
    res.status(202).json({ runId });
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
