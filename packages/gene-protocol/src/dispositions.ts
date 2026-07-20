/** Dispositions of the 17 recovered gene types per Prompt 2 §6.2 */

import type { GeneTypeClassification } from './types.js';

export interface GeneDispositionRecord {
  geneType: string;
  classification: GeneTypeClassification;
  disposition: 'CORE' | 'LIBRARY' | 'RESEARCH' | 'SECURITY' | 'REDUNDANT' | 'ARCHIVED';
  rationale: string;
}

/**
 * Authoritative classification of the 17 recovered gene types.
 *
 * These were empirically derived in Prompt 1 from implementing 26 domain
 * engines. Prompt 2 classifies them per §6.2 criteria. None are removed
 * — founder inventions are preserved, formalized, relocated, or archived.
 */
export const RECOVERED_GENE_DISPOSITIONS: readonly GeneDispositionRecord[] = [
  {
    geneType: 'scalar',
    classification: 'FUNDAMENTAL_VALUE_KIND',
    disposition: 'CORE',
    rationale: 'Continuous numeric value. Irreducible primitive — removing it would eliminate all numerical representation.'
  },
  {
    geneType: 'categorical',
    classification: 'FUNDAMENTAL_VALUE_KIND',
    disposition: 'CORE',
    rationale: 'Discrete label from finite vocabulary. Fundamental to type systems and decision spaces.'
  },
  {
    geneType: 'vector',
    classification: 'FUNDAMENTAL_VALUE_KIND',
    disposition: 'CORE',
    rationale: 'Ordered tuple of scalars. Foundation of geometry, embeddings, and coordinate spaces.'
  },
  {
    geneType: 'expression',
    classification: 'OPERATOR_OR_RULE',
    disposition: 'CORE',
    rationale: 'Syntactic expression evaluated deterministically. Not a value type — it IS the rule execution primitive.'
  },
  {
    geneType: 'struct',
    classification: 'COMPOSITE_STRUCTURE',
    disposition: 'CORE',
    rationale: 'Composite of named fields. Part of the core value system alongside array — these are the two universal composition primitives.'
  },
  {
    geneType: 'array',
    classification: 'COMPOSITE_STRUCTURE',
    disposition: 'CORE',
    rationale: 'Homogeneous collection. Second universal composition primitive alongside struct.'
  },
  {
    geneType: 'graph',
    classification: 'GRAPH_STRUCTURE',
    disposition: 'CORE',
    rationale: 'Typed node/edge graph. The core IR substrate — all architecture and artifact structure reduces to this.'
  },
  {
    geneType: 'topology',
    classification: 'GRAPH_STRUCTURE',
    disposition: 'CORE',
    rationale: 'Topology-derived invariant. Distinct from graph — captures continuous manifold properties that graph adjacency alone cannot express.'
  },
  {
    geneType: 'temporal',
    classification: 'FUNDAMENTAL_VALUE_KIND',
    disposition: 'CORE',
    rationale: 'Time-domain signal or sequence. Fundamental to animation, audio, and any time-varying artifact.'
  },
  {
    geneType: 'regulatory',
    classification: 'OPERATOR_OR_RULE',
    disposition: 'CORE',
    rationale: 'Threshold-switch / regulatory gene. Implements conditional logic in the gene network — essential for constraint expression.'
  },
  {
    geneType: 'field',
    classification: 'DOMAIN_SPECIFIC_LIBRARY_TYPE',
    disposition: 'LIBRARY',
    rationale: 'Spatially distributed field. Domain-specific (physics, graphics) but well-defined with rigorous semantics. Promoted to library type.'
  },
  {
    geneType: 'symbolic',
    classification: 'FUNDAMENTAL_VALUE_KIND',
    disposition: 'CORE',
    rationale: 'Symbolic token without numerical content. Essential for identifiers, names, and categorical references.'
  },
  {
    geneType: 'quantum',
    classification: 'DOMAIN_SPECIFIC_LIBRARY_TYPE',
    disposition: 'LIBRARY',
    rationale: 'Probability vector over basis states. Domain-specific (quantum computing, ML) — rigorous semantics exist but not universal.'
  },
  {
    geneType: 'gematria',
    classification: 'DOMAIN_SPECIFIC_LIBRARY_TYPE',
    disposition: 'LIBRARY',
    rationale: 'Compositional value from text-derived mapping. Domain-specific (linguistic computation, sacred geometry). Preserved for founder intent.'
  },
  {
    geneType: 'resonance',
    classification: 'DOMAIN_SPECIFIC_LIBRARY_TYPE',
    disposition: 'LIBRARY',
    rationale: 'Frequency-domain parameter set. Domain-specific (audio, signal processing). Can be composed from vector+temporal but has distinct semantics.'
  },
  {
    geneType: 'dimensional',
    classification: 'FUNDAMENTAL_VALUE_KIND',
    disposition: 'CORE',
    rationale: 'Coordinate-frame or dimension-tag. Fundamental — dimensional analysis and unit correctness depend on this primitive.'
  },
  {
    geneType: 'sovereignty',
    classification: 'SECURITY_PRIMITIVE',
    disposition: 'SECURITY',
    rationale: 'Cryptographic identity block. Not a gene in the conventional sense — it is a structural security boundary. Preserved as a security primitive with mutation/crossover permanently disabled.'
  },
];

/** Look up the disposition of a recovered gene type */
export function getDisposition(geneType: string): GeneDispositionRecord | undefined {
  return RECOVERED_GENE_DISPOSITIONS.find(d => d.geneType === geneType);
}

export type GeneDisposition = GeneDispositionRecord['disposition'];
