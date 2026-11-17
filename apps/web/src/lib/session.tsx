import { LoadingSkeleton } from '@snapshare/ui';
import type { Me } from '@snapshare/types';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError, apiFetch, json } from './api';

export const ME_KEY = ['me'] as const;

/** Set by the API at login (readable, no secret); absent means "certainly signed out". */
export const hasSessionHint = () =>
  typeof document !== 'undefined' && document.cookie.split('; ').includes('ss_session=1');

/** The signed-in user, or null when signed out. Never throws for 401. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async ({ signal }) => {
      // Anonymous visitors (no hint cookie) never cost an API request.
      if (!hasSessionHint()) return null;
      try {
        return await apiFetch<Me>('/me', { signal });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

/**
 * Only same-site paths are allowed as a post-login destination, so a crafted
 * `?next=https://evil.example` link can't bounce users off-site (open redirect).
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  return next;
}

/** Where a signed-in user lands: their first studio, or onboarding if they have none. */
export function homePath(me: Me): string {
  const studio = me.workspaces.find((w) => w.type === 'studio');
  return studio?.slug ? `/studio/${studio.slug}` : '/onboarding';
}

/**
 * Signs out, then reloads into `to` (default /login). A full page load is deliberate:
 * it drops every cached query, so nothing from the previous account stays in memory.
 */
export function useSignOut() {
  return async (to = '/login') => {
    await apiFetch('/auth/logout', json('POST')).catch(() => undefined);
    window.location.assign(to);
  };
}

/** Renders children for signed-in users; otherwise sends them to log in and back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <LoadingSkeleton label="Loading your account" />;
  if (!me.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

/** Login/signup pages: a signed-in user goes straight to their workspace. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <LoadingSkeleton label="Loading" />;
  if (me.data) {
    const next = safeNext(new URLSearchParams(location.search).get('next'));
    return <Navigate to={next ?? homePath(me.data)} replace />;
  }
  return children;
}
