/**
 * @gspl/gene-protocol — Extensible Gene Type Registry
 *
 * Replaces the fixed 17-gene-type inventory with a versioned, extensible
 * protocol. Every gene type declares its schema, canonicalization,
 * validation, normalization, hashing behavior, IR lowering, composition
 * semantics, and optional capabilities.
 *
 * Per Prompt 2 §6.
 */

export type {
  GeneTypeId,
  GeneTypeDescriptor,
  GeneTypeRegistry,
  GeneTypeClassification,
  GeneValueSchema,
  GeneCanonicalizer,
  GeneValidator,
  GeneNormalizer,
  GeneIrLowering,
  GeneCompositionSemantics,
  GeneMergeSemantics,
  GeneDiffSemantics,
  GeneOptionalCapability,
  GeneMigrationBehavior,
  GeneResourceEstimate,
  GeneEffectRequirement,
  ExtensibleGeneRegistry,
  ImmutableGeneRegistryConfig,
} from './types.js';

export {
  GENE_TYPE_CLASSIFICATIONS,
  classifyGeneType,
  isFundamentalValueKind,
  isCompositeStructure,
  isGraphStructure,
  isDomainSpecificLibrary,
  isSecurityPrimitive,
  isOperatorOrRule,
  createImmutableRegistry,
  validateGeneAgainstRegistry,
} from './registry.js';

export {
  RECOVERED_GENE_DISPOSITIONS,
  getDisposition,
  type GeneDisposition,
  type GeneDispositionRecord,
} from './dispositions.js';

export type { GeneIrFragment, GeneLifting, IrLiftingContext, IrLoweringContext } from './types.js';
export { createStandardGeneRegistry, ALL_GENE_DESCRIPTORS, CORE_GENE_DESCRIPTORS } from './defaults.js';
