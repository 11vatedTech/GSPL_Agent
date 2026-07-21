/**
 * GSPL Event-Sourced Execution History
 *
 * Records every meaningful state transition as a structured event.
 * Supports replay, debugging, audit, reconstruction, and divergence detection.
 */

export interface ExecutionEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  causalParent: string | null;
  source: string;
  action: string;
  affectedEntities: string[];
  preStateRef: string | null;
  postStateRef: string | null;
  intentLineage: string;
  capabilityLineage: string | null;
  result: EventResult;
  verification: EventVerification | null;
  errors: EventError[];
  resourceUse: EventResourceUse;
}

export interface EventResult {
  success: boolean;
  output: unknown;
  artifacts: string[];
}

export interface EventVerification {
  method: string;
  passed: boolean;
  evidence: string[];
  verifier: string;
}

export interface EventError {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'fatal';
}

export interface EventResourceUse {
  computeUnits: number;
  memoryBytes: number;
  wallTimeMs: number;
  tokensUsed: number;
}

// ── Event Store ──

export interface EventStore {
  append(event: ExecutionEvent): void;
  query(filter: EventFilter): ExecutionEvent[];
  replay(sessionId: string): ExecutionEvent[];
  reconstructState(sessionId: string, targetEventId: string): Record<string, unknown>;
  detectDivergence(events: ExecutionEvent[]): DivergenceReport;
  audit(sessionId: string): AuditReport;
  /** Export all events for persistence */
  exportState(): ExecutionEvent[];
  /** Import events from persistence */
  importState(events: ExecutionEvent[]): void;
}

export interface EventFilter {
  sessionId?: string;
  source?: string;
  action?: string;
  since?: number;
  until?: number;
  minSeverity?: string;
  limit?: number;
}

export interface DivergenceReport {
  diverged: boolean;
  events: { eventId: string; expected: unknown; actual: unknown }[];
}

export interface AuditReport {
  sessionId: string;
  totalEvents: number;
  errors: number;
  securityEvents: number;
  unauthorizedAttempts: number;
  auditTrail: string[];
}

export function createEventStore(): EventStore {
  const events: ExecutionEvent[] = [];

  return {
    append(event) {
      events.push({ ...event });
    },

    query(filter) {
      let results = [...events];
      if (filter.sessionId) results = results.filter(e => e.sessionId === filter.sessionId);
      if (filter.source) results = results.filter(e => e.source === filter.source);
      if (filter.action) results = results.filter(e => e.action === filter.action);
      if (filter.since != null) results = results.filter(e => e.timestamp >= filter.since!);
      if (filter.until != null) results = results.filter(e => e.timestamp <= filter.until!);
      if (filter.limit) results = results.slice(0, filter.limit);
      return results;
    },

    replay(sessionId) {
      return events.filter(e => e.sessionId === sessionId);
    },

    reconstructState(sessionId, targetEventId) {
      const sessionEvents = events.filter(e => e.sessionId === sessionId);
      const state: Record<string, unknown> = {};
      for (const event of sessionEvents) {
        // Apply each event's effects to reconstruct state
        if (event.postStateRef) {
          state[event.id] = event.result.output;
        }
        if (event.id === targetEventId) break;
      }
      return state;
    },

    detectDivergence(eventsToCheck) {
      const divergences: { eventId: string; expected: unknown; actual: unknown }[] = [];
      for (const event of eventsToCheck) {
        if (!event.result.success) {
          divergences.push({
            eventId: event.id,
            expected: 'success',
            actual: event.errors.map(e => e.message),
          });
        }
      }
      return { diverged: divergences.length > 0, events: divergences };
    },

    audit(sessionId) {
      const sessionEvents = events.filter(e => e.sessionId === sessionId);
      return {
        sessionId,
        totalEvents: sessionEvents.length,
        errors: sessionEvents.filter(e => e.errors.length > 0).length,
        securityEvents: 0,
        unauthorizedAttempts: 0,
        auditTrail: sessionEvents.map(e => `${e.timestamp}: ${e.source}.${e.action} — ${e.result.success ? 'OK' : 'FAIL'}`),
      };
    },

    exportState(): ExecutionEvent[] {
      return [...events];
    },

    importState(importedEvents: ExecutionEvent[]) {
      events.length = 0;
      for (const evt of importedEvents) {
        events.push({ ...evt });
      }
    },
  };
}
