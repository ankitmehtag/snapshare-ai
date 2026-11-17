import { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { RouteRegistry } from '../../kernel/routes.js';
import { PERMISSIONS, ROLE_KEYS, ROLE_RANK, SYSTEM_ROLES } from './services/system-roles.js';

const can = (role: keyof typeof SYSTEM_ROLES, p: string) =>
  (SYSTEM_ROLES[role].permissions as string[]).includes(p);

describe('system roles (DATABASE_SCHEMA §3 matrix)', () => {
  it('ranks roles strictly from owner down to viewer', () => {
    const ranks = ROLE_KEYS.map((k) => ROLE_RANK[k]);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('gives the owner everything and keeps owner-only powers owner-only', () => {
    expect(SYSTEM_ROLES.owner.permissions).toEqual([...PERMISSIONS]);
    for (const p of ['billing.manage', 'studio.delete', 'studio.transfer']) {
      for (const role of ['admin', 'editor', 'uploader', 'viewer'] as const) {
        expect(can(role, p), `${role} must not have ${p}`).toBe(false);
      }
    }
  });

  it('matches the matrix row by row', () => {
    expect(can('admin', 'team.manage') && can('admin', 'billing.view')).toBe(true);
    expect(can('editor', 'event.create') && !can('editor', 'event.delete')).toBe(true);
    expect(can('editor', 'team.manage') || can('editor', 'studio.settings')).toBe(false);
    expect(can('uploader', 'photo.upload') && can('uploader', 'photo.delete_own')).toBe(true);
    expect(can('uploader', 'photo.delete')).toBe(false);
    expect(
      SYSTEM_ROLES.viewer.permissions.every((p) => p.endsWith('.read') || p.endsWith('.view')),
    ).toBe(true);
  });

  it('only uses declared permissions, and every role can read', () => {
    for (const key of ROLE_KEYS) {
      for (const p of SYSTEM_ROLES[key].permissions) expect(PERMISSIONS).toContain(p);
      expect(can(key, 'studio.view') && can(key, 'event.read') && can(key, 'photo.read')).toBe(
        true,
      );
    }
  });
});

describe('route registry', () => {
  it('refuses a studio route that declares no permission', () => {
    const registry = new RouteRegistry();
    expect(() =>
      registry.mount(Router(), {
        method: 'get',
        path: '/studios/{studioId}/things',
        scope: 'studio',
        summary: 'x',
        responses: { 200: { description: 'ok' } },
        handler: () => undefined,
      }),
    ).toThrow(/must declare a permission/);
  });
});
