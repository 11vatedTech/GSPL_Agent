import { describe, it, expect } from 'vitest';
import {
  createEntropyRoot,
  createStandardEntropyTree,
  EntropyChannel,
  verifyGoldenVectors,
  ENTROPY_GOLDEN_VECTORS,
} from '../src/rng/entropy-channels.js';

describe('EntropyChannels — golden vectors', () => {
  it('all golden vectors pass', () => {
    const result = verifyGoldenVectors();
    expect(result.ok).toBe(true);
  });

  it('golden vectors have correct algorithm metadata', () => {
    expect(ENTROPY_GOLDEN_VECTORS.algorithm).toBe('splitmix64');
    expect(ENTROPY_GOLDEN_VECTORS.algorithmVersion).toBe('1.0');
    expect(ENTROPY_GOLDEN_VECTORS.vectors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('EntropyChannels — root creation', () => {
  it('creates root from bigint seed', () => {
    const root = createEntropyRoot(42n);
    expect(root.descriptor.name).toBe('root');
    expect(root.descriptor.path).toBe('');
  });

  it('creates root from string seed', () => {
    const root = createEntropyRoot('my-seed');
    expect(root.descriptor.name).toBe('root');
  });

  it('creates root from Uint8Array seed', () => {
    const root = createEntropyRoot(new Uint8Array([1, 2, 3, 4]));
    expect(root.descriptor.name).toBe('root');
  });

  it('same seed produces same first output', () => {
    const a = createEntropyRoot(42n);
    const b = createEntropyRoot(42n);
    expect(a.nextU64()).toEqual(b.nextU64());
  });

  it('different seeds produce different first output', () => {
    const a = createEntropyRoot(42n);
    const b = createEntropyRoot(43n);
    expect(a.nextU64()).not.toEqual(b.nextU64());
  });
});

describe('EntropyChannels — hierarchical forks', () => {
  it('forks produce independent streams', () => {
    const root = createEntropyRoot(42n);
    const arch = root.fork('architecture', 'test');
    const naming = root.fork('naming', 'test');
    expect(arch.nextU64()).not.toEqual(naming.nextU64());
  });

  it('same fork name produces same stream', () => {
    const a = createEntropyRoot(42n);
    const b = createEntropyRoot(42n);
    expect(a.fork('arch', 'test').nextU64()).toEqual(b.fork('arch', 'test').nextU64());
  });

  it('fork returns existing child if already forked', () => {
    const root = createEntropyRoot(42n);
    const first = root.fork('arch', 'test');
    const second = root.fork('arch', 'test');
    expect(first).toBe(second);
  });

  it('order-independent forks produce stable streams', () => {
    const a = createEntropyRoot(42n);
    const b = createEntropyRoot(42n);
    
    // Fork in different orders
    const aArch = a.fork('arch', 'test', true);
    const aNaming = a.fork('naming', 'test', true);
    
    const bNaming = b.fork('naming', 'test', true);
    const bArch = b.fork('arch', 'test', true);
    
    // Despite different fork order, streams should be identical
    expect(aArch.nextU64()).toEqual(bArch.nextU64());
    expect(aNaming.nextU64()).toEqual(bNaming.nextU64());
  });

  it('nested forks work', () => {
    const root = createEntropyRoot(42n);
    const arch = root.fork('architecture', 'test', true);
    const archNaming = arch.fork('naming', 'test', true);
    expect(archNaming.descriptor.path).toBe('architecture/naming');
    expect(archNaming.descriptor.parentPath).toBe('architecture');
  });

  it('toDescriptors returns flat tree', () => {
    const root = createEntropyRoot(42n);
    root.fork('arch', 'test', true);
    root.fork('naming', 'test', true);
    const arch = root.child('arch')!;
    arch.fork('sub', 'test', true);
    
    const descs = root.toDescriptors();
    expect(descs.length).toBe(4); // root + arch + naming + arch/sub
    expect(descs.some(d => d.path === 'arch/sub')).toBe(true);
  });
});

describe('EntropyChannels — standard tree', () => {
  it('creates all 6 standard channels', () => {
    const root = createStandardEntropyTree(42n);
    const children = root.listChildren();
    expect(children.length).toBe(6);
    expect(children).toContain('architecture');
    expect(children).toContain('naming');
    expect(children).toContain('dependency-selection');
    expect(children).toContain('layout');
    expect(children).toContain('optimization');
    expect(children).toContain('target-specific-projection');
  });

  it('standard tree is deterministic across constructions', () => {
    const a = createStandardEntropyTree(42n);
    const b = createStandardEntropyTree(42n);
    const aArch = a.child('architecture')!;
    const bArch = b.child('architecture')!;
    expect(aArch.nextU64()).toEqual(bArch.nextU64());
  });
});

describe('EntropyChannels — cross-process reproducibility', () => {
  it('same seed + same channel = same output regardless of consumption order', () => {
    // Simulate two processes with different consumption patterns
    const proc1 = createEntropyRoot(999n);
    proc1.fork('arch', 'test', true);
    const proc1Arch = proc1.child('arch')!;
    proc1Arch.nextU64(); // consume some
    proc1Arch.nextU64();
    const prod1Last = proc1Arch.nextU64();

    const proc2 = createEntropyRoot(999n);
    proc2.fork('naming', 'test', true); // different fork first
    proc2.fork('arch', 'test', true);
    const proc2Arch = proc2.child('arch')!;
    proc2Arch.nextU64();
    proc2Arch.nextU64();
    const proc2Last = proc2Arch.nextU64();

    // Same seed + order-independent fork = same result
    expect(prod1Last).toEqual(proc2Last);
  });
});

describe('EntropyChannels — distribution properties', () => {
  it('nextDouble is in [0, 1)', () => {
    const root = createEntropyRoot(1n);
    for (let i = 0; i < 100; i++) {
      const v = root.nextDouble();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt is in [0, n)', () => {
    const root = createEntropyRoot(1n);
    for (let i = 0; i < 100; i++) {
      const v = root.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('nextBytes produces correct length', () => {
    const root = createEntropyRoot(42n);
    expect(root.nextBytes(16).length).toBe(16);
    expect(root.nextBytes(0).length).toBe(0);
    expect(root.nextBytes(100).length).toBe(100);
  });

  it('nextBytes is deterministic', () => {
    const a = createEntropyRoot(42n);
    const b = createEntropyRoot(42n);
    expect(a.nextBytes(32)).toEqual(b.nextBytes(32));
  });

  it('nextGaussian has approximately zero mean', () => {
    const root = createEntropyRoot(7n);
    let sum = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) sum += root.nextGaussian();
    expect(Math.abs(sum / N)).toBeLessThan(0.2);
  });

  it('no channel uses Math.random', () => {
    const root = createEntropyRoot(42n);
    for (let i = 0; i < 100; i++) root.nextU64();
    const root2 = createEntropyRoot(42n);
    for (let i = 0; i < 100; i++) root2.nextU64();
    expect(root.nextU64()).toEqual(root2.nextU64());
  });
});
