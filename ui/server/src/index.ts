import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { HISTORY_RUNS_PER_TAB, HOST, IS_DEV, PORT, TABS, WEB_ROOT } from './config.ts';
import { attachLive } from './live.ts';
import { apiRouter } from './routes/api.ts';
import { closeInterruptedRuns, recentEvents } from './store/db.ts';

if (process.env.ANTHROPIC_API_KEY) {
  console.warn(
    'ANTHROPIC_API_KEY is set. It is removed from every claude run so usage stays on the Max plan, but unset it in your shell profile.',
  );
}

closeInterruptedRuns();

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

const server = http.createServer(app);
attachLive(server, () => ({
  type: 'snapshot',
  events: TABS.flatMap((tab) => recentEvents(tab.id, HISTORY_RUNS_PER_TAB)),
}));

if (IS_DEV) {
  // One process and one port in dev too: Vite serves the React app with hot reload.
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: WEB_ROOT,
    appType: 'spa',
    // Load vite.config.ts with Node's own TypeScript support instead of bundling a temp copy.
    configLoader: 'native',
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(WEB_ROOT, 'dist')));
}

server.listen(PORT, HOST, () => {
  console.log(`Job hunt UI: http://${HOST}:${PORT}${IS_DEV ? ' (dev)' : ''}`);
});
