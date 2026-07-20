/**
 * The 8-phase tick cycle per spec/03.
 *
 * The tick cycle is the deterministic run-time of GSPL's kernel. Every
 * canonical seed expansion, mutation, breeding, and projection operation is
 * modelled as a tick that traverses these 8 ordered phases:
 *
 *   1. intake    — receive the operation request and bound the seed
 *   2. validate  — apply the 8 invariants; halt on failure
 *   3. plan      — decide operator(s) and target contract(s)
 *   4. mutate    — apply typed gene operators
 *   5. execute   — run side-effecting components inside the effect budget
 *   6. reduce    — coalesce stochastic and parallel effects
 *   7. emit      — write the projection target bytes
 *   8. persist   — record lineage, hashes, sovereignty updates
 *
 * Tests pin TICK_PHASES to this exact ordering.
 */

export const TICK_PHASES = [
  'intake',
  'validate',
  'plan',
  'mutate',
  'execute',
  'reduce',
  'emit',
  'persist',
] as const;

export type TickPhase = (typeof TICK_PHASES)[number];

export type TickOperationKind = 'grow' | 'mutate' | 'breed' | 'compose' | 'evolve' | 'export' | 'import' | 'validate';

export interface TickOperation {
  kind: TickOperationKind;
  engine?: string;
  [k: string]: unknown;
}

export interface TickError {
  phase: TickPhase;
  code: string;
  message: string;
}

export interface Tick {
  operation: TickOperation;
  phase_index: number;
  status: 'pending' | 'completed' | 'failed';
  error?: TickError;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Open a new pending tick.
 */
export function startTick(operation: TickOperation): Tick {
  return {
    operation,
    phase_index: 0,
    status: 'pending',
    startedAt: new Date().toISOString(),
  };
}

/**
 * Mark a tick as completed (terminal).
 */
export function completeTick(tick: Tick): Tick {
  return {
    ...tick,
    status: 'completed',
    phase_index: TICK_PHASES.length - 1,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Mark a tick as failed at a specific phase, with a typed error.
 */
export function failTick(tick: Tick, phase: TickPhase, code: string, message: string): Tick {
  const idx = TICK_PHASES.indexOf(phase);
  return {
    ...tick,
    status: 'failed',
    phase_index: idx >= 0 ? idx : tick.phase_index,
    error: { phase, code, message },
    completedAt: new Date().toISOString(),
  };
}
