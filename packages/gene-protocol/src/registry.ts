import type {
  GeneTypeId,
  GeneTypeDescriptor,
  GeneTypeClassification,
  GeneTypeRegistry,
  ImmutableGeneRegistryConfig,
} from './types.js';
import { RECOVERED_GENE_DISPOSITIONS } from './dispositions.js';

export { RECOVERED_GENE_DISPOSITIONS };

export const GENE_TYPE_CLASSIFICATIONS: readonly GeneTypeClassification[] = [
  'FUNDAMENTAL_VALUE_KIND',
  'COMPOSITE_STRUCTURE',
  'GRAPH_STRUCTURE',
  'DOMAIN_SPECIFIC_LIBRARY_TYPE',
  'OPERATOR_OR_RULE',
  'SECURITY_PRIMITIVE',
  'ANNOTATION',
  'METAPHOR_WITHOUT_DISTINCT_SEMANTICS',
  'RESEARCH_ONLY',
];

export function classifyGeneType(geneType: string): GeneTypeClassification {
  const record = RECOVERED_GENE_DISPOSITIONS.find(d => d.geneType === geneType);
  return record?.classification ?? 'RESEARCH_ONLY';
}

export function isFundamentalValueKind(geneType: string): boolean {
  return classifyGeneType(geneType) === 'FUNDAMENTAL_VALUE_KIND';
}

export function isCompositeStructure(geneType: string): boolean {
  return classifyGeneType(geneType) === 'COMPOSITE_STRUCTURE';
}

export function isGraphStructure(geneType: string): boolean {
  return classifyGeneType(geneType) === 'GRAPH_STRUCTURE';
}

export function isDomainSpecificLibrary(geneType: string): boolean {
  return classifyGeneType(geneType) === 'DOMAIN_SPECIFIC_LIBRARY_TYPE';
}

export function isSecurityPrimitive(geneType: string): boolean {
  return classifyGeneType(geneType) === 'SECURITY_PRIMITIVE';
}

export function isOperatorOrRule(geneType: string): boolean {
  return classifyGeneType(geneType) === 'OPERATOR_OR_RULE';
}

// ── Immutable Gene Type Registry ──

class ImmutableGeneRegistry implements GeneTypeRegistry {
  readonly version: string;
  readonly types: ReadonlyMap<GeneTypeId, GeneTypeDescriptor>;

  constructor(config: ImmutableGeneRegistryConfig) {
    this.version = config.schemaVersion;
    const map = new Map<GeneTypeId, GeneTypeDescriptor>();
    for (const t of config.types) {
      if (map.has(t.typeId)) {
        throw new Error('Duplicate gene type: ' + t.typeId);
      }
      map.set(t.typeId, t);
    }
    this.types = map;
  }

  get(typeId: GeneTypeId): GeneTypeDescriptor | undefined {
    return this.types.get(typeId);
  }

  has(typeId: GeneTypeId): boolean {
    return this.types.has(typeId);
  }

  list(): GeneTypeDescriptor[] {
    return [...this.types.values()];
  }

  listByClassification(c: GeneTypeClassification): GeneTypeDescriptor[] {
    return this.list().filter(t => t.classification === c);
  }
}

export function createImmutableRegistry(config: ImmutableGeneRegistryConfig): GeneTypeRegistry {
  return new ImmutableGeneRegistry(config);
}

// ── Validation ──

export interface GeneRegistryValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateGeneAgainstRegistry(
  geneType: string,
  value: unknown,
  registry: GeneTypeRegistry
): GeneRegistryValidationResult {
  const descriptor = registry.get(geneType);
  if (!descriptor) {
    return { ok: false, errors: ['Unknown gene type: ' + geneType] };
  }
  const result = descriptor.validate(value);
  if (result.ok) return { ok: true, errors: [] };
  return { ok: false, errors: (result.errors ?? []).map(e => e.code + ': ' + e.message) };
}
