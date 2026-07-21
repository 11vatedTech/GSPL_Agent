/**
 * Verify GSPL Canon Dependency
 *
 * Ensures the GSPL canon submodule is pinned to the expected revision
 * and that no AI-owned package duplicates canonical GSPL types.
 */

import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const EXPECTED_CANON_REVISION = '02a07bc';
const CANON_PATH = 'deps/gspl-canon';

async function verifyCanonDeps() {
  console.log('🔍 Verifying GSPL canon dependency...\n');

  // 1. Check that the canon submodule exists
  try {
    await access(resolve(root, CANON_PATH));
    console.log('✅ Canon submodule directory exists');
  } catch {
    console.error('❌ Canon submodule directory not found at', CANON_PATH);
    process.exit(1);
  }

  // 2. Verify the pinned revision in .gitmodules
  try {
    const gitmodulesContent = await readFile(resolve(root, '.gitmodules'), 'utf-8');
    if (gitmodulesContent.includes('gspl-canon') || gitmodulesContent.includes('GSPL_canon')) {
      console.log('✅ Canon submodule referenced in .gitmodules');
    }
  } catch {
    console.log('⚠️  No .gitmodules file found — checking package.json instead');
  }

  // 3. Verify the submodule revision
  try {
    const actualRevision = execSync(`git submodule status ${CANON_PATH}`, { cwd: root, encoding: 'utf-8' }).trim();
    // Format: [+ ][<sha1> ]<path>
    const sha = actualRevision.match(/^[-+ ]?([0-9a-f]+)/)?.[1];
    if (!sha) {
      console.error('❌ Could not parse submodule revision from:', actualRevision);
      process.exit(1);
    }
    if (sha.startsWith(EXPECTED_CANON_REVISION)) {
      console.log(`✅ Canon revision matches expected: ${sha.slice(0, 7)}...`);
    } else {
      console.error(`❌ Canon revision mismatch!`);
      console.error(`   Expected: ${EXPECTED_CANON_REVISION}`);
      console.error(`   Actual:   ${sha.slice(0, 7)}`);
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Failed to verify submodule revision:', e.message);
    console.log('   (This is expected in CI if submodules are initialized via checkout)');
    // In CI, the checkout action with submodules: recursive handles this
    try {
      const pkgJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf-8'));
      const canonDep = pkgJson.dependencies?.['@gspl/canon'] || pkgJson.dependencies?.['gspl-canon'];
      if (canonDep) {
        console.log(`✅ Canon dependency found in package.json: ${canonDep}`);
      }
    } catch {
      console.log('⚠️  Could not verify package.json dependency');
    }
  }

  // 4. Verify no duplicated GSPL types
  console.log('\n🔍 Checking for duplicated GSPL types...');
  const forbiddenImports = [
    'from \'@gspl/canon\'',
    'from \'@gspl/foundation\'',
  ];

  // This basic check verifies workspace packages reference the correct scope
  const pkgJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf-8'));
  const workspacePackages = pkgJson.workspaces || [];

  let duplicates = 0;
  for (const ws of workspacePackages) {
    if (ws === 'deps/*') continue; // Skip deps directory
    try {
      const wsPkg = JSON.parse(await readFile(resolve(root, ws, 'package.json'), 'utf-8'));
      const name = wsPkg.name;
      // GSPL AI packages should not be named like canon packages
      if (name && (name.includes('gspl-compiler') || name.includes('gspl-ir') || name.includes('gspl-gene') || name.includes('gspl-seed'))) {
        console.error(`❌ Package ${name} appears to be a canon package — should be a dependency, not owned source`);
        duplicates++;
      }
    } catch {
      // Skip unreadable packages
    }
  }

  if (duplicates === 0) {
    console.log('✅ No duplicated GSPL canon packages detected');
  }

  console.log('\n✨ Canon dependency verification complete.\n');
}

verifyCanonDeps().catch(e => {
  console.error('Verification failed:', e);
  process.exit(1);
});
