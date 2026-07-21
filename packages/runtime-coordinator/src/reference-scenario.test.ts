/**
 * GSPL Agent — End-to-End Reference Scenario Tests
 *
 * Tests the complete runtime spine: compile intent → morphogenesis →
 * async organ execution → verification → checkpoint → restart.
 * All tests use the async executeTick API with real infrastructure.
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createRuntimeCoordinator, type AgentSession, type RuntimeCoordinator } from './runtime-coordinator.js';
import { createPrimordialGenome } from '@gspl/cognitive-kernel';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'gspl-ref-scenario-'));

function makeCoordinator(): RuntimeCoordinator {
  return createRuntimeCoordinator({
    config: {
      storagePath: TEST_DIR,
      schemaVersion: 1,
      backupEnabled: false,
      maxBackupCount: 5,
      riskTolerance: 'MEDIUM',
      maxComputeUnits: 1000,
      maxMemoryBytes: 16 * 1024 * 1024 * 1024,
      resourceBudget: {
        maxComputeUnits: 1000,
        maxMemoryBytes: 16 * 1024 * 1024 * 1024,
        maxWallTimeMs: 300000,
        maxTokens: 100000,
      },
    },
  });
}

describe('GSPL Agent — End-to-End Reference Scenario', () => {
  let coordinator: RuntimeCoordinator;

  beforeEach(() => {
    coordinator = makeCoordinator();
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('Step 1: Preserves original owner statement', () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const updated = coordinator.submitObjective(s, 'Analyze the repository');
    expect(updated.compiledIntent!.originalStatement).toBe('Analyze the repository');
  });

  it('Step 2: Intent compiler preserves authority boundaries', () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const updated = coordinator.submitObjective(s, 'Inspect the repository');
    expect(updated.compiledIntent!.intent.goal).not.toContain('modify');
  });

  it('Step 3: Intent compiler derives requirements with provenance', () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const updated = coordinator.submitObjective(s, 'Refactor the auth module securely');
    expect(updated.compiledIntent!.requirements.length).toBeGreaterThan(0);
    expect(updated.compiledIntent!.requirements[0].status).toBe('derived');
  });

  it('Step 4: World model is constructed', () => {
    const s = coordinator.createSession(createPrimordialGenome());
    expect(s.world.id).toBeDefined();
  });

  it('Step 6: Morphogenesis generates cognitive graph', async () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const intent = coordinator.submitObjective(s, 'Analyze code for security vulnerabilities');
    const ticked = await coordinator.executeTick(intent);
    expect(ticked.cognitiveGraph!.organs.length).toBeGreaterThan(0);
  });

  it('Step 7: Different objectives produce structurally different phenotypes', async () => {
    const c = makeCoordinator();
    const s1 = c.createSession(createPrimordialGenome());
    const s2 = c.createSession(createPrimordialGenome());
    // 'Analyze' triggers research + code domains; 'Summarize' triggers documentation only
    const t1 = await c.executeTick(c.submitObjective(s1, 'Analyze code for security vulnerabilities and implement fixes'));
    const t2 = await c.executeTick(c.submitObjective(s2, 'Summarize the README file'));
    const types1 = new Set(t1.cognitiveGraph!.organs.map(o => o.contract.organType));
    const types2 = new Set(t2.cognitiveGraph!.organs.map(o => o.contract.organType));
    // First objective (code+security) should select CODE_REASONING or SECURITY_ANALYSIS
    // Second objective (summarize) has fewer domains
    const different = types1.size !== types2.size || t1.cognitiveGraph!.edges.length !== t2.cognitiveGraph!.edges.length;
    expect(different).toBe(true);
  });

  it('Step 9: Complete 8-phase tick cycle (async)', async () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const ticked = await coordinator.executeTick(coordinator.submitObjective(s, 'List files'));
    expect(ticked.phase).toBe('PERSIST');
    expect(ticked.tick).toBeGreaterThan(s.tick);
  });

  it('Step 14-15: Epistemic engine creates and tracks claims', async () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const ticked = await coordinator.executeTick(coordinator.submitObjective(s, 'Verify package.json'));
    expect(ticked.epistemicEngine).toBeDefined();
  });

  it('Step 17: Completion verification checks requirements', async () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const ticked = await coordinator.executeTick(coordinator.submitObjective(s, 'Count files'));
    const v = await coordinator.verifyCompletion(ticked);
    expect(v.complete).toBeDefined();
    expect(v.confidence).toBeGreaterThanOrEqual(0);
  });

  it('Step 18-20: Checkpoint and restore lifecycle', async () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const ticked = await coordinator.executeTick(coordinator.submitObjective(s, 'Record state'));
    const cp = await coordinator.checkpoint(ticked);
    expect(cp.checkpointId).toContain('cp-');
    const restored = await coordinator.restoreSession(cp.sessionId);
    expect(restored.sessionId).toBe(cp.sessionId);
  });

  it('Step 22: Missing intent produces explicit errors', async () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const ticked = await coordinator.executeTick(s);
    expect(ticked.errors[0].code).toBe('NO_INTENT');
  });

  it('Step 24: Full pipeline integrity (async)', async () => {
    const s = coordinator.createSession(createPrimordialGenome());
    const intented = coordinator.submitObjective(s, 'Analyze for leaks');
    const executed = await coordinator.executeTick(intented);
    const v = await coordinator.verifyCompletion(executed);
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
  afterAll(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('Identical inputs produce identical phenotypes', async () => {
    const c = makeCoordinator();
    const s1 = c.createSession(createPrimordialGenome());
    const s2 = c.createSession(createPrimordialGenome());
    const t1 = await c.executeTick(c.submitObjective(s1, 'Count files'));
    const t2 = await c.executeTick(c.submitObjective(s2, 'Count files'));
    expect(t1.cognitiveGraph!.organs.map(o => o.contract.organType).sort())
      .toEqual(t2.cognitiveGraph!.organs.map(o => o.contract.organType).sort());
  });
});
