/**
 * GSPL Persistence Architecture — REAL IMPLEMENTATION
 *
 * Atomic file-based persistence with SHA-256 integrity hashing.
 * Each agent state is persisted to {storagePath}/{agentId}.json
 * using atomic writes (write to temp, rename) for crash consistency.
 *
 * Pinned from: https://github.com/11vatedTech/GSPL @ 822e051
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, rename, unlink, access, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface PersistedState {
  schemaVersion: number;
  agentId: string;
  genome: unknown;
  worldState: unknown;
  memories: unknown[];
  claims: unknown[];
  evidence: unknown[];
  capabilities: unknown[];
  policies: unknown;
  plans: unknown[];
  events: unknown[];
  checkpoints: unknown[];
  mutations: unknown[];
  createdAt: number;
  updatedAt: number;
  contentHash: string;
}

export interface PersistenceConfig {
  storagePath: string;
  schemaVersion: number;
  backupEnabled: boolean;
  maxBackupCount: number;
  compressionEnabled: boolean;
}

export interface PersistenceLayer {
  save(state: PersistedState): Promise<boolean>;
  load(agentId: string): Promise<PersistedState | null>;
  backup(state: PersistedState): Promise<string>;
  restore(backupId: string): Promise<PersistedState | null>;
  migrate(fromVersion: number, toVersion: number, state: PersistedState): PersistedState;
  validate(state: PersistedState): { valid: boolean; errors: string[] };
  exportState(state: PersistedState): Promise<Uint8Array>;
  deleteState(agentId: string): Promise<boolean>;
}

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

function stateFilePath(storagePath: string, agentId: string): string {
  return join(storagePath, `${agentId}.json`);
}

function backupFilePath(storagePath: string, backupId: string): string {
  return join(storagePath, 'backups', `${backupId}.json`);
}

export function createPersistenceLayer(config: PersistenceConfig): PersistenceLayer {
  const { storagePath, maxBackupCount } = config;
  const backupsDir = join(storagePath, 'backups');

  // Ensure storage directories exist
  async function ensureDirs(): Promise<void> {
    await mkdir(storagePath, { recursive: true });
    if (config.backupEnabled) {
      await mkdir(backupsDir, { recursive: true });
    }
  }

  // Initialize directories synchronously at construction time (fire-and-forget)
  ensureDirs().catch(() => {});

  function computeHash(state: PersistedState): string {
    const { contentHash, ...rest } = state as PersistedState & { contentHash?: string };
    return sha256(JSON.stringify(rest));
  }

  /** Atomic write: write to temp file, then rename */
  async function atomicWrite(filePath: string, data: string): Promise<void> {
    const tmpPath = filePath + '.' + randomBytes(4).toString('hex') + '.tmp';
    await writeFile(tmpPath, data, 'utf-8');
    await rename(tmpPath, filePath);
  }

  return {
    async save(state) {
      await ensureDirs();
      const updated: PersistedState = {
        ...state,
        updatedAt: Date.now(),
        contentHash: '',
      };
      updated.contentHash = computeHash(updated);
      const filePath = stateFilePath(storagePath, state.agentId);
      const json = JSON.stringify(updated, null, 2);
      await atomicWrite(filePath, json);
      return true;
    },

    async load(agentId) {
      const filePath = stateFilePath(storagePath, agentId);
      try {
        await access(filePath);
        const raw = await readFile(filePath, 'utf-8');
        const state = JSON.parse(raw) as PersistedState;
        return state;
      } catch {
        return null;
      }
    },

    async backup(state) {
      await ensureDirs();
      const backupId = 'backup-' + Date.now().toString(36) + '-' + randomBytes(4).toString('hex');
      const backupState: PersistedState = {
        ...state,
        updatedAt: Date.now(),
        contentHash: '',
      };
      backupState.contentHash = computeHash(backupState);
      const filePath = backupFilePath(storagePath, backupId);
      const json = JSON.stringify(backupState, null, 2);
      await atomicWrite(filePath, json);

      // Prune old backups if exceeding maxBackupCount
      if (maxBackupCount > 0) {
        try {
          const files = await readdir(backupsDir);
          const backups = files.filter(f => f.endsWith('.json'));
          if (backups.length > maxBackupCount) {
            // Sort by name (which contains timestamp), delete oldest
            const toDelete = backups.slice(0, backups.length - maxBackupCount);
            for (const f of toDelete) {
              await unlink(join(backupsDir, f)).catch(() => {});
            }
          }
        } catch { /* non-critical */ }
      }

      return backupId;
    },

    async restore(backupId) {
      const filePath = backupFilePath(storagePath, backupId);
      try {
        await access(filePath);
        const raw = await readFile(filePath, 'utf-8');
        return JSON.parse(raw) as PersistedState;
      } catch {
        return null;
      }
    },

    migrate(fromVersion, toVersion, state) {
      let current = { ...state };
      for (let v = fromVersion; v < toVersion; v++) {
        current.schemaVersion = v + 1;
      }
      return current;
    },

    validate(state) {
      const errors: string[] = [];
      if (!state.agentId) errors.push('Missing agentId');
      if (!state.genome) errors.push('Missing genome');
      if (state.schemaVersion < 1) errors.push('Invalid schema version');

      // Verify content hash using SHA-256
      const storedHash = state.contentHash;
      if (storedHash) {
        const recomputed = computeHash(state);
        if (storedHash !== recomputed) {
          errors.push('Content hash mismatch — possible corruption');
        }
      }
      return { valid: errors.length === 0, errors };
    },

    async exportState(state) {
      const json = JSON.stringify(state, null, 2);
      return new TextEncoder().encode(json);
    },

    async deleteState(agentId) {
      const filePath = stateFilePath(storagePath, agentId);
      try {
        await unlink(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}
