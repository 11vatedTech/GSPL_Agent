import { describe, it, expect, beforeEach } from 'vitest';
import { createEventStore, type EventStore, type ExecutionEvent } from './event-history.js';

function makeEvent(sessionId: string, action: string, success: boolean): ExecutionEvent {
  return {
    id: 'evt-' + Math.random().toString(36).slice(2, 8),
    sessionId,
    timestamp: Date.now(),
    causalParent: null,
    source: 'test-organ',
    action,
    affectedEntities: [],
    preStateRef: null,
    postStateRef: null,
    intentLineage: 'test-intent',
    capabilityLineage: null,
    result: { success, output: { done: true }, artifacts: [] },
    verification: null,
    errors: success ? [] : [{ code: 'FAIL', message: 'Action failed', severity: 'error' }],
    resourceUse: { computeUnits: 1, memoryBytes: 1000, wallTimeMs: 10, tokensUsed: 0 },
  };
}

describe('Event History', () => {
  let store: EventStore;

  beforeEach(() => {
    store = createEventStore();
  });

  it('appends and queries events', () => {
    store.append(makeEvent('session-1', 'read', true));
    store.append(makeEvent('session-1', 'write', true));
    const results = store.query({ sessionId: 'session-1' });
    expect(results.length).toBe(2);
  });

  it('filters by session, action, and time range', () => {
    const e1 = makeEvent('s1', 'read', true);
    const e2 = makeEvent('s2', 'write', true);
    store.append(e1);
    store.append(e2);
    expect(store.query({ sessionId: 's1' }).length).toBe(1);
    expect(store.query({ action: 'write' }).length).toBe(1);
  });

  it('replays events for a session', () => {
    store.append(makeEvent('s-replay', 'step-1', true));
    store.append(makeEvent('s-replay', 'step-2', true));
    store.append(makeEvent('s-other', 'step-1', true));
    const replay = store.replay('s-replay');
    expect(replay.length).toBe(2);
  });

  it('reconstructs state from events', () => {
    store.append(makeEvent('s-recon', 'init', true));
    const state = store.reconstructState('s-recon', '');
    expect(state).toBeDefined();
  });

  it('detects divergence in event sequences', () => {
    const events = [
      makeEvent('s-div', 'step-1', true),
      makeEvent('s-div', 'step-2', false),
    ];
    const report = store.detectDivergence(events);
    expect(report.diverged).toBe(true);
  });

  it('generates audit reports', () => {
    store.append(makeEvent('s-audit', 'read', true));
    store.append(makeEvent('s-audit', 'write', false));
    const report = store.audit('s-audit');
    expect(report.totalEvents).toBe(2);
    expect(report.errors).toBe(1);
    expect(Array.isArray(report.auditTrail)).toBe(true);
  });

  it('each event store is independent', () => {
    const s1 = createEventStore();
    const s2 = createEventStore();
    s1.append(makeEvent('only-s1', 'action', true));
    expect(s1.query({ sessionId: 'only-s1' }).length).toBe(1);
    expect(s2.query({ sessionId: 'only-s1' }).length).toBe(0);
  });

  it('events carry intent and capability lineage', () => {
    store.append(makeEvent('s-lineage', 'delegated-action', true));
    const results = store.query({ sessionId: 's-lineage' });
    expect(results[0].intentLineage).toBeDefined();
  });
});
