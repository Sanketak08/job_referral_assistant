import type { Server } from 'node:http';
import type { ServerMessage } from '@jobhunt/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { IS_DEV } from './config.ts';

const wss = new WebSocketServer({ noServer: true });

/**
 * Serves the one WebSocket channel at /ws. Each new connection first gets a snapshot, then
 * every new event. Node is single-threaded, so nothing can slip in between the two.
 */
export function attachLive(server: Server, snapshot: () => ServerMessage): void {
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => ws.send(JSON.stringify(snapshot())));
    } else if (!IS_DEV) {
      // In dev, Vite's hot-reload socket handles other paths.
      socket.destroy();
    }
  });
}

export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}
