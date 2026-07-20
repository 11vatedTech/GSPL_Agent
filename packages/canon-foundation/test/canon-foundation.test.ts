import { describe, it, expect, beforeAll } from 'vitest';
import {
  GST_VERSION,
  GSED_MAGIC,
  GENE_TYPES,
  DOMAINS,
  KEYWORDS,
  SEVEN_AXES,
} from '../src/constants.js';
import {
  GENE_TYPE_REGISTRY,
  GENE_TYPES_COUNT,
  isCanonicalGeneType,
} from '../src/types/gene-types.js';
import { canonicalize, canonicalizeGene } from '../src/canonicalize/jcs.js';
import { hashSeed, verifyHash, sha256String, HASH_PREFIX, hashToRngSeed } from '../src/hash/sha256.js';
import { validateSeed } from '../src/validate/validator.js';
import { checkSevenAxes, SEVEN_AXES_COUNT } from '../src/validate/invariants.js';
import { makePrimordialDraft } from '../src/types/universal-seed.js';
import { DeterministicRng, fnv1a64 } from '../src/rng/deterministic.js';
import { startTick, completeTick, failTick, TICK_PHASES } from '../src/tick/cycle.js';
import type { UniversalSeed } from '../src/types/universal-seed.js';

describe('constants — locked canon values', () => {
  it('GST_VERSION is locked at 1.0', () => {
    expect(GST_VERSION).toBe('1.0');
  });
  it('GSED magic bytes are locked', () => {
    expect(GSED_MAGIC).toBe('GSED');
  });
  it('exactly 17 gene types are LOCKED per spec/02', () => {
    expect(GENE_TYPES.length).toBe(17);
    expect(GENE_TYPES_COUNT).toBe(17);
    expect(GENE_TYPES).toContain('scalar');
    expect(GENE_TYPES).toContain('sovereignty');
    expect(GENE_TYPES).not.toContain('experimental');
  });
  it('exactly 26 domains are declared per spec/00', () => {
    expect(DOMAINS.length).toBe(26);
    expect(DOMAINS).toContain('character');
    expect(DOMAINS).toContain('choreography');
  });
  it('exactly 26 keywords are reserved per spec/04', () => {
    expect(KEYWORDS.length).toBe(26);
    expect(KEYWORDS).toContain('seed');
    expect(KEYWORDS).toContain('signed');
  });
});

describe('gene-type registry', () => {
  it('all 17 types are registered', () => {
    expect(Object.keys(GENE_TYPE_REGISTRY).length).toBe(17);
  });
  it('sovereignty has mutationAllowed=false and crossoverAllowed=false', () => {
    expect(GENE_TYPE_REGISTRY.sovereignty.mutationAllowed).toBe(false);
    expect(GENE_TYPE_REGISTRY.sovereignty.crossoverAllowed).toBe(false);
  });
  it('isCanonicalGeneType rejects non-canonical ids', () => {
    expect(isCanonicalGeneType('scalar')).toBe(true);
    expect(isCanonicalGeneType('sovereignty')).toBe(true);
    expect(isCanonicalGeneType('experimental')).toBe(false);
    expect(isCanonicalGeneType('not-a-type')).toBe(false);
  });
});

describe('JCS canonicalization', () => {
  const seed = makePrimordialDraft(
    'character',
    {
      size: { type: 'scalar', value: 1.75 },
      archetype: { type: 'categorical', value: 'warrior' },
      palette: { type: 'vector', value: [0.2, 0.15, 0.1] },
    },
    { name: 'Iron Warrior' }
  );

  it('canonical form is deterministic (re-runs identical)', () => {
    const a = canonicalize(seed);
    const b = canonicalize(seed);
    expect(a).toEqual(b);
  });

  it('canonical form excludes $hash field', () => {
    const text = new TextDecoder().decode(canonicalize(seed));
    expect(text).not.toContain('$hash');
  });

  it('canonical form includes $gst, $domain, $name, $lineage, genes', () => {
    const text = new TextDecoder().decode(canonicalize(seed));
    expect(text).toContain('$gst');
    expect(text).toContain('$domain');
    expect(text).toContain('$name');
    expect(text).toContain('$lineage');
    expect(text).toContain('genes');
  });

  it('canonical form excludes $lineage.timestamp from hash material', () => {
    const withTimestamp = { ...seed, $lineage: { ...seed.$lineage, timestamp: '2026-04-06T12:00:00Z' } };
    const withoutTimestamp = { ...seed, $lineage: { ...seed.$lineage, timestamp: '1990-01-01T00:00:00Z' } };
    const a = canonicalize(withTimestamp as UniversalSeed);
    const b = canonicalize(withoutTimestamp as UniversalSeed);
    expect(a).toEqual(b); // timestamps are excluded
  });

  it('keys are sorted lexicographically within nested objects', () => {
    const reordered: UniversalSeed = {
      ...seed,
      genes: {
        archetype: seed.genes.archetype,
        size: seed.genes.size,
        palette: seed.genes.palette,
      },
    };
    expect(canonicalize(seed)).toEqual(canonicalize(reordered));
  });

  it('numeric values use shortest round-trippable form', () => {
    const s: UniversalSeed = makePrimordialDraft('character', {
      exact: { type: 'scalar', value: 1.5 },
    });
    const text = new TextDecoder().decode(canonicalize(s));
    expect(text).toContain('1.5');
    expect(text).not.toContain('1.50');
  });

  it('canonicalizes a single gene', () => {
    const bytes = canonicalizeGene({ type: 'scalar', value: 0.5 });
    expect(bytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes)).toContain('"scalar"');
  });
});

describe('SHA-256 hashing', () => {
  const seed = makePrimordialDraft('character', {
    size: { type: 'scalar', value: 1.75 },
  });

  it('produces a sha256:-prefixed content hash', () => {
    const h = hashSeed(seed);
    expect(h.startsWith(HASH_PREFIX)).toBe(true);
    expect(h.slice(HASH_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash is deterministic for identical seeds', () => {
    expect(hashSeed(seed)).toEqual(hashSeed(seed));
  });

  it('hash differs for different seed content', () => {
    const other = makePrimordialDraft('character', {
      size: { type: 'scalar', value: 1.76 },
    });
    expect(hashSeed(seed)).not.toEqual(hashSeed(other));
  });

  it('sha256String matches a known test vector', () => {
    // SHA-256 of empty string is a well-known vector
    expect(sha256String('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // SHA-256 of "abc" is a well-known vector
    expect(sha256String('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashToRngSeed derives a u64 from the first 8 bytes of the hash', () => {
    const h =
      'sha256:000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    const seedU64 = hashToRngSeed(h);
    expect(typeof seedU64).toBe('bigint');
    expect(seedU64 >= 0n).toBe(true);
  });

  it('verifyHash returns true when $hash matches canonical hash', () => {
    const h = hashSeed(seed);
    const signed: UniversalSeed = { ...seed, $hash: h };
    expect(verifyHash(signed)).toBe(true);
  });
  it('verifyHash returns false when $hash does not match', () => {
    const signed: UniversalSeed = { ...seed, $hash: 'sha256:' + '0'.repeat(64) };
    expect(verifyHash(signed)).toBe(false);
  });
});

describe('validator — 8 invariants per spec/01', () => {
  it('validates a well-formed primordial draft', () => {
    const seed = makePrimordialDraft('character', {
      size: { type: 'scalar', value: 1.75 },
    });
    const r = validateSeed(seed);
    expect(r.ok).toBe(true);
  });

  it('rejects unknown $gst (invariant 8)', () => {
    const seed = makePrimordialDraft('character', {
      size: { type: 'scalar', value: 1.75 },
    });
    const r = validateSeed({ ...seed, $gst: '2.0' as never });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.invariant === 8)).toBe(true);
    }
  });

  it('rejects unknown domain (invariant 6)', () => {
    const seed = makePrimordialDraft('character', {
      size: { type: 'scalar', value: 1.75 },
    });
    const r = validateSeed({ ...seed, $domain: 'unknown' as never });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.invariant === 6)).toBe(true);
    }
  });  it('rejects unknown gene type (invariant 4)', () => {
    const seed = makePrimordialDraft(
      'character',
      {
        size: { type: 'unknown_type' as any, value: 1 },
      }
    );
    const r = validateSeed(seed);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.invariant === 4)).toBe(true);
    }
  });

  it('rejects gene name starting with $ (invariant 3)', () => {
    const seed = makePrimordialDraft('character', {
      $illegalName: { type: 'scalar', value: 1 },
    } as never);
    const r = validateSeed(seed);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.invariant === 3)).toBe(true);
    }
  });

  it('rejects bad hash (invariant 1)', () => {
    const seed = makePrimordialDraft('character', {
      size: { type: 'scalar', value: 1.75 },
    });
    const r = validateSeed({ ...seed, $hash: 'sha256:' + '0'.repeat(64) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.invariant === 1)).toBe(true);
    }
  });

  it('rejects derivative seed with empty parents (invariant 2)', () => {
    const r = validateSeed({
      $gst: '1.0',
      $domain: 'character',
      $lineage: { operation: 'mutate', parents: [], generation: 1 },
      genes: { size: { type: 'scalar', value: 1.75 } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.invariant === 2)).toBe(true);
    }
  });
});

describe('seven-axis discipline', () => {
  it('there are exactly 7 axes', () => {
    expect(SEVEN_AXES.length).toBe(7);
    expect(SEVEN_AXES_COUNT).toBe(7);
    expect(SEVEN_AXES).toContain('signed');
    expect(SEVEN_AXES).toContain('typed');
    expect(SEVEN_AXES).toContain('lineage-tracked');
    expect(SEVEN_AXES).toContain('graph-structured');
    expect(SEVEN_AXES).toContain('confidence-bearing');
    expect(SEVEN_AXES).toContain('rollback-able');
    expect(SEVEN_AXES).toContain('differentiable');
  });

  it('reports per-axis present/absent for an unsigned seed', () => {
    const seed = makePrimordialDraft('character', {
      size: { type: 'scalar', value: 1.75 },
    });
    const report = checkSevenAxes(seed);
    expect(report.axes.length).toBe(7);
    expect(report.axes.find((a) => a.axis === 'signed')?.present).toBe(false);
    expect(report.axes.find((a) => a.axis === 'differentiable')?.present).toBe(true);
    expect(report.allPresent).toBe(false);
    expect(report.missing).toContain('signed');
    expect(report.missing).toContain('lineage-tracked');
    expect(report.missing).toContain('confidence-bearing');
  });

  it('records typed evidence per axis', () => {
    const seed = makePrimordialDraft('character', {
      size: { type: 'scalar', value: 1.75 },
    }, {
      metadata: { engine_version: '1.2.3', license: 'MIT' }
    });
    const report = checkSevenAxes(seed);
    for (const a of report.axes) expect(a.evidence.length).toBeGreaterThan(0);
  });
});

describe('deterministic RNG', () => {
  it('produces identical streams from the same seed', () => {
    const a = new DeterministicRng(42n);
    const b = new DeterministicRng(42n);
    for (let i = 0; i < 100; i++) {
      expect(a.nextU64()).toEqual(b.nextU64());
    }
  });
  it('produces different streams from different seeds', () => {
    const a = new DeterministicRng(42n);
    const b = new DeterministicRng(43n);
    expect(a.nextU64()).not.toEqual(b.nextU64());
  });
  it('nextDouble is in [0, 1)', () => {
    const r = new DeterministicRng(1n);
    for (let i = 0; i < 100; i++) {
      const v = r.nextDouble();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('nextInt is in [0, n)', () => {
    const r = new DeterministicRng(1n);
    for (let i = 0; i < 100; i++) {
      const v = r.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });
  it('nextGaussian has approximately zero mean', () => {
    const r = new DeterministicRng(7n);
    let sum = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) sum += r.nextGaussian();
    const mean = sum / N;
    expect(Math.abs(mean)).toBeLessThan(0.2);
  });
  it('fnv1a64 is deterministic and consistent', () => {
    expect(fnv1a64('test')).toEqual(fnv1a64('test'));
    expect(fnv1a64('a')).not.toEqual(fnv1a64('b'));
  });
  it('substream produces an independent stream', () => {
    const r = new DeterministicRng(42n);
    const s1 = r.substream('gene_a');
    const s2 = r.substream('gene_b');
    expect(s1.nextU64()).not.toEqual(s2.nextU64());
  });
});

describe('tick cycle scaffolding', () => {
  it('declares exactly 8 phases', () => {
    expect(TICK_PHASES.length).toBe(8);
    expect(TICK_PHASES).toEqual([
      'intake', 'validate', 'plan', 'mutate', 'execute', 'reduce', 'emit', 'persist',
    ]);
  });
  it('a tick can be started, completed, and failed', () => {
    const tick = startTick({ kind: 'grow', engine: 'sprite' });
    expect(tick.operation.kind).toBe('grow');
    expect(tick.phase_index).toBe(0);
    const ok = completeTick(tick);
    expect(ok.status).toBe('completed');
    const failed = failTick(tick, 'validate', 'BAD_HASH', 'seed hash mismatch');
    expect(failed.status).toBe('failed');
    expect(failed.error).toBeDefined();
    expect(failed.error!.phase).toBe('validate');
  });
});
