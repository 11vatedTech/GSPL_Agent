/**
 * UniversalSeed — the canonical type per spec/01.
 *
 * Per `packages/canon-foundation/test/canon-foundation.test.ts`, the type
 * must contain at minimum:
 *  - $gst
 *  - $domain
 *  - $lineage
 *  - genes
 *
 * And may contain optional:
 *  - $name
 *  - $metadata
 *  - $hash (excluded from canonicalization material)
 *
 * The `makePrimordialDraft` factory packages the most common construction.
 */

import type { DomainId, Keyword, GeneTypeId } from '../constants.js';

export interface Lineage {
  /** How this seed was produced. */
  operation: 'primordial' | 'mutate' | 'breed' | 'compose';
  /** Parent seed $hash values (empty array for primordial). */
  parents: readonly string[];
  /** Generational depth. 0 for primordial. */
  generation: number;
  /** Optional ISO-8601 timestamp; excluded from hash material. */
  timestamp?: string;
}

export interface SeedMetadata {
  /** Engine / knowledge-base version this seed expects. */
  engine_version?: string;
  /** Optional licensing declaration. */
  license?: string;
  /** Free-form annotations; NOT included in hash material. */
  [k: string]: unknown;
}

export interface Gene {
  type: GeneTypeId;
  /** Gene value: shape depends on `type`. */
  value: unknown;
  /** Per-gene confidence for diff display. */
  confidence?: number;
}

export type GeneMap = Readonly<Record<string, Gene>>;

export interface UniversalSeed {
  /** Canonical $gst schema version. */
  $gst: '1.0';
  /** Domain identifier (one of 26). */
  $domain: DomainId;
  /** Lineage block. Primordials have empty parents and generation 0. */
  $lineage: Lineage;
  /** Optional / locked name. */
  $name?: string;
  /** Optional metadata block; engine_version is the load-bearing field. */
  $metadata?: SeedMetadata;
  /** Optional content hash (sha256:hex). Present iff seed is signed. */
  $hash?: string;
  /** Map of gene name → gene. */
  genes: GeneMap;
}

// Re-export Keyword to satisfy tests that may import it via this module.
export type { Keyword };

/**
 * Construct a primordial UniversalSeed.
 *
 * A primordial seed has empty `parents`, `generation: 0`, and operation
 * `'primordial'`. Useful for tests and for tooling that produces fresh
 * top-level seeds from components.
 */
export function makePrimordialDraft(
  domain: DomainId,
  genes: GeneMap | Record<string, Gene>,
  options?: { name?: string; metadata?: SeedMetadata }
): UniversalSeed {
  const seed: UniversalSeed = {
    $gst: '1.0',
    $domain: domain,
    $lineage: {
      operation: 'primordial',
      parents: [],
      generation: 0,
    },
    genes: genes as GeneMap,
  };
  if (options?.name !== undefined) seed.$name = options.name;
  if (options?.metadata !== undefined) seed.$metadata = options.metadata;
  return seed;
}
