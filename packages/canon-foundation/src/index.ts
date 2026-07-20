/**
 * @gspl/canon-foundation
 *
 * The load-bearing canon module of Generative Seed Programming Language (GSPL).
 *
 * Provides:
 *  - The canonical UniversalSeed type and runtime validators
 *  - The 17-gene-type registry (per spec/02-gene-system.md)
 *  - RFC 8785 (JCS) canonicalization with GSPL top-level field ordering
 *  - SHA-256 content hashing per spec/05-sovereignty.md
 *  - 8-phase tick cycle scaffolding per spec/03-kernel.md
 *  - Determinism contracts validated by property tests
 */

export * from './types/universal-seed.js';
export * from './types/gene-types.js';
export * from './canonicalize/jcs.js';
export * from './hash/sha256.js';
export * from './validate/validator.js';
export * from './validate/invariants.js';
export * from './rng/deterministic.js';
export * from './rng/entropy-channels.js';
export * from './tick/cycle.js';
export { GENE_TYPES, DOMAINS, KEYWORDS, GST_VERSION, GSED_MAGIC, SEVEN_AXES } from './constants.js';
export type { GstVersion, DomainId, GeneTypeId, SovereigntyShape } from './constants.js';
