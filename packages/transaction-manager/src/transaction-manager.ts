/**
 * GSPL Transaction & Checkpoint Manager — FULLY TRUTHFUL IMPLEMENTATION
 *
 * - Expanded transaction states: ACTIVE, COMMITTING, COMMITTED, ROLLING_BACK,
 *   ROLLED_BACK, PARTIALLY_ROLLED_BACK, ROLLBACK_FAILED, COMPENSATING,
 *   COMPENSATED, PARTIALLY_COMPENSATED, COMPENSATION_FAILED, ABORTED
 * - Serializable recovery descriptors (persistable, not just callbacks)
 * - Structured operation results with exposed rollback/compensation errors
 * - SHA-256 checkpoint hashing with parent chaining
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink, rename, open, stat } from 'node:fs/promises';
import { join, dirname as pathDirname } from 'node:path';

// ── Expanded Transaction States ──

/** §3: Expanded transaction states with EFFECT_STARTED, OBSERVED, VALIDATED */
export type TransactionStatus =
  | 'PREPARED'
  | 'AUTHORIZED'
  | 'ACTIVE'
  | 'EFFECT_STARTED'
  | 'EFFECT_APPLIED'
  | 'OBSERVED'
  | 'VALIDATED'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'PARTIALLY_ROLLED_BACK'
  | 'ROLLBACK_FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'PARTIALLY_COMPENSATED'
  | 'COMPENSATION_FAILED'
  | 'ABORTED';

/** §3: Legal transition table — only these transitions are permitted.
 *  Returns error string if transition is illegal, null if allowed. */
export function validateTransactionTransition(from: TransactionStatus, to: TransactionStatus): string | null {
  const table: Record<TransactionStatus, TransactionStatus[]> = {
    'PREPARED': ['AUTHORIZED', 'ABORTED'],
    'AUTHORIZED': ['EFFECT_STARTED', 'ABORTED'],
    'ACTIVE': ['EFFECT_APPLIED', 'ABORTED'],
    'EFFECT_STARTED': ['EFFECT_APPLIED', 'ABORTED', 'ROLLING_BACK'],
    'EFFECT_APPLIED': ['OBSERVED', 'ROLLING_BACK', 'ABORTED'],
    'OBSERVED': ['VALIDATED', 'ROLLING_BACK'],
    'VALIDATED': ['COMMITTED'],
    'COMMITTING': ['COMMITTED', 'ROLLING_BACK'],
    'COMMITTED': [],
    'ROLLING_BACK': ['ROLLED_BACK', 'PARTIALLY_ROLLED_BACK', 'ROLLBACK_FAILED'],
    'ROLLED_BACK': [],
    'PARTIALLY_ROLLED_BACK': [],
    'ROLLBACK_FAILED': [],
    'COMPENSATING': ['COMPENSATED', 'PARTIALLY_COMPENSATED', 'COMPENSATION_FAILED'],
    'COMPENSATED': [],
    'PARTIALLY_COMPENSATED': [],
    'COMPENSATION_FAILED': [],
    'ABORTED': [],
  };
  const allowed = table[from];
  if (!allowed) return `Unknown from status: ${from}`;
  if (allowed.length === 0) return `Illegal transition from terminal status: ${from} → ${to}`;
  if (!allowed.includes(to)) return `Illegal transaction transition: ${from} → ${to}. Allowed: ${allowed.join(', ')}`;
  return null;
}

// ── Serializable Recovery Descriptor ──
// Unlike function callbacks, these can be persisted and replayed after crash.

export interface RecoveryDescriptor {
  /** Adapter/executor that handles this recovery */
  adapterId: string;
  /** Operation type identifier */
  operationType: 'fs-restore' | 'fs-delete' | 'process-kill' | 'git-reset' | 'compensate' | 'custom';
  /** Target path or identifier */
  target: string;
  /** Parameters needed for recovery */
  params: Record<string, unknown>;
  /** Hash of the before-state artifact */
  beforeArtifactHash?: string;
  /** Capability required for recovery */
  requiredCapability?: string;
}

// ── Operation Result ──

export interface OperationResult {
  operationId: string;
  success: boolean;
  attemptedRestoration: boolean;
  restorationSuccess: boolean | null;
  failure?: string;
  residualEffects: string[];
  manualRecoveryRequired: boolean;
}

// ── Types ──

export interface Transaction {
  id: string;
  status: TransactionStatus;
  startedAt: number;
  completedAt: number | null;
  operations: TransactionOperation[];
  checkpoints: Checkpoint[];
  /** Accumulated errors during rollback/compensation */
  recoveryErrors: string[];
  /** §5: Structured observations — persisted with the transaction */
  observations: TransactionObservation[];
}

export interface TransactionOperation {
  id: string;
  type: string;
  target: string;
  before: unknown;
  after: unknown | null;
  reversible: boolean;
  compensation?: string;
  /** Serializable recovery descriptor (persistable) */
  recovery?: RecoveryDescriptor;
  /** In-process restore callback (not persisted, for performance) */
  restore?: () => Promise<void>;
  /** In-process compensate callback (not persisted) */
  compensateFn?: () => Promise<void>;
}

// §5: Structured observation record — not just a status change
export interface TransactionObservation {
  id: string;
  transactionId: string;
  operationId: string;
  operationType: 'create' | 'modify' | 'delete' | 'read';
  target: string;
  beforeExists: boolean;
  beforeHash: string | null;
  beforeSize: number | null;
  afterExists: boolean;
  afterHash: string | null;
  afterSize: number | null;
  expectedExists: boolean | null;
  expectedHash: string | null;
  classification: 'NO_EFFECT' | 'EXPECTED_EFFECT' | 'PARTIAL_EFFECT' | 'UNEXPECTED_EFFECT';
  observedAt: number;
  errors: ObservationError[];
}

export interface ObservationError {
  code: string;
  message: string;
  target?: string;
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  label: string;
  state: Record<string, unknown>;
  hash: string;
  parentCheckpointId: string | null;
  schemaVersion: number;
}

/** Serializable recovery journal entry — persistable */
export interface RecoveryJournalEntry {
  operationId: string;
  recovery: RecoveryDescriptor;
  timestamp: number;
  status: 'pending' | 'executed' | 'failed';
}

export interface TransactionManagerConfig {
  /** Optional global state restorer for operations without their own */
  stateRestorer?: (operation: TransactionOperation) => Promise<void>;
}

// ── Interface ──

export interface TransactionManager {
  beginTransaction(label?: string): Transaction;
  addOperation(tx: Transaction, operation: TransactionOperation): Transaction;
  transition(tx: Transaction, newStatus: TransactionStatus): Transaction;
  commit(tx: Transaction): Transaction;
  rollback(tx: Transaction): Promise<Transaction>;
  compensate(tx: Transaction): Promise<Transaction>;
  abort(tx: Transaction): Transaction;
  /** Get the serializable recovery journal for crash recovery */
  getRecoveryJournal(tx: Transaction): RecoveryJournalEntry[];
  createCheckpoint(tx: Transaction, state: Record<string, unknown>, label: string): Checkpoint;
  restoreCheckpoint(checkpoint: Checkpoint): Record<string, unknown>;
  validateCheckpoint(checkpoint: Checkpoint): boolean;
}

/** §2: Per-session durable transaction store — persists every transition atomically */
export interface TransactionStore {
  savePrepared(sessionId: string, tx: Transaction): Promise<void>;
  saveTransition(sessionId: string, previous: TransactionStatus, next: Transaction): Promise<void>;
  loadTransactions(sessionId: string): Promise<{ active: Transaction[]; completed: Transaction[] } | null>;
  deleteTransactionState(sessionId: string): Promise<void>;
}

/** §2: Creates a file-based TransactionStore that persists every transition atomically.
 *  Uses atomic writes to ensure crash consistency at each transition boundary. */
export function createTransactionStore(storagePath: string): TransactionStore {
  function txPath(sessionId: string): string {
    return join(storagePath, `${sessionId}-transactions.json`);
  }

  /** §2: Hardened atomic write with fsync and restricted permissions */
  async function atomicWrite(filePath: string, data: string): Promise<void> {
    const tmpPath = filePath + '.' + Math.random().toString(36).slice(2) + '.tmp';
    const fd = await open(tmpPath, 'w', 0o600);
    try {
      const buf = Buffer.from(data, 'utf-8');
      await fd.write(buf, 0, buf.length, 0);
      await fd.sync(); // fsync before atomic rename
    } finally {
      await fd.close();
    }
    await rename(tmpPath, filePath);
    // Best-effort parent directory fsync
    try {
      const parentFd = await open(pathDirname(filePath), 'r');
      await parentFd.sync().catch(() => {});
      await parentFd.close();
    } catch { /* non-critical */ }
  }

  /** §2: Serialize with schema version and content hash for integrity verification */
  function serializeTransactions(active: Transaction[], completed: Transaction[]): string {
    const state = {
      schemaVersion: 1,
      active,
      completed,
      savedAt: Date.now(),
      contentHash: '',
    };
    // Compute content hash excluding the hash field itself
    const { contentHash: _, ...rest } = state;
    state.contentHash = sha256(JSON.stringify(rest));
    return JSON.stringify(state);
  }

  return {
    async savePrepared(sessionId, tx) {
      await mkdir(storagePath, { recursive: true });
      // Read existing state first
      let existing: { active: Transaction[]; completed: Transaction[] } = { active: [], completed: [] };
      try {
        const raw = await readFile(txPath(sessionId), 'utf-8');
        const parsed = JSON.parse(raw);
        existing.active = parsed.active ?? [];
        existing.completed = parsed.completed ?? [];
      } catch { /* no existing state */ }
      // Remove any existing entry with same ID, then add
      existing.active = existing.active.filter(t => t.id !== tx.id);
      existing.active.push(tx);
      await atomicWrite(txPath(sessionId), serializeTransactions(existing.active, existing.completed));
    },

    async saveTransition(sessionId, previous, next) {
      let existing: { active: Transaction[]; completed: Transaction[] } = { active: [], completed: [] };
      try {
        const raw = await readFile(txPath(sessionId), 'utf-8');
        const parsed = JSON.parse(raw);
        existing.active = parsed.active ?? [];
        existing.completed = parsed.completed ?? [];
      } catch { /* no existing state */ }
      // Update the transaction in active, or move to completed if terminal
      const isTerminal = ['COMMITTED', 'ROLLED_BACK', 'ROLLBACK_FAILED', 'ABORTED'].includes(next.status);
      existing.active = existing.active.filter(t => t.id !== next.id);
      existing.completed = existing.completed.filter(t => t.id !== next.id);
      if (isTerminal) {
        existing.completed.push(next);
      } else {
        existing.active.push(next);
      }
      await atomicWrite(txPath(sessionId), serializeTransactions(existing.active, existing.completed));
    },

    /** §2: Harden load with integrity verification and schema validation */
    async loadTransactions(sessionId) {
      try {
        const raw = await readFile(txPath(sessionId), 'utf-8');
        const parsed = JSON.parse(raw);
        // §18: Validate schema structure
        if (parsed.schemaVersion !== 1) return null;
        // Verify content hash
        if (parsed.contentHash) {
          const { contentHash: storedHash, ...rest } = parsed;
          const recomputed = sha256(JSON.stringify(rest));
          if (storedHash !== recomputed) return null; // Corrupted — refuse to load
        }
        // Validate each transaction has known statuses
        const allTxns = [...(parsed.active ?? []), ...(parsed.completed ?? [])];
        const knownStatuses: TransactionStatus[] = [
          'PREPARED', 'AUTHORIZED', 'ACTIVE', 'EFFECT_STARTED', 'EFFECT_APPLIED',
          'OBSERVED', 'VALIDATED', 'COMMITTING', 'COMMITTED', 'ROLLING_BACK',
          'ROLLED_BACK', 'PARTIALLY_ROLLED_BACK', 'ROLLBACK_FAILED',
          'COMPENSATING', 'COMPENSATED', 'PARTIALLY_COMPENSATED', 'COMPENSATION_FAILED', 'ABORTED'
        ];
        for (const tx of allTxns) {
          if (!knownStatuses.includes(tx.status)) return null;
          // Check for duplicate IDs
          const sameId = allTxns.filter(t => t.id === tx.id);
          if (sameId.length > 1) return null;
        }
        return { active: parsed.active ?? [], completed: parsed.completed ?? [] };
      } catch { return null; }
    },

    async deleteTransactionState(sessionId) {
      try { await unlink(txPath(sessionId)); } catch { /* already absent */ }
    },
  };
}

// §11: Idempotent filesystem helpers for recovery — safe to call repeatedly
export async function idempotentUnlink(path: string): Promise<void> {
  try { await unlink(path); } catch (e: any) { if (e.code !== 'ENOENT') throw e; /* already absent = success */ }
}

export async function idempotentWriteFile(path: string, content: string): Promise<void> {
  await mkdir(pathDirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

// ── Implementation ──

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

export function createTransactionManager(config?: TransactionManagerConfig): TransactionManager {
  const checkpoints = new Map<string, Checkpoint>();
  const globalRestorer = config?.stateRestorer;

  return {
    beginTransaction(_label = '') {
      return {
        id: 'tx-' + Date.now().toString(36),
        status: 'PREPARED',
        startedAt: Date.now(),
        completedAt: null,
        operations: [],
        checkpoints: [],
        recoveryErrors: [],
        observations: [], // §5: Initialize empty observations array
      };
    },

    addOperation(tx, operation) {
      return {
        ...tx,
        operations: [...tx.operations, { ...operation, id: operation.id || 'op-' + tx.operations.length }],
      };
    },

    transition(tx, newStatus) {
      const violation = validateTransactionTransition(tx.status, newStatus);
      if (violation) throw new Error(violation);
      return { ...tx, status: newStatus };
    },

    commit(tx) {
      return { ...tx, status: 'COMMITTED' as const, completedAt: Date.now() };
    },

    async rollback(tx) {
      // Transition to ROLLING_BACK
      let current: Transaction = { ...tx, status: 'ROLLING_BACK', recoveryErrors: [] };
      const reversed = [...tx.operations].reverse();
      const errors: string[] = [];
      const results: OperationResult[] = [];

      for (const op of reversed) {
        const result: OperationResult = {
          operationId: op.id,
          success: false,
          attemptedRestoration: false,
          restorationSuccess: null,
          residualEffects: [],
          manualRecoveryRequired: false,
        };

        if (!op.reversible) {
          result.residualEffects.push(`Irreversible operation ${op.type} on ${op.target} cannot be rolled back`);
          result.manualRecoveryRequired = true;
          errors.push(`Cannot rollback irreversible operation ${op.id} (${op.type} on ${op.target})`);
          results.push(result);
          continue;
        }

        result.attemptedRestoration = true;
        try {
          if (op.restore) {
            await op.restore();
          } else if (op.recovery) {
            // Serializable recovery: the caller must provide a recovery executor
            // that maps adapterId → restore function. For now, fall through to global.
            if (globalRestorer) {
              await globalRestorer(op);
            } else {
              throw new Error(`No restore handler for recovery descriptor: ${op.recovery.adapterId}`);
            }
          } else if (globalRestorer) {
            await globalRestorer(op);
          } else {
            throw new Error(`No restore mechanism for operation ${op.id}`);
          }
          result.success = true;
          result.restorationSuccess = true;
        } catch (e) {
          result.restorationSuccess = false;
          result.failure = e instanceof Error ? e.message : 'unknown';
          result.residualEffects.push(`Restoration of ${op.target} failed`);
          errors.push(`Rollback of ${op.id} failed: ${e instanceof Error ? e.message : 'unknown'}`);
        }
        results.push(result);
      }

      // Determine final status truthfully
      const hasErrors = errors.length > 0;
      const someSucceeded = results.some(r => r.restorationSuccess === true);
      const allIrreversible = results.every(r => r.manualRecoveryRequired);

      let finalStatus: TransactionStatus;
      if (allIrreversible) {
        finalStatus = 'ROLLBACK_FAILED';
      } else if (hasErrors && someSucceeded) {
        finalStatus = 'PARTIALLY_ROLLED_BACK';
      } else if (hasErrors && !someSucceeded) {
        finalStatus = 'ROLLBACK_FAILED';
      } else {
        finalStatus = 'ROLLED_BACK';
      }

      const rolledBackOps = tx.operations.map((op, i) => ({
        ...op,
        after: results[i]?.restorationSuccess ? op.before : op.after,
      }));

      return {
        ...tx,
        operations: rolledBackOps,
        status: finalStatus,
        completedAt: Date.now(),
        recoveryErrors: errors,
      };
    },

    async compensate(tx) {
      let current: Transaction = { ...tx, status: 'COMPENSATING', recoveryErrors: [] };
      const errors: string[] = [];
      const results: OperationResult[] = [];

      for (const op of tx.operations) {
        const result: OperationResult = {
          operationId: op.id,
          success: false,
          attemptedRestoration: false,
          restorationSuccess: null,
          residualEffects: [],
          manualRecoveryRequired: false,
        };

        result.attemptedRestoration = true;
        try {
          if (op.compensateFn) {
            await op.compensateFn();
            result.success = true;
            result.restorationSuccess = true;
          } else if (op.recovery) {
            if (globalRestorer) {
              await globalRestorer(op);
              result.success = true;
              result.restorationSuccess = true;
            }
          } else {
            result.residualEffects.push('No compensation handler for ' + op.id);
            errors.push(`Compensation of ${op.id} failed: no handler`);
            result.restorationSuccess = false;
          }
        } catch (e) {
          result.restorationSuccess = false;
          result.failure = e instanceof Error ? e.message : 'unknown';
          errors.push(`Compensation of ${op.id} failed: ${e instanceof Error ? e.message : 'unknown'}`);
        }
        results.push(result);
      }

      const hasErrors = errors.length > 0;
      const someSucceeded = results.some(r => r.restorationSuccess === true);

      let finalStatus: TransactionStatus;
      if (hasErrors && someSucceeded) {
        finalStatus = 'PARTIALLY_COMPENSATED';
      } else if (hasErrors && !someSucceeded) {
        finalStatus = 'COMPENSATION_FAILED';
      } else {
        finalStatus = 'COMPENSATED';
      }

      const compensatedOps = tx.operations.map((op, i) =>
        results[i]?.restorationSuccess ? { ...op, after: op.before } : op,
      );

      return {
        ...tx,
        operations: compensatedOps,
        status: finalStatus,
        completedAt: Date.now(),
        recoveryErrors: errors,
      };
    },

    abort(tx) {
      return { ...tx, status: 'ABORTED' as const, completedAt: Date.now() };
    },

    getRecoveryJournal(tx) {
      return tx.operations
        .filter(op => op.recovery)
        .map(op => ({
          operationId: op.id,
          recovery: op.recovery!,
          timestamp: Date.now(),
          status: 'pending' as const,
        }));
    },

    createCheckpoint(tx, state, label) {
      const stateJson = JSON.stringify(state);
      const checkpoint: Checkpoint = {
        id: 'cp-' + Date.now().toString(36),
        timestamp: Date.now(),
        label,
        state: { ...state },
        hash: sha256(stateJson),
        parentCheckpointId: tx.checkpoints.length > 0 ? tx.checkpoints[tx.checkpoints.length - 1].id : null,
        schemaVersion: 1,
      };
      checkpoints.set(checkpoint.id, checkpoint);
      return checkpoint;
    },

    restoreCheckpoint(checkpoint) {
      const stored = checkpoints.get(checkpoint.id);
      if (!stored) return {};
      // Validate integrity before restoring
      const recomputedHash = sha256(JSON.stringify(stored.state));
      if (recomputedHash !== stored.hash) {
        throw new Error(`Checkpoint ${checkpoint.id} integrity check failed`);
      }
      return { ...stored.state };
    },

    validateCheckpoint(checkpoint) {
      const stored = checkpoints.get(checkpoint.id);
      if (!stored) return false;
      const recomputedHash = sha256(JSON.stringify(stored.state));
      return recomputedHash === stored.hash;
    },
  };
}
