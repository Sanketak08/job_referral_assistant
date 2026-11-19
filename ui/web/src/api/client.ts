import type { ApiError, TabId, TabInfo } from '@jobhunt/shared';

async function request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { method });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as ApiError | null)?.error ?? `${method} ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  tabs: () => request<TabInfo[]>('GET', '/tabs'),
  run: (tab: TabId) => request<{ runId: number }>('POST', `/tabs/${tab}/run`),
  stop: (tab: TabId) => request<{ stopped: boolean }>('POST', `/tabs/${tab}/stop`),
};
