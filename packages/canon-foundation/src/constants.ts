/**
 * Canonical constants for GSPL.
 *
 * Handbook on what is and is not LOCKED in v0.1:
 *
 *   LOCKED (mathematical / cryptographic primitives):
 *     - SHA-256 content hash (FIPS 180-4)
 *     - ECDSA P-256 deterministic signing (RFC 6979)
 *     - JSON Canonicalization Scheme (JCS, RFC 8785)
 *     - xoshiro256** + SplitMix64 + Box-Muller + FNV-1a (algorithmic spec/03)
 *     - 8-phase tick cycle phases and their behaviors (algorithmic spec/03)
 *     - 7-axis discipline as a structural contract (claim ADR-0006-MVP)
 *     - The canonical $gst schema fields: $gst, $domain, $lineage, genes
 *
 *   INITIAL INVENTORY (empirically derived from one source-spec, NOT closed):
 *     - The 17 gene types (scalar, categorical, vector, expression, struct,
 *       array, graph, topology, temporal, regulatory, field, symbolic,
 *       quantum, gematria, resonance, dimensional, sovereignty).
 *       Status: 17 types were arrived at empirically by implementing 26 domain
 *       engines and pruning per spec/02. They are recorded as the INITIAL
 *       INVENTORY but ARE EXTENSIBLE per the EXTENSIBILITY PROTOCOL below.
 *     - The 26 domain identifiers and the 26 GSPL keywords. Same caveat.
 *
 *   EXTENSIBILITY PROTOCOL:
 *     New gene types may be added WITHOUT a $gst major version bump if and
 *     only if:
 *       1. The new type carries its own (validate, mutate, crossover,
 *          distance, canonicalize) operators satisfying the per-type
 *          Property tests in spec/02.
 *       2. The new type passes hostile review (see GSPL_FIRST_PRINCIPLES.md).
 *       3. Composed types do not introduce implicit coercion with the
 *          initial 17 types.
 *
 *     Adding gene types requires a GID (GSPL Invention Disposition) document
 *     under docs/canon/decisions/, an entry in the invention ledger, and an
 *     ADR. The current count 17 is reported as GENE_TYPES_COUNT and is the
 *     "initial" count, not a closed set. We deny the 17-as-closed-set reading.
 *
 * Reasons for the labels:
 *   - Spec/02 says "Removing any type loses expressiveness in a way that
 *     cannot be recovered by composition of the rest." This is an empirical
 *     claim of irreducibility, not a proof. ADR-0004 records this distinction.
 *   - Genetic information types form a closed ALGEBRA under composition with
 *     domain semantics — the user-extensible alternative is "user-facing
 *     typed composable schemas (struct composition), not more primitive
 *     gene types." Both are possible; the initial-17 inventory is the
 *     empirical starting point.
 */

/** The current canonical $gst spec version. Bumped on breaking schema changes. */
export const GST_VERSION: GstVersion = '1.0';

/** The .gseed file-format magic bytes. See spec/06-gseed-format.md. */
export const GSED_MAGIC = 'GSED';

/**
 * The 17 gene types recorded as INITIAL INVENTORY (per spec/02 empirical
 * derivation; EXTENSIBLE per the EXTENSIBILITY PROTOCOL above).
 *
 * NOT LOCKED. Adding new types requires a GID + ADR + provenance ledger
 * entry. Closed reading is denied.
 */
export const GENE_TYPES = [
  'scalar',
  'categorical',
  'vector',
  'expression',
  'struct',
  'array',
  'graph',
  'topology',
  'temporal',
  'regulatory',
  'field',
  'symbolic',
  'quantum',
  'gematria',
  'resonance',
  'dimensional',
  'sovereignty',
] as const;

/**
 * INITIAL INVENTORY of 26 domain identifiers (spec/00). EXTENSIBLE per the
 * EXTENSIBILITY PROTOCOL.
 */
export const DOMAINS = [
  'sprite',
  'character',
  'music',
  'fullgame',
  'animation',
  'procedural',
  'geometry3d',
  'narrative',
  'ui',
  'physics',
  'visual2d',
  'audio',
  'ecosystem',
  'game',
  'alife',
  'shader',
  'particle',
  'typography',
  'architecture',
  'vehicle',
  'furniture',
  'fashion',
  'robotics',
  'circuit',
  'food',
  'choreography',
] as const;

/**
 * INITIAL INVENTORY of 26 reserved GSPL keywords (spec/04). EXTENSIBLE per
 * the EXTENSIBILITY PROTOCOL; additions should remain conservative because
 * keywords are source-code-meaning-changing.
 */
export const KEYWORDS = [
  'seed',
  'breed',
  'mutate',
  'compose',
  'evolve',
  'grow',
  'export',
  'import',
  'let',
  'fn',
  'if',
  'else',
  'match',
  'for',
  'while',
  'return',
  'true',
  'false',
  'null',
  'type',
  'trait',
  'impl',
  'where',
  'gene',
  'domain',
  'signed',
] as const;

/**
 * The 7-axis discipline is a STRUCTURAL CONTRACT. Every gseed/CLI/editor/
 * export must satisfy all seven. It IS load-bearing because dropping any
 * axis breaks the Next-Axis claim (see ADR-0006-MVP and MVP_DEFINITION.md
 * Part 7).
 *
 * The seven are NOT a registry of concepts; they are dimensions of a
 * contract that all surfaces comply with. Adding an axis would mean
 * inventing a new structural property; dropping one would invalidate the
 * substrate.
 */
export const SEVEN_AXES = [
  'signed',
  'typed',
  'lineage-tracked',
  'graph-structured',
  'confidence-bearing',
  'rollback-able',
  'differentiable',
] as const;

export type GstVersion = '1.0';
export type GeneTypeId = (typeof GENE_TYPES)[number];
export type DomainId = (typeof DOMAINS)[number];
export type Keyword = (typeof KEYWORDS)[number];
export type SevenAxisId = (typeof SEVEN_AXES)[number];
export type SovereigntyShape = 'primordial' | 'mutate' | 'breed' | 'compose';
