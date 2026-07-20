/**
 * GSPL Intent Compiler
 *
 * Transforms natural-language or multimodal owner input into an explicit
 * GSPL intent structure. The compiled intent becomes the agent's
 * coreIntent gene, which drives cognitive morphogenesis.
 *
 * The intent compiler:
 *   1. Preserves the original statement
 *   2. Identifies explicit goals
 *   3. Derives implied requirements
 *   4. Identifies constraints and anti-goals
 *   5. Identifies ambiguous interpretations
 *   6. Identifies quality expectations
 *   7. Identifies authority boundaries
 *   8. Identifies completion evidence
 *   9. Identifies unresolved unknowns
 *  10. Produces a traceable intent graph
 */

import type { IntentValue, IntentConstraint } from '@gspl/agent-genes';

// ── Compiled Intent ──

export interface CompiledIntent {
  /** The original owner statement, preserved verbatim */
  originalStatement: string;
  /** The structured intent object */
  intent: IntentValue;
  /** Derived requirements with traceability */
  requirements: DerivedRequirement[];
  /** Ambiguous interpretations identified */
  ambiguities: Ambiguity[];
  /** Unresolved unknowns */
  unknowns: UnknownItem[];
  /** Intent lineage (can be revised later) */
  lineage: IntentLineage;
}

export interface DerivedRequirement {
  id: string;
  description: string;
  category: RequirementCategory;
  sourceIntent: string; // reference to which part of the intent generated this
  derivation: string;
  assumptions: string[];
  failureIfAbsent: string;
  dependencies: string[];
  validationMethod: string;
  status: 'derived' | 'validated' | 'disputed' | 'resolved';
}

export type RequirementCategory =
  | 'FUNCTIONAL'
  | 'NONFUNCTIONAL'
  | 'SECURITY'
  | 'OPERATIONAL'
  | 'LIFECYCLE'
  | 'RECOVERY'
  | 'OBSERVABILITY'
  | 'ACCESSIBILITY'
  | 'PRIVACY'
  | 'PERFORMANCE'
  | 'MIGRATION'
  | 'MAINTENANCE'
  | 'OWNERSHIP'
  | 'COMPLIANCE'
  | 'FUTURE_EXTENSION';

export interface Ambiguity {
  text: string;
  interpretations: string[];
  impact: 'low' | 'medium' | 'high';
  resolution: string | null;
}

export interface UnknownItem {
  description: string;
  category: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  investigability: 'researchable' | 'unknowable' | 'deferrable';
}

export interface IntentLineage {
  parentIntentHash: string | null;
  revisionNumber: number;
  createdAt: number;
  revisedAt: number | null;
  revisable: boolean;
}

// ── Intent Compiler Engine ──

/**
 * Compile a natural language statement into a structured GSPL intent.
 * This is a heuristic compiler. In production, a model organ would enhance
 * the quality of interpretation. But even without a model, the compiler
 * produces a structured intent that preserves traceability.
 */
export function compileIntent(naturalLanguageInput: string): CompiledIntent {
  const lower = naturalLanguageInput.toLowerCase();

  // 1. Extract goal — the primary directive
  const goal = extractGoal(naturalLanguageInput);

  // 2. Extract motivation
  const motivation = extractMotivation(naturalLanguageInput, lower);

  // 3. Extract scope
  const scope = extractScope(lower);

  // 4. Extract priority
  const priority = extractPriority(lower);

  // 5. Extract constraints
  const constraints = extractConstraints(naturalLanguageInput, lower);

  // 6. Extract anti-goals
  const antiGoals = extractAntiGoals(lower);

  // 7. Extract quality threshold
  const qualityThreshold = extractQualityThreshold(lower);

  // 8. Extract completion evidence
  const completionEvidence = extractCompletionEvidence(lower);

  // 9. Extract assumptions
  const assumptions = extractAssumptions(naturalLanguageInput, lower);

  // 10. Extract revision conditions
  const revisionConditions = extractRevisionConditions(lower);

  // 11. Identify ambiguities
  const ambiguities = identifyAmbiguities(naturalLanguageInput);

  // 12. Identify unknowns
  const unknowns = identifyUnknowns(naturalLanguageInput, lower);

  // 13. Derive requirements
  const requirements = deriveRequirements(goal, scope, constraints, lower);

  const intent: IntentValue = {
    goal,
    motivation,
    scope,
    priority,
    constraints,
    antiGoals,
    qualityThreshold,
    completionEvidence,
    assumptions,
    revisionConditions,
  };

  return {
    originalStatement: naturalLanguageInput,
    intent,
    requirements,
    ambiguities,
    unknowns,
    lineage: {
      parentIntentHash: null,
      revisionNumber: 1,
      createdAt: Date.now(),
      revisedAt: null,
      revisable: true,
    },
  };
}

/**
 * Revise an existing compiled intent with new owner input.
 */
export function reviseIntent(
  prior: CompiledIntent,
  revisionStatement: string,
): CompiledIntent {
  const revised = compileIntent(revisionStatement);

  // Merge with prior — new goal supersedes, constraints accumulate
  const mergedIntent: IntentValue = {
    ...revised.intent,
    constraints: [
      ...prior.intent.constraints.filter(
        c => !revised.intent.constraints.some(rc => rc.name === c.name),
      ),
      ...revised.intent.constraints,
    ],
    antiGoals: [...new Set([...prior.intent.antiGoals, ...revised.intent.antiGoals])],
    revisionConditions: [
      ...new Set([...prior.intent.revisionConditions, ...revised.intent.revisionConditions]),
    ],
  };

  return {
    ...revised,
    intent: mergedIntent,
    lineage: {
      parentIntentHash: prior.lineage.parentIntentHash ?? 'root',
      revisionNumber: prior.lineage.revisionNumber + 1,
      createdAt: prior.lineage.createdAt,
      revisedAt: Date.now(),
      revisable: true,
    },
  };
}

// ── Extraction Heuristics ──

function extractGoal(input: string): string {
  // Extract the primary action from the input
  const actionPatterns = [
    /^(?:i want (?:you )?to |please |can you |could you |would you )?(.+?)(?:\.|$)/i,
    /^(?:build|create|implement|design|architect|develop|write|code|generate|research|investigate|analyze|fix|debug|refactor|optimize|test|deploy|configure|setup|install|migrate|convert|translate|explain|summarize|document) (.+?)(?:\.|$)/i,
  ];

  for (const pattern of actionPatterns) {
    const match = input.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return input.trim();
}

function extractMotivation(_input: string, lower: string): string {
  if (lower.includes('because')) return lower.split('because')[1]?.trim() || '';
  if (lower.includes('so that')) return lower.split('so that')[1]?.trim() || '';
  if (lower.includes('in order to')) return lower.split('in order to')[1]?.trim() || '';
  return 'Owner directive';
}

function extractScope(lower: string): string[] {
  const scope: string[] = [];
  const scopeIndicators: [string, string][] = [
    ['code', 'code'], ['program', 'code'], ['implement', 'code'],
    ['refactor', 'code'], ['test', 'verification'], ['verify', 'verification'],
    ['architecture', 'architecture'], ['design', 'architecture'],
    ['research', 'research'], ['investigate', 'research'],
    ['security', 'security'], ['vulnerability', 'security'],
    ['deploy', 'operations'], ['configure', 'operations'],
    ['document', 'documentation'], ['explain', 'documentation'],
    ['create', 'creation'], ['generate', 'creation'], ['build', 'creation'],
  ];
  for (const [keyword, domain] of scopeIndicators) {
    if (lower.includes(keyword) && !scope.includes(domain)) {
      scope.push(domain);
    }
  }
  return scope.length > 0 ? scope : ['general'];
}

function extractPriority(lower: string): number {
  if (lower.includes('urgent') || lower.includes('critical') || lower.includes('asap')) return 1.0;
  if (lower.includes('important') || lower.includes('high priority')) return 0.8;
  if (lower.includes('when you can') || lower.includes('low priority')) return 0.3;
  return 0.6; // default moderate priority
}

function extractConstraints(input: string, lower: string): IntentConstraint[] {
  const constraints: IntentConstraint[] = [];

  // Security constraints
  if (lower.includes('secure') || lower.includes('security') || lower.includes('safe')) {
    constraints.push({
      name: 'security-gate',
      predicate: 'All operations must pass security policy',
      severity: 'hard',
      weight: 1.0,
    });
  }

  // Determinism constraints
  if (lower.includes('deterministic') || lower.includes('reproducible')) {
    constraints.push({
      name: 'determinism',
      predicate: 'Output must be deterministically reproducible',
      severity: 'hard',
      weight: 1.0,
    });
  }

  // Performance constraints
  const perfMatch = input.match(/(?:within|under|in) (\d+)\s*(ms|seconds?|minutes?)/i);
  if (perfMatch) {
    constraints.push({
      name: 'performance',
      predicate: `Must complete within ${perfMatch[0]}`,
      severity: 'soft',
      weight: 0.7,
    });
  }

  // Offline constraint
  if (lower.includes('offline') || lower.includes('local') || lower.includes('no network')) {
    constraints.push({
      name: 'local-only',
      predicate: 'Must operate without network access',
      severity: 'hard',
      weight: 1.0,
    });
  }

  // Privacy constraint
  if (lower.includes('private') || lower.includes('confidential') || lower.includes('secret')) {
    constraints.push({
      name: 'privacy',
      predicate: 'No data may leave local environment',
      severity: 'hard',
      weight: 1.0,
    });
  }

  return constraints;
}

function extractAntiGoals(lower: string): string[] {
  const antiGoals: string[] = [];
  const antiPatterns: [string, string][] = [
    ["don't delete", 'Do not delete any files'],
    ["do not delete", 'Do not delete any files'],
    ["don't modify", 'Do not modify existing files without confirmation'],
    ["do not modify", 'Do not modify existing files without confirmation'],
    ["don't break", 'Do not break existing functionality'],
    ["do not break", 'Do not break existing functionality'],
    ['no network', 'Do not make network requests'],
    ['no api', 'Do not call external APIs'],
    ['no changes to', 'Do not change specified targets'],
    ['do not increase', 'Do not increase resource usage'],
    ['do not add', 'Do not add new dependencies'],
    ['do not remove', 'Do not remove existing features'],
    ['without changing', 'Do not change the specified aspect'],
    ['without modifying', 'Do not modify the specified targets'],
  ];
  for (const [pattern, antiGoal] of antiPatterns) {
    if (lower.includes(pattern)) antiGoals.push(antiGoal);
  }
  return antiGoals;
}

function extractQualityThreshold(lower: string): number {
  if (lower.includes('perfect') || lower.includes('production') || lower.includes('flawless')) return 1.0;
  if (lower.includes('good') || lower.includes('solid') || lower.includes('reliable')) return 0.8;
  if (lower.includes('quick') || lower.includes('draft') || lower.includes('rough')) return 0.5;
  return 0.8; // default high quality
}

function extractCompletionEvidence(lower: string): string[] {
  const evidence: string[] = [];
  if (lower.includes('test') || lower.includes('verify')) evidence.push('Tests pass');
  if (lower.includes('compile') || lower.includes('build')) evidence.push('Build succeeds');
  if (lower.includes('typecheck')) evidence.push('Typecheck passes');
  if (lower.includes('review')) evidence.push('Code review approved');
  if (lower.includes('deploy')) evidence.push('Deployment succeeds');
  return evidence;
}

function extractAssumptions(input: string, _lower: string): string[] {
  const assumptions: string[] = [
    'Owner has provided sufficient context',
    'Required tools and dependencies are available',
    'The environment matches declared configuration',
  ];
  // Add document-based assumptions
  if (input.length > 500) assumptions.push('Input is comprehensive enough for task');
  return assumptions;
}

function extractRevisionConditions(_lower: string): string[] {
  return [
    'Owner provides additional clarification',
    'New constraints are discovered during execution',
    'Resource limitations prevent full completion',
    'Security policy violation detected',
  ];
}

function identifyAmbiguities(input: string): Ambiguity[] {
  const ambiguities: Ambiguity[] = [];

  // Check for "it" without clear antecedent
  if (/\bit\b/i.test(input) && input.split(' ').length < 10) {
    ambiguities.push({
      text: 'Ambiguous reference "it"',
      interpretations: ['Could refer to previous context'],
      impact: 'medium',
      resolution: null,
    });
  }

  // Check for unclear scope
  if (!input.match(/\b(in|within|for|to)\s+(the|a|my|our)\s+\w+/i)) {
    ambiguities.push({
      text: 'Scope not explicitly defined',
      interpretations: ['May apply to entire project or specific component'],
      impact: 'high',
      resolution: null,
    });
  }

  return ambiguities;
}

function identifyUnknowns(input: string, lower: string): UnknownItem[] {
  const unknowns: UnknownItem[] = [];

  if (!lower.includes('test') && !lower.includes('verify') && lower.includes('code')) {
    unknowns.push({
      description: 'No verification method specified for code changes',
      category: 'verification',
      impact: 'high',
      investigability: 'researchable',
    });
  }

  if (lower.includes('all') || lower.includes('every') || lower.includes('entire')) {
    unknowns.push({
      description: 'Scope keyword suggests breadth unknown without inspection',
      category: 'scope',
      impact: 'medium',
      investigability: 'researchable',
    });
  }

  return unknowns;
}

// ── Requirement Derivation ──

function deriveRequirements(
  goal: string,
  scope: string[],
  constraints: IntentConstraint[],
  lower: string,
): DerivedRequirement[] {
  const requirements: DerivedRequirement[] = [];
  let id = 0;

  // Functional requirement from goal
  requirements.push({
    id: `REQ-${++id}`,
    description: `Fulfill: ${goal}`,
    category: 'FUNCTIONAL',
    sourceIntent: 'goal',
    derivation: 'Directly derived from the primary goal',
    assumptions: ['Goal is correctly interpreted'],
    failureIfAbsent: 'The agent would have no objective',
    dependencies: [],
    validationMethod: 'Owner confirmation of completion',
    status: 'derived',
  });

  // Security requirements
  if (constraints.some(c => c.name === 'security-gate')) {
    requirements.push({
      id: `REQ-${++id}`,
      description: 'All operations must pass security policy enforcement',
      category: 'SECURITY',
      sourceIntent: 'constraint:security-gate',
      derivation: 'Security constraint requires policy gate',
      assumptions: ['Policy rules are correctly configured'],
      failureIfAbsent: 'Operations could bypass security',
      dependencies: ['REQ-1'],
      validationMethod: 'Security audit log review',
      status: 'derived',
    });
  }

  // Verification requirement for code scope
  if (scope.includes('code')) {
    requirements.push({
      id: `REQ-${++id}`,
      description: 'All code changes must be tested and typechecked',
      category: 'NONFUNCTIONAL',
      sourceIntent: 'scope:code',
      derivation: 'Code scope implies testing and type safety',
      assumptions: ['Test infrastructure is available'],
      failureIfAbsent: 'Code changes could introduce regressions',
      dependencies: ['REQ-1'],
      validationMethod: 'CI test suite passes',
      status: 'derived',
    });
  }

  // Observability requirement
  if (lower.includes('log') || lower.includes('trace') || lower.includes('monitor')) {
    requirements.push({
      id: `REQ-${++id}`,
      description: 'Operations must be observable and auditable',
      category: 'OBSERVABILITY',
      sourceIntent: 'explicit-request',
      derivation: 'Owner requested observability',
      assumptions: ['Observability infrastructure is configured'],
      failureIfAbsent: 'Cannot audit agent actions',
      dependencies: ['REQ-1'],
      validationMethod: 'Observability dashboard shows traces',
      status: 'derived',
    });
  }

  return requirements;
}
