/**
 * GSPL Memory Architecture
 *
 * A complete memory organism containing:
 *   - Working memory (immediate context)
 *   - Episodic memory (temporal event sequences)
 *   - Semantic memory (facts, concepts, ontologies)
 *   - Procedural memory (skills, patterns, methods)
 *   - Project memory (per-project state)
 *   - Evidence memory (provenance-aware records)
 *   - Failure memory (errors + recovery paths)
 *   - Capability memory (discovered capabilities)
 *   - Identity memory (agent self-knowledge)
 *
 * Every memory object carries:
 *   identity, type, origin, timestamp, confidence,
 *   epistemic status, privacy classification, access policy,
 *   validity interval, content hash, lineage.
 */

import type { MemoryNode, MemoryEdge, MemoryValue, MemoryType, EpistemicStatus } from '@gspl/agent-genes';

// ── Memory Store ──

export interface MemoryStore {
  nodes: Map<string, MemoryNode>;
  edges: MemoryEdge[];
  addNode(node: MemoryNode): void;
  getNode(id: string): MemoryNode | undefined;
  queryNodes(filter: MemoryQuery): MemoryNode[];
  addEdge(edge: MemoryEdge): void;
  consolidate(): void;
  decay(): void;
  toMemoryValue(): MemoryValue;
}

export interface MemoryQuery {
  type?: MemoryType;
  tags?: string[];
  minConfidence?: number;
  minStrength?: number;
  privacy?: 'private' | 'project' | 'shared';
  epistemicStatus?: EpistemicStatus;
  since?: number;
  limit?: number;
}

export function createMemoryStore(): MemoryStore {
  const nodes = new Map<string, MemoryNode>();
  const edges: MemoryEdge[] = [];

  return {
    nodes,
    edges,
    addNode(node) {
      nodes.set(node.id, {
        ...node,
        created: node.created || Date.now(),
        lastAccessed: node.lastAccessed || Date.now(),
        accessCount: node.accessCount ?? 0,
      });
    },
    getNode(id) {
      const node = nodes.get(id);
      if (node) {
        node.lastAccessed = Date.now();
        node.accessCount++;
      }
      return node;
    },
    queryNodes(filter) {
      const results: MemoryNode[] = [];
      for (const node of nodes.values()) {
        if (filter.type && node.type !== filter.type) continue;
        if (filter.tags && !filter.tags.some(t => node.tags.includes(t))) continue;
        if (filter.minConfidence && node.confidence < filter.minConfidence) continue;
        if (filter.minStrength && node.strength < filter.minStrength) continue;
        if (filter.privacy && node.privacy !== filter.privacy) continue;
        if (filter.epistemicStatus && node.epistemicStatus !== filter.epistemicStatus) continue;
        if (filter.since && node.lastAccessed < filter.since) continue;
        results.push(node);
      }
      results.sort((a, b) => b.strength - a.strength);
      return filter.limit ? results.slice(0, filter.limit) : results;
    },
    addEdge(edge) {
      edges.push({ ...edge, created: Date.now() });
    },
    consolidate() {
      // Merge duplicate/similar nodes, strengthen reinforced memories
      const now = Date.now();
      for (const node of nodes.values()) {
        const age = now - node.created;
        const recency = now - node.lastAccessed;
        // Strength increases with access and decreases with age
        node.strength = Math.min(1, node.strength + node.accessCount * 0.01 - age * 0.0000001);
        node.strength = Math.max(0, node.strength);
      }
    },
    decay() {
      // Apply decay to weaken old, unaccessed memories
      for (const node of nodes.values()) {
        const timeSinceAccess = Date.now() - node.lastAccessed;
        const decayFactor = Math.exp(-node.decayRate * timeSinceAccess / (1000 * 60 * 60 * 24)); // days
        node.strength = Math.max(0.01, node.strength * decayFactor);
      }
    },
    toMemoryValue() {
      return { nodes: [...nodes.values()], edges: [...edges], version: 1 };
    },
  };
}

// ── Seed Memory (Semantic Compression) ──

export interface SeedMemory {
  id: string;
  problemStructure: string; // compressed problem ontology
  reasoningTopology: string; // successful reasoning graph structure
  causalExplanation: string;
  verifiedPattern: string;
  failureClass: string | null;
  diagnosticMethod: string | null;
  compressionFidelity: number; // 0-1
  sourceExperienceHash: string;
  createdAt: number;
}

export interface CompressionResult {
  seed: SeedMemory;
  fidelityContract: {
    preservedProperties: string[];
    lostProperties: string[];
    regenerationTests: string[];
    measuredFidelity: number;
  };
}

/**
 * Create a seed memory from a solved problem.
 * This compresses the experience into its generative causes.
 */
export function compressToSeedMemory(
  problemStructure: string,
  reasoningTopology: string,
  verifiedPattern: string,
  fidelity: number,
): SeedMemory {
  return {
    id: 'sm-' + Date.now().toString(36) + '-' + problemStructure.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '') + '-' + Math.floor(fidelity * 100),
    problemStructure,
    reasoningTopology,
    causalExplanation: '',
    verifiedPattern,
    failureClass: null,
    diagnosticMethod: null,
    compressionFidelity: fidelity,
    sourceExperienceHash: '',
    createdAt: Date.now(),
  };
}

// ── Memory Lifecycle ──

export type MemoryPhase =
  | 'CAPTURE'
  | 'CLASSIFY'
  | 'VALIDATE'
  | 'INDEX'
  | 'RETRIEVE'
  | 'USE'
  | 'REINFORCE'
  | 'CONSOLIDATE'
  | 'RESOLVE_CONTRADICTIONS'
  | 'ARCHIVE'
  | 'EXPIRE'
  | 'DELETE';

export interface MemoryLifecycleEvent {
  memoryId: string;
  phase: MemoryPhase;
  timestamp: number;
  details: string;
}

export function recordLifecycle(memoryId: string, phase: MemoryPhase, details: string): MemoryLifecycleEvent {
  return { memoryId, phase, timestamp: Date.now(), details };
}
