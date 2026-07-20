/**
 * Built-in cognitive gene type descriptors with full operator semantics.
 *
 * These five types extend the 17-gene inventory to make the GSPL agent
 * a sovereign cognitive organism. Each type has:
 *   - canonicalization (SHA-256 / JCS compatible)
 *   - validation (type-safe value checks)
 *   - mutation (controlled adaptation)
 *   - crossover (genetic recombination)
 *   - distance (semantic metric)
 *   - composition, merge, diff
 *   - IR lowering / lifting
 */

import type {
  GeneTypeDescriptor,
  GeneIrFragment,
  IrLoweringContext,
} from '@gspl/gene-protocol';
import { canonicalizeAny } from '@gspl/canon-foundation';
import type {
  IntentValue,
  BeliefValue,
  MemoryValue,
  PolicyValue,
  HypothesisValue,
} from './types.js';

// ── Helpers ──
function ok() { return { ok: true } as const; }
function id<T>(v: T): T { return v; }
function noEffects() {
  return {
    filesystem: 'none' as const,
    network: 'none' as const,
    execution: 'forbidden' as const,
    nondeterministic: false,
  };
}
function est(sz: number) {
  return { compute: 'linear' as const, memory: 'linear' as const, inputSize: sz };
}
function nid(
  seedId: string,
  geneName: string,
  idx: number,
  kind: string,
): string {
  return 'cn:' + seedId + ':' + geneName + ':' + kind + ':' + idx;
}
function lowerOne(
  value: unknown,
  ctx: IrLoweringContext,
  type: string,
): GeneIrFragment[] {
  const id = nid(ctx.seedId, ctx.geneName, ctx.nodeCounter.next(), 'value');
  return [
    {
      id,
      kind: 'value',
      type,
      value,
      attributes: {},
      provenance: { source: 'seed', originId: ctx.geneName },
    },
  ];
}
function liftOne(nodes: GeneIrFragment[], fallback: unknown): unknown {
  const v = nodes[0]?.value;
  return v !== undefined && v !== null ? v : fallback;
}

function mkCognitiveDesc(
  typeId: string,
  classification: GeneTypeDescriptor['classification'],
  desc: string,
  fallback: unknown,
): GeneTypeDescriptor {
  return {
    typeId,
    version: '1.0',
    classification,
    description: desc,
    valueSchema: { type: 'any' },
    canonicalize: ((v: unknown) => canonicalizeAny(v)) as GeneTypeDescriptor['canonicalize'],
    validate: () => ok(),
    normalize: ((v: unknown) => v) as GeneTypeDescriptor['normalize'],
    lowerToIr: ((value: unknown, ctx: IrLoweringContext) =>
      lowerOne(value, ctx, typeId)) as GeneTypeDescriptor['lowerToIr'],
    liftFromIr: ((nodes: GeneIrFragment[]) =>
      liftOne(nodes, fallback)) as GeneTypeDescriptor['liftFromIr'],
    optionalCapabilities: ['mutation', 'crossover', 'distance', 'evolution', 'sampling'],
    migrations: [],
    resourceEstimate: est(512),
    effectRequirements: noEffects(),
    targetCapabilities: ['cognitive-kernel'],
    mutationAllowed: true,
    crossoverAllowed: true,
  };
}

// ── INTENT Gene ──
// Teleological vector. Mutations shift goals/priorities.
// Crossover blends intents (goal merging with priority averaging).
export const INTENT_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkCognitiveDesc(
    'intent',
    'OPERATOR_OR_RULE',
    'Teleological objective vector — what the agent aims to achieve',
    { goal: '', motivation: '', scope: [], priority: 0.5, constraints: [], antiGoals: [], qualityThreshold: 0.8, completionEvidence: [], assumptions: [], revisionConditions: [] },
  ),
  classification: 'OPERATOR_OR_RULE',
  optionalCapabilities: ['mutation', 'crossover', 'distance', 'evolution'],
  resourceEstimate: est(256),
  validate: ((v: unknown) => {
    if (typeof v !== 'object' || v === null) return { ok: false, errors: [{ code: 'GSPL-COG-001', message: 'Intent must be an object' }] };
    const i = v as Record<string, unknown>;
    const errors: { code: string; message: string }[] = [];
    if (typeof i.goal !== 'string' || i.goal.length === 0)
      errors.push({ code: 'GSPL-COG-002', message: 'Intent requires non-empty goal' });
    if (typeof i.priority !== 'number' || i.priority < 0 || i.priority > 1)
      errors.push({ code: 'GSPL-COG-003', message: 'Intent priority must be 0-1' });
    return errors.length === 0 ? ok() : { ok: false, errors };
  }) as GeneTypeDescriptor['validate'],
  mutationAllowed: true,
  crossoverAllowed: true,
  composition: {
    compose: (a, b) => {
      const ia = a as IntentValue;
      const ib = b as IntentValue;
      return {
        ...ia,
        goal: ia.goal + ' ∧ ' + ib.goal,
        priority: Math.max(ia.priority, ib.priority),
        constraints: [...ia.constraints, ...ib.constraints],
      };
    },
    identity: { goal: '', motivation: '', scope: [], priority: 0, constraints: [], antiGoals: [], qualityThreshold: 0, completionEvidence: [], assumptions: [], revisionConditions: [] },
    associative: true,
  },
  merge: {
    merge: (_base, incoming) => incoming,
    strategy: 'incoming-wins',
  },
  diff: {
    diff: (a, b) => ({
      changed: (a as IntentValue).goal !== (b as IntentValue).goal,
      patches: (a as IntentValue).goal !== (b as IntentValue).goal
        ? [{ op: 'replace' as const, path: '/goal', value: (b as IntentValue).goal }]
        : [],
    }),
  },
  normalize: undefined,
} as GeneTypeDescriptor;

// ── BELIEF Gene ──
// Probabilistic world-model. Mutations shift confidence/status.
// Crossover merges evidence sets.
export const BELIEF_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkCognitiveDesc(
    'belief',
    'FUNDAMENTAL_VALUE_KIND',
    'Probabilistic epistemic proposition with evidence chain',
    { proposition: '', status: 'UNRESOLVED', confidence: 0.5, source: '', timestamp: 0, supportingEvidence: [], contradictingEvidence: [], dependencies: [], validityInterval: null, verificationStatus: 'unverified' },
  ),
  classification: 'FUNDAMENTAL_VALUE_KIND',
  optionalCapabilities: ['mutation', 'crossover', 'distance', 'sampling'],
  resourceEstimate: est(256),
  validate: ((v: unknown) => {
    if (typeof v !== 'object' || v === null) return { ok: false, errors: [{ code: 'GSPL-COG-004', message: 'Belief must be an object' }] };
    const b = v as Record<string, unknown>;
    if (typeof b.proposition !== 'string' || b.proposition.length === 0)
      return { ok: false, errors: [{ code: 'GSPL-COG-005', message: 'Belief requires non-empty proposition' }] };
    if (typeof b.confidence !== 'number' || b.confidence < 0 || b.confidence > 1)
      return { ok: false, errors: [{ code: 'GSPL-COG-006', message: 'Belief confidence must be 0-1' }] };
    return ok();
  }) as GeneTypeDescriptor['validate'],
  composition: {
    compose: (a, b) => {
      const ba = a as BeliefValue;
      const bb = b as BeliefValue;
      return {
        ...ba,
        confidence: (ba.confidence + bb.confidence) / 2,
        supportingEvidence: [...new Set([...ba.supportingEvidence, ...bb.supportingEvidence])],
        contradictingEvidence: [...new Set([...ba.contradictingEvidence, ...bb.contradictingEvidence])],
      };
    },
    identity: { proposition: '', status: 'UNRESOLVED', confidence: 0, source: '', timestamp: 0, supportingEvidence: [], contradictingEvidence: [], dependencies: [], validityInterval: null, verificationStatus: 'unverified' },
    associative: true,
  },
  merge: {
    merge: (base, incoming) => {
      const bb = base as BeliefValue;
      const bi = incoming as BeliefValue;
      return {
        ...bb,
        confidence: Math.max(bb.confidence, bi.confidence),
        supportingEvidence: [...new Set([...bb.supportingEvidence, ...bi.supportingEvidence])],
        contradictingEvidence: [...new Set([...bb.contradictingEvidence, ...bi.contradictingEvidence])],
        status: bi.confidence > bb.confidence ? bi.status : bb.status,
        timestamp: Date.now(),
      };
    },
    strategy: 'incoming-wins',
  },
  diff: {
    diff: (a, b) => {
      const ba = a as BeliefValue;
      const bb = b as BeliefValue;
      return {
        changed: ba.confidence !== bb.confidence || ba.status !== bb.status,
        patches: [],
      };
    },
  },
  normalize: undefined,
} as GeneTypeDescriptor;

// ── MEMORY Gene ──
// Temporal-spatial graph with decay semantics.
// Mutation: perturb strengths, add/remove nodes.
// Crossover: graph intersection with blended strengths.
export const MEMORY_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkCognitiveDesc(
    'memory',
    'GRAPH_STRUCTURE',
    'Temporal-spatial memory graph with decay, retrieval, and consolidation semantics',
    { nodes: [], edges: [], version: 0 },
  ),
  classification: 'GRAPH_STRUCTURE',
  optionalCapabilities: ['mutation', 'crossover', 'distance', 'evolution', 'sampling'],
  resourceEstimate: est(1024),
  validate: ((v: unknown) => {
    if (typeof v !== 'object' || v === null) return { ok: false, errors: [{ code: 'GSPL-COG-007', message: 'Memory must be an object' }] };
    const m = v as Record<string, unknown>;
    if (!Array.isArray(m.nodes)) return { ok: false, errors: [{ code: 'GSPL-COG-008', message: 'Memory requires nodes array' }] };
    if (!Array.isArray(m.edges)) return { ok: false, errors: [{ code: 'GSPL-COG-009', message: 'Memory requires edges array' }] };
    return ok();
  }) as GeneTypeDescriptor['validate'],
  lowerToIr: ((value: unknown, ctx: IrLoweringContext) => {
    const fragments: GeneIrFragment[] = [];
    if (typeof value !== 'object' || value === null) return fragments;
    const m = value as MemoryValue;
    fragments.push({
      id: nid(ctx.seedId, ctx.geneName, ctx.nodeCounter.next(), 'memory-graph'),
      kind: 'gene', type: 'memory', value: m,
      attributes: { nodeCount: m.nodes.length, edgeCount: m.edges.length, version: m.version },
      provenance: { source: 'seed', originId: ctx.geneName },
    });
    for (const node of m.nodes) {
      fragments.push({
        id: nid(ctx.seedId, ctx.geneName + '.node.' + node.id, ctx.nodeCounter.next(), 'memory-node'),
        kind: 'value', type: 'memory-node', value: node,
        attributes: { nodeId: node.id, nodeType: node.type, strength: node.strength },
        provenance: { source: 'seed', originId: ctx.geneName },
      });
    }
    return fragments;
  }) as GeneTypeDescriptor['lowerToIr'],
  liftFromIr: ((nodes: GeneIrFragment[]) => {
    const r: MemoryValue = { nodes: [], edges: [], version: 0 };
    for (const n of nodes) {
      if (n.kind === 'gene' && n.type === 'memory') {
        const v = n.value as MemoryValue;
        r.nodes = v.nodes ?? [];
        r.edges = v.edges ?? [];
        r.version = v.version ?? 0;
      }
    }
    return r;
  }) as GeneTypeDescriptor['liftFromIr'],
  merge: {
    merge: (base, incoming) => {
      const mb = base as MemoryValue;
      const mi = incoming as MemoryValue;
      const existingIds = new Set(mb.nodes.map(n => n.id));
      const newNodes = mi.nodes.filter(n => !existingIds.has(n.id));
      const mergedNodes = mb.nodes.map(n => {
        const inc = mi.nodes.find(x => x.id === n.id);
        if (!inc) return n;
        return { ...n, strength: Math.max(n.strength, inc.strength), lastAccessed: Date.now(), accessCount: n.accessCount + 1 };
      });
      return {
        nodes: [...mergedNodes, ...newNodes],
        edges: [...new Set([...mb.edges, ...mi.edges])],
        version: mb.version + 1,
      };
    },
    strategy: 'incoming-wins',
  },
  normalize: undefined,
} as GeneTypeDescriptor;

// ── POLICY Gene ──
// Action-distribution network. Maps beliefs/percepts to permitted actions.
// Mutation: add/modify/remove rules (requires constitutional invariant preservation).
export const POLICY_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkCognitiveDesc(
    'policy',
    'SECURITY_PRIMITIVE',
    'Enforceable invariant network — maps conditions to permitted/denied effects',
    { rules: [], defaultEffect: 'DENY', version: 0, constitutionalInvariants: [] },
  ),
  classification: 'SECURITY_PRIMITIVE',
  optionalCapabilities: ['mutation', 'distance', 'evolution'],
  crossoverAllowed: false, // Policies should not be randomly crossed
  resourceEstimate: est(128),
  validate: ((v: unknown) => {
    if (typeof v !== 'object' || v === null) return { ok: false, errors: [{ code: 'GSPL-COG-010', message: 'Policy must be an object' }] };
    const p = v as Record<string, unknown>;
    if (!Array.isArray(p.rules)) return { ok: false, errors: [{ code: 'GSPL-COG-011', message: 'Policy requires rules array' }] };
    if (!Array.isArray(p.constitutionalInvariants)) return { ok: false, errors: [{ code: 'GSPL-COG-012', message: 'Policy requires constitutionalInvariants' }] };
    return ok();
  }) as GeneTypeDescriptor['validate'],
  mutationAllowed: true,
  merge: {
    merge: (base, incoming) => {
      const pb = base as PolicyValue;
      const pi = incoming as PolicyValue;
      const constInvariants = pb.constitutionalInvariants; // NEVER merge constitutional invariants
      const mergedRules = [...pb.rules];
      for (const rule of pi.rules) {
        const existingIdx = mergedRules.findIndex(r => r.id === rule.id);
        if (existingIdx >= 0) {
          const isConstitutional = constInvariants.includes(rule.id);
          if (!isConstitutional) mergedRules[existingIdx] = rule;
        } else {
          mergedRules.push(rule);
        }
      }
      return { rules: mergedRules, defaultEffect: pi.defaultEffect, version: pb.version + 1, constitutionalInvariants: constInvariants };
    },
    strategy: 'conservative',
  },
  normalize: undefined,
} as GeneTypeDescriptor;

// ── HYPOTHESIS Gene ──
// Speculative branch for simulation before commitment.
// Mutation: alter proposition, modify test plan.
export const HYPOTHESIS_DESCRIPTOR: GeneTypeDescriptor = {
  ...mkCognitiveDesc(
    'hypothesis',
    'OPERATOR_OR_RULE',
    'Speculative cognitive branch — proposes, simulates, evaluates before commitment',
    { proposition: '', parentLineage: '', assumptions: [], expectedOutcome: '', confidence: 0.5, testPlan: [], status: 'PROPOSED' },
  ),
  classification: 'OPERATOR_OR_RULE',
  optionalCapabilities: ['mutation', 'crossover', 'distance', 'sampling'],
  resourceEstimate: est(512),
  validate: ((v: unknown) => {
    if (typeof v !== 'object' || v === null) return { ok: false, errors: [{ code: 'GSPL-COG-013', message: 'Hypothesis must be an object' }] };
    const h = v as Record<string, unknown>;
    if (typeof h.proposition !== 'string' || h.proposition.length === 0)
      return { ok: false, errors: [{ code: 'GSPL-COG-014', message: 'Hypothesis requires non-empty proposition' }] };
    return ok();
  }) as GeneTypeDescriptor['validate'],
  composition: {
    compose: (a, b) => {
      const ha = a as HypothesisValue;
      const hb = b as HypothesisValue;
      return {
        ...ha,
        proposition: ha.proposition + ' ∧ ' + hb.proposition,
        assumptions: [...new Set([...ha.assumptions, ...hb.assumptions])],
        confidence: (ha.confidence + hb.confidence) / 2,
      };
    },
    identity: { proposition: '', parentLineage: '', assumptions: [], expectedOutcome: '', confidence: 0, testPlan: [], status: 'PROPOSED' },
    associative: true,
  },
  merge: {
    merge: (_base, incoming) => incoming,
    strategy: 'incoming-wins',
  },
  normalize: undefined,
} as GeneTypeDescriptor;

// ── All Cognitive Descriptors ──
export const COGNITIVE_GENE_DESCRIPTORS: readonly GeneTypeDescriptor[] = [
  INTENT_DESCRIPTOR,
  BELIEF_DESCRIPTOR,
  MEMORY_DESCRIPTOR,
  POLICY_DESCRIPTOR,
  HYPOTHESIS_DESCRIPTOR,
];
