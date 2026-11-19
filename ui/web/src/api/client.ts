import type {
  ApiError,
  AppInfo,
  JobRef,
  Outputs,
  ProfileFile,
  RunSummary,
  StoredEvent,
  TabId,
} from '@jobhunt/shared';

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
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
  outputs: () => request<Outputs>('GET', '/outputs'),
  run: (tab: TabId, prompt?: string): Started => request('POST', `/tabs/${tab}/run`, { prompt }),
  handoff: (tab: TabId, jobs: JobRef[]): Started => request('POST', `/tabs/${tab}/run`, { jobs }),
  message: (tab: TabId, text: string): Started => request('POST', `/tabs/${tab}/message`, { text }),
  compact: (tab: TabId): Started => request('POST', `/tabs/${tab}/compact`),
  newSession: (tab: TabId) => request<{ ok: true }>('POST', `/tabs/${tab}/new-session`),
  stop: (tab: TabId) => request<{ stopped: boolean }>('POST', `/tabs/${tab}/stop`),
  runs: () => request<RunSummary[]>('GET', '/runs'),
  runEvents: (runId: number) => request<StoredEvent[]>('GET', `/runs/${runId}/events`),
  profile: () => request<ProfileFile>('GET', '/profile'),
  saveProfile: (text: string, baseModifiedAt: number) =>
    request<ProfileFile>('PUT', '/profile', { text, baseModifiedAt }),
  approve: (requestId: string, allow: boolean) =>
    request<{ ok: true }>('POST', `/approvals/${requestId}`, { allow }),
};

/** Turns any thrown value into a message for the UI. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
