/**
 * GSPL Agent Cognitive Gene Types
 *
 * Extends the 17-gene inventory with five cognitive gene types
 * that make the GSPL agent a sovereign cognitive organism.
 *
 * These types are first-class gene types with full operator semantics
 * (mutation, crossover, distance, validation, canonicalization, IR lowering/lifting).
 *
 * Per the thinker's architecture:
 *   intent    — Teleological vector; defines objective gradients
 *   belief    — Probabilistic world-model (quantum extension)
 *   memory    — Temporal-spatial graph; episodic history with decay
 *   policy    — Action-distribution network (regulatory extension)
 *   hypothesis — Speculative branch; nested sub-seed for simulation
 */

import type {
  GeneTypeDescriptor,
  GeneTypeClassification,
  GeneIrFragment,
  IrLoweringContext,
  IrLiftingContext,
} from '@gspl/gene-protocol';

// ── Cognitive gene type identifiers ──
export const COGNITIVE_GENE_TYPE_IDS = [
  'intent',
  'belief',
  'memory',
  'policy',
  'hypothesis',
] as const;

export type CognitiveGeneTypeId = (typeof COGNITIVE_GENE_TYPE_IDS)[number];

export function isCognitiveGeneType(id: string): id is CognitiveGeneTypeId {
  return (COGNITIVE_GENE_TYPE_IDS as readonly string[]).includes(id);
}

// ── Intent Gene ──
// An intent is a structured objective: { goal: string, motivation: string,
//   scope: string[], priority: number, constraints: Constraint[],
//   antiGoals: string[], qualityThreshold: number, completionEvidence: string[] }

export interface IntentValue {
  goal: string;
  motivation: string;
  scope: string[];
  priority: number; // 0-1
  constraints: IntentConstraint[];
  antiGoals: string[];
  qualityThreshold: number; // 0-1
  completionEvidence: string[];
  assumptions: string[];
  revisionConditions: string[];
}

export interface IntentConstraint {
  name: string;
  predicate: string;
  severity: 'hard' | 'soft';
  weight: number;
}

export function validateIntent(v: unknown): v is IntentValue {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  return (
    typeof i.goal === 'string' &&
    typeof i.motivation === 'string' &&
    Array.isArray(i.scope) &&
    typeof i.priority === 'number' &&
    i.priority >= 0 && i.priority <= 1 &&
    Array.isArray(i.constraints) &&
    Array.isArray(i.antiGoals) &&
    typeof i.qualityThreshold === 'number' &&
    i.qualityThreshold >= 0 && i.qualityThreshold <= 1
  );
}

// ── Belief Gene ──
// A belief is a probabilistic claim about the world.
// Extends quantum: carries a proposition + probability distribution.

export type EpistemicStatus =
  | 'KNOWN'
  | 'BELIEVED'
  | 'INFERRED'
  | 'ASSUMED'
  | 'SIMULATED'
  | 'PREDICTED'
  | 'REPORTED'
  | 'OBSERVED'
  | 'VERIFIED'
  | 'PROVEN'
  | 'DISPROVEN'
  | 'OBSOLETE'
  | 'UNRESOLVED';

export interface BeliefValue {
  proposition: string;
  status: EpistemicStatus;
  confidence: number; // 0-1
  source: string;
  timestamp: number; // epoch ms
  supportingEvidence: string[]; // evidence hashes
  contradictingEvidence: string[];
  dependencies: string[]; // belief hashes this depends on
  validityInterval: { start: number; end?: number } | null;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'failed';
}

// ── Memory Gene ──
// Memory is a temporal-spatial graph with decay semantics.

export type MemoryType =
  | 'WORKING'
  | 'EPISODIC'
  | 'SEMANTIC'
  | 'PROCEDURAL'
  | 'PROJECT'
  | 'EVIDENCE'
  | 'FAILURE'
  | 'CAPABILITY'
  | 'IDENTITY';

export interface MemoryNode {
  id: string;
  type: MemoryType;
  content: unknown;
  created: number;
  lastAccessed: number;
  accessCount: number;
  decayRate: number; // 0-1, rate of strength decay
  strength: number; // 0-1, current retention strength
  confidence: number; // 0-1
  epistemicStatus: EpistemicStatus;
  privacy: 'private' | 'project' | 'shared';
  tags: string[];
  contentHash: string;
}

export interface MemoryEdge {
  from: string;
  to: string;
  relation: string;
  strength: number;
  created: number;
}

export interface MemoryValue {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  version: number;
}

// ── Policy Gene ──
// A policy is an enforceable invariant, not advisory text.
// Maps conditions to permitted/denied actions.

export type PolicyEffect = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'LOG_ONLY';

export interface PolicyRule {
  id: string;
  description: string;
  condition: PolicyCondition;
  effect: PolicyEffect;
  priority: number;
  scope: string[]; // subsystems this applies to
}

export interface PolicyCondition {
  action?: string;
  target?: string;
  dataSensitivity?: 'public' | 'internal' | 'sensitive' | 'secret';
  sourceTrust?: 'trusted' | 'untrusted' | 'unknown';
  reversibility?: 'reversible' | 'compensatable' | 'irreversible';
  resourceBudget?: { cpu?: number; memory?: number; timeMs?: number };
  customPredicate?: string;
}

export interface PolicyValue {
  rules: PolicyRule[];
  defaultEffect: PolicyEffect;
  version: number;
  constitutionalInvariants: string[]; // immutable constitutional laws
}

// ── Hypothesis Gene ──
// A hypothesis is a speculative branch: a nested sub-seed for simulation.

export interface HypothesisValue {
  proposition: string;
  parentLineage: string;
  assumptions: string[];
  expectedOutcome: string;
  confidence: number;
  testPlan: string[];
  simulationSeed?: unknown; // nested seed for simulation
  status: 'PROPOSED' | 'SIMULATING' | 'EVALUATED' | 'ACCEPTED' | 'REJECTED';
  results?: {
    outcome: string;
    evidence: string[];
    confidenceDelta: number;
    timestamp: number;
  };
}

// ── Cognitive Gene Type Registry Extension ──

export interface CognitiveGeneRegistry {
  readonly intent: GeneTypeDescriptor;
  readonly belief: GeneTypeDescriptor;
  readonly memory: GeneTypeDescriptor;
  readonly policy: GeneTypeDescriptor;
  readonly hypothesis: GeneTypeDescriptor;
}
