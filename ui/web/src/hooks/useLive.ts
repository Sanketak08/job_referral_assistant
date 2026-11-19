import type { ServerMessage, StoredEvent } from '@jobhunt/shared';
import { useEffect, useState } from 'react';

const RECONNECT_MS = 2000;

/** Keeps every tab's events in sync over the /ws channel, reconnecting when it drops. */
export function useLive(): { events: StoredEvent[]; connected: boolean } {
  const [events, setEvents] = useState<StoredEvent[]>([]);
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
        // Each connection starts with a full snapshot, so a reconnect never leaves gaps.
        if (msg.type === 'snapshot') setEvents(msg.events);
        else setEvents((prev) => [...prev, msg.event]);
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

  return { events, connected };
}
