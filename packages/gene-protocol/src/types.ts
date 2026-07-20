/** Core gene protocol types — Prompt 2 §6 */

/** Stable gene type identifier */
export type GeneTypeId = string;

/** Classification of a gene type per §6.2 */
export type GeneTypeClassification =
  | 'FUNDAMENTAL_VALUE_KIND'
  | 'COMPOSITE_STRUCTURE'
  | 'GRAPH_STRUCTURE'
  | 'DOMAIN_SPECIFIC_LIBRARY_TYPE'
  | 'OPERATOR_OR_RULE'
  | 'SECURITY_PRIMITIVE'
  | 'ANNOTATION'
  | 'METAPHOR_WITHOUT_DISTINCT_SEMANTICS'
  | 'RESEARCH_ONLY';

/** JSON Schema subset for gene value validation */
export interface GeneValueSchema {
  type: 'number' | 'string' | 'boolean' | 'array' | 'object' | 'any';
  /** For 'number': min, max, integer flag */
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  /** For 'string': enum values or pattern */
  enum?: readonly string[];
  pattern?: string;
  /** For 'array': item schema */
  items?: GeneValueSchema;
  /** For 'object': property schemas */
  properties?: Record<string, GeneValueSchema>;
  required?: readonly string[];
  /** Human description */
  description?: string;
}

/** Canonicalization function: value → canonical bytes */
export type GeneCanonicalizer<T = unknown> = (value: T) => Uint8Array;

/** Validation function: value → ValidationResult */
export type GeneValidator<T = unknown> = (value: T) => GeneValidationResult;

export interface GeneValidationResult {
  ok: boolean;
  errors?: GeneValidationError[];
}

export interface GeneValidationError {
  code: string;
  message: string;
  path?: string;
}

/** Normalization: value → normalized value (stable across equivalent inputs) */
export type GeneNormalizer<T = unknown> = (value: T) => T;

/** IR lowering: value → IR graph fragment */
export type GeneIrLowering<T = unknown> = (value: T, ctx: IrLoweringContext) => GeneIrFragment[];

export interface IrLoweringContext {
  seedId: string;
  geneName: string;
  nodeCounter: { next(): number };
}

/** IR lifting: IR nodes → gene value (reconstruction) */
export type GeneLifting<T = unknown> = (nodes: GeneIrFragment[], ctx: IrLiftingContext) => T;

export interface IrLiftingContext {
  seedId: string;
  geneName: string;
  resolveGeneValue(typeId: string, nodeIds: string[]): unknown;
}

/** IR graph fragment produced by lowering */
export interface GeneIrFragment {
  id: string;
  kind: string;
  type: string;
  value: unknown;
  attributes: Record<string, unknown>;
  provenance: { source: string; originId: string };
}




export interface ProvenanceChain {
  source: 'seed' | 'knowledge' | 'rule' | 'compiler' | 'default';
  originId: string;
  transformation?: string;
}

/** Composition semantics */
export interface GeneCompositionSemantics<T = unknown> {
  compose(a: T, b: T): T;
  identity: T;
  associative: boolean;
}

/** Merge semantics */
export interface GeneMergeSemantics<T = unknown> {
  merge(base: T, incoming: T): T;
  /** Conservative: keep base on conflict; incoming-wins: prefer incoming */
  strategy: 'conservative' | 'incoming-wins';
}

/** Diff semantics */
export interface GeneDiffSemantics<T = unknown> {
  diff(a: T, b: T): GeneDiff;
}

export interface GeneDiff {
  changed: boolean;
  patches: GeneDiffPatch[];
}

export interface GeneDiffPatch {
  op: 'replace' | 'add' | 'remove' | 'move';
  path: string;
  value?: unknown;
}

/** Optional capabilities per §6.1 */
export type GeneOptionalCapability =
  | 'mutation'
  | 'crossover'
  | 'distance'
  | 'interpolation'
  | 'sampling'
  | 'gradient'
  | 'optimization'
  | 'evolution'
  | 'visual-editing';

/** Migration behavior */
export interface GeneMigrationBehavior {
  from: string;
  to: string;
  migrate: (value: unknown) => unknown;
  reversible: boolean;
}

/** Resource estimation */
export interface GeneResourceEstimate {
  compute: 'constant' | 'linear' | 'quadratic' | 'exponential' | 'unknown';
  memory: 'constant' | 'linear' | 'quadratic' | 'exponential' | 'unknown';
  inputSize: number;
}

/** Effect requirements */
export interface GeneEffectRequirement {
  filesystem?: 'read' | 'write' | 'none';
  network?: 'outbound' | 'inbound' | 'none';
  execution?: 'allowed' | 'forbidden';
  nondeterministic?: boolean;
  timeAccess?: boolean;
  environmentAccess?: boolean;
}

/** Complete gene type descriptor per §6.1 */
export interface GeneTypeDescriptor<T = unknown> {
  /** Stable type identifier */
  typeId: GeneTypeId;
  /** Schema version */
  version: string;
  /** Classification */
  classification: GeneTypeClassification;
  /** Value schema for validation */
  valueSchema: GeneValueSchema;
  /** Human description */
  description: string;
  /** Canonicalization */
  canonicalize: GeneCanonicalizer<T>;
  /** Validation */
  validate: GeneValidator<T>;
  /** Normalization */
  normalize?: GeneNormalizer<T>;
  /** IR lowering */
  lowerToIr?: GeneIrLowering<T>;
  /** IR lifting (reconstruction from IR nodes) */
  liftFromIr?: GeneLifting<T>;
  /** Composition semantics */
  composition?: GeneCompositionSemantics<T>;
  /** Merge semantics */
  merge?: GeneMergeSemantics<T>;
  /** Diff semantics */
  diff?: GeneDiffSemantics<T>;
  /** Optional capabilities supported */
  optionalCapabilities: GeneOptionalCapability[];
  /** Migration behaviors */
  migrations: GeneMigrationBehavior[];
  /** Resource estimation */
  resourceEstimate: GeneResourceEstimate;
  /** Effect requirements */
  effectRequirements: GeneEffectRequirement;
  /** Target capabilities required */
  targetCapabilities: string[];
  /** Whether mutation is allowed */
  mutationAllowed: boolean;
  /** Whether crossover is allowed */
  crossoverAllowed: boolean;
}

/** Immutable gene type registry */
export interface GeneTypeRegistry {
  readonly version: string;
  readonly types: ReadonlyMap<GeneTypeId, GeneTypeDescriptor>;
  get(typeId: GeneTypeId): GeneTypeDescriptor | undefined;
  has(typeId: GeneTypeId): boolean;
  list(): GeneTypeDescriptor[];
  listByClassification(c: GeneTypeClassification): GeneTypeDescriptor[];
}

/** Configuration for building an immutable registry */
export interface ImmutableGeneRegistryConfig {
  schemaVersion: string;
  types: GeneTypeDescriptor[];
}

/** Writable registry builder (becomes immutable on .build()) */
export interface ExtensibleGeneRegistry {
  register(descriptor: GeneTypeDescriptor): ExtensibleGeneRegistry;
  build(): GeneTypeRegistry;
  get typeCount(): number;
}
