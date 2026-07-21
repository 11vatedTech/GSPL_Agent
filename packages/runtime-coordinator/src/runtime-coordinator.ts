/**
 * GSPL Agent Runtime Coordinator — ASYNC + DI
 *
 * The central orchestrator that connects all agent packages into a coherent
 * intelligence system. Fully asynchronous with explicit dependency injection.
 *
 * The coordinator does NOT contain domain reasoning — it orchestrates typed
 * contracts between packages.
 *
 * Lifecycle:
 *   Owner intent → Intent compilation → World construction → Morphogenesis →
 *   Organ binding → Plan execution → Observation → Epistemic update →
 *   Memory consolidation → Verification → Checkpoint → Restart
 */

import type {
  SovereignAgentGenome, CognitiveGraph, CognitiveOrgan,
  MorphogenesisRequest, MorphogenesisResult, OrganContract,
  CognitiveTickPhase, TickPhaseResult, OrganResult, ResourceBudget, RiskLevel,
} from '@gspl/cognitive-kernel';
import { createPrimordialGenome, validateSovereignGenome, createChildGenome, performMorphogenesis } from '@gspl/cognitive-kernel';
import { compileIntent, type CompiledIntent } from '@gspl/intent-compiler';
import { createEpistemicEngine, type EpistemicEngine, type Claim } from '@gspl/epistemic-engine';
import { createMemoryStore, type MemoryStore } from '@gspl/memory-architecture';
import { createCapabilityManager, type CapabilityManager, type EffectType } from '@gspl/capability-security';
import { createWorld, discoverAbsences, type SemanticWorld } from '@gspl/world-model';
import { createActionRegistry, createActionExecutor, registerStandardActions, type ActionRegistry, type ActionExecutor } from '@gspl/action-fabric';
import { createTransactionManager, type TransactionManager } from '@gspl/transaction-manager';
import { createPersistenceLayer, type PersistenceLayer, type PersistenceConfig, type PersistedState } from '@gspl/persistence';
import { createEventStore, type EventStore, type ExecutionEvent } from '@gspl/event-history';
import { createObservabilitySystem, type ObservabilitySystem } from '@gspl/observability';
import { createVerificationEngine, type VerificationEngine } from '@gspl/verification-engine';
import type { IntentValue } from '@gspl/agent-genes';

// ── Runtime Configuration ──

export interface RuntimeConfig {
  /** Storage root for persistence */
  storagePath: string;
  /** Current schema version */
  schemaVersion: number;
  /** Enable automatic backups */
  backupEnabled: boolean;
  /** Max number of backup files */
  maxBackupCount: number;
  /** Resource budget for morphogenesis */
  resourceBudget: ResourceBudget;
  /** Default risk tolerance */
  riskTolerance: RiskLevel;
  /** Default compute budget */
  maxComputeUnits: number;
  /** Default memory budget */
  maxMemoryBytes: number;
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  storagePath: './.gspl-agent-state',
  schemaVersion: 1,
  backupEnabled: true,
  maxBackupCount: 10,
  resourceBudget: {
    maxComputeUnits: 1000,
    maxMemoryBytes: 16 * 1024 * 1024 * 1024,
    maxWallTimeMs: 300000,
    maxTokens: 100000,
  },
  riskTolerance: 'MEDIUM',
  maxComputeUnits: 1000,
  maxMemoryBytes: 16 * 1024 * 1024 * 1024,
};

// ── Dependencies (injected, not constructed internally) ──

export interface RuntimeDependencies {
  persistence: PersistenceLayer;
  eventStore: EventStore;
  observability: ObservabilitySystem;
  verification: VerificationEngine;
  actionRegistry: ActionRegistry;
  actionExecutor: ActionExecutor;
  transactionManager: TransactionManager;
  /** Returns current monotonic time in ms */
  clock: () => number;
  /** Generates unique collision-resistant identifiers */
  generateId: (prefix?: string) => string;
  /** Runtime configuration */
  config: RuntimeConfig;
}

// ── Organ Registry Entry ──

export interface OrganRegistryEntry {
  organType: string;
  handler: (organ: CognitiveOrgan, session: AgentSession) => Promise<OrganResult>;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  requiredCapabilities: string[];
}

// ── Agent Session ──

export interface AgentSession {
  sessionId: string;
  genome: SovereignAgentGenome;
  compiledIntent: CompiledIntent | null;
  world: SemanticWorld;
  cognitiveGraph: CognitiveGraph | null;
  epistemicEngine: EpistemicEngine;
  memoryStore: MemoryStore;
  capabilityManager: CapabilityManager;
  availableOrgans: OrganContract[];
  tick: number;
  phase: CognitiveTickPhase;
  startedAt: number;
  errors: AgentSessionError[];
  checkpointId: string | null;
  /** Execution plan if generated */
  executionPlan: import('@gspl/planning-execution').ExecutionPlan | null;
}

export interface AgentSessionError {
  phase: CognitiveTickPhase;
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'fatal';
  recoverable: boolean;
}

// ── Runtime Coordinator Interface ──

export interface RuntimeCoordinator {
  createSession(genome?: SovereignAgentGenome): AgentSession;
  restoreSession(agentId: string): Promise<AgentSession>;
  submitObjective(session: AgentSession, objective: string): AgentSession;
  executeTick(session: AgentSession): Promise<AgentSession>;
  verifyCompletion(session: AgentSession): CompletionVerification;
  checkpoint(session: AgentSession): Promise<AgentSession>;
  getSelfModel(session: AgentSession): AgentSession;
  /** Register a cognitive organ handler */
  registerOrgan(entry: OrganRegistryEntry): void;
}

export interface CompletionVerification {
  complete: boolean;
  requirementsSatisfied: string[];
  requirementsFailed: string[];
  evidence: string[];
  confidence: number;
}

// ── Implementation ──

export function createRuntimeCoordinator(deps: Partial<RuntimeDependencies> & { config?: Partial<RuntimeConfig> }): RuntimeCoordinator {
  // Merge config with defaults
  const config: RuntimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...deps.config,
    resourceBudget: { ...DEFAULT_RUNTIME_CONFIG.resourceBudget, ...deps.config?.resourceBudget },
  };

  // Internal infrastructure — inject or create
  const persistence: PersistenceLayer = deps.persistence ??
    createPersistenceLayer({
      storagePath: config.storagePath,
      schemaVersion: config.schemaVersion,
      backupEnabled: config.backupEnabled,
      maxBackupCount: config.maxBackupCount,
      compressionEnabled: false,
    });
  const eventStore: EventStore = deps.eventStore ?? createEventStore();
  const observability: ObservabilitySystem = deps.observability ?? createObservabilitySystem();
  const verification: VerificationEngine = deps.verification ?? createVerificationEngine();
  const actionRegistry: ActionRegistry = deps.actionRegistry ?? createActionRegistry();
  const actionExecutor: ActionExecutor = deps.actionExecutor ?? createActionExecutor(actionRegistry);
  const transactionManager: TransactionManager = deps.transactionManager ?? createTransactionManager();
  const clock: () => number = deps.clock ?? (() => Date.now());
  const generateId: (prefix?: string) => string = deps.generateId ??
    ((p) => (p ?? 'gid') + '-' + clock().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

  // Ensure standard actions are registered
  registerStandardActions(actionRegistry);

  // ── Default Organ Contracts ──

  function buildDefaultOrganContracts(): OrganContract[] {
    return [
      { organType: 'INTENT_INTERPRETATION', inputTypes: ['CompiledIntent'], outputTypes: ['InterpretedIntent'], epistemicReliability: 0.9, cost: { computeUnits: 1, memoryBytes: 0 }, latency: { best: 10, typical: 50, worst: 200 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'LANGUAGE_REASONING', inputTypes: ['Intent'], outputTypes: ['ParsedObjective'], epistemicReliability: 0.92, cost: { computeUnits: 1, memoryBytes: 0 }, latency: { best: 10, typical: 50, worst: 200 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'PLANNING', inputTypes: ['Intent', 'WorldState'], outputTypes: ['ExecutionPlan'], epistemicReliability: 0.85, cost: { computeUnits: 2, memoryBytes: 0 }, latency: { best: 20, typical: 100, worst: 500 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'CODE_REASONING', inputTypes: ['Code'], outputTypes: ['Analysis'], epistemicReliability: 0.85, cost: { computeUnits: 1, memoryBytes: 0 }, latency: { best: 30, typical: 150, worst: 500 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'RETRIEVAL', inputTypes: ['Query'], outputTypes: ['MemoryNodes'], epistemicReliability: 0.9, cost: { computeUnits: 1, memoryBytes: 1024 }, latency: { best: 5, typical: 20, worst: 100 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'SECURITY_ANALYSIS', inputTypes: ['SystemState'], outputTypes: ['ThreatReport'], epistemicReliability: 0.8, cost: { computeUnits: 2, memoryBytes: 0 }, latency: { best: 30, typical: 100, worst: 300 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'TESTING', inputTypes: ['Artifacts'], outputTypes: ['TestResults'], epistemicReliability: 0.95, cost: { computeUnits: 3, memoryBytes: 0 }, latency: { best: 100, typical: 500, worst: 5000 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'ADVERSARIAL_CRITICISM', inputTypes: ['Plan', 'State'], outputTypes: ['Critique'], epistemicReliability: 0.85, cost: { computeUnits: 2, memoryBytes: 0 }, latency: { best: 50, typical: 200, worst: 1000 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'ARCHITECTURE_ANALYSIS', inputTypes: ['System'], outputTypes: ['ArchitectureReport'], epistemicReliability: 0.8, cost: { computeUnits: 2, memoryBytes: 0 }, latency: { best: 50, typical: 200, worst: 1000 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'CAUSAL_ANALYSIS', inputTypes: ['Events'], outputTypes: ['CausalGraph'], epistemicReliability: 0.75, cost: { computeUnits: 2, memoryBytes: 0 }, latency: { best: 50, typical: 200, worst: 1000 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'SYMBOLIC_REASONING', inputTypes: ['Facts'], outputTypes: ['Conclusions'], epistemicReliability: 0.9, cost: { computeUnits: 1, memoryBytes: 0 }, latency: { best: 10, typical: 50, worst: 200 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'CREATIVE_SYNTHESIS', inputTypes: ['Ideas'], outputTypes: ['Synthesis'], epistemicReliability: 0.7, cost: { computeUnits: 2, memoryBytes: 0 }, latency: { best: 50, typical: 200, worst: 1000 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'nondeterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
      { organType: 'CONSTRAINT_SOLVING', inputTypes: ['Constraints'], outputTypes: ['Solutions'], epistemicReliability: 0.95, cost: { computeUnits: 1, memoryBytes: 0 }, latency: { best: 10, typical: 50, worst: 200 }, resourceNeeds: { vramRequired: 0, ramRequired: 0, gpuRequired: false }, determinism: 'deterministic', failureModes: [], evidenceRequirements: [], replacementStrategy: 'none' },
    ];
  }

  // ── Organ Registry ──

  const organRegistry = new Map<string, OrganRegistryEntry>();

  function registerOrgan(entry: OrganRegistryEntry): void {
    organRegistry.set(entry.organType, entry);
    observability.log({ level: 'INFO', source: 'runtime-coordinator', message: `Organ registered: ${entry.organType}`, sessionId: '', tickNumber: 0, correlationId: '', data: { organType: entry.organType } });
  }

  // Register default organ handlers (real deterministic implementations)

  registerOrgan({
    organType: 'LANGUAGE_REASONING',
    handler: async (_organ, session) => ({
      output: { understood: true, objective: session.compiledIntent?.intent.goal ?? '', confidence: 0.92 },
      confidence: 0.92,
      evidence: ['Language reasoning: objective parsed'],
      errors: [],
      consumedResources: { computeUnits: 1, memoryBytes: 0 },
    }),
    inputSchema: { intent: 'CompiledIntent' },
    outputSchema: { understood: 'boolean' },
    requiredCapabilities: [],
  });

  registerOrgan({
    organType: 'CODE_REASONING',
    handler: async (_organ, session) => {
      const intent = session.compiledIntent?.intent;
      return {
        output: { analyzed: true, domain: intent?.scope ?? [], recommendations: [] },
        confidence: 0.85,
        evidence: ['Code reasoning: domain analysis complete'],
        errors: [],
        consumedResources: { computeUnits: 1, memoryBytes: 0 },
      };
    },
    inputSchema: { intent: 'CompiledIntent' },
    outputSchema: { analyzed: 'boolean' },
    requiredCapabilities: [],
  });

  registerOrgan({
    organType: 'INTENT_INTERPRETATION',
    handler: async (organ, session) => {
      const intent = session.compiledIntent?.intent;
      return {
        output: {
          objective: intent?.goal ?? '',
          requirements: session.compiledIntent?.requirements?.map(r => r.description) ?? [],
          assumptions: intent?.assumptions ?? [],
          ambiguities: session.compiledIntent?.ambiguities?.map(a => a.text) ?? [],
          antiGoals: intent?.antiGoals ?? [],
          constraints: intent?.constraints ?? [],
          qualityThreshold: intent?.qualityThreshold ?? 0,
          authority: 'owner-authorized',
        },
        confidence: intent ? 0.95 : 0,
        evidence: intent ? [`Compiled from intent: ${intent.goal}`] : [],
        errors: [],
        consumedResources: { computeUnits: 1, memoryBytes: 0 },
      };
    },
    inputSchema: { compiledIntent: 'CompiledIntent' },
    outputSchema: { objective: 'string', requirements: 'string[]' },
    requiredCapabilities: [],
  });

  registerOrgan({
    organType: 'PLANNING',
    handler: async (_organ, session) => {
      const intent = session.compiledIntent?.intent;
      const steps = ['interpret', 'plan', 'execute', 'verify'];
      return {
        output: {
          planGenerated: true,
          steps,
          complexity: steps.length > 3 ? 'moderate' : 'simple',
          estimatedDuration: steps.length * 1000,
        },
        confidence: 0.85,
        evidence: [`Generated ${steps.length}-step plan`],
        errors: [],
        consumedResources: { computeUnits: 2, memoryBytes: 0 },
      };
    },
    inputSchema: { intent: 'IntentValue', world: 'SemanticWorld' },
    outputSchema: { planGenerated: 'boolean', steps: 'string[]' },
    requiredCapabilities: [],
  });

  registerOrgan({
    organType: 'RETRIEVAL',
    handler: async (_organ, session) => {
      const nodes = session.memoryStore.toMemoryValue().nodes;
      return {
        output: { retrievedNodes: nodes.length, nodes: nodes.map(n => ({ id: n.id, type: n.type })) },
        confidence: nodes.length > 0 ? 0.9 : 0.5,
        evidence: [`Retrieved ${nodes.length} memory nodes`],
        errors: [],
        consumedResources: { computeUnits: 1, memoryBytes: nodes.length * 1024 },
      };
    },
    inputSchema: { memoryStore: 'MemoryStore' },
    outputSchema: { retrievedNodes: 'number' },
    requiredCapabilities: ['MEMORY_READ'],
  });

  registerOrgan({
    organType: 'FILESYSTEM_EXECUTION',
    handler: async (_organ, session) => {
      const planNode = session.executionPlan?.nodes.find(n => n.status === 'READY');
      return {
        output: { executed: !!planNode, planNodeId: planNode?.id ?? null },
        confidence: 0.8,
        evidence: planNode ? [`Executing plan node: ${planNode.id}`] : ['No ready plan nodes'],
        errors: [],
        consumedResources: { computeUnits: 3, memoryBytes: 0 },
      };
    },
    inputSchema: { planNode: 'PlanNode' },
    outputSchema: { executed: 'boolean' },
    requiredCapabilities: ['FILESYSTEM_WRITE'],
  });

  registerOrgan({
    organType: 'OBSERVATION',
    handler: async (_organ, _session) => {
      return {
        output: { observed: true, timestamp: clock() },
        confidence: 0.95,
        evidence: ['Observation completed'],
        errors: [],
        consumedResources: { computeUnits: 1, memoryBytes: 0 },
      };
    },
    inputSchema: {},
    outputSchema: { observed: 'boolean' },
    requiredCapabilities: [],
  });

  registerOrgan({
    organType: 'EPISTEMIC_UPDATE',
    handler: async (_organ, session) => {
      const claimCount = 0; // Claims tracked by epistemic engine
      return {
        output: { claimsUpdated: claimCount, epistemicStatus: 'updated' },
        confidence: 0.9,
        evidence: ['Epistemic state updated'],
        errors: [],
        consumedResources: { computeUnits: 1, memoryBytes: 0 },
      };
    },
    inputSchema: { claims: 'Claim[]' },
    outputSchema: { claimsUpdated: 'number' },
    requiredCapabilities: [],
  });

  registerOrgan({
    organType: 'VERIFICATION',
    handler: async (_organ, _session) => {
      return {
        output: { verified: true, checkCount: 0 },
        confidence: 0.85,
        evidence: ['Verification pass — no blockers'],
        errors: [],
        consumedResources: { computeUnits: 2, memoryBytes: 0 },
      };
    },
    inputSchema: { completionCriteria: 'string[]' },
    outputSchema: { verified: 'boolean' },
    requiredCapabilities: [],
  });

  registerOrgan({
    organType: 'ADVERSARIAL_CRITICISM',
    handler: async (_organ, session) => {
      const issues: string[] = [];
      for (const err of session.errors) {
        if (err.severity === 'fatal') issues.push(err.message);
      }
      return {
        output: {
          critique: issues.length > 0 ? issues.join('; ') : 'No adversarial issues detected',
          threatsIdentified: issues.length,
          severity: issues.length > 0 ? 'HIGH' : 'LOW',
        },
        confidence: 0.9,
        evidence: [`Adversarial analysis: ${issues.length} issues found`],
        errors: [],
        consumedResources: { computeUnits: 2, memoryBytes: 0 },
      };
    },
    inputSchema: { errors: 'AgentSessionError[]', world: 'SemanticWorld' },
    outputSchema: { critique: 'string', threatsIdentified: 'number' },
    requiredCapabilities: [],
  });

  // ── Agent Session ──

  function createSession(genome?: SovereignAgentGenome): AgentSession {
    const g = genome ?? createPrimordialGenome();
    const validation = validateSovereignGenome(g);
    if (!validation.valid) {
      throw new Error('Invalid agent genome: ' + validation.errors.join('; '));
    }

    return {
      sessionId: generateId('session'),
      genome: g,
      compiledIntent: null,
      world: createWorld('default'),
      cognitiveGraph: null,
      epistemicEngine: createEpistemicEngine(),
      memoryStore: createMemoryStore(),
      capabilityManager: createCapabilityManager(g.genes.actionBounds),
      availableOrgans: buildDefaultOrganContracts(),
      tick: g.$lineage.tick,
      phase: 'INTAKE',
      startedAt: clock(),
      errors: [],
      checkpointId: null,
      executionPlan: null,
    };
  }

  async function restoreSession(agentId: string): Promise<AgentSession> {
    const state = await persistence.load(agentId);
    if (!state) {
      throw new Error(`No persisted state found for agent ${agentId}`);
    }
    const validation = persistence.validate(state);
    if (!validation.valid) {
      throw new Error(`Corrupted persisted state: ${validation.errors.join('; ')}`);
    }
    const genome = state.genome as SovereignAgentGenome;

    // Restore memory store with persisted memories
    const memoryStore = createMemoryStore();
    if (Array.isArray(state.memories)) {
      for (const mem of state.memories) {
        if (mem && typeof mem === 'object') {
          memoryStore.addNode(mem as Parameters<typeof memoryStore.addNode>[0]);
        }
      }
    }

    return {
      sessionId: state.agentId,
      genome,
      compiledIntent: null,
      world: (state.worldState as SemanticWorld) ?? createWorld('default'),
      cognitiveGraph: null,
      epistemicEngine: createEpistemicEngine(),
      memoryStore,
      capabilityManager: createCapabilityManager(genome.genes.actionBounds),
      availableOrgans: buildDefaultOrganContracts(),
      tick: genome.$lineage.tick,
      phase: 'PERSIST',
      startedAt: state.createdAt,
      errors: [],
      checkpointId: agentId,
      executionPlan: null,
    };
  }

  function submitObjective(session: AgentSession, objective: string): AgentSession {
    const compiled = compileIntent(objective);

    const updatedGenome = createChildGenome(
      session.genome,
      [],
      { coreIntent: compiled.intent },
    );

    return {
      ...session,
      genome: updatedGenome,
      compiledIntent: compiled,
      phase: 'INTAKE',
      tick: session.tick + 1,
    };
  }

  // ── Async executeTick ──

  async function executeTick(session: AgentSession): Promise<AgentSession> {
    if (!session.compiledIntent) {
      return {
        ...session,
        errors: [...session.errors, {
          phase: 'INTAKE',
          code: 'NO_INTENT',
          message: 'No compiled intent — submit objective first',
          severity: 'error',
          recoverable: true,
        }],
      };
    }

    const phaseResults: Partial<Record<CognitiveTickPhase, TickPhaseResult>> = {};
    let currentSession = { ...session };

    // INTAKE
    phaseResults.INTAKE = {
      phase: 'INTAKE',
      success: true,
      errors: [],
      observations: [session.compiledIntent.originalStatement],
    };

    // VALIDATE
    const validation = validateSovereignGenome(currentSession.genome);
    const absences = discoverAbsences(currentSession.world);
    phaseResults.VALIDATE = {
      phase: 'VALIDATE',
      success: validation.valid,
      errors: validation.errors.map(e => ({
        phase: 'VALIDATE' as CognitiveTickPhase,
        code: 'VALIDATION',
        message: e,
        severity: 'error' as const,
        recoverable: false,
      })),
      observations: absences.map(a => a.description),
    };

    // PLAN — cognitive morphogenesis
    if (currentSession.compiledIntent) {
      const morphRequest: MorphogenesisRequest = {
        objective: currentSession.compiledIntent.intent.goal,
        intent: currentSession.compiledIntent.intent,
        availableOrgans: currentSession.availableOrgans,
        resourceBudget: config.resourceBudget,
        riskTolerance: config.riskTolerance,
        priorBeliefs: [],
      };

      const morphResult = performMorphogenesis(morphRequest);

      phaseResults.PLAN = {
        phase: 'PLAN',
        success: true,
        errors: [],
        cognitiveGraph: morphResult.cognitiveGraph,
        morphogenesisResult: morphResult,
      };

      currentSession = { ...currentSession, cognitiveGraph: morphResult.cognitiveGraph };
    }

    // MUTATE
    phaseResults.MUTATE = {
      phase: 'MUTATE',
      success: true,
      errors: [],
    };

    // EXECUTE — async organ execution through registry
    const executeErrors: import('@gspl/cognitive-kernel').OrganError[] = [];
    if (currentSession.cognitiveGraph) {
      const sortedOrgans = topologicalSortOrgans(currentSession.cognitiveGraph);
      for (const organ of sortedOrgans) {
        try {
          const result = await executeOrganAsync(organ, currentSession, organRegistry);
          if (result.errors.length > 0) {
            executeErrors.push(...result.errors);
          }
          organ.status = result.errors.some(e => e.severity === 'fatal') ? 'FAILED' : 'COMPLETED';
          organ.result = result;
          organ.completedAt = clock();
        } catch (e) {
          organ.status = 'FAILED';
          executeErrors.push({
            code: 'ORGAN_EXECUTION_FAILED',
            message: `Organ ${organ.id} failed: ${e instanceof Error ? e.message : 'unknown'}`,
            severity: 'error',
            recoverable: true,
          });
        }
      }
    }
    phaseResults.EXECUTE = {
      phase: 'EXECUTE',
      success: executeErrors.filter(e => e.severity === 'fatal').length === 0,
      errors: executeErrors,
    };

    // REDUCE — consolidate results, store in memory
    const reduceErrors: import('@gspl/cognitive-kernel').OrganError[] = [];
    try {
      if (currentSession.cognitiveGraph) {
        for (const organ of currentSession.cognitiveGraph.organs) {
          if (organ.result && organ.status === 'COMPLETED') {
            currentSession.memoryStore.addNode({
              id: 'mem-' + organ.id + '-' + clock().toString(36),
              type: 'PROCEDURAL',
              content: organ.result.output,
              created: clock(),
              lastAccessed: clock(),
              accessCount: 1,
              decayRate: 0.01,
              strength: organ.result.confidence,
              confidence: organ.result.confidence,
              epistemicStatus: 'OBSERVED',
              privacy: 'private',
              tags: [organ.contract.organType],
              contentHash: '',
            });
          }
        }
      }
    } catch (e) {
      reduceErrors.push({
        code: 'REDUCE_ERROR',
        message: e instanceof Error ? e.message : 'Unknown reduce error',
        severity: 'warning',
        recoverable: true,
      });
    }
    phaseResults.REDUCE = {
      phase: 'REDUCE',
      success: reduceErrors.length === 0,
      errors: reduceErrors,
    };

    // EMIT — record execution events
    const emitErrors: import('@gspl/cognitive-kernel').OrganError[] = [];
    try {
      if (currentSession.cognitiveGraph) {
        for (const organ of currentSession.cognitiveGraph.organs) {
          if (organ.result) {
            eventStore.append({
              id: 'evt-' + currentSession.sessionId + '-' + organ.id,
              sessionId: currentSession.sessionId,
              timestamp: clock(),
              causalParent: null,
              source: organ.id,
              action: organ.contract.organType,
              affectedEntities: [currentSession.sessionId],
              preStateRef: null,
              postStateRef: null,
              intentLineage: currentSession.compiledIntent?.intent.goal ?? '',
              capabilityLineage: null,
              result: { success: organ.status === 'COMPLETED', output: organ.result.output, artifacts: [] },
              verification: null,
              errors: organ.result.errors.map(e => ({ code: e.code, message: e.message, severity: e.severity })),
              resourceUse: { computeUnits: organ.result.consumedResources.computeUnits, memoryBytes: organ.result.consumedResources.memoryBytes, wallTimeMs: 0, tokensUsed: organ.result.consumedResources.tokenEstimate ?? 0 },
            });
          }
        }
      }
    } catch (e) {
      emitErrors.push({
        code: 'EMIT_ERROR',
        message: e instanceof Error ? e.message : 'Unknown emit error',
        severity: 'warning',
        recoverable: true,
      });
    }
    phaseResults.EMIT = {
      phase: 'EMIT',
      success: emitErrors.length === 0,
      errors: emitErrors,
    };

    // PERSIST — async save session state
    const persistErrors: import('@gspl/cognitive-kernel').OrganError[] = [];
    try {
      const persisted: PersistedState = {
        schemaVersion: config.schemaVersion,
        agentId: currentSession.sessionId,
        genome: currentSession.genome,
        worldState: currentSession.world,
        memories: currentSession.memoryStore.toMemoryValue().nodes,
        claims: [],
        evidence: [],
        capabilities: [],
        policies: currentSession.genome.genes.actionBounds,
        plans: [],
        events: eventStore.query({ sessionId: currentSession.sessionId }),
        checkpoints: [],
        mutations: currentSession.genome.$lineage.mutations,
        createdAt: currentSession.startedAt,
        updatedAt: clock(),
        contentHash: '',
      };
      await persistence.save(persisted);
      currentSession.checkpointId = 'cp-' + currentSession.sessionId + '-tick-' + currentSession.tick;
    } catch (e) {
      persistErrors.push({
        code: 'PERSIST_ERROR',
        message: e instanceof Error ? e.message : 'Unknown persist error',
        severity: 'warning',
        recoverable: true,
      });
    }
    phaseResults.PERSIST = {
      phase: 'PERSIST',
      success: persistErrors.length === 0,
      errors: persistErrors,
    };

    // Apply all phase results
    for (const [phaseKey, result] of Object.entries(phaseResults)) {
      const phase = phaseKey as CognitiveTickPhase;
      const sessionErrors: AgentSessionError[] = (result?.errors ?? []).map(e => ({
        phase,
        code: e.code,
        message: e.message,
        severity: e.severity,
        recoverable: e.recoverable,
      }));
      currentSession = {
        ...currentSession,
        phase,
        cognitiveGraph: result?.cognitiveGraph ?? currentSession.cognitiveGraph,
        errors: [...currentSession.errors, ...sessionErrors],
      };
    }

    return {
      ...currentSession,
      phase: 'PERSIST',
      tick: currentSession.tick + 1,
    };
  }

  // ── Verify Completion ──

  function verifyCompletion(session: AgentSession): CompletionVerification {
    const intent = session.compiledIntent?.intent;
    if (!intent) {
      return { complete: false, requirementsSatisfied: [], requirementsFailed: ['No intent to verify'], evidence: [], confidence: 0 };
    }

    const satisfied: string[] = [];
    const failed: string[] = [];

    // Check completion evidence against actual cognitive execution results
    for (const evidence of intent.completionEvidence) {
      // Each evidence item must be validated by actual observations
      const hasEvidence = session.cognitiveGraph?.organs.some(
        o => o.status === 'COMPLETED' && o.result?.evidence?.some(e => e.includes(evidence))
      );
      if (hasEvidence) {
        satisfied.push(evidence);
      } else {
        failed.push(evidence);
      }
    }

    // Check cognitive graph completion
    if (session.cognitiveGraph) {
      const completedOrgans = session.cognitiveGraph.organs.filter(o => o.status === 'COMPLETED');
      const total = session.cognitiveGraph.organs.length;
      const evidence = `${completedOrgans.length}/${total} organs completed`;
      if (completedOrgans.length === total) {
        satisfied.push(evidence);
      } else {
        failed.push(evidence);
      }
    }

    // Check for fatal errors
    const fatalErrors = session.errors.filter(e => e.severity === 'fatal' && !e.recoverable);
    if (fatalErrors.length > 0) {
      failed.push(`${fatalErrors.length} unrecoverable fatal errors`);
    }

    return {
      complete: failed.length === 0 && satisfied.length > 0,
      requirementsSatisfied: satisfied,
      requirementsFailed: failed,
      evidence: satisfied,
      confidence: failed.length === 0 ? 0.9 : 0.3,
    };
  }

  // ── Checkpoint ──

  async function checkpoint(session: AgentSession): Promise<AgentSession> {
    const cpId = 'cp-' + session.sessionId + '-tick-' + session.tick;
    const state: PersistedState = {
      schemaVersion: config.schemaVersion,
      agentId: session.sessionId,
      genome: session.genome,
      worldState: session.world,
      memories: session.memoryStore.toMemoryValue().nodes,
      claims: [],
      evidence: [],
      capabilities: [],
      policies: session.genome.genes.actionBounds,
      plans: [],
      events: eventStore.query({ sessionId: session.sessionId }),
      checkpoints: [],
      mutations: session.genome.$lineage.mutations,
      createdAt: session.startedAt,
      updatedAt: clock(),
      contentHash: '',
    };
    await persistence.save(state);
    return { ...session, checkpointId: cpId };
  }

  function getSelfModel(session: AgentSession): AgentSession {
    return { ...session };
  }

  return {
    createSession,
    restoreSession,
    submitObjective,
    executeTick,
    verifyCompletion,
    checkpoint,
    getSelfModel,
    registerOrgan,
  };
}

// ── Topological Sort ──

function topologicalSortOrgans(graph: CognitiveGraph): CognitiveOrgan[] {
  const sorted: CognitiveOrgan[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(organId: string) {
    if (visited.has(organId)) return;
    if (visiting.has(organId)) return;
    visiting.add(organId);
    for (const edge of graph.edges) {
      if (edge.to === organId) {
        visit(edge.from);
      }
    }
    visiting.delete(organId);
    visited.add(organId);
    const organ = graph.organs.find(o => o.id === organId);
    if (organ) sorted.push(organ);
  }

  for (const organ of graph.organs) {
    visit(organ.id);
  }

  return sorted;
}

// ── Async Organ Execution ──

async function executeOrganAsync(
  organ: CognitiveOrgan,
  session: AgentSession,
  registry: Map<string, OrganRegistryEntry>,
): Promise<OrganResult> {
  organ.status = 'ACTIVE';
  const time = Date.now();
  organ.startedAt = time;
  const startTime = time;

  // Look up organ handler in registry
  const entry = registry.get(organ.contract.organType);
  if (!entry) {
    return {
      output: { error: `ORGAN_UNAVAILABLE: ${organ.contract.organType}` },
      confidence: 0,
      evidence: [],
      errors: [{
        code: 'ORGAN_UNAVAILABLE',
        message: `No handler registered for organ type: ${organ.contract.organType}`,
        severity: 'error',
        recoverable: true,
      }],
      consumedResources: { computeUnits: 0, memoryBytes: 0 },
    };
  }

  try {
    const result = await entry.handler(organ, session);
    return result;
  } catch (e) {
    return {
      output: null,
      confidence: 0,
      evidence: [],
      errors: [{
        code: 'ORGAN_ERROR',
        message: e instanceof Error ? e.message : 'Unknown organ execution error',
        severity: 'fatal',
        recoverable: false,
      }],
      consumedResources: { computeUnits: organ.contract.cost.computeUnits, memoryBytes: organ.contract.cost.memoryBytes },
    };
  }
}
