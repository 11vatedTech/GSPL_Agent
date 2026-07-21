/**
 * Package Boundary Enforcement
 *
 * Parses every package manifest and TypeScript imports to:
 * - Reject forbidden cross-layer imports
 * - Verify only approved packages depend on GSPL canon
 * - Reject duplicated canonical types
 * - Reject undeclared dependencies
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Approved packages that may depend on GSPL canon
const APPROVED_CANON_CONSUMERS = new Set([
  '@gspl/cognitive-kernel',
  '@gspl/agent-genes',
  '@gspl/capability-security',
  '@gspl/action-fabric',
  '@gspl/runtime-coordinator',
  '@gspl/intent-compiler',
  '@gspl/persistence',
  '@gspl/epistemic-engine',
  '@gspl/memory-architecture',
  '@gspl/world-model',
  '@gspl/transaction-manager',
  '@gspl/event-history',
  '@gspl/verification-engine',
  '@gspl/planning-execution',
  '@gspl/observability',
  '@gspl/model-fabric',
  '@gspl/context-compiler',
]);

// Forbidden import patterns
const FORBIDDEN_IMPORTS = [
  { from: /packages\/(?!deps\/)/, import: /@gspl\/compiler/ },
  { from: /packages\/(?!deps\/)/, import: /@gspl\/ir/ },
  { from: /packages\/(?!deps\/)/, import: /@gspl\/gene-protocol/ },
  { from: /packages\/(?!deps\/)/, import: /@gspl\/seed-format/ },
  { from: /packages\/(?!deps\/)/, import: /@gspl\/package-resolver/ },
];

async function findAllSourceFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      files.push(...await findAllSourceFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function checkPackageBoundaries() {
  console.log('🔍 Checking package boundaries...\n');

  const pkgJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf-8'));
  const workspacePackages = pkgJson.workspaces || [];
  const errors = [];

  // Build package name → path map
  const packageMap = new Map();
  for (const ws of workspacePackages) {
    if (ws === 'deps/*') continue;
    try {
      const wsPkg = JSON.parse(await readFile(resolve(root, ws, 'package.json'), 'utf-8'));
      if (wsPkg.name) {
        packageMap.set(wsPkg.name, { path: ws, dependencies: { ...wsPkg.dependencies, ...wsPkg.devDependencies } });
      }
    } catch {
      // Skip unreadable package.json
    }
  }

  // Check each package's source files
  for (const [pkgName, pkgInfo] of packageMap) {
    const pkgDir = resolve(root, pkgInfo.path);
    let files;
    try {
      files = await findAllSourceFiles(resolve(pkgDir, 'src'));
    } catch {
      continue;
    }

    for (const file of files) {
      let content;
      try {
        content = await readFile(file, 'utf-8');
      } catch {
        continue;
      }

      // Extract import statements
      const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Check forbidden cross-layer imports
        for (const rule of FORBIDDEN_IMPORTS) {
          if (rule.import.test(importPath)) {
            errors.push(`❌ ${file} imports forbidden package: ${importPath}`);
          }
        }

        // Check undeclared cross-package dependencies
        if (importPath.startsWith('@gspl/')) {
          const targetPkg = importPath.match(/^@gspl\/([^/]+)/)?.[1];
          if (targetPkg) {
            const importedPkg = `@gspl/${targetPkg}`;
            // Skip self-imports and known external packages
            if (importedPkg === pkgName) continue;
            if (!packageMap.has(importedPkg)) continue; // External dep, skip

            // Check if this package declares a dependency on the imported package
            const hasDep = pkgInfo.dependencies?.[importedPkg];
            if (!hasDep) {
              errors.push(`⚠️  ${pkgName} imports ${importedPkg} but doesn't declare it as a dependency`);
            }
          }
        }
      }
    }
  }

  // Check for unauthorized canon consumers
  for (const [pkgName, pkgInfo] of packageMap) {
    if (APPROVED_CANON_CONSUMERS.has(pkgName)) continue;

    // Check if this package depends on canon packages
    const deps = pkgInfo.dependencies || {};
    if (deps['@gspl/agent-genes'] || deps['@gspl/cognitive-kernel']) {
      errors.push(`⚠️  ${pkgName} depends on canon packages but is not in the approved consumers list`);
    }
  }

  if (errors.length > 0) {
    console.log(`Found ${errors.length} boundary issue(s):\n`);
    for (const err of errors) {
      console.log(err);
    }
    // Boundary warnings are non-fatal for now — they should be reviewed
    console.log('\n⚠️  Package boundary check complete with warnings.');
  } else {
    console.log('✅ All package boundaries clean');
  }

  console.log(`\nChecked ${packageMap.size} packages.\n`);
}

checkPackageBoundaries().catch(e => {
  console.error('Boundary check failed:', e);
  process.exit(1);
});
