import type { ApiError, TabInfo } from '@jobhunt/shared';
import { Router, type Response } from 'express';
import { findTab, TABS } from '../config.ts';
import { isRunning, startRun, stopRun } from '../runner/runner.ts';

export const apiRouter = Router();

apiRouter.get('/tabs', (_req, res: Response<TabInfo[]>) => {
  res.json(TABS.map(({ id, label, model, presetLabel }) => ({ id, label, model, presetLabel })));
});

apiRouter.post('/tabs/:tab/run', (req, res: Response<{ runId: number } | ApiError>) => {
  const tab = findTab(req.params.tab);
  if (!tab) return void res.status(404).json({ error: `Unknown tab: ${req.params.tab}` });
  if (isRunning(tab.id))
    return void res.status(409).json({ error: `${tab.label} is already running` });
  res.status(202).json({ runId: startRun(tab, tab.presetPrompt) });
});

apiRouter.post('/tabs/:tab/stop', (req, res: Response<{ stopped: boolean } | ApiError>) => {
  const tab = findTab(req.params.tab);
  if (!tab) return void res.status(404).json({ error: `Unknown tab: ${req.params.tab}` });
  res.json({ stopped: stopRun(tab.id) });
});
