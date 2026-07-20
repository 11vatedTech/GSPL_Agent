/**
 * Cognitive Tick Cycle — maps the 8-phase GSPL kernel tick cycle
 * to cognitive operations for the agent.
 *
 * The tick cycle is the agent's heartbeat. Each tick advances
 * the agent through Perceive→Verify→Reason→Adapt→Act→Consolidate→Respond→Remember.
 * This is NOT a ReAct loop. It is a deterministic phase-structured
 * cognitive execution cycle derived from the GSPL kernel's 8-phase tick.
 */

import type {
  CognitiveTickPhase,
  CognitiveTickState,
  SovereignAgentGenome,
  CognitiveGraph,
  CognitiveOrgan,
  CognitiveEffect,
  OrganError,
  MorphogenesisResult,
} from './types.js';

// ── Tick Cycle Engine ──

export interface TickCycleConfig {
  /** Max wall time per tick in ms */
  maxTickTimeMs: number;
  /** Max phases that can be retried on error */
  maxRetries: number;
  /** Whether to persist state between ticks */
  persistentState: boolean;
  /** Whether to enforce determinism in phases 1-4 */
  enforceDeterminism: boolean;
}

export const DEFAULT_TICK_CONFIG: TickCycleConfig = {
  maxTickTimeMs: 30000,
  maxRetries: 3,
  persistentState: true,
  enforceDeterminism: true,
};

/**
 * Create a new cognitive tick state from an agent genome.
 */
export function createInitialTickState(
  genome: SovereignAgentGenome,
  config: TickCycleConfig = DEFAULT_TICK_CONFIG,
): CognitiveTickState {
  return {
    phase: 'INTAKE',
    tickNumber: genome.$lineage.tick + 1,
    genome,
    cognitiveGraph: null,
    activeOrgans: [],
    pendingEffects: [],
    errors: [],
    startedAt: Date.now(),
    phaseStartedAt: Date.now(),
    completed: false,
  };
}

/**
 * Advance the tick state through the 8 phases.
 * Returns the final state after all phases complete (or fail).
 */
export function advanceTick(
  state: CognitiveTickState,
  phaseResults: Partial<Record<CognitiveTickPhase, TickPhaseResult>>,
): CognitiveTickState {
  const phaseOrder: CognitiveTickPhase[] = [
    'INTAKE', 'VALIDATE', 'PLAN', 'MUTATE', 'EXECUTE', 'REDUCE', 'EMIT', 'PERSIST',
  ];

  let current = { ...state };
  let aborted = false;

  for (const phase of phaseOrder) {
    if (aborted) break;

    current = { ...current, phase, phaseStartedAt: Date.now() };
    const result = phaseResults[phase];

    if (result?.errors && result.errors.length > 0) {
      const fatalErrors = result.errors.filter(e => e.severity === 'fatal');
      if (fatalErrors.length > 0) {
        current = {
          ...current,
          errors: [...current.errors, ...fatalErrors],
          completed: true,
        };
        aborted = true;
        break;
      }
      current = { ...current, errors: [...current.errors, ...result.errors.filter(e => e.severity !== 'fatal')] };
    }

    // Apply phase-specific mutations
    if (result) {
      current = applyPhaseResult(current, phase, result);
    }
  }

  if (!aborted) {
    current = { ...current, completed: true };
  }

  return current;
}

export interface TickPhaseResult {
  phase: CognitiveTickPhase;
  success: boolean;
  errors: OrganError[];
  cognitiveGraph?: CognitiveGraph;
  activeOrgans?: CognitiveOrgan[];
  pendingEffects?: CognitiveEffect[];
  morphogenesisResult?: MorphogenesisResult;
  observations?: unknown[];
}

function applyPhaseResult(
  state: CognitiveTickState,
  phase: CognitiveTickPhase,
  result: TickPhaseResult,
): CognitiveTickState {
  switch (phase) {
    case 'PLAN':
      return {
        ...state,
        cognitiveGraph: result.cognitiveGraph ?? state.cognitiveGraph,
      };
    case 'MUTATE':
      // Mutations are applied to the genome
      return state;
    case 'EXECUTE':
      return {
        ...state,
        activeOrgans: result.activeOrgans ?? state.activeOrgans,
      };
    case 'EMIT':
      return {
        ...state,
        pendingEffects: result.pendingEffects ?? state.pendingEffects,
      };
    case 'PERSIST':
      // State is persisted; increment tick
      return {
        ...state,
        genome: {
          ...state.genome,
          $lineage: {
            ...state.genome.$lineage,
            tick: state.tickNumber,
            createdAt: Date.now(),
          },
        },
      };
    default:
      return state;
  }
}

/**
 * Phase-specific handlers describe what each tick phase does.
 */
export const COGNITIVE_TICK_PHASE_DESCRIPTIONS: Record<CognitiveTickPhase, string> = {
  INTAKE:
    'PERCEIVE — Bind sensory inputs (text, vision, system state) to seed context. ' +
    'Load external references. Identify what changed since last tick.',
  VALIDATE:
    'VERIFY — Cryptographic sovereignty checks. Are perceptual inputs valid? ' +
    'Am I operating within signed policy boundaries? Run invariant validators.',
  PLAN:
    'REASON — Compute Fisher Information gradient. Discover cognitive gaps. ' +
    'Select/synthesize cognitive organs. Generate cognitive graph (phenotype).',
  MUTATE:
    'ADAPT — Apply controlled mutations to beliefs based on new evidence. ' +
    'Update hypotheses. Adjust confidence. Consolidate contradictions.',
  EXECUTE:
    'ACT — Invoke model fabric. Execute tools. Run selected cognitive organs. ' +
    'Generate outputs. Dispatch capability-bounded actions.',
  REDUCE:
    'CONSOLIDATE — Collapse parallel branches. Merge results. ' +
    'Resolve conflicts. Compute consensus across organs.',
  EMIT:
    'RESPOND — Dispatch side effects (API calls, UI updates). ' +
    'Spawn sub-agents as child seeds. Queue pending effects.',
  PERSIST:
    'REMEMBER — Append tick to $lineage. Hash and sign new cognitive frame. ' +
    'Consolidate memory. Archive evidence. Update self-model.',
};

/**
 * Get the next phase in the cycle.
 */
export function nextTickPhase(current: CognitiveTickPhase): CognitiveTickPhase {
  const order: CognitiveTickPhase[] = [
    'INTAKE', 'VALIDATE', 'PLAN', 'MUTATE', 'EXECUTE', 'REDUCE', 'EMIT', 'PERSIST',
  ];
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= order.length - 1) return 'INTAKE';
  return order[idx + 1];
}

/**
 * Get the previous phase in the cycle.
 */
export function prevTickPhase(current: CognitiveTickPhase): CognitiveTickPhase {
  const order: CognitiveTickPhase[] = [
    'INTAKE', 'VALIDATE', 'PLAN', 'MUTATE', 'EXECUTE', 'REDUCE', 'EMIT', 'PERSIST',
  ];
  const idx = order.indexOf(current);
  if (idx <= 0) return 'PERSIST';
  return order[idx - 1];
}
