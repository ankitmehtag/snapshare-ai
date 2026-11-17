import type { Paginated, Problem } from '@snapshare/types';

/** API base: same-origin `/api/v1` (proxied by Vite in dev, nginx in production). */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

const CSRF_COOKIE = 'csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.title);
    this.name = 'ApiError';
  }
  get status() {
    return this.problem.status;
  }
  get code() {
    return this.problem.code;
  }
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

let csrfRequest: Promise<void> | undefined;

/** Fetches the double-submit cookie once if the browser doesn't have it yet. */
async function ensureCsrf(): Promise<void> {
  if (readCookie(CSRF_COOKIE)) return;
  csrfRequest ??= request<unknown>('/auth/csrf', {})
    .then(() => undefined)
    .finally(() => {
      csrfRequest = undefined;
    });
  await csrfRequest;
}

let refreshRequest: Promise<boolean> | undefined;

/** One refresh shared by every request that hit TOKEN_EXPIRED at the same time. */
function refreshSession(): Promise<boolean> {
  refreshRequest ??= request<unknown>('/auth/refresh', { method: 'POST' })
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      refreshRequest = undefined;
    });
  return refreshRequest;
}

/** Paths that must never trigger an automatic refresh-and-retry. */
const NO_RETRY = new Set(['/auth/refresh', '/auth/login', '/auth/logout', '/auth/csrf']);

/**
 * fetch wrapper used by every query/mutation:
 * - sends cookies (HttpOnly session cookies — ADR-008)
 * - fetches and adds the double-submit CSRF header on state-changing requests
 * - on TOKEN_EXPIRED, refreshes the session once and retries (API_SPEC §1.3)
 * - turns RFC 9457 problem responses into ApiError
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (!SAFE_METHODS.has(method)) await ensureCsrf();
  try {
    return await request<T>(path, init);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.code === 'TOKEN_EXPIRED' &&
      !NO_RETRY.has(path) &&
      (await refreshSession())
    ) {
      return request<T>(path, init);
    }
    throw err;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, method, headers, credentials: 'include' });
  } catch {
    throw new ApiError({
      type: 'about:blank',
      title: 'You appear to be offline. Check your connection and try again.',
      status: 0,
      code: 'INTERNAL',
    });
  }

  if (res.status === 204) return undefined as T;
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  const body: unknown = isJson ? await res.json() : undefined;
  if (!res.ok) {
    const p = body as Partial<Problem> | undefined;
    throw new ApiError({
      type: p?.type ?? 'about:blank',
      title: p?.title ?? `Request failed (${res.status})`,
      status: res.status,
      code: p?.code ?? 'INTERNAL',
      ...(p?.detail ? { detail: p.detail } : {}),
      ...(p?.requestId ? { requestId: p.requestId } : {}),
      ...(p?.errors ? { errors: p.errors } : {}),
      ...(p?.meta ? { meta: p.meta } : {}),
    });
  }
  return body as T;
}

/** Builds `?limit=&cursor=` for cursor-paginated list endpoints (API_SPEC §1.4). */
export function pageQuery(cursor: string | null | undefined, limit = 50): string {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set('cursor', cursor);
  return `?${q.toString()}`;
}

export const nextCursor = <T>(page: Paginated<T>) =>
  page.page.hasMore ? page.page.nextCursor : null;

/** JSON body helper: `apiFetch(path, json('POST', body))`. */
export const json = (method: 'POST' | 'PATCH' | 'DELETE' | 'PUT', body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
