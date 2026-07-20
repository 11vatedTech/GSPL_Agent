import { describe, it, expect } from 'vitest';
import {
  createImmutableRegistry,
  validateGeneAgainstRegistry,
  classifyGeneType,
  isFundamentalValueKind,
  isCompositeStructure,
  isGraphStructure,
  isDomainSpecificLibrary,
  isSecurityPrimitive,
  isOperatorOrRule,
  RECOVERED_GENE_DISPOSITIONS,
  getDisposition,
} from '../src/index.js';
import type { GeneTypeDescriptor, GeneTypeRegistry } from '../src/index.js';

describe('Gene Protocol — type classification', () => {
  it('all 17 recovered types have dispositions', () => {
    expect(RECOVERED_GENE_DISPOSITIONS.length).toBe(17);
  });

  it('scalar is FUNDAMENTAL_VALUE_KIND with CORE disposition', () => {
    const d = getDisposition('scalar');
    expect(d).toBeDefined();
    expect(d!.classification).toBe('FUNDAMENTAL_VALUE_KIND');
    expect(d!.disposition).toBe('CORE');
  });

  it('struct is COMPOSITE_STRUCTURE with CORE disposition', () => {
    const d = getDisposition('struct');
    expect(d!.classification).toBe('COMPOSITE_STRUCTURE');
    expect(d!.disposition).toBe('CORE');
  });

  it('graph is GRAPH_STRUCTURE with CORE disposition', () => {
    const d = getDisposition('graph');
    expect(d!.classification).toBe('GRAPH_STRUCTURE');
    expect(d!.disposition).toBe('CORE');
  });

  it('field is DOMAIN_SPECIFIC_LIBRARY_TYPE with LIBRARY disposition', () => {
    const d = getDisposition('field');
    expect(d!.classification).toBe('DOMAIN_SPECIFIC_LIBRARY_TYPE');
    expect(d!.disposition).toBe('LIBRARY');
  });

  it('sovereignty is SECURITY_PRIMITIVE with SECURITY disposition', () => {
    const d = getDisposition('sovereignty');
    expect(d!.classification).toBe('SECURITY_PRIMITIVE');
    expect(d!.disposition).toBe('SECURITY');
  });

  it('expression is OPERATOR_OR_RULE with CORE disposition', () => {
    const d = getDisposition('expression');
    expect(d!.classification).toBe('OPERATOR_OR_RULE');
    expect(d!.disposition).toBe('CORE');
  });

  it('classifyGeneType returns RESEARCH_ONLY for unknown types', () => {
    expect(classifyGeneType('unknown-type')).toBe('RESEARCH_ONLY');
  });

  it('helper functions work correctly', () => {
    expect(isFundamentalValueKind('scalar')).toBe(true);
    expect(isFundamentalValueKind('graph')).toBe(false);
    expect(isCompositeStructure('struct')).toBe(true);
    expect(isGraphStructure('graph')).toBe(true);
    expect(isDomainSpecificLibrary('field')).toBe(true);
    expect(isSecurityPrimitive('sovereignty')).toBe(true);
    expect(isOperatorOrRule('expression')).toBe(true);
  });

  it('CORE types include the 8 fundamental kinds', () => {
    const coreTypes = RECOVERED_GENE_DISPOSITIONS
      .filter(d => d.disposition === 'CORE')
      .map(d => d.geneType);
    expect(coreTypes.length).toBe(12);
    expect(coreTypes).toContain('scalar');
    expect(coreTypes).toContain('vector');
    expect(coreTypes).toContain('graph');
    expect(coreTypes).toContain('struct');
    expect(coreTypes).toContain('expression');
  });

  it('LIBRARY types are domain-specific but well-defined', () => {
    const libTypes = RECOVERED_GENE_DISPOSITIONS
      .filter(d => d.disposition === 'LIBRARY')
      .map(d => d.geneType);
    expect(libTypes.length).toBe(4);
  });
});

describe('Gene Protocol — immutable registry', () => {
  function makeTestDescriptor(typeId: string, classification: string): GeneTypeDescriptor {
    return {
      typeId,
      version: '1.0',
      classification: classification as any,
      valueSchema: { type: 'any' },
      description: 'Test gene: ' + typeId,
      canonicalize: (v: unknown) => new Uint8Array(),
      validate: () => ({ ok: true }),
      optionalCapabilities: [],
      migrations: [],
      resourceEstimate: { compute: 'constant', memory: 'constant', inputSize: 0 },
      effectRequirements: {},
      targetCapabilities: [],
      mutationAllowed: true,
      crossoverAllowed: true,
    };
  }

  it('creates registry from config', () => {
    const reg = createImmutableRegistry({
      schemaVersion: '1.0',
      types: [
        makeTestDescriptor('scalar', 'FUNDAMENTAL_VALUE_KIND'),
        makeTestDescriptor('vector', 'FUNDAMENTAL_VALUE_KIND'),
      ],
    });
    expect(reg.has('scalar')).toBe(true);
    expect(reg.has('vector')).toBe(true);
    expect(reg.has('unknown')).toBe(false);
    expect(reg.list().length).toBe(2);
  });

  it('throws on duplicate type ids', () => {
    expect(() =>
      createImmutableRegistry({
        schemaVersion: '1.0',
        types: [
          makeTestDescriptor('scalar', 'FUNDAMENTAL_VALUE_KIND'),
          makeTestDescriptor('scalar', 'FUNDAMENTAL_VALUE_KIND'),
        ],
      })
    ).toThrow('Duplicate gene type');
  });

  it('validates gene values against registry', () => {
    const reg = createImmutableRegistry({
      schemaVersion: '1.0',
      types: [
        {
          ...makeTestDescriptor('scalar', 'FUNDAMENTAL_VALUE_KIND'),
          validate: (v: unknown) =>
            typeof v === 'number' && !Number.isNaN(v)
              ? { ok: true }
              : { ok: false, errors: [{ code: 'BAD', message: 'not a number' }] },
        } as GeneTypeDescriptor,
      ],
    });
    expect(validateGeneAgainstRegistry('scalar', 42, reg).ok).toBe(true);
    expect(validateGeneAgainstRegistry('scalar', 'not-a-number', reg).ok).toBe(false);
    expect(validateGeneAgainstRegistry('unknown', 42, reg).ok).toBe(false);
  });

  it('lists types by classification', () => {
    const reg = createImmutableRegistry({
      schemaVersion: '1.0',
      types: [
        makeTestDescriptor('scalar', 'FUNDAMENTAL_VALUE_KIND'),
        makeTestDescriptor('vector', 'FUNDAMENTAL_VALUE_KIND'),
        makeTestDescriptor('graph', 'GRAPH_STRUCTURE'),
      ],
    });
    expect(reg.listByClassification('FUNDAMENTAL_VALUE_KIND').length).toBe(2);
    expect(reg.listByClassification('GRAPH_STRUCTURE').length).toBe(1);
    expect(reg.listByClassification('RESEARCH_ONLY').length).toBe(0);
  });

  it('registry is immutable after creation', () => {
    const reg = createImmutableRegistry({
      schemaVersion: '1.0',
      types: [makeTestDescriptor('scalar', 'FUNDAMENTAL_VALUE_KIND')],
    });
    expect(reg.has('scalar')).toBe(true);
    // Attempting to mutate via get should not change registry
    const desc = reg.get('scalar');
    expect(desc).toBeDefined();
    // The registry itself should not have a 'register' method
    expect((reg as any).register).toBeUndefined();
  });
});
