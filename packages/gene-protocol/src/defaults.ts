/**
 * Built-in gene type descriptors with lowerToIr / liftFromIr
 */
import type { GeneTypeDescriptor, GeneIrLowering, GeneLifting, IrLoweringContext, IrLiftingContext, GeneTypeRegistry } from './types.js';
import type { GeneIrFragment } from './types.js';
import { canonicalizeAny } from '@gspl/canon-foundation';

function ok() { return { ok: true } as const; }
function id<T>(v: T): T { return v; }
function noEffects() { return { filesystem: 'none' as const, network: 'none' as const, execution: 'forbidden' as const, nondeterministic: false }; }
function est(sz: number) { return { compute: 'linear' as const, memory: 'linear' as const, inputSize: sz }; }
function nid(seedId: string, geneName: string, idx: number, kind: string): string { return 'n:' + seedId + ':' + geneName + ':' + kind + ':' + idx; }
function lowerOne(value: unknown, ctx: IrLoweringContext, type: string, nodeKind?: string): GeneIrFragment[] { const id = nid(ctx.seedId, ctx.geneName, ctx.nodeCounter.next(), nodeKind ?? 'value'); return [{ id, kind: nodeKind ?? 'value', type, value, attributes: {}, provenance: { source: 'seed', originId: ctx.geneName } }]; }
function liftOne(nodes: GeneIrFragment[], fallback: unknown): unknown { const v = nodes[0]?.value; return v !== undefined && v !== null ? v : fallback; }

// ── CORE Descriptors (12) ──
function mkDesc(typeId: string, classification: GeneTypeDescriptor['classification'], desc: string, fallback: unknown): GeneTypeDescriptor {
  return {
    typeId, version: '1.0', classification, description: desc, valueSchema: { type: 'any' },
    canonicalize: ((v: unknown) => canonicalizeAny(v)) as GeneTypeDescriptor['canonicalize'],
    validate: () => ok(),
    normalize: ((v: unknown) => v) as GeneTypeDescriptor['normalize'],
    lowerToIr: ((value: unknown, ctx: IrLoweringContext) => lowerOne(value, ctx, typeId)) as GeneTypeDescriptor['lowerToIr'],
    liftFromIr: ((nodes: GeneIrFragment[]) => liftOne(nodes, fallback)) as GeneTypeDescriptor['liftFromIr'],
    optionalCapabilities: [], migrations: [], resourceEstimate: est(64),
    effectRequirements: noEffects(), targetCapabilities: [],
    mutationAllowed: true, crossoverAllowed: true,
  };
}

// Variance note: `GeneTypeDescriptor<T>` is invariant in T because
// `canonicalize(v: T)` and `validate(v: T)` place T in contravariant position,
// so `GeneTypeDescriptor<unknown>` and `GeneTypeDescriptor<number>` are not
// subtypes. Per thinker recommendation A1, individual descriptors are
// specialized UNIFORMLY as plain `GeneTypeDescriptor`. The public registry
// flattens to one shape anyway.
export const SCALAR_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkDesc('scalar', 'FUNDAMENTAL_VALUE_KIND', 'Continuous numeric value', 0),
  valueSchema: { type: 'number' },
  validate: ((v: unknown) => typeof v === 'number' && Number.isFinite(v) ? ok() : { ok: false, errors: [{ code: 'GSPL-GENE-001', message: 'Not a finite number' }] }) as GeneTypeDescriptor['validate'],
  composition: { compose: (a, b) => (a as number) + (b as number), identity: 0, associative: true },
  merge: { merge: (_b: number, i: number) => i, strategy: 'incoming-wins' },
  diff: { diff: (a, b) => ({ changed: a !== b, patches: a !== b ? [{ op: 'replace' as const, path: '', value: b }] : [] }) },
  optionalCapabilities: ['mutation', 'crossover', 'distance', 'interpolation', 'sampling', 'evolution'],
  resourceEstimate: est(8),
  normalize: undefined,
};

export const CATEGORICAL_DESCRIPTOR = mkDesc('categorical', 'FUNDAMENTAL_VALUE_KIND', 'Discrete label', '');
export const SYMBOLIC_DESCRIPTOR = mkDesc('symbolic', 'FUNDAMENTAL_VALUE_KIND', 'Symbolic token', '');
export const VECTOR_DESCRIPTOR = mkDesc('vector', 'FUNDAMENTAL_VALUE_KIND', 'Ordered tuple of scalars', []);
export const TEMPORAL_DESCRIPTOR = mkDesc('temporal', 'FUNDAMENTAL_VALUE_KIND', 'Time-domain signal', null);
export const DIMENSIONAL_DESCRIPTOR = mkDesc('dimensional', 'FUNDAMENTAL_VALUE_KIND', 'Coordinate-frame', null);
export const EXPRESSION_DESCRIPTOR = mkDesc('expression', 'OPERATOR_OR_RULE', 'Deterministic expression', '');
export const REGULATORY_DESCRIPTOR = mkDesc('regulatory', 'OPERATOR_OR_RULE', 'Conditional logic', null);
export const TOPOLOGY_DESCRIPTOR = mkDesc('topology', 'GRAPH_STRUCTURE', 'Manifold properties', null);

export const STRUCT_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkDesc('struct', 'COMPOSITE_STRUCTURE', 'Composite named fields', {}),
  lowerToIr: (value, ctx) => {
    const fragments: GeneIrFragment[] = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return fragments;
    const sid = nid(ctx.seedId, ctx.geneName, ctx.nodeCounter.next(), 'struct');
    fragments.push({ id: sid, kind: 'gene', type: 'struct', value, attributes: {}, provenance: { source: 'seed', originId: ctx.geneName } });
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      fragments.push({ id: nid(ctx.seedId, ctx.geneName + '.' + key, ctx.nodeCounter.next(), 'value'), kind: 'value', type: typeof val, value: val, attributes: { fieldName: key, parentStruct: sid }, provenance: { source: 'seed', originId: ctx.geneName } });
    }
    return fragments;
  },
  liftFromIr: ((nodes: GeneIrFragment[]) => { const r: Record<string, unknown> = {}; for (const n of nodes) { if (typeof n.attributes?.fieldName === 'string') r[n.attributes.fieldName] = n.value; } return Object.keys(r).length > 0 ? r : {}; }) as GeneTypeDescriptor['liftFromIr'],
  normalize: undefined,
};

export const ARRAY_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkDesc('array', 'COMPOSITE_STRUCTURE', 'Homogeneous collection', []),
  lowerToIr: (value, ctx) => {
    const fragments: GeneIrFragment[] = [];
    if (!Array.isArray(value)) return fragments;
    fragments.push({ id: nid(ctx.seedId, ctx.geneName, ctx.nodeCounter.next(), 'array'), kind: 'gene', type: 'array', value, attributes: { length: value.length }, provenance: { source: 'seed', originId: ctx.geneName } });
    return fragments;
  },
  liftFromIr: ((nodes: GeneIrFragment[]) => { for (const n of nodes) { if (Array.isArray(n.value)) return n.value; } return []; }) as GeneTypeDescriptor['liftFromIr'],
  normalize: undefined,
};

export const GRAPH_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkDesc('graph', 'GRAPH_STRUCTURE', 'Node/edge graph', {}),
  lowerToIr: (value, ctx) => {
    const fragments: GeneIrFragment[] = [];
    if (typeof value !== 'object' || value === null) return fragments;
    const g = value as { nodes?: string[]; edges?: [string, string, string][] };
    fragments.push({ id: nid(ctx.seedId, ctx.geneName, ctx.nodeCounter.next(), 'graph'), kind: 'gene', type: 'graph', value, attributes: { nodeCount: g.nodes?.length ?? 0, edgeCount: g.edges?.length ?? 0 }, provenance: { source: 'seed', originId: ctx.geneName } });
    if (g.nodes) for (const n of g.nodes) fragments.push({ id: nid(ctx.seedId, ctx.geneName + '.' + n, ctx.nodeCounter.next(), 'graph-node'), kind: 'value', type: 'symbolic', value: n, attributes: { graphNodeName: n }, provenance: { source: 'seed', originId: ctx.geneName } });
    if (g.edges) for (const [from, kind, to] of g.edges) fragments.push({ id: nid(ctx.seedId, ctx.geneName + '.edge', ctx.nodeCounter.next(), 'graph-edge'), kind: 'value', type: 'symbolic', value: { from, kind, to }, attributes: { edgeKind: kind }, provenance: { source: 'seed', originId: ctx.geneName } });
    return fragments;
  },
  liftFromIr: ((nodes: GeneIrFragment[]) => {
    const r: { nodes?: string[]; edges?: Array<[string, string, string]> } = {};
    for (const n of nodes) {
      if (typeof n.value === 'string' && n.attributes?.graphNodeName) (r.nodes ??= []).push(n.value);
      if (typeof n.value === 'object' && n.value !== null && n.attributes?.edgeKind) {
        const e = n.value as { from: string; kind: string; to: string };
        (r.edges ??= []).push([e.from, e.kind, e.to]);
      }
    }
    return r;
  }) as GeneTypeDescriptor['liftFromIr'],
  normalize: undefined,
};

// ── Library types (4) ──
const libDesc = (typeId: string): GeneTypeDescriptor => ({ ...mkDesc(typeId, 'DOMAIN_SPECIFIC_LIBRARY_TYPE', typeId + ' domain type', null), mutationAllowed: false, crossoverAllowed: false });
export const FIELD_DESCRIPTOR: GeneTypeDescriptor = libDesc('field');
export const QUANTUM_DESCRIPTOR: GeneTypeDescriptor = libDesc('quantum');
export const GEMATRIA_DESCRIPTOR: GeneTypeDescriptor = libDesc('gematria');
export const RESONANCE_DESCRIPTOR: GeneTypeDescriptor = libDesc('resonance');

export const SOVEREIGNTY_DESCRIPTOR: GeneTypeDescriptor = { ...libDesc('sovereignty'), classification: 'SECURITY_PRIMITIVE', description: 'Cryptographic identity block', resourceEstimate: est(256), normalize: undefined };

// ── Exports ──
export const CORE_GENE_DESCRIPTORS: readonly GeneTypeDescriptor[] = [
  SCALAR_DESCRIPTOR, CATEGORICAL_DESCRIPTOR, SYMBOLIC_DESCRIPTOR, VECTOR_DESCRIPTOR, TEMPORAL_DESCRIPTOR, DIMENSIONAL_DESCRIPTOR,
  EXPRESSION_DESCRIPTOR, REGULATORY_DESCRIPTOR, STRUCT_DESCRIPTOR, ARRAY_DESCRIPTOR, GRAPH_DESCRIPTOR, TOPOLOGY_DESCRIPTOR,
];
export const ALL_GENE_DESCRIPTORS: readonly GeneTypeDescriptor[] = [
  ...CORE_GENE_DESCRIPTORS, FIELD_DESCRIPTOR, QUANTUM_DESCRIPTOR, GEMATRIA_DESCRIPTOR, RESONANCE_DESCRIPTOR, SOVEREIGNTY_DESCRIPTOR,
];

export function createStandardGeneRegistry(): GeneTypeRegistry {
  const m = new Map<string, GeneTypeDescriptor>();
  for (const d of ALL_GENE_DESCRIPTORS) {
    m.set(d.typeId, deepFreezeDescriptor(d));
  }
  // §9 — registry exposes a frozen internal `types` map (typed ReadonlyMap) so
  // the interface contract is honored, while the live writer API (`get`/`has`/
  // `list`) prevents consumers from doing structural mutation through the
  // typed-as-readonly facade. We provide closure-backed operations as the only
  // canonical mutation channel — there is no public `.register()`.
  const typesReadOnly: ReadonlyMap<string, GeneTypeDescriptor> = Object.freeze({
    has: (k: string) => m.has(k),
    get: (k: string) => m.get(k),
    entries: () => m.entries(),
    keys: () => m.keys(),
    values: () => m.values(),
    forEach: (cb: (value: GeneTypeDescriptor, key: string, map: Map<string, GeneTypeDescriptor>) => void, thisArg?: unknown) => m.forEach(cb, thisArg),
    get size() { return m.size; },
    [Symbol.iterator]: () => m[Symbol.iterator](),
  }) as ReadonlyMap<string, GeneTypeDescriptor>;
  return {
    version: '1.0',
    types: typesReadOnly,
    get: (id) => m.get(id),
    has: (id) => m.has(id),
    list: () => [...m.values()],
    listByClassification: (c) => [...m.values()].filter((t) => t.classification === c),
  };
}

function deepFreezeDescriptor<T extends GeneTypeDescriptor>(d: T): T {
  const frozen: T = Object.freeze({ ...d });
  if (frozen.optionalCapabilities) Object.freeze(frozen.optionalCapabilities as readonly string[]);
  if (frozen.migrations) Object.freeze(frozen.migrations as readonly unknown[]);
  if (frozen.targetCapabilities) Object.freeze(frozen.targetCapabilities as readonly string[]);
  return frozen;
}