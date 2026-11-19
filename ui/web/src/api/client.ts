import type { ApiError, AppInfo, TabId } from '@jobhunt/shared';

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as ApiError | null)?.error ?? `${method} ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

type Started = Promise<{ runId: number }>;

export const api = {
  app: () => request<AppInfo>('GET', '/app'),
  run: (tab: TabId, prompt?: string): Started => request('POST', `/tabs/${tab}/run`, { prompt }),
  message: (tab: TabId, text: string): Started => request('POST', `/tabs/${tab}/message`, { text }),
  compact: (tab: TabId): Started => request('POST', `/tabs/${tab}/compact`),
  newSession: (tab: TabId) => request<{ ok: true }>('POST', `/tabs/${tab}/new-session`),
  stop: (tab: TabId) => request<{ stopped: boolean }>('POST', `/tabs/${tab}/stop`),
};

/** Turns any thrown value into a message for the UI. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
