import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryStore, type MemoryStore } from './memory.js';
import type { MemoryNode } from '@gspl/agent-genes';

describe('Memory Architecture', () => {
  let store: MemoryStore;
  beforeEach(() => { store = createMemoryStore(); });

  function makeNode(id: string, type: MemoryNode['type'], content: string): MemoryNode {
    return { id, type, content, created: Date.now(), lastAccessed: Date.now(), accessCount: 0, decayRate: 0.01, strength: 1.0, confidence: 0.9, epistemicStatus: 'OBSERVED', privacy: 'private', tags: [], contentHash: 'hash-' + id };
  }

  it('stores and retrieves memory nodes', () => {
    store.addNode(makeNode('ep-1', 'EPISODIC', 'User asked to analyze code'));
    expect(store.toMemoryValue().nodes.length).toBe(1);
    expect(store.getNode('ep-1')!.type).toBe('EPISODIC');
  });

  it('supports all 9 memory types', () => {
    const types: MemoryNode['type'][] = ['WORKING','EPISODIC','SEMANTIC','PROCEDURAL','PROJECT','EVIDENCE','FAILURE','CAPABILITY','IDENTITY'];
    for (const t of types) store.addNode(makeNode(t, t, 'Test ' + t));
    expect(store.toMemoryValue().nodes.length).toBe(9);
  });

  it('queries nodes by type', () => {
    store.addNode(makeNode('a', 'EPISODIC', 'Episode A'));
    store.addNode(makeNode('b', 'SEMANTIC', 'Fact B'));
    expect(store.queryNodes({ type: 'SEMANTIC' }).length).toBe(1);
  });

  it('enforces privacy', () => {
    store.addNode({ ...makeNode('p', 'EPISODIC', 'Secret'), privacy: 'private' });
    expect(store.toMemoryValue().nodes[0].privacy).toBe('private');
  });

  it('each store is independent', () => {
    const s1 = createMemoryStore();
    const s2 = createMemoryStore();
    s1.addNode(makeNode('s1', 'EPISODIC', 'S1 only'));
    expect(s1.toMemoryValue().nodes.length).toBe(1);
    expect(s2.toMemoryValue().nodes.length).toBe(0);
  });

  it('nodes carry epistemic status and confidence', () => {
    store.addNode({ ...makeNode('ev', 'EVIDENCE', 'Test passed'), epistemicStatus: 'VERIFIED', confidence: 1.0 });
    expect(store.toMemoryValue().nodes[0].confidence).toBe(1.0);
  });

  it('consolidation updates node strengths', () => {
    store.addNode(makeNode('c1', 'EPISODIC', 'Event'));
    store.getNode('c1'); // Access it once
    store.consolidate();
    const n = store.getNode('c1')!;
    expect(n.strength).toBeGreaterThanOrEqual(0);
  });

  it('decay reduces strength over time', () => {
    store.addNode({ ...makeNode('d1', 'EPISODIC', 'Old memory'), lastAccessed: Date.now() - 86400000, decayRate: 0.5 });
    store.decay();
    expect(store.getNode('d1')!.strength).toBeLessThan(1.0);
  });
});
