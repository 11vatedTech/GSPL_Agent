/**
 * GSPL Cognitive Kernel Types
 *
 * The cognitive kernel is the execution substrate for the GSPL agent.
 * It maps the 8-phase tick cycle to cognitive operations and manages
 * the Sovereign Agent Genome — the agent's identity as a versioned seed.
 */

import type { IntentValue, BeliefValue, MemoryValue, PolicyValue, HypothesisValue } from '@gspl/agent-genes';

// ── Sovereign Agent Genome ──
// The agent's identity is a versioned seed with cognitive genes.

export interface SovereignAgentGenome {
  /** GSPL type tag */
  $gst: 'gspl:agent:v1';
  /** Cryptographic identity block */
  $sovereignty: AgentSovereignty;
  /** Versioned lineage */
  $lineage: AgentLineage;
  /** Cognitive genes — the agent's phenotype */
  genes: AgentGenes;
}

export interface AgentSovereignty {
  pubkey: string;
  signature: string;
  identityHash: string;
  createdAt: number;
  version: number;
}

export interface AgentLineage {
  parent: string | null; // hash of parent agent seed
  tick: number; // monotonic tick counter
  branchId: string;
  mutations: AgentMutation[];
  createdAt: number;
}

export interface AgentMutation {
  tick: number;
  affectedGenes: string[];
  description: string;
  hash: string;
  reversible: boolean;
}

// ── Agent Genes ──
// The 5 cognitive gene types compose the agent's runtime phenotype.

export interface AgentGenes {
  coreIntent: IntentValue;
  worldModel: BeliefValue;
  episodicStore: MemoryValue;
  actionBounds: PolicyValue;
  activeHypotheses: HypothesisValue[];
}

// ── Cognitive Organ Model ──
// An organ is a cognitive capability with a typed contract.

export type OrganType =
  | 'LANGUAGE_REASONING'
  | 'CODE_REASONING'
  | 'SYMBOLIC_REASONING'
  | 'THEOREM_PROVING'
  | 'CONSTRAINT_SOLVING'
  | 'NUMERICAL_SIMULATION'
  | 'CAUSAL_ANALYSIS'
  | 'RETRIEVAL'
  | 'WEB_RESEARCH'
  | 'VISUAL_PERCEPTION'
  | 'GUI_GROUNDING'
  | 'PLANNING'
  | 'ADVERSARIAL_CRITICISM'
  | 'SECURITY_ANALYSIS'
  | 'TESTING'
  | 'ARCHITECTURE_ANALYSIS'
  | 'CREATIVE_SYNTHESIS'
  | 'INTENT_INTERPRETATION'
  | 'OBSERVATION'
  | 'EPISTEMIC_UPDATE'
  | 'FILESYSTEM_EXECUTION'
  | 'VERIFICATION';

export interface OrganContract {
  organType: OrganType;
  inputTypes: string[];
  outputTypes: string[];
  epistemicReliability: number; // 0-1
  cost: OrganCost;
  latency: OrganLatency;
  resourceNeeds: OrganResources;
  determinism: 'deterministic' | 'quasi-deterministic' | 'nondeterministic';
  failureModes: OrganFailureMode[];
  evidenceRequirements: string[];
  replacementStrategy: string;
}

export interface OrganCost {
  computeUnits: number;
  memoryBytes: number;
  tokenEstimate?: number;
}

export interface OrganLatency {
  best: number;
  typical: number;
  worst: number;
}

export interface OrganResources {
  vramRequired: number;
  ramRequired: number;
  gpuRequired: boolean;
  modelRequired?: string;
}

export interface OrganFailureMode {
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectionMethod: string;
  recoveryAction: string;
}

// ── Cognitive Graph (Phenotype) ──
// The generated cognitive architecture for a specific objective.

export interface CognitiveGraph {
  id: string;
  objective: string;
  generatedAt: number;
  organs: CognitiveOrgan[];
  edges: CognitiveEdge[];
  rootOrganId: string;
  verificationOrganId: string | null;
  resourceBudget: ResourceBudget;
  riskClassification: RiskLevel;
  uncertaintyClassification: UncertaintyLevel;
}

export interface CognitiveOrgan {
  id: string;
  contract: OrganContract;
  status: 'IDLE' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'DEGRADED';
  assignedModelId?: string;
  allocatedResources: OrganResources;
  startedAt?: number;
  completedAt?: number;
  result?: OrganResult;
}

export interface OrganResult {
  output: unknown;
  confidence: number;
  evidence: string[];
  errors: OrganError[];
  consumedResources: OrganCost;
}

export interface OrganError {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'fatal';
  recoverable: boolean;
}

export interface CognitiveEdge {
  from: string;
  to: string;
  dataType: string;
  confidence: number;
  bidirectional: boolean;
}

export interface ResourceBudget {
  maxComputeUnits: number;
  maxMemoryBytes: number;
  maxWallTimeMs: number;
  maxTokens: number;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type UncertaintyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

// ── Cognitive Tick Cycle ──
// Maps the 8-phase kernel tick cycle to cognitive operations.

export type CognitiveTickPhase =
  | 'INTAKE'    // Perceive — bind sensory inputs to seed context
  | 'VALIDATE'  // Verify — check sovereignty, invariants, policy compliance
  | 'PLAN'      // Reason — compute Fisher gradient, select cognitive organs
  | 'MUTATE'    // Adapt — mutate beliefs, hypotheses based on new evidence
  | 'EXECUTE'   // Act — invoke model fabric, execute tools
  | 'REDUCE'    // Consolidate — collapse branches, consolidate results
  | 'EMIT'      // Respond — dispatch effects, spawn sub-agents
  | 'PERSIST';  // Remember — append to lineage, hash and sign

export interface CognitiveTickState {
  phase: CognitiveTickPhase;
  tickNumber: number;
  genome: SovereignAgentGenome;
  cognitiveGraph: CognitiveGraph | null;
  activeOrgans: CognitiveOrgan[];
  pendingEffects: CognitiveEffect[];
  errors: OrganError[];
  startedAt: number;
  phaseStartedAt: number;
  completed: boolean;
}

export interface CognitiveEffect {
  type: string;
  params: unknown;
  authority: string;
  reversibility: 'reversible' | 'compensatable' | 'irreversible';
  requiresApproval: boolean;
  approved: boolean;
}

// ── Morphogenesis Request/Result ──

export interface MorphogenesisRequest {
  objective: string;
  intent: IntentValue;
  availableOrgans: OrganContract[];
  resourceBudget: ResourceBudget;
  riskTolerance: RiskLevel;
  priorBeliefs: BeliefValue[];
}

export interface MorphogenesisResult {
  cognitiveGraph: CognitiveGraph;
  reasoning: string;
  rejectedAlternatives: string[];
  assumptions: string[];
  unresolved: string[];
}

// ── Self-Model ──

export interface AgentSelfModel {
  identity: {
    agentId: string;
    version: string;
    tick: number;
  };
  constitutionalLaws: string[];
  availableModels: string[];
  capabilities: OrganContract[];
  permissions: PolicyValue;
  memorySystems: string[];
  activePhenotype: CognitiveGraph | null;
  knownLimitations: string[];
  benchmarkHistory: BenchmarkRecord[];
  knownFailurePatterns: FailurePattern[];
  currentHealth: HealthStatus;
  degradedComponents: string[];
  pendingMutations: AgentMutation[];
  unresolvedObligations: string[];
}

export interface BenchmarkRecord {
  id: string;
  score: number;
  timestamp: number;
  confidence: number;
}

export interface FailurePattern {
  id: string;
  description: string;
  frequency: number;
  rootCause: string;
  mitigation: string;
}

export interface HealthStatus {
  overall: 'HEALTHY' | 'DEGRADED' | 'IMPAIRED' | 'CRITICAL';
  memoryPressure: number; // 0-1
  vramPressure: number; // 0-1
  activeTaskCount: number;
  errorRate: number;
  avgLatencyMs: number;
}
