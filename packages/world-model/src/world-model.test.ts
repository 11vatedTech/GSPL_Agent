import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld, addEntity, createBranch, discoverAbsences, type SemanticWorld, type WorldEntity } from './world-model.js';

describe('World Model', () => {
  let world: SemanticWorld;
  beforeEach(() => { world = createWorld('test-world'); });

  function makeEntity(id: string, type: WorldEntity['type'], name: string): WorldEntity {
    return { id, type, name, properties: {}, relationships: [], state: { status: 'ACTIVE', health: 1.0, lastCheckpoint: null, version: 1 }, createdAt: Date.now(), updatedAt: Date.now(), observedAt: Date.now(), confidence: 0.9 };
  }

  it('creates a world with identity', () => {
    expect(world.id).toBeDefined();
    expect(world.name).toBe('test-world');
    expect(world.entities.size).toBe(0);
  });

  it('adds entities to world', () => {
    addEntity(world, makeEntity('e1', 'FILE', 'package.json'));
    expect(world.entities.size).toBe(1);
    expect(world.entities.get('e1')!.name).toBe('package.json');
  });

  it('multiple entities persist', () => {
    addEntity(world, makeEntity('e1', 'FILE', 'test.ts'));
    addEntity(world, makeEntity('e2', 'DIRECTORY', 'src'));
    expect(world.entities.size).toBe(2);
  });

  it('creates counterfactual branches', () => {
    const branch = createBranch(world, 'alternative', ['assume X']);
    expect(branch.id).not.toBe(world.id);
    expect(branch.parentBranchId).toBe(world.currentBranchId);
  });

  it('branches are recorded', () => {
    createBranch(world, 'feature-branch', ['assume Y']);
    expect(world.branches.length).toBe(1);
    expect(world.branches[0].name).toBe('feature-branch');
  });

  it('discovers structural absences', () => {
    addEntity(world, makeEntity('e1', 'FILE', 'file.ts'));
    const absences = discoverAbsences(world);
    expect(Array.isArray(absences)).toBe(true);
    for (const a of absences) { expect(a.description).toBeDefined(); }
  });

  it('different worlds are independent', () => {
    const w1 = createWorld('world-1');
    const w2 = createWorld('world-2');
    addEntity(w1, makeEntity('e1', 'FILE', 'w1.ts'));
    expect(w1.entities.size).toBe(1);
    expect(w2.entities.size).toBe(0);
  });

  it('world facts preserve epistemic status in properties', () => {
    const e = makeEntity('e1', 'INTENT', 'observed-fact');
    e.properties = { epistemicStatus: 'OBSERVED', confidence: 0.95 };
    addEntity(world, e);
    expect(world.entities.get('e1')!.properties.epistemicStatus).toBe('OBSERVED');
  });
});
