/**
 * GSPL Persistence Architecture — HARDENED IMPLEMENTATION
 *
 * Atomic file-based persistence with SHA-256 integrity hashing.
 * - Typed error classes for all failure modes
 * - Identifier validation (reject path separators, traversal tokens)
 * - Real migration registry with versioned transformations
 * - Improved atomic writes with platform-aware directory flush
 * - Backup validation and metadata-based sorting
 *
 * Dependency: GSPL canon foundation @ deps/gspl-canon
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, rename, unlink, access, readdir, stat, open } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';

// ── Typed Error Hierarchy ──

export class PersistenceError extends Error {
  constructor(message: string, public readonly code: string, public readonly recoverable: boolean = true) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export class StateNotFoundError extends PersistenceError {
  constructor(agentId: string) {
    super(`No persisted state found for agent '${agentId}'`, 'STATE_NOT_FOUND', true);
    this.name = 'StateNotFoundError';
  }
}

export class BackupNotFoundError extends PersistenceError {
  constructor(backupId: string) {
    super(`No backup found with id '${backupId}'`, 'BACKUP_NOT_FOUND', true);
    this.name = 'BackupNotFoundError';
  }
}

export class IntegrityError extends PersistenceError {
  constructor(detail: string) {
    super(`Integrity check failed: ${detail}`, 'INTEGRITY_ERROR', false);
    this.name = 'IntegrityError';
  }
}

export class SchemaError extends PersistenceError {
  constructor(currentVersion: number, targetVersion: number) {
    super(`Cannot migrate from schema v${currentVersion} to v${targetVersion} — no migration path`, 'SCHEMA_ERROR', false);
    this.name = 'SchemaError';
  }
}

export class IdentifierError extends PersistenceError {
  constructor(agentId: string, detail: string) {
    super(`Invalid agent identifier '${agentId}': ${detail}`, 'IDENTIFIER_ERROR', false);
    this.name = 'IdentifierError';
  }
}

export class PermissionError extends PersistenceError {
  constructor(path: string) {
    super(`Permission denied accessing '${path}'`, 'PERMISSION_ERROR', false);
    this.name = 'PermissionError';
  }
}

export class IOError extends PersistenceError {
  constructor(path: string, detail: string) {
    super(`I/O error on '${path}': ${detail}`, 'IO_ERROR', true);
    this.name = 'IOError';
  }
}

// ── Types ──

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
  /** Compiled intent (optional, for session restore) */
  compiledIntent?: unknown;
  /** Workspace root for isolated filesystem operations */
  workspaceRoot?: string;
  /** Session tick counter */
  tick?: number;
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
  migrate(state: PersistedState): PersistedState;
  validate(state: PersistedState): { valid: boolean; errors: string[] };
  exportState(state: PersistedState): Promise<Uint8Array>;
  deleteState(agentId: string): Promise<boolean>;
}

export interface BackupMetadata {
  backupId: string;
  agentId: string;
  timestamp: number;
  schemaVersion: number;
  filePath: string;
}

// ── Migration ──

export interface Migration {
  sourceVersion: number;
  targetVersion: number;
  transform: (state: PersistedState) => PersistedState;
  validate: (state: PersistedState) => boolean;
  reversible: boolean;
  description: string;
}

// ── Identifier Validation ──

const AGENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

function validateIdentifier(agentId: string): void {
  if (!agentId || typeof agentId !== 'string') {
    throw new IdentifierError(agentId, 'identifier must be a non-empty string');
  }
  if (agentId.length > 128) {
    throw new IdentifierError(agentId, 'identifier too long (max 128 characters)');
  }
  if (agentId.includes('/') || agentId.includes('\\')) {
    throw new IdentifierError(agentId, 'identifier contains path separators');
  }
  if (agentId.includes('..') || agentId.includes('~')) {
    throw new IdentifierError(agentId, 'identifier contains traversal or expansion tokens');
  }
  if (agentId.includes('\0') || agentId.includes('<') || agentId.includes('>') || agentId.includes(':')) {
    throw new IdentifierError(agentId, 'identifier contains reserved characters');
  }
  // Check for reserved Windows names (case-insensitive)
  const upper = agentId.toUpperCase();
  if (RESERVED_NAMES.has(upper)) {
    throw new IdentifierError(agentId, 'identifier is a reserved system name');
  }
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new IdentifierError(agentId, 'identifier contains invalid characters');
  }
  // Reject control characters and non-printable
  for (let i = 0; i < agentId.length; i++) {
    const code = agentId.charCodeAt(i);
    if (code < 0x20 || code === 0x7F) {
      throw new IdentifierError(agentId, 'identifier contains control characters');
    }
  }
}

// ── Hashing ──

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

function stableSerialize(obj: unknown): string {
  // Deterministic serialization: sort keys, no trailing whitespace
  return JSON.stringify(obj, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return v;
  });
}

// ── Path Helpers ──

function stateFilePath(storagePath: string, agentId: string): string {
  return join(storagePath, `${agentId}.json`);
}

function backupFilePath(storagePath: string, backupId: string): string {
  return join(storagePath, 'backups', `${backupId}.json`);
}

// ── Implementation ──

export function createPersistenceLayer(config: PersistenceConfig): PersistenceLayer {
  const { storagePath, maxBackupCount } = config;
  const backupsDir = join(storagePath, 'backups');

  // Migration registry
  const migrations: Map<number, Migration> = new Map();

  function registerMigration(migration: Migration): void {
    const key = migration.sourceVersion;
    if (migrations.has(key)) {
      throw new Error(`Migration from v${key} already registered`);
    }
    migrations.set(key, migration);
  }

  // Register default migration: v1 → v2 (adds structured capabilities array)
  registerMigration({
    sourceVersion: 1,
    targetVersion: 2,
    reversible: false,
    description: 'Add structured capabilities array and event lineage',
    transform(state) {
      return {
        ...state,
        schemaVersion: 2,
        capabilities: Array.isArray(state.capabilities) ? state.capabilities : [],
        events: Array.isArray(state.events) ? state.events : [],
      };
    },
    validate(state) {
      return Array.isArray(state.capabilities) && Array.isArray(state.events) && state.schemaVersion === 2;
    },
  });

  async function ensureDirs(): Promise<void> {
    await mkdir(storagePath, { recursive: true });
    if (config.backupEnabled) {
      await mkdir(backupsDir, { recursive: true });
    }
  }

  // Initialize directories (fire-and-forget, but error is non-critical at construction)
  ensureDirs().catch(() => {});

  function computeHash(state: PersistedState): string {
    const { contentHash, ...rest } = state as PersistedState & { contentHash?: string };
    return sha256(stableSerialize(rest));
  }

  /** Atomic write: write to temp file, fsync, rename */
  async function atomicWrite(filePath: string, data: string): Promise<void> {
    const tmpPath = filePath + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      const fd = await open(tmpPath, 'w', 0o600);
      try {
        // Node 20-compatible: use write instead of writeFile on FileHandle
        const buf = Buffer.from(data, 'utf-8');
        await fd.write(buf, 0, buf.length, 0);
        await fd.sync();
      } finally {
        await fd.close();
      }
      await rename(tmpPath, filePath);
      // Flush parent directory (platform-dependent, best-effort on Windows)
      try {
        const parentDir = await open(dirname(filePath), 'r');
        await parentDir.sync().catch(() => {});
        await parentDir.close();
      } catch { /* non-critical on platforms without directory sync */ }
    } catch (e) {
      // Clean up temp file on failure
      await unlink(tmpPath).catch(() => {});
      throw e;
    }
  }

  /** Extract backup metadata from stored JSON */
  async function readBackupMetadata(filePath: string): Promise<BackupMetadata | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState & { timestamp?: number };
      const bid = basename(filePath, '.json');
      return {
        backupId: bid,
        agentId: parsed.agentId ?? 'unknown',
        timestamp: parsed.updatedAt ?? parsed.createdAt ?? 0,
        schemaVersion: parsed.schemaVersion ?? 0,
        filePath,
      };
    } catch {
      return null;
    }
  }

  return {
    async save(state) {
      validateIdentifier(state.agentId);
      await ensureDirs();
      const updated: PersistedState = {
        ...state,
        updatedAt: Date.now(),
        contentHash: '',
      };
      updated.contentHash = computeHash(updated);
      const filePath = stateFilePath(storagePath, state.agentId);
      const json = JSON.stringify(updated);
      await atomicWrite(filePath, json);
      return true;
    },

    async load(agentId) {
      validateIdentifier(agentId);
      const filePath = stateFilePath(storagePath, agentId);
      try {
        await access(filePath);
      } catch {
        return null; // State not found — not an error
      }
      try {
        const raw = await readFile(filePath, 'utf-8');
        const state = JSON.parse(raw) as PersistedState;
        return state;
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new PersistenceError(`Malformed JSON in persisted state for '${agentId}'`, 'MALFORMED_JSON', false);
        }
        const err = e as NodeJS.ErrnoException;
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          throw new PermissionError(filePath);
        }
        throw new IOError(filePath, err.message ?? 'unknown');
      }
    },

    async backup(state) {
      await ensureDirs();
      validateIdentifier(state.agentId);
      const backupId = 'backup-' + Date.now().toString(36) + '-' + randomBytes(4).toString('hex');
      const backupState: PersistedState = {
        ...state,
        updatedAt: Date.now(),
        contentHash: '',
      };
      backupState.contentHash = computeHash(backupState);
      const filePath = backupFilePath(storagePath, backupId);
      const json = JSON.stringify(backupState);
      await atomicWrite(filePath, json);

      // Prune old backups sorted by metadata timestamp (not filename)
      if (maxBackupCount > 0) {
        try {
          const files = await readdir(backupsDir);
          const backupFiles = files.filter(f => f.endsWith('.json'));
          const metadataList: BackupMetadata[] = [];
          for (const f of backupFiles) {
            const meta = await readBackupMetadata(join(backupsDir, f));
            if (meta) metadataList.push(meta);
          }
          // Sort by timestamp ascending (oldest first)
          metadataList.sort((a, b) => a.timestamp - b.timestamp);
          if (metadataList.length > maxBackupCount) {
            const toDelete = metadataList.slice(0, metadataList.length - maxBackupCount);
            for (const meta of toDelete) {
              await unlink(meta.filePath).catch(() => {});
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
      } catch {
        throw new BackupNotFoundError(backupId);
      }
      try {
        const raw = await readFile(filePath, 'utf-8');
        const state = JSON.parse(raw) as PersistedState;
        // Validate backup integrity before restoring
        const validation = createPersistenceLayer(config).validate(state);
        if (!validation.valid) {
          throw new IntegrityError(`backup '${backupId}': ${validation.errors.join('; ')}`);
        }
        return state;
      } catch (e) {
        if (e instanceof PersistenceError) throw e;
        throw new IOError(filePath, e instanceof Error ? e.message : 'unknown');
      }
    },

    migrate(state) {
      const target = config.schemaVersion;
      if (state.schemaVersion === target) return state;

      let current = { ...state };
      while (current.schemaVersion < target) {
        const migration = migrations.get(current.schemaVersion);
        if (!migration) {
          throw new SchemaError(current.schemaVersion, target);
        }
        current = migration.transform(current);
        if (!migration.validate(current)) {
          throw new IntegrityError(`migration v${migration.sourceVersion}→v${migration.targetVersion} validation failed`);
        }
      }
      return current;
    },

    validate(state) {
      const errors: string[] = [];
      if (!state.agentId) errors.push('Missing agentId');
      if (!state.genome) errors.push('Missing genome');
      if (state.schemaVersion < 1) errors.push('Invalid schema version');
      if (state.schemaVersion > config.schemaVersion) {
        errors.push(`Schema version ${state.schemaVersion} exceeds supported maximum ${config.schemaVersion}`);
      }

      // Verify content hash
      const storedHash = state.contentHash;
      if (storedHash) {
        const recomputed = computeHash(state);
        if (storedHash !== recomputed) {
          errors.push('Content hash mismatch — possible corruption');
        }
      } else {
        errors.push('Missing content hash');
      }
      return { valid: errors.length === 0, errors };
    },

    async exportState(state) {
      const json = stableSerialize(state);
      return new TextEncoder().encode(json);
    },

    async deleteState(agentId) {
      validateIdentifier(agentId);
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
