/**
 * The 17 Gene Types — INITIAL INVENTORY per spec/02.
 *
 * Per `packages/canon-foundation/test/canon-foundation.test.ts`, the registry
 * must expose a non-empty entry for each of the 17 types, and `sovereignty`
 * must have `mutationAllowed=false` and `crossoverAllowed=false`.
 *
 * This registry is EXTENSIBLE per the EXTENSIBILITY PROTOCOL in
 * `docs/canon/GSPL_FIRST_PRINCIPLES.md` and `constants.ts`. New gene types
 * require an Invention entry, a GID document, and an ADR.
 */

import { GENE_TYPES } from '../constants.js';

/** Total canonical gene-type count. */
export const GENE_TYPES_COUNT: number = GENE_TYPES.length;

export interface GeneTypeDescriptor {
  readonly id: (typeof GENE_TYPES)[number];
  /** Whether the operator `mutate` may be applied to genes of this type. */
  readonly mutationAllowed: boolean;
  /** Whether the operator `crossover` may be applied to genes of this type. */
  readonly crossoverAllowed: boolean;
  /** Short human description. */
  readonly description: string;
}

/**
 * Authoritative registry. Order follows the canonical ordering in `GENE_TYPES`.
 */
export const GENE_TYPE_REGISTRY: Readonly<Record<(typeof GENE_TYPES)[number], GeneTypeDescriptor>> = {
  scalar: {
    id: 'scalar',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Continuous numeric value (real or integer).',
  },
  categorical: {
    id: 'categorical',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Discrete label drawn from a finite vocabulary.',
  },
  vector: {
    id: 'vector',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Ordered tuple of scalar coordinates.',
  },
  expression: {
    id: 'expression',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Syntactic expression evaluated deterministically.',
  },
  struct: {
    id: 'struct',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Composite of named fields, each a gene.',
  },
  array: {
    id: 'array',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Homogeneous collection of gene instances.',
  },
  graph: {
    id: 'graph',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Typed node/edge graph structure.',
  },
  topology: {
    id: 'topology',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Topology-derived invariant (continuous manifold).',
  },
  temporal: {
    id: 'temporal',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Time-domain signal or sequence.',
  },
  regulatory: {
    id: 'regulatory',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Threshold-switch / regulatory gene.',
  },
  field: {
    id: 'field',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Spatially distributed field (scalar or vector valued).',
  },
  symbolic: {
    id: 'symbolic',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Symbolic token without numerical content.',
  },
  quantum: {
    id: 'quantum',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Probability vector over basis states.',
  },
  gematria: {
    id: 'gematria',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Compositional value (text-derived mapping).',
  },
  resonance: {
    id: 'resonance',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Frequency-domain parameter set.',
  },
  dimensional: {
    id: 'dimensional',
    mutationAllowed: true,
    crossoverAllowed: true,
    description: 'Coordinate-frame or dimension-tag gene.',
  },
  sovereignty: {
    id: 'sovereignty',
    mutationAllowed: false,
    crossoverAllowed: false,
    description: 'Cryptographic identity block; purely structural, never mutated by genetic operators.',
  },
};

/** Returns true iff `id` is one of the canonical 17 gene types. */
export function isCanonicalGeneType(id: string): id is (typeof GENE_TYPES)[number] {
  return (GENE_TYPES as readonly string[]).includes(id);
}
