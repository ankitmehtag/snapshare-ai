/**
 * Shared types used by web, api and workers.
 * See docs/ARCHITECTURE.md §5 (tenancy) and docs/API_SPEC.md §1 (conventions).
 */

/** Ownership scope of a resource (ADR-007). `studio` → scopeId is the tenantId. */
export type ScopeType = 'studio' | 'personal';

export interface Scope {
  type: ScopeType;
  id: string;
}

export type PlatformRole = 'none' | 'support' | 'admin';

/**
 * Server-resolved request context. Never built from client-supplied ids
 * without membership validation (MASTER_SPEC §6).
 */
export interface AuthContext {
  userId: string;
  sessionId: string;
  platformRole: PlatformRole;
  scope: Scope | null;
  permissions: readonly string[];
}

/** RFC 9457 problem details, as returned by every API error. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
  meta?: Record<string, unknown>;
}

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'MFA_REQUIRED'
  | 'FORBIDDEN'
  | 'ENTITLEMENT_REQUIRED'
  | 'CSRF_FAILED'
  | 'CONSENT_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE'
  | 'STATE_INVALID'
  | 'GALLERY_EXPIRED'
  | 'FILE_TOO_LARGE'
  | 'QUOTA_EXCEEDED'
  | 'LOCKED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** Cursor pagination envelope (API_SPEC §1.4). */
export interface Page {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Paginated<T> {
  data: T[];
  page: Page;
}

/** Route scope classes used by the route registry and isolation tests (TESTING §4). */
export type RouteScope = 'studio' | 'personal' | 'public' | 'admin' | 'internal' | 'system';
