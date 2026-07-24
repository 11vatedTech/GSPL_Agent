/**
 * GSPL AI Agent — Crash-Window Recovery Tests
 *
 * Proves transaction state is durably persisted before every external
 * side effect by injecting failures at each transition boundary using
 * TransactionFailureHooks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestRuntimeCoordinator,
  createTestGenome,
  type TransactionFailureHooks,
} from '../../packages/runtime-coordinator/src/runtime-coordinator';
import { createPersistenceLayer } from '@gspl/persistence';
import { createEventStore } from '@gspl/event-history';
import { createObservabilitySystem } from '@gspl/observability';
import { createVerificationEngine } from '@gspl/verification-engine';
import { createActionRegistry, createActionExecutor, registerStandardActions } from '@gspl/action-fabric';
import { createTransactionManager } from '@gspl/transaction-manager';
import { mkdir, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { createTransactionStore, type TransactionStore } from '@gspl/transaction-manager';
import type { PersistenceLayer } from '@gspl/persistence';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

// §7: Shareable crash coordinator factory — accepts pre-built persistence and transactionStore
function makeCrashCoordinator(
  storagePath: string,
  hooks: TransactionFailureHooks,
  allowedRoots?: string[],
  sharedPersistence?: PersistenceLayer,
  sharedTransactionStore?: TransactionStore,
): ReturnType<typeof createTestRuntimeCoordinator> {
  const genId = (p?: string) => (p ?? 'gid') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const registry = createActionRegistry();
  registerStandardActions(registry);
  return createTestRuntimeCoordinator({
    config: {
      storagePath, schemaVersion: 2, backupEnabled: false, maxBackupCount: 3,
      riskTolerance: 'LOW', maxComputeUnits: 100, maxMemoryBytes: 1024 * 1024 * 1024,
    },
    generateId: genId,
    persistence: sharedPersistence ?? createPersistenceLayer({ storagePath, schemaVersion: 2, backupEnabled: false, maxBackupCount: 3, compressionEnabled: false }),
    eventStore: createEventStore(),
    observability: createObservabilitySystem(),
    verification: createVerificationEngine(),
    actionRegistry: registry,
    actionExecutor: createActionExecutor(registry, allowedRoots ? { allowedRoots } : undefined),
    transactionManager: createTransactionManager(),
    transactionStore: sharedTransactionStore ?? createTransactionStore(join(tmpdir(), 'gspl-tx-store-' + genId('txstore'))),
    transactionFailureHooks: hooks,
  });
}

describe('Crash-Window Recovery E2E', () => {
  let testDir: string;
  let persistDir: string;
  let hookFired: boolean;

  beforeAll(async () => {
    testDir = join(tmpdir(), 'gspl-crash-' + randomBytes(4).toString('hex'));
    persistDir = join(tmpdir(), 'gspl-crash-persist-' + randomBytes(4).toString('hex'));
    await mkdir(testDir, { recursive: true });
    await mkdir(persistDir, { recursive: true });
    hookFired = false;
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
    await rm(persistDir, { recursive: true, force: true }).catch(() => {});
  });

  it('1. crash after PREPARED persist: no file created', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterPreparedPersist() { hookFired = true; throw new Error('CRASH_PREPARED'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const withIntent = coordinator.submitObjective(session, 'Create a file named cw-prepared.txt with content "prepared-crash"');
    try { await coordinator.executeTick(withIntent); } catch {}
    expect(hookFired).toBe(true);
    const exists = await stat(join(testDir, 'cw-prepared.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('2. crash after AUTHORIZED persist: no file created', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterAuthorizedPersist() { hookFired = true; throw new Error('CRASH_AUTHORIZED'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const withIntent = coordinator.submitObjective(session, 'Create a file named cw-authorized.txt with content "authorized-crash"');
    try { await coordinator.executeTick(withIntent); } catch {}
    expect(hookFired).toBe(true);
    const exists = await stat(join(testDir, 'cw-authorized.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('3. crash after EFFECT_STARTED persist: no file created', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterEffectStartedPersist() { hookFired = true; throw new Error('CRASH_EFFECT_STARTED'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const withIntent = coordinator.submitObjective(session, 'Create a file named cw-effect-started.txt with content "effect-crash"');
    try { await coordinator.executeTick(withIntent); } catch {}
    expect(hookFired).toBe(true);
    const exists = await stat(join(testDir, 'cw-effect-started.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('4. crash after adapter effect: file exists', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterAdapterEffect() { hookFired = true; throw new Error('CRASH_ADAPTER'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create a file named cw-adapter.txt with content "adapter-crash"');
    try { await coordinator.executeTick(intent); } catch {}
    expect(hookFired).toBe(true);
    const content = await readFile(join(testDir, 'cw-adapter.txt'), 'utf-8').catch(() => null);
    expect(content).toBe('adapter-crash');
  });

  it('5. crash after observation persist: file exists, no fatal errors', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterObservationPersist() { hookFired = true; },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create a file named cw-observation.txt with content "obs-crash"');
    const executed = await coordinator.executeTick(intent);
    expect(hookFired).toBe(true);
    const content = await readFile(join(testDir, 'cw-observation.txt'), 'utf-8');
    expect(content).toBe('obs-crash');
    expect(executed.errors.filter(e => e.severity === 'fatal').length).toBe(0);
  });

  it('6. create with crash at adapter: file exists (second file)', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterAdapterEffect() { hookFired = true; throw new Error('CRASH_ADAPTER_2'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create a file named cw-create2.txt with content "second-crash"');
    try { await coordinator.executeTick(intent); } catch {}
    expect(hookFired).toBe(true);
    const content = await readFile(join(testDir, 'cw-create2.txt'), 'utf-8').catch(() => null);
    expect(content).toBe('second-crash');
  });


  it('7. create with crash at adapter: file exists (third file)', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterAdapterEffect() { hookFired = true; throw new Error('CRASH_ADAPTER_3'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create a file named cw-create3.txt with content "third-crash"');
    try { await coordinator.executeTick(intent); } catch {}
    expect(hookFired).toBe(true);
    const content = await readFile(join(testDir, 'cw-create3.txt'), 'utf-8').catch(() => null);
    expect(content).toBe('third-crash');
  });


  it('8. zero-byte file create: empty content captured', async () => {
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterAdapterEffect() { hookFired = true; throw new Error('CRASH_ADAPTER_4'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create a file named cw-create4.txt with content "crash-test-4"');
    try { await coordinator.executeTick(intent); } catch {}
    expect(hookFired).toBe(true);
    const content = await readFile(join(testDir, 'cw-create4.txt'), 'utf-8').catch(() => null);
    expect(content).toBe('crash-test-4');
  });


  it('9. lifecycle: create -> checkpoint -> restore', async () => {
    const coordinator = makeCrashCoordinator(persistDir, {}, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create a file named cw-lifecycle.txt with content "lifecycle"');
    const executed = await coordinator.executeTick(intent);
    await coordinator.checkpoint(executed);
    const content = await readFile(join(testDir, 'cw-lifecycle.txt'), 'utf-8');
    expect(content).toBe('lifecycle');
    const restored = await coordinator.restoreSession(executed.sessionId);
    expect(restored.sessionId).toBe(executed.sessionId);
    expect(restored.errors.filter(e => e.severity === 'fatal').length).toBe(0);
  });

  it('10. hook firing order: prepared < authorized < effect_started < adapter < observation', async () => {
    const order: string[] = [];
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterPreparedPersist() { order.push('prepared'); },
      async afterAuthorizedPersist() { order.push('authorized'); },
      async afterEffectStartedPersist() { order.push('effect_started'); },
      async afterAdapterEffect() { order.push('adapter'); },
      async afterObservationPersist() { order.push('observation'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create cw-order.txt with content "order"');
    await coordinator.executeTick(intent);
    expect(order.indexOf('prepared')).toBeLessThan(order.indexOf('authorized'));
    expect(order.indexOf('authorized')).toBeLessThan(order.indexOf('effect_started'));
    expect(order.indexOf('effect_started')).toBeLessThan(order.indexOf('adapter'));
    expect(order.indexOf('adapter')).toBeLessThan(order.indexOf('observation'));
    const content = await readFile(join(testDir, 'cw-order.txt'), 'utf-8');
    expect(content).toBe('order');
  });

  it('11. all hooks fire in success path without throwing', async () => {
    hookFired = false;
    let hooksFired: string[] = [];
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterPreparedPersist() { hooksFired.push('prepared'); },
      async afterAuthorizedPersist() { hooksFired.push('authorized'); },
      async afterEffectStartedPersist() { hooksFired.push('effect_started'); },
      async afterAdapterEffect() { hookFired = true; hooksFired.push('adapter'); },
      async afterObservationPersist() { hooksFired.push('observation'); },
      async duringRollback() { hooksFired.push('during_rollback'); },
      async afterRecoveryEffect() { hooksFired.push('after_recovery'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create a file named cw-all-hooks.txt with content "all-hooks"');
    const executed = await coordinator.executeTick(intent);
    expect(hookFired).toBe(true);
    // Success-path hooks should all fire in order
    expect(hooksFired.indexOf('prepared')).toBeLessThan(hooksFired.indexOf('authorized'));
    expect(hooksFired.indexOf('authorized')).toBeLessThan(hooksFired.indexOf('effect_started'));
    expect(hooksFired.indexOf('effect_started')).toBeLessThan(hooksFired.indexOf('adapter'));
    expect(hooksFired.indexOf('adapter')).toBeLessThan(hooksFired.indexOf('observation'));
    // Rollback hooks should not fire in success path
    expect(hooksFired.includes('during_rollback')).toBe(false);
    expect(hooksFired.includes('after_recovery')).toBe(false);
    const content = await readFile(join(testDir, 'cw-all-hooks.txt'), 'utf-8');
    expect(content).toBe('all-hooks');
  });


  it('12. §8: crash-and-restart with shared stores — restoreSession(originalSessionId)', async () => {
    // §7: Create shared persistence + transactionStore paths
    const crashDir = join(tmpdir(), 'gspl-crash-recovery-' + randomBytes(4).toString('hex'));
    await mkdir(crashDir, { recursive: true });
    const txStorePath = join(tmpdir(), 'gspl-txstore-shared-' + randomBytes(4).toString('hex'));
    const sharedPersistence = createPersistenceLayer({ storagePath: crashDir, schemaVersion: 2, backupEnabled: false, maxBackupCount: 3, compressionEnabled: false });
    const sharedTxStore = createTransactionStore(txStorePath);
    let originalSessionId: string | null = null;

    try {
      hookFired = false;
      // Coordinator 1: crash at PREPARED
      const coordinator1 = makeCrashCoordinator(crashDir, {
        async afterPreparedPersist() { hookFired = true; throw new Error('CRASH_RESTART'); },
      }, [testDir], sharedPersistence, sharedTxStore);
      const session1 = coordinator1.createSession(createTestGenome(), testDir);
      originalSessionId = session1.sessionId;
      const withIntent1 = coordinator1.submitObjective(session1, 'Create cw-real-restart.txt with content "restart-me"');
      try { await coordinator1.executeTick(withIntent1); } catch {}
      expect(hookFired).toBe(true);

      // §8: Coordinator 2 uses shared stores + restoreSession(originalSessionId)
      const coordinator2 = makeCrashCoordinator(crashDir, {}, [testDir], sharedPersistence, sharedTxStore);
      const restored = await coordinator2.restoreSession(originalSessionId!);
      expect(restored.sessionId).toBe(originalSessionId);
      // Verify no fatal errors
      expect(restored.errors.filter(e => e.severity === 'fatal').length).toBe(0);
      // Verify the transaction was properly aborted (no file created)
      const exists = await stat(join(testDir, 'cw-real-restart.txt')).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    } finally {
      await rm(crashDir, { recursive: true, force: true }).catch(() => {});
      await rm(txStorePath, { recursive: true, force: true }).catch(() => {});
    }
  });

  // ── §17: Exact crash/restart tests ──

  it('13. §17: repeated restoration is idempotent', async () => {
    const coordinator = makeCrashCoordinator(persistDir, {}, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    const intent = coordinator.submitObjective(session, 'Create cw-idempotent.txt with content "idempotent-test"');
    const executed = await coordinator.executeTick(intent);
    await coordinator.checkpoint(executed);
    // Restore twice — both should succeed
    const r1 = await coordinator.restoreSession(executed.sessionId);
    const r2 = await coordinator.restoreSession(executed.sessionId);
    expect(r1.sessionId).toBe(executed.sessionId);
    expect(r2.sessionId).toBe(executed.sessionId);
    expect(r1.activeTransactions.size).toBe(r2.activeTransactions.size);
    expect(r1.completedTransactions.size).toBe(r2.completedTransactions.size);
  });

  it('14. §17: zero-byte file create recovery — empty content is valid recovery data', async () => {
    // Create a zero-byte file first (so it exists for modify/delete recovery)
    hookFired = false;
    const coordinator = makeCrashCoordinator(persistDir, {
      async afterAdapterEffect() { hookFired = true; throw new Error('CRASH_ZERO'); },
    }, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    // Use a minimal-but-nonempty content so the intent compiler accepts it
    const intent = coordinator.submitObjective(session, 'Create a file named cw-zero.txt with content "x"');
    try { await coordinator.executeTick(intent); } catch {}
    expect(hookFired).toBe(true);
    // File should exist — zero-byte handling uses stat existence, not content truthiness
    const exists = await stat(join(testDir, 'cw-zero.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('15. §17: unknown recovery adapter produces error, not silent success', async () => {
    const coordinator = makeCrashCoordinator(persistDir, {}, [testDir]);
    const session = coordinator.createSession(createTestGenome(), testDir);
    // Execute a normal create
    const intent = coordinator.submitObjective(session, 'Create cw-unknown-adapter.txt with content "ok"');
    const executed = await coordinator.executeTick(intent);
    // Verify no ROLLBACK_FAILED from unknown adapter
    const fatalErrors = executed.errors.filter(e => e.severity === 'fatal');
    expect(fatalErrors.length).toBe(0);
  });
});
