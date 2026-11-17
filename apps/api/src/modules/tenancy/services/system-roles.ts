/**
 * System roles and the permission matrix (DATABASE_SCHEMA §3). Route handlers check
 * permissions, never role names (ARCHITECTURE §5.2). This file is the single source
 * of truth: the `roles` collection is upserted from it at start.
 */

export const PERMISSIONS = [
  'studio.view',
  'studio.settings',
  'studio.delete',
  'studio.transfer',
  'billing.view',
  'billing.manage',
  'team.view',
  'team.manage',
  'event.read',
  'event.create',
  'event.update',
  'event.delete',
  'photo.read',
  'photo.upload',
  'photo.delete',
  'photo.delete_own',
  'share.manage',
  'proofing.manage',
  'ai.settings',
  'crm.view',
  'crm.manage',
  'analytics.view',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = ['owner', 'admin', 'editor', 'uploader', 'viewer'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** Higher outranks lower: nobody can grant or manage a role above their own. */
export const ROLE_RANK: Record<RoleKey, number> = {
  owner: 50,
  admin: 40,
  editor: 30,
  uploader: 20,
  viewer: 10,
};

const READ: Permission[] = ['studio.view', 'team.view', 'event.read', 'photo.read'];

export const SYSTEM_ROLES: Record<RoleKey, { name: string; permissions: Permission[] }> = {
  owner: { name: 'Owner', permissions: [...PERMISSIONS] },
  admin: {
    name: 'Admin',
    permissions: [
      ...READ,
      'studio.settings',
      'billing.view',
      'team.manage',
      'event.create',
      'event.update',
      'event.delete',
      'photo.upload',
      'photo.delete',
      'share.manage',
      'proofing.manage',
      'ai.settings',
      'crm.view',
      'crm.manage',
      'analytics.view',
      'audit.view',
    ],
  },
  editor: {
    name: 'Editor',
    permissions: [
      ...READ,
      'event.create',
      'event.update',
      'photo.upload',
      'photo.delete',
      'share.manage',
      'proofing.manage',
      'crm.view',
    ],
  },
  uploader: { name: 'Uploader', permissions: [...READ, 'photo.upload', 'photo.delete_own'] },
  viewer: { name: 'Viewer', permissions: [...READ] },
};

export const isRoleKey = (v: string): v is RoleKey => (ROLE_KEYS as readonly string[]).includes(v);
