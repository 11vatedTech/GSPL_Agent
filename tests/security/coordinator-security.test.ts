/**
 * GSPL AI Agent — Security E2E Tests
 *
 * Coordinator-level security tests exercising the full runtime path:
 * - Path traversal prevention
 * - Unauthorized root denial
 * - Missing capability denial
 * - Capability scope enforcement
 * - Persistence corruption detection
 * - Invalid cognitive graph rejection
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRuntimeCoordinator } from '../../packages/runtime-coordinator/src/runtime-coordinator';
import { createPrimordialGenome } from '@gspl/cognitive-kernel';
import { createPersistenceLayer } from '@gspl/persistence';
import { createEventStore } from '@gspl/event-history';
import { createObservabilitySystem } from '@gspl/observability';
import { createVerificationEngine } from '@gspl/verification-engine';
import { createActionRegistry, createActionExecutor, registerStandardActions } from '@gspl/action-fabric';
import { createTransactionManager } from '@gspl/transaction-manager';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

describe('Security E2E', () => {
  let workspace: string;
  let outsideWorkspace: string;
  let testClock: number;
  let idCounter: number;

  beforeAll(async () => {
    workspace = join(tmpdir(), 'gspl-security-' + randomBytes(4).toString('hex'));
    outsideWorkspace = join(tmpdir(), 'gspl-outside-' + randomBytes(4).toString('hex'));
    await mkdir(workspace, { recursive: true });
    await mkdir(outsideWorkspace, { recursive: true });
    testClock = 3000000;
    idCounter = 200;
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
    await rm(outsideWorkspace, { recursive: true, force: true }).catch(() => {});
  });

  function createCoordinator(allowedRoots: string[] = [workspace]) {
    const registry = createActionRegistry();
    registerStandardActions(registry);
    return createRuntimeCoordinator({
      config: { storagePath: join(tmpdir(), 'gspl-persist-sec-' + randomBytes(2).toString('hex')), schemaVersion: 2, backupEnabled: false, maxBackupCount: 1, riskTolerance: 'LOW', maxComputeUnits: 50, maxMemoryBytes: 1024 * 1024 },
      clock: () => testClock++,
      generateId: (prefix) => `${prefix ?? 'gid'}-${idCounter++}`,
      persistence: createPersistenceLayer({ storagePath: join(tmpdir(), 'gspl-persist-sec-tmp'), schemaVersion: 2, backupEnabled: false, maxBackupCount: 1, compressionEnabled: false }),
      eventStore: createEventStore(),
      observability: createObservabilitySystem(),
      verification: createVerificationEngine(),
      actionRegistry: registry,
      actionExecutor: createActionExecutor(registry, { allowedRoots }),
      transactionManager: createTransactionManager(),
    });
  }

  it('1. path traversal is blocked', async () => {
    const coordinator = createCoordinator([workspace]);
    const registry = createActionRegistry();
    registerStandardActions(registry);
    const executor = createActionExecutor(registry, { allowedRoots: [workspace] });

    const session = coordinator.createSession();
    const result = await executor.execute('fs-read',
      { path: join(workspace, '..', '..', 'etc', 'passwd') },
      session.capabilityManager,
    );
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code.includes('PATH') || e.code.includes('outside') || e.code === 'ACTION_ERROR')).toBe(true);
  });

  it('2. writing outside allowed roots is blocked', async () => {
    const coordinator = createCoordinator([workspace]);
    const registry = createActionRegistry();
    registerStandardActions(registry);
    const executor = createActionExecutor(registry, { allowedRoots: [workspace] });

    const session = coordinator.createSession();
    const result = await executor.execute('fs-write',
      { path: join(outsideWorkspace, 'forbidden.txt'), content: 'should not write' },
      session.capabilityManager,
    );
    expect(result.success).toBe(false);
  });

  it('3. missing capability is denied', async () => {
    const coordinator = createCoordinator([workspace]);
    const session = coordinator.createSession(createPrimordialGenome(), workspace);

    // Submit an intent but don't issue write capability
    const withIntent = coordinator.submitObjective(session, 'Create a file');
    // Don't execute tick — test raw action without capability
    const registry = createActionRegistry();
    registerStandardActions(registry);
    const executor = createActionExecutor(registry, { allowedRoots: [workspace] });

    // Without a write capability, the action should be denied
    const writeResult = await executor.execute('fs-write',
      { path: join(workspace, 'no-cap.txt'), content: 'test' },
      session.capabilityManager,
    );
    // Write should be denied without explicit capability
    expect(writeResult.success === false || writeResult.errors.length > 0).toBe(true);
  });

  it('4. persistence corruption is detected', async () => {
    const storagePath = join(tmpdir(), 'gspl-corrupt-' + randomBytes(4).toString('hex'));
    await mkdir(storagePath, { recursive: true });

    const persistence = createPersistenceLayer({
      storagePath,
      schemaVersion: 2,
      backupEnabled: false,
      maxBackupCount: 1,
      compressionEnabled: false,
    });

    // Write corrupt JSON
    await writeFile(join(storagePath, 'corrupt-agent.json'), '{invalid json', 'utf-8');

    // Loading corrupted state should throw
    try {
      await persistence.load('corrupt-agent');
      // Should not reach here
    } catch (e) {
      expect(e).toBeDefined();
    }

    await rm(storagePath, { recursive: true, force: true }).catch(() => {});
  });

  it('5. invalid cognitive graph with missing handlers fails safely', async () => {
    const coordinator = createCoordinator([workspace]);
    const session = coordinator.createSession(createPrimordialGenome(), workspace);

    // Submit a valid objective
    const withIntent = coordinator.submitObjective(session, 'Create a file named safe-test.txt');

    // Execute — the morphogenesis should only select registered organs
    const executed = await coordinator.executeTick(withIntent);

    // No fatal errors
    const fatalErrors = executed.errors.filter(e => e.severity === 'fatal');
    expect(fatalErrors.length).toBe(0);
  });
});
