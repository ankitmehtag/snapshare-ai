import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JS tooling script without type declarations
import { findViolations, isAllowed } from './check-licenses.js';

describe('licence allowlist (RISK R1c)', () => {
  it.each(['MIT', 'Apache-2.0', '(MIT OR GPL-3.0)', 'BSD-3-Clause AND MIT', 'MPL-2.0'])(
    'allows %s',
    (expr) => {
      expect(isAllowed(expr)).toBe(true);
    },
  );

  it.each([
    'GPL-3.0',
    'AGPL-3.0-only',
    'LGPL-2.1',
    'SSPL-1.0',
    'BUSL-1.1',
    'CC-BY-NC-4.0',
    'MIT AND GPL-2.0',
    'UNKNOWN',
    '',
    undefined,
  ])('rejects %s', (expr) => {
    expect(isAllowed(expr)).toBe(false);
  });

  it('reports each offending package with its versions', () => {
    const violations = findViolations({
      MIT: [{ name: 'ok', versions: ['1.0.0'] }],
      'AGPL-3.0': [{ name: 'bad', versions: ['2.0.0', '2.1.0'] }],
    });
    expect(violations).toEqual(['bad@2.0.0,2.1.0: AGPL-3.0']);
  });
});
