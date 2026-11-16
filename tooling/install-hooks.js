// Installs git hooks via lefthook. Skips (exit 0) outside a git checkout, e.g. in
// Docker builds; any real lefthook failure inside a checkout still fails install.
import { spawnSync } from 'node:child_process';

const inRepo = spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status === 0;
if (!inRepo || process.env.CI_SKIP_HOOKS === '1') {
  console.log('[hooks] not a git checkout; skipping hook install');
  process.exit(0);
}
const result = spawnSync('pnpm', ['exec', 'lefthook', 'install'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
