/**
 * Sovereign Agent Genome Builder
 *
 * Creates and manages the agent's identity as a versioned GSPL seed.
 * Every agent has a cryptographic identity, lineage, and typed cognitive genome.
 */

import type {
  SovereignAgentGenome,
  AgentSovereignty,
  AgentLineage,
  AgentGenes,
  AgentMutation,
} from './types.js';
import type { IntentValue, BeliefValue, MemoryValue, PolicyValue, HypothesisValue } from '@gspl/agent-genes';

// ── Default Genome ──

export function createDefaultGenes(): AgentGenes {
  return {
    coreIntent: {
      goal: 'Assist with generation, analysis, and transformation of artifacts through GSPL',
      motivation: 'Fulfill the GSPL sovereign agent mandate',
      scope: ['code', 'architecture', 'research', 'creation'],
      priority: 0.8,
      constraints: [
        { name: 'sovereignty', predicate: 'All actions must preserve owner cryptographic identity', severity: 'hard', weight: 1.0 },
        { name: 'determinism', predicate: 'All generative operations must be reproducible', severity: 'hard', weight: 1.0 },
        { name: 'security', predicate: 'No ambient authority — all actions through explicit capabilities', severity: 'hard', weight: 1.0 },
      ],
      antiGoals: [
        'Modify the agent constitution without owner approval',
        'Expose private data to external services',
        'Produce unverifiable claims as truth',
      ],
      qualityThreshold: 0.8,
      completionEvidence: ['All outputs verified', 'All invariants preserved', 'Owner acknowledged completion'],
      assumptions: ['Owner controls the hardware', 'Models are available locally or through configured providers'],
      revisionConditions: [
        'Owner issues new directive',
        'Constitutional amendment approved',
        'Critical failure pattern detected',
      ],
    },
    worldModel: {
      proposition: 'The world consists of the local filesystem, configured repositories, available models, and owner-defined projects',
      status: 'KNOWN',
      confidence: 1.0,
      source: 'genome-initialization',
      timestamp: Date.now(),
      supportingEvidence: [],
      contradictingEvidence: [],
      dependencies: [],
      validityInterval: null,
      verificationStatus: 'verified',
    },
    episodicStore: {
      nodes: [],
      edges: [],
      version: 0,
    },
    actionBounds: {
      rules: [
        {
          id: 'constitutional-authority',
          description: 'Constitutional rule: all actions must pass through capability security',
          condition: {},
          effect: 'REQUIRE_APPROVAL',
          priority: 0,
          scope: ['*'],
        },
        {
          id: 'read-filesystem',
          description: 'Allow reading from project directories',
          condition: { action: 'filesystem-read', dataSensitivity: 'internal' },
          effect: 'ALLOW',
          priority: 10,
          scope: ['filesystem'],
        },
        {
          id: 'write-filesystem',
          description: 'Writing files requires approval',
          condition: { action: 'filesystem-write', dataSensitivity: 'internal' },
          effect: 'REQUIRE_APPROVAL',
          priority: 10,
          scope: ['filesystem'],
        },
      ],
      defaultEffect: 'DENY',
      version: 1,
      constitutionalInvariants: ['constitutional-authority'],
    },
    activeHypotheses: [],
  };
}

export function createDefaultSovereignty(): AgentSovereignty {
  return {
    pubkey: '',
    signature: '',
    identityHash: '',
    createdAt: Date.now(),
    version: 1,
  };
}

export function createDefaultLineage(): AgentLineage {
  return {
    parent: null,
    tick: 0,
    branchId: 'primordial',
    mutations: [],
    createdAt: Date.now(),
  };
}

/**
 * Create a primordial (first-generation) sovereign agent genome.
 */
export function createPrimordialGenome(): SovereignAgentGenome {
  return {
    $gst: 'gspl:agent:v1',
    $sovereignty: createDefaultSovereignty(),
    $lineage: createDefaultLineage(),
    genes: createDefaultGenes(),
  };
}

/**
 * Create a child genome from a parent, applying specified mutations.
 */
export function createChildGenome(
  parent: SovereignAgentGenome,
  mutations: AgentMutation[],
  geneOverrides: Partial<AgentGenes>,
): SovereignAgentGenome {
  return {
    $gst: 'gspl:agent:v1',
    $sovereignty: {
      ...parent.$sovereignty,
      version: parent.$sovereignty.version + 1,
    },
    $lineage: {
      parent: parent.$sovereignty.identityHash || null,
      tick: 0,
      branchId: parent.$lineage.branchId + '-branch-' + mutations.length,
      mutations: [...parent.$lineage.mutations, ...mutations],
      createdAt: Date.now(),
    },
    genes: {
      ...parent.genes,
      ...geneOverrides,
      // Always merge memory
      episodicStore: {
        ...parent.genes.episodicStore,
        ...(geneOverrides.episodicStore ?? {}),
        version: parent.genes.episodicStore.version + 1,
      },
    },
  };
}

/**
 * Check if a genome is in a valid sovereign state.
 */
export function validateSovereignGenome(genome: SovereignAgentGenome): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (genome.$gst !== 'gspl:agent:v1') {
    errors.push('Invalid $gst: expected gspl:agent:v1');
  }
  if (!genome.$sovereignty.pubkey) {
    errors.push('Missing sovereignty public key');
  }
  if (!genome.genes.coreIntent.goal) {
    errors.push('Missing core intent goal');
  }
  if (genome.genes.actionBounds.constitutionalInvariants.length === 0) {
    errors.push('No constitutional invariants defined — agent has no immutable laws');
  }
  if (genome.genes.coreIntent.priority < 0 || genome.genes.coreIntent.priority > 1) {
    errors.push('Intent priority out of bounds');
  }

  return { valid: errors.length === 0, errors };
}
