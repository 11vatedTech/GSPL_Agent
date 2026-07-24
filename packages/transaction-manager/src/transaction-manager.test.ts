import { describe, it, expect, beforeEach } from 'vitest';
import { createTransactionManager, type TransactionManager, type Transaction } from './transaction-manager.js';

describe('Transaction Manager', () => {
  let tm: TransactionManager;

  beforeEach(() => {
    tm = createTransactionManager();
  });

  it('begins a transaction', () => {
    const tx = tm.beginTransaction('test');
    expect(tx.id).toBeDefined();
    expect(tx.status).toBe('PREPARED');
    expect(tx.operations.length).toBe(0);
  });

  it('adds operations to transaction', () => {
    const tx = tm.beginTransaction('test');
    const updated = tm.addOperation(tx, {
      id: 'op-1',
      type: 'write',
      target: './test.txt',
      before: null,
      after: 'new content',
      reversible: true,
    });
    expect(updated.operations.length).toBe(1);
  });

  it('commits a transaction', () => {
    const tx = tm.beginTransaction('test');
    // §9: commit() requires VALIDATED — transition through full lifecycle
    const authorized = tm.transition(tx, 'AUTHORIZED');
    const started = tm.transition(authorized, 'EFFECT_STARTED');
    const applied = tm.transition(started, 'EFFECT_APPLIED');
    const observed = tm.transition(applied, 'OBSERVED');
    const validated = tm.transition(observed, 'VALIDATED');
    const committed = tm.commit(validated);
    expect(committed.status).toBe('COMMITTED');
  });

  it('rolls back a transaction (truthfully: requires restore callback)', async () => {
    let wasRestored = false;
    const tmWithRestorer = createTransactionManager({
      stateRestorer: async (_op) => { wasRestored = true; },
    });
    const tx = tmWithRestorer.beginTransaction('test');
    const withOp = tmWithRestorer.addOperation(tx, {
      id: 'op-1',
      type: 'write',
      target: './test.txt',
      before: 'old',
      after: 'new',
      reversible: true,
    });
    const rolled = await tmWithRestorer.rollback(withOp);
    expect(rolled.status).toBe('ROLLED_BACK');
    expect(wasRestored).toBe(true);
    expect(rolled.operations[0].after).toBe('old');
  });

  it('compensates a transaction', async () => {
    const tx = tm.beginTransaction('test');
    const withOp = tm.addOperation(tx, {
      id: 'op-1',
      type: 'write',
      target: './test.txt',
      before: 'old',
      after: 'new',
      reversible: true,
      compensation: 'delete ./test.txt',
      compensateFn: async () => {},
    });
    const compensated = await tm.compensate(withOp);
    expect(compensated.status).toBe('COMPENSATED');
  });

  it('creates and validates checkpoints', () => {
    const tx = tm.beginTransaction('test');
    const cp = tm.createCheckpoint(tx, { key: 'value' }, 'snapshot-1');
    expect(cp.id).toBeDefined();
    expect(cp.hash).toBeDefined();
    expect(tm.validateCheckpoint(cp)).toBe(true);
    const restored = tm.restoreCheckpoint(cp);
    expect(restored.key).toBe('value');
  });

  it('detects corrupted checkpoints', () => {
    const tx = tm.beginTransaction('test');
    const cp = tm.createCheckpoint(tx, { key: 'value' }, 'snapshot');
    cp.state.key = 'tampered';
    expect(tm.validateCheckpoint(cp)).toBe(false);
  });

  it('handles irreversible operations in rollback (truthfully: ROLLBACK_FAILED)', async () => {
    const tx = tm.beginTransaction('test');
    const withOp = tm.addOperation(tx, {
      id: 'op-1',
      type: 'delete',
      target: './secret.txt',
      before: null,
      after: null,
      reversible: false,
    });
    const rolled = await tm.rollback(withOp);
    // Irreversible operations cannot be rolled back — truthful behavior
    expect(rolled.status === 'ROLLBACK_FAILED' || rolled.status === 'PARTIALLY_ROLLED_BACK').toBe(true);
    expect(rolled.recoveryErrors.length).toBeGreaterThanOrEqual(1);
  });

  it('executes restore callback on rollback', async () => {
    let restored = false;
    const tx = tm.beginTransaction('test');
    const withOp = tm.addOperation(tx, {
      id: 'op-1',
      type: 'write',
      target: './data.txt',
      before: 'original',
      after: 'modified',
      reversible: true,
      restore: async () => { restored = true; },
    });
    await tm.rollback(withOp);
    expect(restored).toBe(true);
  });

  it('exposes rollback errors', async () => {
    const tx = tm.beginTransaction('test');
    const withOp = tm.addOperation(tx, {
      id: 'op-1',
      type: 'write',
      target: './data.txt',
      before: 'original',
      after: 'modified',
      reversible: true,
      restore: async () => { throw new Error('disk failure'); },
    });
    const rolled = await tm.rollback(withOp);
    expect(rolled.recoveryErrors.length).toBeGreaterThanOrEqual(1);
    expect(rolled.status).toBe('ROLLBACK_FAILED');
  });
});
