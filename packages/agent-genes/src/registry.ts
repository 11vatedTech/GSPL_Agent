/**
 * Cognitive Gene Registry — extends the standard 17-gene registry
 * with the 5 cognitive gene types for agent cognition.
 */

import type { GeneTypeDescriptor, GeneTypeRegistry } from '@gspl/gene-protocol';
import { createStandardGeneRegistry } from '@gspl/gene-protocol';
import { COGNITIVE_GENE_DESCRIPTORS } from './defaults.js';

/**
 * Create an extended gene registry that includes the standard 17 types
 * plus the 5 cognitive gene types (intent, belief, memory, policy, hypothesis).
 */
export function createCognitiveGeneRegistry(): GeneTypeRegistry & {
  readonly cognitiveTypes: ReadonlyMap<string, GeneTypeDescriptor>;
} {
  const base = createStandardGeneRegistry();
  const cognitiveMap = new Map<string, GeneTypeDescriptor>();

  // Copy base types
  for (const t of base.list()) {
    cognitiveMap.set(t.typeId, t);
  }

  // Add cognitive types
  for (const t of COGNITIVE_GENE_DESCRIPTORS) {
    if (cognitiveMap.has(t.typeId)) {
      throw new Error(`Cognitive gene type collision: ${t.typeId} already exists`);
    }
    cognitiveMap.set(t.typeId, Object.freeze({ ...t }));
  }

  const frozenMap: ReadonlyMap<string, GeneTypeDescriptor> = Object.freeze({
    has: (k: string) => cognitiveMap.has(k),
    get: (k: string) => cognitiveMap.get(k),
    entries: () => cognitiveMap.entries(),
    keys: () => cognitiveMap.keys(),
    values: () => cognitiveMap.values(),
    forEach: (cb: (value: GeneTypeDescriptor, key: string, map: Map<string, GeneTypeDescriptor>) => void, thisArg?: unknown) =>
      cognitiveMap.forEach(cb, thisArg),
    get size() { return cognitiveMap.size; },
    [Symbol.iterator]: () => cognitiveMap[Symbol.iterator](),
  }) as ReadonlyMap<string, GeneTypeDescriptor>;

  const cognitiveTypesOnly: ReadonlyMap<string, GeneTypeDescriptor> = Object.freeze({
    has: (k: string) => COGNITIVE_GENE_DESCRIPTORS.some(d => d.typeId === k),
    get: (k: string) => COGNITIVE_GENE_DESCRIPTORS.find(d => d.typeId === k),
    entries: () => COGNITIVE_GENE_DESCRIPTORS.map(d => [d.typeId, d] as const)[Symbol.iterator](),
    keys: () => COGNITIVE_GENE_DESCRIPTORS.map(d => d.typeId)[Symbol.iterator](),
    values: () => COGNITIVE_GENE_DESCRIPTORS[Symbol.iterator](),
    forEach: (cb: (value: GeneTypeDescriptor, key: string) => void, thisArg?: unknown) =>
      COGNITIVE_GENE_DESCRIPTORS.forEach(d => cb.call(thisArg, d, d.typeId)),
    get size() { return COGNITIVE_GENE_DESCRIPTORS.length; },
    [Symbol.iterator]: () => COGNITIVE_GENE_DESCRIPTORS[Symbol.iterator](),
  }) as ReadonlyMap<string, GeneTypeDescriptor>;

  return {
    version: '1.0-cognitive',
    types: frozenMap,
    get: (id) => cognitiveMap.get(id),
    has: (id) => cognitiveMap.has(id),
    list: () => [...cognitiveMap.values()],
    listByClassification: (c) => [...cognitiveMap.values()].filter(t => t.classification === c),
    cognitiveTypes: cognitiveTypesOnly,
  };
}

/**
 * Check if a gene type ID is a cognitive gene type
 */
export function isCognitiveGene(typeId: string): boolean {
  return COGNITIVE_GENE_DESCRIPTORS.some(d => d.typeId === typeId);
}

/**
 * Standard cognitive gene registry — factory-created, no global mutable state.
 * Each caller receives its own instance.
 */
export function createStandardCognitiveRegistry(): ReturnType<typeof createCognitiveGeneRegistry> {
  return createCognitiveGeneRegistry();
}
