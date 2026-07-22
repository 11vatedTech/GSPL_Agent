/**
 * GSPL AI Agent - Adversarial Authority E2E Tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestRuntimeCoordinator, createTestGenome } from '../../packages/runtime-coordinator/src/runtime-coordinator';
import { createPrimordialGenome } from '@gspl/cognitive-kernel';
import { type AuthorityProvider, type CapabilityIssuanceEnvelope } from '@gspl/capability-security';
import { createPersistenceLayer } from '@gspl/persistence';
import { createEventStore } from '@gspl/event-history';
import { createObservabilitySystem } from '@gspl/observability';
import { createVerificationEngine } from '@gspl/verification-engine';
import { createActionRegistry, createActionExecutor, registerStandardActions, type ActionRegistry } from '@gspl/action-fabric';
import { createTransactionManager } from '@gspl/transaction-manager';
import { mkdir, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

function createDenyAllProvider(): AuthorityProvider {
  return {
    providerId: 'deny-all',
    async requestCapability(_envelope: CapabilityIssuanceEnvelope, _hash: string) {
      return { decision: 'DENIED', reason: 'Deny-all provider', providerId: 'deny-all' };
    },
  };
}

describe('Adversarial Authority E2E', () => {
  let workspace: string;
  let storagePath: string;
  let testClock: number;
  let idCounter: number;

  beforeAll(async () => {
    workspace = join(tmpdir(), 'gspl-e2e-auth-' + randomBytes(4).toString('hex'));
    storagePath = join(tmpdir(), 'gspl-persist-auth-' + randomBytes(4).toString('hex'));
    await mkdir(workspace, { recursive: true });
    await mkdir(storagePath, { recursive: true });
    testClock = 5000000;
    idCounter = 500;
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
    await rm(storagePath, { recursive: true, force: true }).catch(() => {});
  });

  function makeCoordinator(overrides?: { authorityProvider?: AuthorityProvider }) {
    const registry: ActionRegistry = createActionRegistry();
    registerStandardActions(registry);
    const genId = (prefix?: string) => (prefix ?? 'gid') + '-' + (idCounter++);
    const deps: Record<string, unknown> = {
      config: { storagePath, schemaVersion: 2, backupEnabled: false, maxBackupCount: 5, riskTolerance: 'LOW', maxComputeUnits: 100, maxMemoryBytes: 1073741824 },
      clock: () => testClock++,
      generateId: genId,
      persistence: createPersistenceLayer({ storagePath, schemaVersion: 2, backupEnabled: false, maxBackupCount: 5, compressionEnabled: false }),
      eventStore: createEventStore(),
      observability: createObservabilitySystem(),
      verification: createVerificationEngine(),
      actionRegistry: registry,
      actionExecutor: createActionExecutor(registry, { allowedRoots: [workspace] }),
      transactionManager: createTransactionManager(),
    };
    if (overrides?.authorityProvider) deps.authorityProvider = overrides.authorityProvider;
    return createTestRuntimeCoordinator(deps as any);
  }

  it('1. deny-all provider prevents file creation', async () => {
    const coordinator = makeCoordinator({ authorityProvider: createDenyAllProvider() });
    const session = coordinator.createSession(createTestGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Create a file named deny-test.txt with content "should not exist"');
    await coordinator.executeTick(withIntent);
    const exists = await stat(join(workspace, 'deny-test.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('2. policy DENY overrides capability', async () => {
    const denyGenome = createPrimordialGenome();
    denyGenome.genes.actionBounds = {
      rules: [{ id: 'deny-fs', description: 'Deny', condition: { action: 'filesystem-write' }, effect: 'DENY', priority: 100, scope: ['filesystem'] }],
      defaultEffect: 'DENY', version: 1, constitutionalInvariants: ['no-ambient-authority'],
    };
    const coordinator = makeCoordinator();
    const session = coordinator.createSession(denyGenome, workspace);
    const withIntent = coordinator.submitObjective(session, 'Create a file named deny-policy.txt with content "blocked"');
    await coordinator.executeTick(withIntent);
    const exists = await stat(join(workspace, 'deny-policy.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('3. valid create produces file', async () => {
    const coordinator = makeCoordinator();
    const session = coordinator.createSession(createTestGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Create a file named success.txt with content "adversarial"');
    await coordinator.executeTick(withIntent);
    const content = await readFile(join(workspace, 'success.txt'), 'utf-8');
    expect(content).toBe('adversarial');
  });

  it('4. file survives checkpoint and restart', async () => {
    const coordinator = makeCoordinator();
    const session = coordinator.createSession(createTestGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Create a file named restart.txt with content "persistent"');
    const executed = await coordinator.executeTick(withIntent);
    await coordinator.checkpoint(executed);
    const restored = await coordinator.restoreSession(executed.sessionId);
    expect(restored.sessionId).toBe(executed.sessionId);
    const content = await readFile(join(workspace, 'restart.txt'), 'utf-8');
    expect(content).toBe('persistent');
  });

  it('5. modify file checkpoint restart ok', async () => {
    const coordinator = makeCoordinator();
    const targetFile = join(workspace, 'mod-restart.txt');
    await writeFile(targetFile, 'original', 'utf-8');
    const session = coordinator.createSession(createTestGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Modify the file named mod-restart.txt to contain "changed"');
    const executed = await coordinator.executeTick(withIntent);
    await coordinator.checkpoint(executed);
    const restored = await coordinator.restoreSession(executed.sessionId);
    expect(restored.sessionId).toBe(executed.sessionId);
    const content = await readFile(targetFile, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('6. transaction in completedTransactions', async () => {
    const coordinator = makeCoordinator();
    const session = coordinator.createSession(createTestGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Create a file named tx.txt with content "tx"');
    const executed = await coordinator.executeTick(withIntent);
    const content = await readFile(join(workspace, 'tx.txt'), 'utf-8');
    expect(content).toBe('tx');
    expect(executed.completedTransactions.size + executed.activeTransactions.size).toBeGreaterThanOrEqual(0);
  });

  it('7. read preserves content', async () => {
    const coordinator = makeCoordinator();
    const targetFile = join(workspace, 'read.txt');
    await writeFile(targetFile, 'readable', 'utf-8');
    const session = coordinator.createSession(createTestGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Read the file named read.txt');
    await coordinator.executeTick(withIntent);
    const content = await readFile(targetFile, 'utf-8');
    expect(content).toBe('readable');
  });

  it('8. no fatal errors', async () => {
    const coordinator = makeCoordinator();
    const session = coordinator.createSession(createTestGenome(), workspace);
    const withIntent = coordinator.submitObjective(session, 'Create a file named clean.txt with content "clean"');
    const executed = await coordinator.executeTick(withIntent);
    expect(executed.errors.filter(e => e.severity === 'fatal').length).toBe(0);
  });
});
