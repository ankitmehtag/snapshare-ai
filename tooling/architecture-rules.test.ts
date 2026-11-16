import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = 'tooling/fixtures/api/src/modules/events';

async function lint(file: string) {
  const eslint = new ESLint({ cwd: root, ignore: false });
  const [result] = await eslint.lintFiles([path.join(root, fixtures, file)]);
  return (result?.messages ?? []).map((m) => m.ruleId);
}

describe('architecture lint rules (ARCHITECTURE §4, ADR-007)', () => {
  it('allows index imports across modules and own internals', async () => {
    expect(await lint('services/ok.service.ts')).toEqual([]);
    expect(await lint('repositories/events.repository.ts')).toEqual([]);
  });

  it('rejects imports of another module internals', async () => {
    expect(await lint('services/bad-boundary.service.ts')).toEqual([
      'architecture/module-boundaries',
    ]);
  });

  it('rejects model imports outside repositories', async () => {
    expect(await lint('services/bad-model.service.ts')).toEqual([
      'architecture/models-only-in-repositories',
    ]);
  });
});
