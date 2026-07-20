/**
 * GSPL Context Compiler
 *
 * Compiles context for model organs rather than concatenating text.
 * Separates trusted instruction from untrusted content.
 * Enforces context budgets, preserves lineage.
 */

import type { MemoryStore, MemoryQuery } from '@gspl/memory-architecture';
import type { EpistemicEngine, Claim } from '@gspl/epistemic-engine';
import type { OrganContract } from '@gspl/cognitive-kernel';

// ── Compiled Context ──

export interface CompiledContext {
  organType: string;
  systemInstruction: TrustedBlock;
  objective: TrustedBlock;
  trustedPolicy: TrustedBlock;
  retrievedMemory: ContextBlock[];
  retrievedEvidence: ContextBlock[];
  worldState: ContextBlock[];
  untrustedContent: ContextBlock[];
  budget: ContextBudget;
  lineage: ContextLineage;
  tokenUsage: number;
}

export interface TrustedBlock {
  content: string;
  source: 'system' | 'owner' | 'policy' | 'constitution';
  hash: string;
  immutable: boolean;
}

export interface ContextBlock {
  id: string;
  content: string;
  source: string;
  trustLevel: 'trusted' | 'untrusted' | 'unknown';
  epistemicStatus: string;
  confidence: number;
  retrievedAt: number;
}

export interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  remainingTokens: number;
}

export interface ContextLineage {
  compiledAt: number;
  compilerVersion: string;
  sources: string[];
  snapshotHash: string;
}

// ── Context Compiler ──

export interface ContextCompiler {
  compile(request: ContextRequest): CompiledContext;
  validateContext(context: CompiledContext): ContextValidation;
  compactContext(context: CompiledContext, targetTokens: number): CompiledContext;
}

export interface ContextRequest {
  organType: string;
  objective: string;
  policyText: string;
  memoryQueries: MemoryQuery[];
  evidenceFilters: { status?: string; minConfidence?: number };
  worldEntityIds: string[];
  untrustedInputs: string[];
  budget: ContextBudget;
}

export interface ContextValidation {
  valid: boolean;
  issues: ContextIssue[];
  tokenWarnings: string[];
}

export interface ContextIssue {
  severity: 'info' | 'warning' | 'error';
  message: string;
  blockId?: string;
}

export function createContextCompiler(
  memoryStore: MemoryStore,
  epistemicEngine: EpistemicEngine,
): ContextCompiler {
  return {
    compile(request) {
      const blocks: ContextBlock[] = [];
      let usedTokens = 0;

      // Retrieve memory
      for (const query of request.memoryQueries) {
        const nodes = memoryStore.queryNodes(query);
        for (const node of nodes) {
          const block: ContextBlock = {
            id: node.id,
            content: typeof node.content === 'string' ? node.content : JSON.stringify(node.content),
            source: node.type,
            trustLevel: node.privacy === 'private' ? 'trusted' : 'unknown',
            epistemicStatus: node.epistemicStatus,
            confidence: node.confidence,
            retrievedAt: Date.now(),
          };
          blocks.push(block);
          usedTokens += estimateTokens(block.content);
        }
      }

      // Build compiled context
      const systemBlock: TrustedBlock = {
        content: 'You are a cognitive organ in the GSPL sovereign agent. You operate under explicit capability bounds. Your outputs will be validated.',
        source: 'system',
        hash: '',
        immutable: true,
      };

      const objectiveBlock: TrustedBlock = {
        content: request.objective,
        source: 'owner',
        hash: '',
        immutable: false,
      };

      const policyBlock: TrustedBlock = {
        content: request.policyText,
        source: 'policy',
        hash: '',
        immutable: true,
      };

      // Untrusted content blocks
      const untrustedBlocks: ContextBlock[] = request.untrustedInputs.map((content, i) => ({
        id: 'untrusted-' + i,
        content,
        source: 'external',
        trustLevel: 'untrusted' as const,
        epistemicStatus: 'REPORTED',
        confidence: 0.3,
        retrievedAt: Date.now(),
      }));

      return {
        organType: request.organType,
        systemInstruction: systemBlock,
        objective: objectiveBlock,
        trustedPolicy: policyBlock,
        retrievedMemory: blocks.filter(b => b.trustLevel === 'trusted'),
        retrievedEvidence: [],
        worldState: [],
        untrustedContent: untrustedBlocks,
        budget: {
          maxTokens: request.budget.maxTokens,
          usedTokens,
          remainingTokens: request.budget.maxTokens - usedTokens,
        },
        lineage: {
          compiledAt: Date.now(),
          compilerVersion: '0.1.0',
          sources: [],
          snapshotHash: '',
        },
        tokenUsage: usedTokens,
      };
    },

    validateContext(context) {
      const issues: ContextIssue[] = [];
      const tokenWarnings: string[] = [];

      // Check no untrusted content has infected trusted blocks
      for (const block of context.untrustedContent) {
        if (context.systemInstruction.content.includes(block.content)) {
          issues.push({ severity: 'error', message: 'Untrusted content detected in system instruction', blockId: block.id });
        }
        if (context.objective.content.includes(block.content)) {
          issues.push({ severity: 'error', message: 'Untrusted content detected in objective', blockId: block.id });
        }
      }

      // Check token budget
      if (context.tokenUsage > context.budget.maxTokens * 0.9) {
        tokenWarnings.push('Context approaching budget limit (' + context.tokenUsage + '/' + context.budget.maxTokens + ')');
      }

      return { valid: issues.filter(i => i.severity === 'error').length === 0, issues, tokenWarnings };
    },

    compactContext(context, targetTokens) {
      if (context.tokenUsage <= targetTokens) return context;

      // Remove lowest-confidence untrusted content first
      const sorted = [...context.untrustedContent].sort((a, b) => a.confidence - b.confidence);
      let currentTokens = context.tokenUsage;
      const kept: typeof sorted = [];

      for (const block of sorted) {
        const blockTokens = estimateTokens(block.content);
        if (currentTokens - blockTokens > targetTokens) {
          currentTokens -= blockTokens;
        } else {
          kept.push(block);
        }
      }

      return {
        ...context,
        untrustedContent: kept,
        tokenUsage: currentTokens,
        budget: { ...context.budget, usedTokens: currentTokens, remainingTokens: context.budget.maxTokens - currentTokens },
      };
    },
  };
}

function estimateTokens(text: string): number {
  // Rough approximation: ~4 chars per token
  return Math.ceil(text.length / 4);
}
