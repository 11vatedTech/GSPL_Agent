/**
 * GSPL AI Agent — Canonical GSPL Dependency Verification
 *
 * Verifies that the git submodule for GSPL canon is at the expected revision.
 * Run: node scripts/verify-canon-deps.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Expected canonical GSPL revision
const EXPECTED_REVISION = '02a07bc42c9399ccab94d27685409b9ba079a7c0';
const SUBMODULE_PATH = 'deps/gspl-canon';
const GITMODULES_PATH = resolve(rootDir, '.gitmodules');

let failures = 0;

// Check .gitmodules exists
if (!existsSync(GITMODULES_PATH)) {
  console.error('FAIL: .gitmodules file not found — submodule not configured');
  process.exit(1);
}

// Read .gitmodules to verify submodule declaration
const gitmodules = readFileSync(GITMODULES_PATH, 'utf-8');
if (!gitmodules.includes('gspl-canon')) {
  console.error('FAIL: gspl-canon submodule not declared in .gitmodules');
  failures++;
}

// Check submodule exists on disk
if (!existsSync(resolve(rootDir, SUBMODULE_PATH, '.git'))) {
  console.error('FAIL: gspl-canon submodule not initialized — run: git submodule update --init');
  process.exit(1);
}

// Check submodule revision
try {
  const actual = execSync('git -C deps/gspl-canon rev-parse HEAD', {
    cwd: rootDir,
    encoding: 'utf-8',
  }).trim();

  if (actual === EXPECTED_REVISION) {
    console.log(`PASS: GSPL canon pinned to ${EXPECTED_REVISION.slice(0, 7)}`);
  } else {
    console.error(`FAIL: GSPL canon at ${actual.slice(0, 7)}, expected ${EXPECTED_REVISION.slice(0, 7)}`);
    failures++;
  }
} catch (e) {
  console.error('FAIL: Could not read submodule revision:', e.message);
  failures++;
}

// Check essential packages exist
try {
  const pkgs = execSync('ls deps/gspl-canon/packages/', {
    cwd: rootDir,
    encoding: 'utf-8',
  }).trim().split('\n');

  for (const pkg of ['canon-foundation', 'gene-protocol']) {
    if (pkgs.includes(pkg)) {
      console.log(`PASS: Package ${pkg} available in canonical GSPL`);
    } else {
      console.error(`FAIL: Package ${pkg} not found in canonical GSPL`);
      failures++;
    }
  }
} catch (e) {
  console.error('FAIL: Could not list canonical packages:', e.message);
  failures++;
}

if (failures > 0) {
  console.error(`\n${failures} verification failure(s) detected`);
  process.exit(1);
}

console.log('\nAll GSPL canonical dependency checks passed.');
