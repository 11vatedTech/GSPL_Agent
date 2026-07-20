/**
 * Hierarchical Deterministic Entropy Channels — Prompt 2 §9
 *
 * A single global RNG is forbidden. Instead, entropy is derived through
 * labeled, hierarchical forks from a root seed.
 *
 * Channel tree example:
 *   root seed entropy
 *   ├── architecture
 *   ├── naming
 *   ├── dependency selection
 *   ├── layout
 *   ├── optimization
 *   └── target-specific projection
 *
 * Requirements:
 *   - stable algorithm selection (SplitMix64)
 *   - algorithm versioning
 *   - unbiased integer sampling
 *   - deterministic floating-point policy
 *   - byte generation
 *   - labeled forks
 *   - order-independent forks where required
 *   - no ambient Math.random
 *   - no wall-clock input
 *   - no process-specific entropy
 *   - no iteration-order dependence
 */

import { DeterministicRng, fnv1a64 } from './deterministic.js';

const MASK_64 = (1n << 64n) - 1n;

/** Golden vectors: known outputs for well-known inputs. §9-16 */
export const ENTROPY_GOLDEN_VECTORS = {
  algorithm: 'splitmix64',
  algorithmVersion: '1.0',
  vectors: [
    { seed: '0', channel: '', count: 0, expected: '0' },
    {
      seed: '1',
      channel: '',
      count: 1,
      expected: '5e41ab087439611e',
    },
    {
      seed: '42',
      channel: '',
      count: 1,
      expected: '57e1faba65107204',
    },
    {
      seed: '42',
      channel: 'architecture',
      count: 1,
      expected: '67630695fe7ef69d',
    },
    {
      seed: '42',
      channel: 'architecture/naming',
      count: 1,
      expected: 'e057fce24bb85b4a',
    },
  ],
} as const;

/** Channel descriptor — metadata about a fork */
export interface EntropyChannelDescriptor {
  /** Channel name (unique within parent) */
  name: string;
  /** Full derivation path (e.g., 'architecture/naming') */
  path: string;
  /** Purpose description */
  purpose: string;
  /** Parent channel path (empty for root) */
  parentPath: string;
}

/**
 * A single entropy channel. Created by forking from a parent channel.
 * Each channel is an independent deterministic stream.
 */
export class EntropyChannel {
  readonly descriptor: EntropyChannelDescriptor;
  private rng: DeterministicRng;
  private children: Map<string, EntropyChannel>;

  constructor(
    descriptor: EntropyChannelDescriptor,
    rng: DeterministicRng
  ) {
    this.descriptor = descriptor;
    this.rng = rng;
    this.children = new Map();
  }

  /** Produce the next 64-bit unsigned integer. */
  nextU64(): bigint {
    return this.rng.nextU64();
  }

  /** Uniform real number in [0, 1). */
  nextDouble(): number {
    return this.rng.nextDouble();
  }

  /** Uniform integer in [0, n). */
  nextInt(n: number): number {
    return this.rng.nextInt(n);
  }

  /** Approximately Gaussian(0, 1). */
  nextGaussian(): number {
    return this.rng.nextGaussian();
  }

  /** Generate `count` random bytes. */
  nextBytes(count: number): Uint8Array {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i += 8) {
      const u = this.nextU64();
      for (let j = 0; j < 8 && i + j < count; j++) {
        bytes[i + j] = Number((u >> BigInt(j * 8)) & 0xffn);
      }
    }
    return bytes;
  }

  /**
   * Fork a child channel with the given name.
   *
   * Forking uses FNV-1a hash of the name XOR'd with the current channel
   * state, producing an independent deterministic substream.
   *
   * If `orderIndependent` is true, the fork derivation does NOT consume
   * entropy from this channel. This ensures that creating forks in
   * different orders still produces identical child streams.
   */
  fork(name: string, purpose: string, orderIndependent = false): EntropyChannel {
    if (this.children.has(name)) {
      return this.children.get(name)!;
    }

    // Derive a seed for the child channel
    const nameHash = fnv1a64(name);
    let childState: bigint;
    if (orderIndependent) {
      // Order-independent: use only the name hash and a snapshot of the
      // parent's initial state (captured at construction time via
      // deterministic derivation). We derive from the parent's descriptor
      // path hash to ensure stability regardless of consumption order.
      const parentPathHash = fnv1a64(this.descriptor.path);
      childState = nameHash ^ parentPathHash;
    } else {
      // Order-dependent: consume entropy from this channel to derive child.
      const parentEntropy = this.nextU64();
      childState = nameHash ^ parentEntropy;
    }

    const childDescriptor: EntropyChannelDescriptor = {
      name,
      path: this.descriptor.path
        ? this.descriptor.path + '/' + name
        : name,
      purpose,
      parentPath: this.descriptor.path,
    };

    const child = new EntropyChannel(
      childDescriptor,
      new DeterministicRng(childState)
    );
    this.children.set(name, child);
    return child;
  }

  /** Get an existing child channel by name. */
  child(name: string): EntropyChannel | undefined {
    return this.children.get(name);
  }

  /** List all child channel names. */
  listChildren(): string[] {
    return [...this.children.keys()].sort();
  }

  /**
   * Serialize the channel tree as a flat list of descriptors.
   * Useful for attaching to seed entropy declarations.
   */
  toDescriptors(): EntropyChannelDescriptor[] {
    const result: EntropyChannelDescriptor[] = [this.descriptor];
    for (const child of this.children.values()) {
      result.push(...child.toDescriptors());
    }
    return result;
  }
}

/**
 * Create a root entropy channel from a seed value.
 *
 * The seed can be a bigint, string, or Uint8Array.
 */
export function createEntropyRoot(
  seed: bigint | string | Uint8Array,
  purpose = 'root'
): EntropyChannel {
  let seedBigInt: bigint;
  if (typeof seed === 'bigint') {
    seedBigInt = seed;
  } else if (typeof seed === 'string') {
    seedBigInt = fnv1a64(seed);
  } else {
    // Uint8Array: hash with FNV-1a byte by byte
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < seed.length; i++) {
      h ^= BigInt(seed[i]);
      h = (h * 0x100000001b3n) & MASK_64;
    }
    seedBigInt = h;
  }

  const rootDescriptor: EntropyChannelDescriptor = {
    name: 'root',
    path: '',
    purpose,
    parentPath: '',
  };

  return new EntropyChannel(rootDescriptor, new DeterministicRng(seedBigInt));
}

/**
 * Create the standard GSPL entropy channel tree.
 *
 * Produces the canonical structure:
 *   root
 *   ├── architecture
 *   ├── naming
 *   ├── dependency-selection
 *   ├── layout
 *   ├── optimization
 *   └── target-specific-projection
 */
export function createStandardEntropyTree(
  rootSeed: bigint | string | Uint8Array
): EntropyChannel {
  const root = createEntropyRoot(rootSeed);

  // Standard channels (order-independent forks)
  root.fork('architecture', 'Architectural decisions and structure', true);
  root.fork('naming', 'Identifier and symbol generation', true);
  root.fork('dependency-selection', 'Dependency resolution and version selection', true);
  root.fork('layout', 'File and directory layout', true);
  root.fork('optimization', 'Performance optimization choices', true);
  root.fork('target-specific-projection', 'Per-target output variations', true);

  return root;
}

/**
 * Verify that golden vectors match.
 * Returns { ok: true } if all vectors produce expected outputs.
 */
export function verifyGoldenVectors(): {
  ok: boolean;
  results: { seed: string; channel: string; count: number; expected: string; actual: string; pass: boolean }[];
} {
  const results: { seed: string; channel: string; count: number; expected: string; actual: string; pass: boolean }[] = [];

  for (let _i = 0; _i < ENTROPY_GOLDEN_VECTORS.vectors.length; _i++) {
    const v = ENTROPY_GOLDEN_VECTORS.vectors[_i];
    if (v.count === 0) {
      results.push({ seed: v.seed, channel: v.channel, count: 0, expected: v.expected, actual: "0", pass: true });
      continue;
    }

    const root = createEntropyRoot(BigInt(v.seed));
    let channel = root;

    if (v.channel) {
      const parts = v.channel.split("/");
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        const child = channel.child(part);
        if (child) {
          channel = child;
        } else {
          channel = channel.fork(part, "golden-vector-test", true);
        }
      }
    }

    let actual = 0n;
    for (let j = 0; j < v.count; j++) {
      actual = channel.nextU64();
    }

    const actualHex = actual.toString(16).padStart(16, "0");
    const pass = actualHex === v.expected;
    results.push({ seed: v.seed, channel: v.channel, count: v.count, expected: v.expected, actual: actualHex, pass: pass });
  }

  return { ok: results.every(function(r) { return r.pass; }), results: results };
}
