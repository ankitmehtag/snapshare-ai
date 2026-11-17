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

/**
 * fetch wrapper used by every query/mutation:
 * - sends cookies (HttpOnly session cookies — ADR-008)
 * - adds the double-submit CSRF header on state-changing requests
 * - turns RFC 9457 problem responses into ApiError
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
