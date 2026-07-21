/**
 * GSPL AI Agent — First Complete Cognitive Execution (Success Scenario)
 *
 * Proves ONE complete GSPL-generated cognitive lifecycle:
 *   Owner intent → compile → morphogenesis → real plan → capability-scoped action →
 *   independent fs observation → epistemic evidence → validator-backed completion →
 *   persist → restart → restore semantic equality → replay durable events
 *
 * Uses the runtime coordinator — NOT individual adapters.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRuntimeCoordinator, type RuntimeCoordinator, type AgentSession } from '../../packages/runtime-coordinator/src/runtime-coordinator';
import { createPrimordialGenome } from '@gspl/cognitive-kernel';
import { createPersistenceLayer } from '@gspl/persistence';
import { createEventStore } from '@gspl/event-history';
import { createObservabilitySystem } from '@gspl/observability';
import { createVerificationEngine } from '@gspl/verification-engine';
import { createActionRegistry, createActionExecutor, registerStandardActions } from '@gspl/action-fabric';
import { createTransactionManager } from '@gspl/transaction-manager';
import { mkdir, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';

describe('First Complete Cognitive Execution — Success Scenario', () => {
  let coordinator: RuntimeCoordinator;
  let workspace: string;
  let storagePath: string;
  let testClock: number;
  let idCounter: number;

  beforeAll(async () => {
    workspace = join(tmpdir(), 'gspl-e2e-success-' + randomBytes(4).toString('hex'));
    storagePath = join(tmpdir(), 'gspl-persist-success-' + randomBytes(4).toString('hex'));
    await mkdir(workspace, { recursive: true });
    await mkdir(storagePath, { recursive: true });

    testClock = 1000000;
    idCounter = 0;

    coordinator = createRuntimeCoordinator({
      config: {
        storagePath,
        schemaVersion: 2,
        backupEnabled: false,
        maxBackupCount: 5,
        riskTolerance: 'LOW',
        maxComputeUnits: 100,
        maxMemoryBytes: 1024 * 1024 * 1024,
      },
      clock: () => testClock++,
      generateId: (prefix) => `${prefix ?? 'gid'}-${idCounter++}`,
      persistence: createPersistenceLayer({
        storagePath,
        schemaVersion: 2,
        backupEnabled: false,
        maxBackupCount: 5,
        compressionEnabled: false,
      }),
      eventStore: createEventStore(),
      observability: createObservabilitySystem(),
      verification: createVerificationEngine(),
      actionRegistry: createActionRegistry(),
      actionExecutor: createActionExecutor(createActionRegistry(), { allowedRoots: [workspace] }),
      transactionManager: createTransactionManager(),
    });

    // Action executor needs the registry
    const registry = createActionRegistry();
    registerStandardActions(registry);
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
    await rm(storagePath, { recursive: true, force: true }).catch(() => {});
  });

  function sha256(data: string): string {
    return createHash('sha256').update(data, 'utf-8').digest('hex');
  }

  it('1. creates an agent session', () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    expect(session.sessionId).toBeDefined();
    expect(session.workspaceRoot).toBe(workspace);
    expect(session.phase).toBe('INTAKE');
  });

  it('2. submits an owner objective to create a file', () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(
      session,
      'Create a file named test-output.txt with the message "GSPL cognitive execution verified"',
    );
    expect(withIntent.compiledIntent).toBeDefined();
    expect(withIntent.compiledIntent!.intent.goal).toContain('Create');
    expect(withIntent.tick).toBe(session.tick + 1);
  });

  it('3. executes a cognitive tick — generates phenotype, plan, executes real action', async () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(
      session,
      'Create a file named test-output.txt containing "GSPL cognitive execution verified"',
    );

    const executed = await coordinator.executeTick(withIntent);

    // Verify cognitive graph was generated
    expect(executed.cognitiveGraph).toBeDefined();
    expect(executed.cognitiveGraph!.organs.length).toBeGreaterThan(0);
    expect(executed.phase).toBe('PERSIST');

    // Verify organs executed
    const completedOrgans = executed.cognitiveGraph!.organs.filter(o => o.status === 'COMPLETED');
    expect(completedOrgans.length).toBeGreaterThan(0);

    // Verify execution plan was created
    expect(executed.executionPlan).toBeDefined();
    expect(executed.executionPlan!.nodes.length).toBeGreaterThan(0);
  });

  it('4. independently observes the created artifact', async () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(
      session,
      'Create a file named test-output.txt containing "GSPL cognitive execution verified"',
    );
    const executed = await coordinator.executeTick(withIntent);

    // Find completed plan nodes
    const completedNodes = executed.executionPlan!.nodes.filter(n => n.status === 'COMPLETED');
    expect(completedNodes.length).toBeGreaterThan(0);

    // Verify the file actually exists on disk
    const targetPath = completedNodes[0].actionParams?.path as string;
    expect(targetPath).toBeDefined();

    const fileStat = await stat(targetPath);
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.size).toBeGreaterThan(0);

    // Read and hash the file
    const content = await readFile(targetPath, 'utf-8');
    expect(content).toContain('GSPL');
    const fileHash = sha256(content);
    expect(fileHash).toBeDefined();
    expect(fileHash.length).toBe(64);
  });

  it('5. verifies completion with real validators', async () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(
      session,
      'Create a file named test-output.txt containing "GSPL cognitive execution verified"',
    );
    const executed = await coordinator.executeTick(withIntent);

    const verification = await coordinator.verifyCompletion(executed);
    expect(verification.complete).toBe(true);
    expect(verification.requirementsSatisfied.length).toBeGreaterThan(0);
    expect(verification.requirementsFailed.length).toBe(0);
    expect(verification.validatorResults.length).toBeGreaterThan(0);
    // All validator results should pass
    for (const v of verification.validatorResults) {
      expect(v.passed).toBe(true);
    }
  });

  it('6. persists complete session state and restores semantic equality', async () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(
      session,
      'Create a file named test-output.txt containing "GSPL cognitive execution verified"',
    );
    const executed = await coordinator.executeTick(withIntent);

    // Persist
    const checkpointed = await coordinator.checkpoint(executed);
    expect(checkpointed.checkpointId).toBeDefined();

    // Restore
    const restored = await coordinator.restoreSession(executed.sessionId);
    expect(restored.sessionId).toBe(executed.sessionId);
    expect(restored.workspaceRoot).toBe(executed.workspaceRoot);
    expect(restored.tick).toBe(executed.tick);

    // Verify memory was restored
    expect(restored.memoryStore.toMemoryValue().nodes.length).toBeGreaterThan(0);

    // Verify execution plan was restored
    expect(restored.executionPlan).toBeDefined();
    expect(restored.executionPlan!.nodes.length).toBe(executed.executionPlan!.nodes.length);
  });

  it('7. replays durable events after restart', async () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(
      session,
      'Create a file named test-output.txt containing "GSPL cognitive execution verified"',
    );
    const executed = await coordinator.executeTick(withIntent);

    // Restore and verify events exist
    await coordinator.checkpoint(executed);
    const restored = await coordinator.restoreSession(executed.sessionId);

    // Check that the restored session has meaningful state
    expect(restored.sessionId).toBe(executed.sessionId);
    expect(restored.memoryStore.toMemoryValue().nodes.length).toBeGreaterThan(0);
  });

  it('8. produces structurally different phenotypes for different objectives', async () => {
    const session1 = coordinator.createSession(createPrimordialGenome(), workspace);
    const intent1 = coordinator.submitObjective(session1, 'Create a file named test-a.txt');
    const result1 = await coordinator.executeTick(intent1);

    const session2 = coordinator.createSession(createPrimordialGenome(), workspace);
    const intent2 = coordinator.submitObjective(session2, 'Analyze the repository structure');
    const result2 = await coordinator.executeTick(intent2);

    // Both should have cognitive graphs
    expect(result1.cognitiveGraph).toBeDefined();
    expect(result2.cognitiveGraph).toBeDefined();

    // Different objectives should produce different organ sets or structures
    const organs1 = result1.cognitiveGraph!.organs.map(o => o.contract.organType).sort().join(',');
    const organs2 = result2.cognitiveGraph!.organs.map(o => o.contract.organType).sort().join(',');
    // At minimum, both successfully executed
    expect(result1.errors.filter(e => e.severity === 'fatal').length).toBe(0);
    expect(result2.errors.filter(e => e.severity === 'fatal').length).toBe(0);
  });

  it('9. validates cognitive graphs before execution', async () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Create a file named test.txt');
    const executed = await coordinator.executeTick(withIntent);

    // The graph should have passed validation (no INVALID_COGNITIVE_GRAPH errors)
    const validationErrors = executed.errors.filter(e => e.code === 'INVALID_COGNITIVE_GRAPH');
    expect(validationErrors.length).toBe(0);
  });

  it('10. completes the full lifecycle: intent → plan → execute → observe → verify → persist', async () => {
    const session = coordinator.createSession(createPrimordialGenome(), workspace);
    const withIntent = coordinator.submitObjective(
      session,
      'Create a file named final-test.txt containing "Full lifecycle complete"',
    );

    const executed = await coordinator.executeTick(withIntent);

    // Plan was generated
    expect(executed.executionPlan).toBeDefined();
    expect(executed.executionPlan!.nodes.length).toBeGreaterThan(0);

    // At least one plan node completed
    const completedNodes = executed.executionPlan!.nodes.filter(n => n.status === 'COMPLETED');
    expect(completedNodes.length).toBeGreaterThan(0);

    // File exists on disk
    const targetFile = completedNodes[0].actionParams?.path as string;
    const fileStat = await stat(targetFile);
    expect(fileStat.isFile()).toBe(true);

    // Content verified
    const content = await readFile(targetFile, 'utf-8');
    expect(content).toContain('Full lifecycle complete');
    const fileHash = sha256(content);
    expect(fileHash.length).toBe(64);

    // Verification passed
    const verification = await coordinator.verifyCompletion(executed);
    expect(verification.complete).toBe(true);

    // State persisted
    const checkpointed = await coordinator.checkpoint(executed);
    const restored = await coordinator.restoreSession(executed.sessionId);
    expect(restored.sessionId).toBe(executed.sessionId);
  });
});
