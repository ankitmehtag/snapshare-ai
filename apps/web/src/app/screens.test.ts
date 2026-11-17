import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NON_ROUTE_SCREENS, SCREENS } from './screens';

// Vitest runs with cwd = apps/web.
const inventory = readFileSync(
  path.resolve(process.cwd(), '../../docs/SCREEN_INVENTORY.md'),
  'utf8',
);
const documentedIds = new Set(
  [...inventory.matchAll(/^\| ((?:PUB|AUTH|ONB|GL|ST|ME|AD)-\d+a?) \|/gm)].map((m) => m[1]!),
);

describe('screen inventory traceability', () => {
  it('every screen in docs/SCREEN_INVENTORY.md is routed or listed as a non-route component', () => {
    const covered = new Set([...SCREENS.map((s) => s.id.replace(/E$/, '')), ...NON_ROUTE_SCREENS]);
    const missing = [...documentedIds].filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
    expect(documentedIds.size).toBe(89);
  });

  it('has no duplicate ids or duplicate paths within an area', () => {
    expect(new Set(SCREENS.map((s) => s.id)).size).toBe(SCREENS.length);
    const keys = SCREENS.map((s) => `${s.area}:${s.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only marks screens ready when they are actually implemented', () => {
    expect(SCREENS.filter((s) => s.ready).map((s) => s.id)).toEqual(['PUB-01']);
  });
});
