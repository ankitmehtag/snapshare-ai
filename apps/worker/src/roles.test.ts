import { QUEUES } from '@snapshare/config';
import { describe, expect, it } from 'vitest';
import { ROLES, parseRoles } from './roles.js';

describe('worker roles', () => {
  it('assigns every registered queue to exactly one role', () => {
    const assigned = Object.values(ROLES).flat();
    expect([...assigned].sort()).toEqual(Object.keys(QUEUES).sort());
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('parses roles and rejects unknown ones', () => {
    expect(parseRoles('media')).toEqual(['media']);
    expect(parseRoles('all')).toEqual(['relay', 'media', 'ai', 'notify', 'system']);
    expect(() => parseRoles('mining')).toThrow(/Unknown worker role/);
    expect(() => parseRoles(undefined)).toThrow(/Unknown worker role/);
  });
});
