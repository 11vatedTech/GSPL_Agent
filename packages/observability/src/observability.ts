/**
 * GSPL Observability
 *
 * Structured observability for every meaningful operation.
 * Logs, metrics, traces, decision records, execution timelines.
 * Does NOT store unrestricted hidden model reasoning.
 */

export interface StructuredLog {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  timestamp: number;
  source: string;
  message: string;
  sessionId: string;
  tickNumber: number;
  correlationId: string;
  data: Record<string, unknown>;
}

export interface MetricPoint {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  labels: Record<string, string>;
}

export interface TraceSpan {
  id: string;
  parentId: string | null;
  name: string;
  source: string;
  startedAt: number;
  completedAt: number | null;
  status: 'OK' | 'ERROR' | 'CANCELLED';
  metadata: Record<string, unknown>;
}

export interface DecisionRecord {
  id: string;
  timestamp: number;
  objective: string;
  decision: string;
  rationale: string;
  evidence: string[];
  alternativesConsidered: string[];
  selectedAction: string;
  validationResult: string | null;
}

export interface ObservabilitySystem {
  log(entry: Omit<StructuredLog, 'timestamp'>): void;
  recordMetric(point: Omit<MetricPoint, 'timestamp'>): void;
  startSpan(name: string, source: string, parentId?: string): TraceSpan;
  endSpan(span: TraceSpan, status?: TraceSpan['status']): TraceSpan;
  recordDecision(decision: Omit<DecisionRecord, 'id' | 'timestamp'>): DecisionRecord;
  getLogs(filter: { sessionId?: string; level?: string; limit?: number }): StructuredLog[];
  getMetrics(name: string, since?: number): MetricPoint[];
  getDecisionHistory(sessionId: string): DecisionRecord[];
}

export function createObservabilitySystem(): ObservabilitySystem {
  const logs: StructuredLog[] = [];
  const metrics: MetricPoint[] = [];
  const decisions: DecisionRecord[] = [];

  let logCounter = 0;
  let decisionCounter = 0;

  return {
    log(entry) {
      const log: StructuredLog = { ...entry, timestamp: Date.now() };
      logs.push(log);
      logCounter++;
    },

    recordMetric(point) {
      metrics.push({ ...point, timestamp: Date.now() });
    },

    startSpan(name, source, parentId?: string) {
      return { id: 'span-' + Date.now().toString(36), parentId: parentId ?? null, name, source, startedAt: Date.now(), completedAt: null, status: 'OK' as const, metadata: {} };
    },

    endSpan(span, status = 'OK') {
      span.completedAt = Date.now();
      span.status = status;
      return span;
    },

    recordDecision(decision) {
      const record: DecisionRecord = { ...decision, id: 'decision-' + Date.now().toString(36), timestamp: Date.now() };
      decisions.push(record);
      return record;
    },

    getLogs(filter) {
      let results = [...logs];
      if (filter.sessionId) results = results.filter(l => l.sessionId === filter.sessionId);
      if (filter.level) results = results.filter(l => l.level === filter.level);
      if (filter.limit) results = results.slice(-filter.limit);
      return results;
    },

    getMetrics(name, since = 0) {
      return metrics.filter(m => m.name === name && m.timestamp >= since);
    },

    getDecisionHistory(sessionId) {
      return decisions.filter(d => d.timestamp > 0); // Simplified
    },
  };
}
