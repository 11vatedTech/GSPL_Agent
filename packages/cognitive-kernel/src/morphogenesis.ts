/**
 * Cognitive Morphogenesis Engine
 *
 * THE CORE INVENTION: The GSPL agent does not have one fixed reasoning loop.
 * It generates the form of cognition required by the current objective.
 *
 * Given an intent (objective), available organs (cognitive capabilities),
 * resource budget, and risk tolerance, the morphogenesis engine:
 *
 *   1. Analyzes the problem structure
 *   2. Classifies risk and uncertainty
 *   3. Selects appropriate cognitive organs
 *   4. Generates a cognitive graph (phenotype)
 *   5. Allocates resources
 *   6. Establishes verification organs
 *   7. Prepares adaptation rules
 *
 * This is NOT role prompting. This is NOT an agent framework.
 * This is the GSPL principle applied to cognition: the seed (intent + genome)
 * generates the form (cognitive graph) required by the objective.
 */

import type {
  CognitiveGraph,
  CognitiveOrgan,
  CognitiveEdge,
  MorphogenesisRequest,
  MorphogenesisResult,
  OrganContract,
  ResourceBudget,
  RiskLevel,
  UncertaintyLevel,
} from './types.js';

// ── Problem Structure Analysis ──

export interface ProblemStructure {
  domain: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'unknown';
  decomposability: 'atomic' | 'decomposable' | 'hierarchical' | 'emergent';
  reversibility: 'fully-reversible' | 'mostly-reversible' | 'partially-reversible' | 'irreversible';
  timeSensitivity: 'immediate' | 'soon' | 'whenever';
  dataSensitivity: 'public' | 'internal' | 'sensitive' | 'secret';
  requiresCreativity: boolean;
  requiresPrecision: boolean;
  requiresResearch: boolean;
  requiresCode: boolean;
  requiresMultimodal: boolean;
}

/**
 * Analyze the problem structure from the intent and objective.
 * This uses heuristics that can later be replaced by model inference.
 */
export function analyzeProblemStructure(
  objective: string,
  intent: MorphogenesisRequest['intent'],
): ProblemStructure {
  const lower = objective.toLowerCase();

  // Detect domains from intent scope and objective keywords
  const domains: string[] = [...intent.scope];
  if (lower.includes('code') || lower.includes('implement') || lower.includes('program') || lower.includes('refactor')) {
    if (!domains.includes('code')) domains.push('code');
  }
  if (lower.includes('research') || lower.includes('investigate') || lower.includes('analyze')) {
    if (!domains.includes('research')) domains.push('research');
  }
  if (lower.includes('test') || lower.includes('verify') || lower.includes('validate')) {
    if (!domains.includes('verification')) domains.push('verification');
  }
  if (lower.includes('architecture') || lower.includes('design') || lower.includes('system')) {
    if (!domains.includes('architecture')) domains.push('architecture');
  }
  if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('threat')) {
    if (!domains.includes('security')) domains.push('security');
  }

  // Complexity classification
  let complexity: ProblemStructure['complexity'] = 'moderate';
  const complexityIndicators = lower.split(' ').length;
  if (complexityIndicators < 5) complexity = 'simple';
  else if (complexityIndicators > 50) complexity = 'complex';
  if (intent.constraints.length > 5) complexity = 'complex';
  if (intent.assumptions.length > 10) complexity = 'complex';

  // Decomposability
  let decomposability: ProblemStructure['decomposability'] = 'decomposable';
  if (intent.scope.length === 1 && complexity === 'simple') decomposability = 'atomic';
  if (intent.constraints.some(c => c.severity === 'hard')) decomposability = 'hierarchical';

  // Reversibility
  let reversibility: ProblemStructure['reversibility'] = 'mostly-reversible';
  if (lower.includes('delete') || lower.includes('destroy') || lower.includes('irreversible')) {
    reversibility = 'irreversible';
  }

  return {
    domain: domains,
    complexity,
    decomposability,
    reversibility,
    timeSensitivity: intent.priority > 0.8 ? 'immediate' : 'soon',
    dataSensitivity: 'internal',
    requiresCreativity: lower.includes('create') || lower.includes('design') || lower.includes('novel'),
    requiresPrecision: lower.includes('exact') || lower.includes('precise') || intent.qualityThreshold > 0.9,
    requiresResearch: lower.includes('research') || lower.includes('find') || lower.includes('discover'),
    requiresCode: domains.includes('code'),
    requiresMultimodal: lower.includes('image') || lower.includes('video') || lower.includes('visual'),
  };
}

// ── Organ Selection ──

export interface OrganSelection {
  selected: OrganContract[];
  rejected: { organ: OrganContract; reason: string }[];
  verificationOrgans: OrganContract[];
}

/**
 * Select cognitive organs based on problem structure, available organs,
 * resource budget, and risk tolerance.
 */
export function selectCognitiveOrgans(
  problem: ProblemStructure,
  availableOrgans: OrganContract[],
  budget: ResourceBudget,
  riskTolerance: RiskLevel,
): OrganSelection {
  const selected: OrganContract[] = [];
  const rejected: { organ: OrganContract; reason: string }[] = [];
  const verificationOrgans: OrganContract[] = [];
  let remainingCompute = budget.maxComputeUnits;
  let remainingMemory = budget.maxMemoryBytes;

  for (const organ of availableOrgans) {
    // Skip if exceeds remaining budget
    if (organ.cost.computeUnits > remainingCompute) {
      rejected.push({ organ, reason: 'Exceeds compute budget' });
      continue;
    }
    if (organ.cost.memoryBytes > remainingMemory) {
      rejected.push({ organ, reason: 'Exceeds memory budget' });
      continue;
    }

    // Select based on problem needs
    let shouldSelect = false;

    switch (organ.organType) {
      case 'INTENT_INTERPRETATION':
        shouldSelect = true; // Always needed
        break;
      case 'LANGUAGE_REASONING':
        shouldSelect = true; // Core organ
        break;
      case 'CODE_REASONING':
        shouldSelect = problem.requiresCode;
        break;
      case 'PLANNING':
        shouldSelect = true; // Always needed for any actionable intent
        break;
      case 'RETRIEVAL':
        shouldSelect = problem.requiresResearch;
        break;
      case 'WEB_RESEARCH':
        shouldSelect = problem.requiresResearch;
        break;
      case 'VISUAL_PERCEPTION':
        shouldSelect = problem.requiresMultimodal;
        break;
      case 'SECURITY_ANALYSIS':
        shouldSelect = problem.dataSensitivity === 'sensitive' || problem.dataSensitivity === 'secret' || riskTolerance === 'LOW';
        break;
      case 'TESTING':
        shouldSelect = problem.requiresCode || problem.requiresPrecision;
        break;
      case 'ARCHITECTURE_ANALYSIS':
        shouldSelect = problem.domain.includes('architecture') || problem.complexity === 'complex';
        break;
      case 'ADVERSARIAL_CRITICISM':
        shouldSelect = riskTolerance === 'LOW' || problem.reversibility === 'irreversible';
        break;
      case 'CAUSAL_ANALYSIS':
        shouldSelect = problem.complexity === 'complex' || problem.decomposability === 'emergent';
        break;
      case 'CONSTRAINT_SOLVING':
        shouldSelect = problem.requiresPrecision;
        break;
      case 'CREATIVE_SYNTHESIS':
        shouldSelect = problem.requiresCreativity;
        break;
      case 'SYMBOLIC_REASONING':
        shouldSelect = problem.requiresPrecision;
        break;
      // Runtime execution organs — always selected for actionable intents
      case 'FILESYSTEM_EXECUTION':
        shouldSelect = problem.requiresCreativity || problem.requiresCode || problem.domain.includes('creation');
        break;
      case 'OBSERVATION':
        shouldSelect = true; // Always observe to verify execution
        break;
      case 'EPISTEMIC_UPDATE':
        shouldSelect = true; // Always learn from execution
        break;
      case 'VERIFICATION':
        shouldSelect = true; // Always verify completion
        break;
      default:
        rejected.push({ organ, reason: 'Not selected for this problem type' });
        continue;
    }

    if (shouldSelect) {
      selected.push(organ);
      remainingCompute -= organ.cost.computeUnits;
      remainingMemory -= organ.cost.memoryBytes;
    } else {
      rejected.push({ organ, reason: 'Not required for this problem' });
    }
  }

  // Select verification organs for high-stakes problems
  if (riskTolerance === 'LOW' || problem.reversibility === 'irreversible') {
    const verifiers = availableOrgans.filter(
      o => o.organType === 'ADVERSARIAL_CRITICISM' || o.organType === 'SECURITY_ANALYSIS' || o.organType === 'TESTING',
    );
    for (const v of verifiers) {
      if (!selected.includes(v) && v.cost.computeUnits <= remainingCompute) {
        verificationOrgans.push(v);
        remainingCompute -= v.cost.computeUnits;
      }
    }
  }

  // Always have at least one verifier if precision matters
  if (problem.requiresPrecision && verificationOrgans.length === 0) {
    const fallbackVerifier = availableOrgans.find(o => o.organType === 'TESTING');
    if (fallbackVerifier && !selected.includes(fallbackVerifier)) {
      verificationOrgans.push(fallbackVerifier);
    }
  }

  return { selected, rejected, verificationOrgans };
}

// ── Cognitive Graph Generation ──

/**
 * Generate a cognitive graph (phenotype) from selected organs.
 * This is the core morphogenesis operation.
 */
export function generateCognitiveGraph(
  organSelection: OrganSelection,
  problem: ProblemStructure,
  budget: ResourceBudget,
  riskTolerance: RiskLevel,
): CognitiveGraph {
  // Generate deterministic ID from organ selection and problem characteristics
  const idSeed = riskTolerance + ':' + organSelection.selected.length + ':' + organSelection.verificationOrgans.length + ':' + problem.domain.join(',');
  let idHash = 0;
  for (let i = 0; i < idSeed.length; i++) {
    idHash = ((idHash << 5) - idHash) + idSeed.charCodeAt(i);
    idHash |= 0;
  }
  const id = 'cg-' + (Date.now().toString(36)) + '-' + Math.abs(idHash).toString(36).slice(0, 6);
  const allOrgans = [...organSelection.selected, ...organSelection.verificationOrgans];

  const organs: CognitiveOrgan[] = allOrgans.map((contract, idx) => ({
    id: 'organ-' + idx + '-' + contract.organType.toLowerCase().replace(/_/g, '-'),
    contract,
    status: 'IDLE' as const,
    allocatedResources: {
      vramRequired: contract.resourceNeeds.vramRequired,
      ramRequired: contract.resourceNeeds.ramRequired,
      gpuRequired: contract.resourceNeeds.gpuRequired,
    },
  }));

  // Build edges: information flows from input organs → processing → verification
  const edges: CognitiveEdge[] = [];

  // Intent interpretation feeds all other organs
  const intentOrgan = organs.find(o => o.contract.organType === 'INTENT_INTERPRETATION');
  if (intentOrgan) {
    for (const o of organs) {
      if (o.id !== intentOrgan.id) {
        edges.push({
          from: intentOrgan.id,
          to: o.id,
          dataType: 'intent_structure',
          confidence: 1.0,
          bidirectional: false,
        });
      }
    }
  }

  // Language reasoning feeds to planning and code reasoning
  const languageOrgan = organs.find(o => o.contract.organType === 'LANGUAGE_REASONING');
  const planner = organs.find(o => o.contract.organType === 'PLANNING');
  const coder = organs.find(o => o.contract.organType === 'CODE_REASONING');

  if (languageOrgan && planner) {
    edges.push({ from: languageOrgan.id, to: planner.id, dataType: 'parsed_objective', confidence: 0.9, bidirectional: false });
  }
  if (planner && coder) {
    edges.push({ from: planner.id, to: coder.id, dataType: 'execution_plan', confidence: 0.95, bidirectional: false });
  }

  // Planning feeds verification organs
  for (const vOrgan of organSelection.verificationOrgans) {
    const v = organs.find(o => o.contract.organType === vOrgan.organType);
    if (v && planner) {
      edges.push({ from: planner.id, to: v.id, dataType: 'plan_to_verify', confidence: 0.95, bidirectional: false });
    }
  }

  // Verification organs report back to the main reasoning chain
  const verifierOrgans = organSelection.verificationOrgans
    .map(v => organs.find(o => o.contract.organType === v.organType))
    .filter((o): o is CognitiveOrgan => o !== undefined);

  const verificationOrganId = verifierOrgans.length > 0 ? verifierOrgans[0].id : null;

  // Uncertainty classification
  let uncertainty: UncertaintyLevel = 'MEDIUM';
  if (problem.complexity === 'simple') uncertainty = 'LOW';
  if (problem.complexity === 'complex' || problem.decomposability === 'emergent') uncertainty = 'HIGH';
  if (problem.complexity === 'unknown') uncertainty = 'UNKNOWN';

  return {
    id,
    objective: '',
    generatedAt: Date.now(),
    organs,
    edges,
    rootOrganId: intentOrgan?.id ?? organs[0]?.id ?? 'root',
    verificationOrganId,
    resourceBudget: budget,
    riskClassification: riskTolerance,
    uncertaintyClassification: uncertainty,
  };
}

// ── Morphogenesis Main Entry Point ──

/**
 * Perform cognitive morphogenesis: given an intent and available organs,
 * generate the cognitive architecture (phenotype) for the objective.
 *
 * This is the central invention of the GSPL agent.
 */
export function performMorphogenesis(
  request: MorphogenesisRequest,
): MorphogenesisResult {
  // 1. Analyze problem structure
  const problem = analyzeProblemStructure(request.objective, request.intent);

  // 2. Select cognitive organs
  const organSelection = selectCognitiveOrgans(
    problem,
    request.availableOrgans,
    request.resourceBudget,
    request.riskTolerance,
  );

  // 3. Generate cognitive graph
  const cognitiveGraph = generateCognitiveGraph(
    organSelection,
    problem,
    request.resourceBudget,
    request.riskTolerance,
  );

  // Set the objective on the graph
  cognitiveGraph.objective = request.objective;

  // 4. Produce reasoning and alternatives
  const reasoning = [
    `Problem domain: ${problem.domain.join(', ')}`,
    `Complexity: ${problem.complexity}`,
    `Selected ${organSelection.selected.length} organs for execution`,
    `Selected ${organSelection.verificationOrgans.length} verification organs`,
    `Budget: ${request.resourceBudget.maxComputeUnits} compute units, ${request.resourceBudget.maxMemoryBytes} bytes`,
  ].join('. ');

  const rejectedAlternatives = organSelection.rejected.map(
    r => `${r.organ.organType}: ${r.reason}`,
  );

  const assumptions = [
    ...request.intent.assumptions,
    `Problem complexity classified as ${problem.complexity}`,
    `Resource budget is sufficient for selected organs`,
  ];

  const unresolved: string[] = [];
  if (problem.complexity === 'unknown') {
    unresolved.push('Problem complexity could not be classified');
  }
  if (organSelection.selected.length === 0) {
    unresolved.push('No cognitive organs could be selected — insufficient resources?');
  }
  for (const r of organSelection.rejected) {
    if (r.reason.includes('budget')) {
      unresolved.push(`Organ ${r.organ.organType} rejected due to budget constraints`);
    }
  }

  return {
    cognitiveGraph,
    reasoning,
    rejectedAlternatives,
    assumptions,
    unresolved,
  };
}
