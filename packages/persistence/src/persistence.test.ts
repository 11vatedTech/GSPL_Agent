import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createPersistenceLayer, type PersistenceLayer, type PersistedState } from './persistence.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'gspl-persist-test-'));

function makeState(agentId: string): PersistedState {
  return {
    schemaVersion: 1,
    agentId,
    genome: { $gst: 'gspl:agent:v1', $sovereignty: { identityHash: 'hash-' + agentId }, $lineage: { tick: 0 }, genes: {} },
    worldState: { id: 'world-1', name: 'default', entities: [] },
    memories: [],
    claims: [],
    evidence: [],
    capabilities: [],
    policies: { defaultEffect: 'DENY' },
    plans: [],
    events: [],
    checkpoints: [],
    mutations: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    contentHash: '',
  };
}

describe('Persistence Layer (REAL)', () => {
  let persistence: PersistenceLayer;

  beforeEach(() => {
    persistence = createPersistenceLayer({
      storagePath: TEST_DIR,
      schemaVersion: 1,
      backupEnabled: true,
      maxBackupCount: 5,
      compressionEnabled: false,
    });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('saves and loads state (survives process memory)', async () => {
    const state = makeState('agent-1');
    const saved = await persistence.save(state);
    expect(saved).toBe(true);

    const loaded = await persistence.load('agent-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.agentId).toBe('agent-1');
    expect(loaded!.contentHash).toBeTruthy();
  });

  it('uses SHA-256 hashes for integrity', async () => {
    const state = makeState('agent-hash');
    await persistence.save(state);
    const loaded = await persistence.load('agent-hash');
    expect(loaded!.contentHash).toHaveLength(64); // SHA-256 hex = 64 chars
    expect(loaded!.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validates content integrity', async () => {
    const state = makeState('agent-valid');
    await persistence.save(state);
    const loaded = await persistence.load('agent-valid');
    const validation = persistence.validate(loaded!);
    expect(validation.valid).toBe(true);
  });

  it('detects corrupted state', async () => {
    const state = makeState('agent-corr');
    await persistence.save(state);
    const loaded = await persistence.load('agent-corr');
    // Tamper with the state
    loaded!.genome = { tampered: true };
    const validation = persistence.validate(loaded!);
    expect(validation.valid).toBe(false);
  });

  it('creates and restores backups', async () => {
    const state = makeState('agent-backup');
    await persistence.save(state);
    const backupId = await persistence.backup(state);
    expect(backupId).toBeTruthy();

    const restored = await persistence.restore(backupId);
    expect(restored).not.toBeNull();
    expect(restored!.agentId).toBe('agent-backup');
  });

  it('deletes state', async () => {
    const state = makeState('agent-del');
    await persistence.save(state);
    const deleted = await persistence.deleteState('agent-del');
    expect(deleted).toBe(true);

    const loaded = await persistence.load('agent-del');
    expect(loaded).toBeNull();
  });

  it('exports state as bytes', async () => {
    const state = makeState('agent-export');
    const exported = await persistence.exportState(state);
    expect(exported).toBeInstanceOf(Uint8Array);
    expect(exported.length).toBeGreaterThanOrEqual(1);
  });

  it('migrates schema versions', () => {
    // Create a new persistence layer with target schemaVersion = 2
    const p2 = createPersistenceLayer({
      storagePath: TEST_DIR,
      schemaVersion: 2,
      backupEnabled: false,
      maxBackupCount: 5,
      compressionEnabled: false,
    });
    const state = makeState('agent-migrate');
    state.schemaVersion = 1;
    const migrated = p2.migrate(state);
    expect(migrated.schemaVersion).toBe(2);
  });

  it('returns null for nonexistent agent', async () => {
    const loaded = await persistence.load('nonexistent');
    expect(loaded).toBeNull();
  });
});
