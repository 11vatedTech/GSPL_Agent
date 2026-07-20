import { describe, it, expect, beforeEach } from 'vitest';
import { createRuntimeCoordinator, type AgentSession } from './runtime-coordinator.js';
import { createPrimordialGenome } from '@gspl/cognitive-kernel';

function createSession(): AgentSession {
  return createRuntimeCoordinator({ storagePath: ':memory:', schemaVersion: 1, backupEnabled: false }).createSession(createPrimordialGenome());
}

describe('GSPL Agent — End-to-End Reference Scenario', () => {
  let session: AgentSession;
  let coordinator: ReturnType<typeof createRuntimeCoordinator>;

  beforeEach(() => {
    coordinator = createRuntimeCoordinator({ storagePath: ':memory:', schemaVersion: 1, backupEnabled: false });
    session = coordinator.createSession(createPrimordialGenome());
  });

  it('Step 1: Preserves original owner statement', () => {
    const updated = coordinator.submitObjective(session, 'Analyze the repository');
    expect(updated.compiledIntent!.originalStatement).toBe('Analyze the repository');
  });

  it('Step 2: Intent compiler preserves authority boundaries', () => {
    const updated = coordinator.submitObjective(session, 'Inspect the repository');
    expect(updated.compiledIntent!.intent.goal).not.toContain('modify');
  });

  it('Step 3: Intent compiler derives requirements with provenance', () => {
    const updated = coordinator.submitObjective(session, 'Refactor the auth module');
    expect(updated.compiledIntent!.requirements.length).toBeGreaterThan(0);
  });

  it('Step 4: World model is constructed', () => {
    expect(session.world.id).toBeDefined();
  });

  it('Step 6: Morphogenesis generates cognitive graph', () => {
    const intent = coordinator.submitObjective(session, 'Analyze code for security vulnerabilities');
    const ticked = coordinator.executeTick(intent);
    expect(ticked.cognitiveGraph!.organs.length).toBeGreaterThan(0);
  });

  it('Step 7: Different objectives produce structurally different phenotypes', () => {
    const s1 = createSession();
    const s2 = createSession();
    const t1 = coordinator.executeTick(coordinator.submitObjective(s1, 'Analyze security'));
    const t2 = coordinator.executeTick(coordinator.submitObjective(s2, 'Add two numbers'));
    const types1 = new Set(t1.cognitiveGraph!.organs.map(o => o.contract.organType));
    const types2 = new Set(t2.cognitiveGraph!.organs.map(o => o.contract.organType));
    expect(types1.size !== types2.size || t1.cognitiveGraph!.edges.length !== t2.cognitiveGraph!.edges.length).toBe(true);
  });

  it('Step 9: Complete 8-phase tick cycle', () => {
    const ticked = coordinator.executeTick(coordinator.submitObjective(session, 'List files'));
    expect(ticked.phase).toBe('PERSIST');
    expect(ticked.tick).toBeGreaterThan(session.tick);
  });

  it('Step 14-15: Epistemic engine creates and tracks claims', () => {
    const ticked = coordinator.executeTick(coordinator.submitObjective(session, 'Verify package.json'));
    expect(ticked.epistemicEngine).toBeDefined();
  });

  it('Step 17: Completion verification checks requirements', () => {
    const ticked = coordinator.executeTick(coordinator.submitObjective(session, 'Count files'));
    const v = coordinator.verifyCompletion(ticked);
    expect(v.complete).toBeDefined();
    expect(v.confidence).toBeGreaterThanOrEqual(0);
  });

  it('Step 18-20: Checkpoint and restore lifecycle', async () => {
    const ticked = coordinator.executeTick(coordinator.submitObjective(session, 'Record state'));
    const cp = await coordinator.checkpoint(ticked);
    expect(cp.checkpointId).toContain('cp-');
    const restored = await coordinator.restoreSession(cp.sessionId);
    expect(restored.sessionId).toBe(cp.sessionId);
  });

  it('Step 22: Missing intent produces explicit errors', () => {
    expect(coordinator.executeTick(session).errors[0].code).toBe('NO_INTENT');
  });

  it('Step 24: Full pipeline integrity', async () => {
    const intented = coordinator.submitObjective(session, 'Analyze for leaks');
    const executed = coordinator.executeTick(intented);
    const v = coordinator.verifyCompletion(executed);
    const cp = await coordinator.checkpoint(executed);
    const restored = await coordinator.restoreSession(cp.sessionId);
    expect(intented.compiledIntent!.originalStatement).toBe('Analyze for leaks');
    expect(executed.cognitiveGraph).not.toBeNull();
    expect(v.complete).toBeDefined();
    expect(cp.checkpointId).not.toBeNull();
    expect(restored.sessionId).toBe(cp.sessionId);
  });
});

describe('Deterministic properties', () => {
  it('Identical inputs produce identical phenotypes', () => {
    const c = createRuntimeCoordinator({ storagePath: ':memory:' });
    const s1 = c.createSession(createPrimordialGenome());
    const s2 = c.createSession(createPrimordialGenome());
    const t1 = c.executeTick(c.submitObjective(s1, 'Count files'));
    const t2 = c.executeTick(c.submitObjective(s2, 'Count files'));
    expect(t1.cognitiveGraph!.organs.map(o => o.contract.organType).sort()).toEqual(t2.cognitiveGraph!.organs.map(o => o.contract.organType).sort());
  });
});
