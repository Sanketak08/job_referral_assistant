import type { ServerMessage, StoredEvent, TabSessions } from '@jobhunt/shared';
import { useEffect, useState } from 'react';

const RECONNECT_MS = 2000;

export interface LiveState {
  events: StoredEvent[];
  sessions: TabSessions;
  connected: boolean;
}

/** Keeps every tab's events and sessions in sync over the /ws channel, reconnecting on drops. */
export function useLive(): LiveState {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [sessions, setSessions] = useState<TabSessions>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: number | undefined;
    let disposed = false;

    const connect = (): void => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws`);
      socket.onopen = () => setConnected(true);
      socket.onmessage = (e: MessageEvent<string>) => {
        const msg = JSON.parse(e.data) as ServerMessage;
        switch (msg.type) {
          // Each connection starts with a full snapshot, so a reconnect never leaves gaps.
          case 'snapshot':
            setEvents(msg.events);
            setSessions(msg.sessions);
            break;
          case 'event':
            setEvents((prev) => [...prev, msg.event]);
            break;
          case 'session':
            setSessions((prev) => ({ ...prev, [msg.tab]: msg.sessionId }));
            break;
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) retry = window.setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return { events, sessions, connected };
}
