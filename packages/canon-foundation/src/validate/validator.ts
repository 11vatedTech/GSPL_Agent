/**
 * The 8 invariants per spec/01 — the structural validity checker for any
 * UniversalSeed.
 *
 * Invariant numbers and meanings (mirrors the test expectations):
 *   1. $hash matches canonical content hash                  (HASH)
 *   2. derivative seeds (operation≠primordial) have ≥1 parent (PARENTS)
 *   3. gene names do not start with '$'                       (NAME_PREFIX)
 *   4. gene type is one of the canonical 17                   (GENE_TYPE)
 *   5. $gst is the locked current version (currently '1.0')   (GST_VERSION)
 *   6. $domain is one of the 26 canonical domains            (DOMAIN)
 *   7. gene values pass per-type basic shape checks          (GENE_SHAPE)
 *   8. $gst is one of the supported values                   (GST_KNOWN)
 *
 * Tests pin specific invariant numbers — DO NOT renumber.
 */

import { GST_VERSION } from '../constants.js';
import { hashSeed } from '../hash/sha256.js';
import { isCanonicalGeneType } from '../types/gene-types.js';
import type { Gene, UniversalSeed } from '../types/universal-seed.js';
import { DOMAINS } from '../constants.js';

export type InvariantNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ValidationError {
  invariant: InvariantNumber;
  code: string;
  message: string;
  path?: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

/**
 * Validate a UniversalSeed against the 8 invariants.
 */
export function validateSeed(seed: UniversalSeed): ValidationResult {
  const errors: ValidationError[] = [];

  // Invariant 1: hash matches (only when $hash is present).
  if (seed.$hash !== undefined) {
    const expected = hashSeed(seed);
    if (expected !== seed.$hash) {
      errors.push({
        invariant: 1,
        code: 'HASH_MISMATCH',
        message: 'seed $hash does not match canonical content hash',
        path: '$.$hash',
      });
    }
  }

  // Invariant 2: derivative seeds must have parents.
  if (seed.$lineage?.operation && seed.$lineage.operation !== 'primordial') {
    if (!seed.$lineage.parents || seed.$lineage.parents.length === 0) {
      errors.push({
        invariant: 2,
        code: 'EMPTY_PARENTS',
        message: `derivative seed (operation=${seed.$lineage.operation}) must declare at least 1 parent`,
        path: '$.$lineage.parents',
      });
    }
  }

  // Invariant 3: gene names must not start with $.
  for (const name of Object.keys(seed.genes)) {
    if (name.startsWith('$')) {
      errors.push({
        invariant: 3,
        code: 'RESERVED_NAME',
        message: `gene name '${name}' starts with '$' (reserved)`,
        path: `$.genes.${name}`,
      });
    }
  }

  // Invariant 4: gene type must be canonical.
  for (const [name, gene] of Object.entries(seed.genes)) {
    if (!gene || typeof gene !== 'object') {
      errors.push({
        invariant: 4,
        code: 'BAD_GENE',
        message: `gene '${name}' is not an object`,
        path: `$.genes.${name}`,
      });
      continue;
    }
    if (!isCanonicalGeneType(String((gene as Gene).type ?? ''))) {
      errors.push({
        invariant: 4,
        code: 'UNKNOWN_GENE_TYPE',
        message: `gene '${name}' has unknown type '${String((gene as Gene).type)}'`,
        path: `$.genes.${name}.type`,
      });
    }
  }

  // Invariant 5: $gst must equal the locked current version.
  if (seed.$gst !== GST_VERSION) {
    errors.push({
      invariant: 5,
      code: 'GST_VERSION_MISMATCH',
      message: `$gst must be '${GST_VERSION}', got '${seed.$gst}'`,
      path: '$.$gst',
    });
  }

  // Invariant 6: $domain must be a canonical domain.
  if (!(DOMAINS as readonly string[]).includes(String(seed.$domain))) {
    errors.push({
      invariant: 6,
      code: 'UNKNOWN_DOMAIN',
      message: `$domain '${seed.$domain}' is not canonical`,
      path: '$.$domain',
    });
  }

  // Invariant 7: gene values pass basic shape checks (per-type).
  for (const [name, gene] of Object.entries(seed.genes)) {
    const g = gene as Gene;
    if (!g || g.value === undefined) {
      errors.push({
        invariant: 7,
        code: 'EMPTY_VALUE',
        message: `gene '${name}' has no value`,
        path: `$.genes.${name}.value`,
      });
    }
    // Per-type first-pass validation.
    if (g.type === 'scalar' && (typeof g.value !== 'number' || Number.isNaN(g.value))) {
      errors.push({
        invariant: 7,
        code: 'SCALAR_VALUE',
        message: `gene '${name}' scalar value must be a finite number`,
        path: `$.genes.${name}.value`,
      });
    }
    if (g.type === 'categorical' && typeof g.value !== 'string') {
      errors.push({
        invariant: 7,
        code: 'CATEGORICAL_VALUE',
        message: `gene '${name}' categorical value must be a string`,
        path: `$.genes.${name}.value`,
      });
    }
    if (g.type === 'vector' && !Array.isArray(g.value)) {
      errors.push({
        invariant: 7,
        code: 'VECTOR_VALUE',
        message: `gene '${name}' vector value must be an array`,
        path: `$.genes.${name}.value`,
      });
    }
  }

  // Invariant 8: $gst must be one of the canonicalized schema versions.
  // Only '1.0' is currently canonicalized; future versions require a major
  // bump and GID + ADR + provenance-ledger entry before this list is grown.
  // Anything in this list is also subject to invariant 5 (must equal the
  // current locked version); invariant 8 is the "known to the canon at all"
  // guard, not the "current" guard.
  if (!['1.0'].includes(String(seed.$gst))) {
    errors.push({
      invariant: 8,
      code: 'UNKNOWN_GST',
      message: `$gst '${seed.$gst}' is not a known schema version`,
      path: '$.$gst',
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}
