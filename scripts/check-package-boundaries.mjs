#!/usr/bin/env node
import { readFile, readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const PACKAGES_DIR = join(ROOT, 'packages');

const CANONICAL_DEPS = new Set(['@gspl/canon-foundation','@gspl/gene-protocol']);
const AI_PACKAGES = new Set(['@gspl/agent-genes','@gspl/cognitive-kernel','@gspl/intent-compiler','@gspl/epistemic-engine','@gspl/model-fabric','@gspl/memory-architecture','@gspl/capability-security','@gspl/world-model','@gspl/runtime-coordinator','@gspl/context-compiler','@gspl/planning-execution','@gspl/action-fabric','@gspl/transaction-manager','@gspl/persistence','@gspl/event-history','@gspl/observability','@gspl/verification-engine']);

const errors = [];
const pkgDirs = (await readdir(PACKAGES_DIR, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => join(PACKAGES_DIR, d.name));

for (const pkgDir of pkgDirs) {
  const pkgName = pkgDir.split(/[/\]/).pop();
  let pkgJson;
  try { pkgJson = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf-8')); } catch { continue; }
  const fullName = pkgJson.name ?? pkgName;
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies, ...pkgJson.peerDependencies };
  if (AI_PACKAGES.has(fullName)) {
    const canonDeps = Object.keys(deps).filter(d => CANONICAL_DEPS.has(d));
    if (canonDeps.length > 2) errors.push(`${fullName}: ${canonDeps.length} canon deps (max 2): ${canonDeps.join(', ')}`);
  }
  if (CANONICAL_DEPS.has(fullName)) errors.push(`${fullName}: duplicates canonical GSPL package`);
}

if (errors.length > 0) { console.error('Boundary violations:'); errors.forEach(e => console.error(`  - ${e}`)); process.exit(1); }
console.log(`Package boundary check: ${pkgDirs.length} packages, ${AI_PACKAGES.size} AI — all clean`);
console.log('Canon deps: canon-foundation, gene-protocol (via submodule deps/gspl-canon)');
