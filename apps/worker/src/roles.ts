import type { QueueName } from '@snapshare/config';

/**
 * Deployable worker roles (ARCHITECTURE §3). One image, one role per process,
 * so each pool scales independently. `all` is for local development only.
 */
export const ROLES = {
  relay: [],
  media: ['media.process', 'media.video'],
  ai: ['ai.face.index', 'ai.face.match', 'ai.face.delete'],
  notify: ['notify.email', 'notify.sms', 'notify.inapp'],
  system: ['export.zip', 'deletion.cascade', 'billing.webhook', 'system.ping'],
} as const satisfies Record<string, readonly QueueName[]>;

export type Role = keyof typeof ROLES;

export function parseRoles(arg: string | undefined): Role[] {
  if (arg === 'all') return Object.keys(ROLES) as Role[];
  if (arg && Object.hasOwn(ROLES, arg)) return [arg as Role];
  throw new Error(
    `Unknown worker role "${arg ?? ''}". Use one of: ${Object.keys(ROLES).join(', ')}, all`,
  );
}
