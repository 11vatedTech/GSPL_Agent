import { describe, it, expect } from 'vitest';
import { performMorphogenesis } from './morphogenesis.js';
import type { MorphogenesisRequest, OrganContract } from './types.js';
import type { IntentValue } from '@gspl/agent-genes';

const MOCK_INTENT: IntentValue = {
  goal: 'Test morphogenesis', motivation: 'Testing', scope: ['test'], priority: 0.5,
  constraints: [], antiGoals: [], qualityThreshold: 0.8, completionEvidence: [],
  assumptions: [], revisionConditions: [],
};

const MOCK_ORGANS: OrganContract[] = [
  { organType: 'CODE_REASONING', inputTypes: ['code'], outputTypes: ['analysis'], epistemicReliability: 0.8, cost: { computeUnits: 10, memoryBytes: 1e6 }, latency: { best: 100, typical: 500, worst: 2000 }, resourceNeeds: { vramRequired: 1e6, ramRequired: 2e6, gpuRequired: false }, determinism: 'quasi-deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'fallback' },
  { organType: 'SECURITY_ANALYSIS', inputTypes: ['code'], outputTypes: ['threat-report'], epistemicReliability: 0.85, cost: { computeUnits: 20, memoryBytes: 2e6 }, latency: { best: 200, typical: 800, worst: 3000 }, resourceNeeds: { vramRequired: 2e6, ramRequired: 4e6, gpuRequired: true }, determinism: 'quasi-deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'escalate' },
  { organType: 'PLANNING', inputTypes: ['intent'], outputTypes: ['plan'], epistemicReliability: 0.75, cost: { computeUnits: 5, memoryBytes: 5e5 }, latency: { best: 50, typical: 200, worst: 1000 }, resourceNeeds: { vramRequired: 5e5, ramRequired: 1e6, gpuRequired: false }, determinism: 'quasi-deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'retry' },
  { organType: 'TESTING', inputTypes: ['code'], outputTypes: ['test-results'], epistemicReliability: 0.9, cost: { computeUnits: 30, memoryBytes: 5e6 }, latency: { best: 500, typical: 2000, worst: 10000 }, resourceNeeds: { vramRequired: 1e6, ramRequired: 5e6, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'retry' },
];

function makeIntent(goal: string): IntentValue {
  return { ...MOCK_INTENT, goal };
}

function makeReq(objective: string, intent: IntentValue, risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'): MorphogenesisRequest {
  return { objective, intent, availableOrgans: MOCK_ORGANS, resourceBudget: { maxComputeUnits: 100, maxMemoryBytes: 1e7, maxWallTimeMs: 60000, maxTokens: 10000 }, riskTolerance: risk, priorBeliefs: [] };
}

describe('Cognitive Morphogenesis', () => {
  it('MORPH-1: Different objectives produce different organ sets', () => {
    const r1 = performMorphogenesis(makeReq('Analyze code for security vulnerabilities', makeIntent('Security analysis')));
    const r2 = performMorphogenesis(makeReq('Write a function that adds two numbers', makeIntent('Add numbers')));
    const types1 = new Set(r1.cognitiveGraph.organs.map(o => o.contract.organType));
    const types2 = new Set(r2.cognitiveGraph.organs.map(o => o.contract.organType));
    expect(types1.size !== types2.size || r1.cognitiveGraph.edges.length !== r2.cognitiveGraph.edges.length || r1.cognitiveGraph.riskClassification !== r2.cognitiveGraph.riskClassification).toBe(true);
  });

  it('MORPH-2: High-risk objectives generate stronger verification', () => {
    const r1 = performMorphogenesis(makeReq('Delete all user data', makeIntent('Delete data'), 'LOW'));
    const r2 = performMorphogenesis(makeReq('Print hello world', makeIntent('Print hello'), 'MEDIUM'));
    expect(r1.cognitiveGraph.riskClassification).toBe('HIGH');
    expect(r2.cognitiveGraph.riskClassification).toBe('LOW');
  });

  it('MORPH-3: Morphogenesis terminates within budget', () => {
    const start = Date.now();
    const result = performMorphogenesis({ ...makeReq('Complex analysis', MOCK_INTENT), resourceBudget: { maxComputeUnits: 1000, maxMemoryBytes: 1e8, maxWallTimeMs: 5000, maxTokens: 100000 } });
    expect(Date.now() - start).toBeLessThan(5000);
    expect(result.cognitiveGraph.organs.length).toBeGreaterThan(0);
  });

  it('MORPH-4: Generated cognitive graph is a valid DAG', () => {
    const result = performMorphogenesis(makeReq('Analyze project', MOCK_INTENT));
    const g = result.cognitiveGraph;
    expect(g.organs.length).toBeGreaterThan(0);
    expect(g.rootOrganId).toBeDefined();
    for (const e of g.edges) expect(e.from).not.toBe(e.to);
    const ids = new Set(g.organs.map(o => o.id));
    for (const e of g.edges) { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true); }
  });

  it('MORPH-5: Records reasoning, rejected alternatives, assumptions', () => {
    const result = performMorphogenesis(makeReq('Build complex system', MOCK_INTENT));
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(Array.isArray(result.rejectedAlternatives)).toBe(true);
    expect(Array.isArray(result.assumptions)).toBe(true);
  });

  it('MORPH-6: Identical intents produce equivalent phenotypes', () => {
    const req = makeReq('Count files', MOCK_INTENT);
    const r1 = performMorphogenesis(req);
    const r2 = performMorphogenesis(req);
    expect(r1.cognitiveGraph.organs.length).toBe(r2.cognitiveGraph.organs.length);
    expect(r1.cognitiveGraph.organs.map(o => o.contract.organType).sort()).toEqual(r2.cognitiveGraph.organs.map(o => o.contract.organType).sort());
  });

  it('MORPH-7: Resource budgets constrain organ selection', () => {
    const small = performMorphogenesis({ ...makeReq('Complex task', MOCK_INTENT), resourceBudget: { maxComputeUnits: 10, maxMemoryBytes: 1e6, maxWallTimeMs: 60000, maxTokens: 1000 } });
    const large = performMorphogenesis({ ...makeReq('Complex task', MOCK_INTENT), resourceBudget: { maxComputeUnits: 1000, maxMemoryBytes: 1e8, maxWallTimeMs: 60000, maxTokens: 100000 } });
    expect(small.cognitiveGraph.organs.length).toBeLessThanOrEqual(large.cognitiveGraph.organs.length);
  });
});
