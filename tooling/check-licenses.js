// Fails when a production npm dependency's licence is not on the allowlist (RISK R1c).
// Copyleft (GPL/AGPL/LGPL/SSPL), source-available (BUSL) and non-commercial licences
// would restrict how SnapShare can be sold. Add a reviewed exception to EXCEPTIONS.
// Usage: pnpm licenses:check
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Unlicense',
  'Zlib',
  'Python-2.0',
  // File-level copyleft only; fine to use unmodified (changes to MPL files must be shared).
  'MPL-2.0',
]);

/** name -> reason. Each entry needs an owner-approved justification. */
export const EXCEPTIONS = new Map();

/** True when an SPDX expression is acceptable: OR needs one allowed side, AND needs all. */
export function isAllowed(expression) {
  const expr = String(expression ?? '')
    .trim()
    .replace(/^\((.*)\)$/, '$1');
  if (!expr) return false;
  if (/\s+OR\s+/i.test(expr)) return expr.split(/\s+OR\s+/i).some(isAllowed);
  if (/\s+AND\s+/i.test(expr)) return expr.split(/\s+AND\s+/i).every(isAllowed);
  return ALLOWED.has(expr);
}

export function findViolations(byLicense) {
  const violations = [];
  for (const [license, pkgs] of Object.entries(byLicense)) {
    for (const pkg of pkgs) {
      if (isAllowed(license) || EXCEPTIONS.has(pkg.name)) continue;
      violations.push(`${pkg.name}@${pkg.versions.join(',')}: ${license}`);
    }
  }
  return violations.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(json);
  const count = Object.values(byLicense).reduce((n, pkgs) => n + pkgs.length, 0);
  const violations = findViolations(byLicense);
  if (violations.length) {
    console.error(`[licenses] ${violations.length} dependency licence(s) not allowed:`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`[licenses] ${count} production npm packages, all on the allowlist`);
}
