/**
 * GSPL Semantic World Model & Reality Compiler
 *
 * A persistent semantic world model for:
 *   - The owner's environment
 *   - The GSPL platform
 *   - Each project
 *   - Each repository
 *   - Each runtime environment
 *   - Each active task
 *   - Counterfactual branches
 *
 * The Reality Compiler transforms:
 *   observed world + desired world → semantic difference → transformation paths → execution graph
 */

// ── World Entity ──

export interface WorldEntity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown>;
  relationships: EntityRelationship[];
  state: EntityState;
  createdAt: number;
  updatedAt: number;
  observedAt: number;
  confidence: number;
}

export type EntityType =
  | 'OWNER'
  | 'PLATFORM'
  | 'PROJECT'
  | 'REPOSITORY'
  | 'FILE'
  | 'DIRECTORY'
  | 'MODULE'
  | 'DEPENDENCY'
  | 'MODEL'
  | 'TOOL'
  | 'AGENT'
  | 'TASK'
  | 'INTENT'
  | 'POLICY'
  | 'MEMORY'
  | 'CAPABILITY';

export interface EntityRelationship {
  targetId: string;
  relation: string;
  strength: number;
  directed: boolean;
  metadata: Record<string, unknown>;
}

export interface EntityState {
  status: 'ACTIVE' | 'INACTIVE' | 'DEGRADED' | 'ERROR' | 'UNKNOWN';
  health: number; // 0-1
  lastCheckpoint: number | null;
  version: number;
}

// ── Semantic World ──

export interface SemanticWorld {
  id: string;
  name: string;
  entities: Map<string, WorldEntity>;
  laws: WorldLaw[];
  events: WorldEvent[];
  branches: CounterfactualBranch[];
  currentBranchId: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorldLaw {
  id: string;
  description: string;
  predicate: string;
  scope: string[];
  enforcement: 'STATIC' | 'RUNTIME' | 'AUDIT';
  violations: LawViolation[];
}

export interface LawViolation {
  lawId: string;
  timestamp: number;
  description: string;
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  resolved: boolean;
}

export interface WorldEvent {
  id: string;
  type: string;
  timestamp: number;
  source: string;
  target: string;
  data: unknown;
  effects: WorldEffect[];
}

export interface WorldEffect {
  type: 'ENTITY_CREATED' | 'ENTITY_UPDATED' | 'ENTITY_DELETED' | 'RELATIONSHIP_CHANGED' | 'STATE_TRANSITION' | 'LAW_VIOLATED' | 'BRANCH_CREATED' | 'BRANCH_MERGED';
  entityId?: string;
  details: string;
}

// ── Counterfactual Branch ──

export interface CounterfactualBranch {
  id: string;
  name: string;
  parentBranchId: string | null;
  assumptions: string[];
  expectedConsequences: string[];
  resourceCost: number;
  architecturalImpact: string;
  securityImpact: string;
  uncertainty: number; // 0-1
  reversibility: 'FULLY' | 'PARTIALLY' | 'IRREVERSIBLE';
  compatibility: 'FULL' | 'PARTIAL' | 'INCOMPATIBLE';
  predictedEvidence: string[];
  invalidationConditions: string[];
  status: 'PROPOSED' | 'SIMULATING' | 'ACTIVE' | 'MERGED' | 'PRUNED' | 'REJECTED';
  createdAt: number;
  closedAt: number | null;
}

// ── Reality Compiler ──

export interface RealityCompilerInput {
  observedWorld: SemanticWorld;
  desiredWorld: SemanticWorld;
  constraints: string[];
  capabilities: string[];
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RealityCompilerOutput {
  semanticDiff: SemanticDiff;
  missingRequirements: string[];
  missingCapabilities: string[];
  candidatePaths: TransformationPath[];
  simulatedOutcomes: SimulatedOutcome[];
  selectedExecutionGraph: ExecutionGraph | null;
  verificationObligations: string[];
  recoveryPlan: string[];
}

export interface SemanticDiff {
  addedEntities: string[];
  removedEntities: string[];
  modifiedEntities: string[];
  stateTransitions: { entityId: string; from: string; to: string }[];
}

export interface TransformationPath {
  id: string;
  steps: TransformationStep[];
  totalCost: number;
  risk: number;
  reversibility: number; // 0-1
  estimatedDuration: number;
}

export interface TransformationStep {
  action: string;
  target: string;
  effect: string;
  preconditions: string[];
  postconditions: string[];
  rollbackAction: string | null;
}

export interface SimulatedOutcome {
  pathId: string;
  finalState: SemanticWorld;
  risks: string[];
  confidence: number;
}

export interface ExecutionGraph {
  nodes: ExecutionNode[];
  edges: { from: string; to: string; condition?: string }[];
}

export interface ExecutionNode {
  id: string;
  action: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  result?: unknown;
}

// ── Unknown-Unknown Discovery ──

export interface SemanticAbsence {
  id: string;
  description: string;
  category: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  probability: number;
  irreversibility: 'reversible' | 'hard-to-reverse' | 'irreversible';
  architecturalCentrality: 'peripheral' | 'core' | 'load-bearing';
  costOfInvestigation: 'low' | 'medium' | 'high';
  detectedAt: number;
}

export function discoverAbsences(world: SemanticWorld): SemanticAbsence[] {
  const absences: SemanticAbsence[] = [];

  // Check for entities without lifecycle definitions
  for (const [id, entity] of world.entities) {
    if (entity.state.lastCheckpoint === null && entity.type !== 'OWNER') {
      absences.push({
        id: 'abs-' + id,
        description: `Entity "${entity.name}" (${id}) lacks lifecycle checkpoint`,
        category: 'LIFECYCLE',
        impact: 'MEDIUM',
        probability: 0.5,
        irreversibility: 'reversible',
        architecturalCentrality: 'peripheral',
        costOfInvestigation: 'low',
        detectedAt: Date.now(),
      });
    }
  }

  // Check for actions without rollback
  if (!world.laws.some(l => l.description.toLowerCase().includes('rollback'))) {
    absences.push({
      id: 'abs-rollback',
      description: 'No rollback law defined — actions may lack recovery paths',
      category: 'RECOVERY',
      impact: 'HIGH',
      probability: 0.7,
      irreversibility: 'hard-to-reverse',
      architecturalCentrality: 'core',
      costOfInvestigation: 'medium',
      detectedAt: Date.now(),
    });
  }

  // Check for decisions without alternatives
  if (world.branches.length === 0) {
    absences.push({
      id: 'abs-alternatives',
      description: 'No counterfactual branches — decisions lack documented alternatives',
      category: 'DECISION_QUALITY',
      impact: 'MEDIUM',
      probability: 0.5,
      irreversibility: 'reversible',
      architecturalCentrality: 'load-bearing',
      costOfInvestigation: 'low',
      detectedAt: Date.now(),
    });
  }

  return absences;
}

// ── World Model Factory ──

export function createWorld(name: string): SemanticWorld {
  return {
    id: 'world-' + Date.now().toString(36),
    name,
    entities: new Map<string, WorldEntity>(),
    laws: [],
    events: [],
    branches: [],
    currentBranchId: 'main',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addEntity(world: SemanticWorld, entity: WorldEntity): SemanticWorld {
  world.entities.set(entity.id, entity);
  world.updatedAt = Date.now();
  world.events.push({
    id: 'evt-' + Date.now().toString(36),
    type: 'ENTITY_ADDED',
    timestamp: Date.now(),
    source: 'world-model',
    target: entity.id,
    data: entity,
    effects: [{ type: 'ENTITY_CREATED', entityId: entity.id, details: `Entity ${entity.name} added to world ${world.name}` }],
  });
  return world;
}

export function createBranch(
  world: SemanticWorld,
  name: string,
  assumptions: string[],
): CounterfactualBranch {
  const branch: CounterfactualBranch = {
    id: 'branch-' + Date.now().toString(36),
    name,
    parentBranchId: world.currentBranchId,
    assumptions,
    expectedConsequences: [],
    resourceCost: 0,
    architecturalImpact: '',
    securityImpact: '',
    uncertainty: 0.5,
    reversibility: 'FULLY',
    compatibility: 'FULL',
    predictedEvidence: [],
    invalidationConditions: [],
    status: 'PROPOSED',
    createdAt: Date.now(),
    closedAt: null,
  };
  world.branches.push(branch);
  return branch;
}
