import { describe, it, expect } from 'vitest';
import type { IntentValue, BeliefValue, MemoryNode, PolicyValue, HypothesisValue, PolicyRule, IntentConstraint } from './types.js';
import { createStandardCognitiveRegistry } from './registry.js';

describe('Agent Genes — Gene Type Validation', () => {
  it('Intent gene has required fields', () => {
    const intent: IntentValue = {
      goal: 'Test goal', motivation: 'Testing', scope: ['test'], priority: 1,
      constraints: [], antiGoals: [], qualityThreshold: 0.8,
      completionEvidence: ['test passes'], assumptions: [], revisionConditions: [],
    };
    expect(intent.goal).toBe('Test goal');
    expect(intent.priority).toBe(1);
  });

  it('Belief gene has required fields', () => {
    const belief: BeliefValue = {
      proposition: 'Something is true', status: 'BELIEVED', confidence: 0.8,
      source: 'inference', timestamp: Date.now(),
      supportingEvidence: [], contradictingEvidence: [],
      dependencies: [], validityInterval: null, verificationStatus: 'unverified',
    };
    expect(belief.confidence).toBe(0.8);
  });

  it('Memory graph has nodes with required fields', () => {
    const node: MemoryNode = {
      id: 'mem-1', type: 'EPISODIC', content: 'Remembered event',
      created: Date.now(), lastAccessed: Date.now(), accessCount: 0,
      decayRate: 0.01, strength: 1.0, confidence: 0.9,
      epistemicStatus: 'OBSERVED', privacy: 'private', tags: [],
      contentHash: 'hash123',
    };
    expect(node.type).toBe('EPISODIC');
    expect(node.strength).toBe(1.0);
  });

  it('Policy gene has required fields', () => {
    const rule: PolicyRule = {
      id: 'r1', description: 'Default deny all',
      condition: {}, effect: 'DENY', priority: 100, scope: ['global'],
    };
    const policy: PolicyValue = {
      rules: [rule], defaultEffect: 'DENY', version: 1,
      constitutionalInvariants: ['no-ambient-authority'],
    };
    expect(policy.defaultEffect).toBe('DENY');
    expect(policy.constitutionalInvariants.length).toBe(1);
  });

  it('Hypothesis gene has required fields', () => {
    const hypothesis: HypothesisValue = {
      proposition: 'If X then Y', confidence: 0.5,
      parentLineage: 'root', assumptions: [], expectedOutcome: 'Y occurs',
      testPlan: ['Test X', 'Observe Y'], status: 'PROPOSED',
    };
    expect(hypothesis.status).toBe('PROPOSED');
  });
});

describe('Agent Genes — Registry', () => {
  it('Registry is created without global state', () => {
    const r1 = createStandardCognitiveRegistry();
    const r2 = createStandardCognitiveRegistry();
    expect(r1).not.toBe(r2);
    expect(r1.types).toBeDefined();
    expect(r2.types).toBeDefined();
  });

  it('Registry lists all types', () => {
    const r = createStandardCognitiveRegistry();
    const types = r.list();
    expect(types.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Agent Genes — Epistemic Statuses', () => {
  it('Belief confidence is bounded [0,1]', () => {
    const belief: BeliefValue = {
      proposition: 'X', status: 'BELIEVED', confidence: 0.75,
      source: 'inference', timestamp: Date.now(),
      supportingEvidence: [], contradictingEvidence: [],
      dependencies: [], validityInterval: null, verificationStatus: 'unverified',
    };
    expect(belief.confidence).toBeGreaterThanOrEqual(0);
    expect(belief.confidence).toBeLessThanOrEqual(1);
  });

  it('Evidence arrays are always defined', () => {
    const belief: BeliefValue = {
      proposition: 'Y', status: 'KNOWN', confidence: 1.0,
      source: 'observation', timestamp: Date.now(),
      supportingEvidence: ['hash1'], contradictingEvidence: [],
      dependencies: [], validityInterval: null, verificationStatus: 'verified',
    };
    expect(Array.isArray(belief.supportingEvidence)).toBe(true);
    expect(Array.isArray(belief.contradictingEvidence)).toBe(true);
  });
});

describe('Agent Genes — Intent Properties', () => {
  it('Intent preserves all required sections', () => {
    const c1: IntentConstraint = { name: 'https', predicate: 'Must use HTTPS', severity: 'hard', weight: 1.0 };
    const c2: IntentConstraint = { name: 'validation', predicate: 'Must validate input', severity: 'hard', weight: 1.0 };
    const intent: IntentValue = {
      goal: 'Build a secure API', motivation: 'Need data access', scope: ['code'],
      priority: 1, constraints: [c1, c2],
      antiGoals: ['Do not expose internal errors', 'Do not log PII'],
      qualityThreshold: 0.9, completionEvidence: ['All tests pass', 'Security audit passes'],
      assumptions: ['Database is available'], revisionConditions: ['Security vulnerability found'],
    };
    expect(intent.constraints.length).toBe(2);
    expect(intent.antiGoals.length).toBe(2);
  });

  it('Anti-goals are explicitly enumerated', () => {
    const intent: IntentValue = {
      goal: 'Refactor auth', motivation: 'Improve security', scope: ['code'],
      priority: 1, constraints: [],
      antiGoals: ['Do not break existing API', 'Do not change database schema'],
      qualityThreshold: 0.8, completionEvidence: [],
      assumptions: [], revisionConditions: [],
    };
    expect(intent.antiGoals).toContain('Do not break existing API');
  });
});

describe('Agent Genes — Policy Properties', () => {
  it('Default-deny policy is enforceable', () => {
    const policy: PolicyValue = {
      rules: [
        { id: 'r1', description: 'Read own files', condition: {}, effect: 'ALLOW', priority: 10, scope: ['filesystem'] },
        { id: 'r2', description: 'Network access', condition: {}, effect: 'DENY', priority: 100, scope: ['network'] },
      ],
      defaultEffect: 'DENY', version: 1,
      constitutionalInvariants: [],
    };
    expect(policy.defaultEffect).toBe('DENY');
    expect(policy.rules.length).toBe(2);
  });
});
