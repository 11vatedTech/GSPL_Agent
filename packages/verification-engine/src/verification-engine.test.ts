import { describe, it, expect, beforeEach } from 'vitest';
import { createVerificationEngine, type VerificationEngine } from './verification-engine.js';

describe('Verification Engine', () => {
  let ve: VerificationEngine;

  beforeEach(() => {
    ve = createVerificationEngine();
  });

  it('verifies requirement satisfaction', () => {
    const result = ve.verifyRequirement('REQ-1', 'expected', 'expected');
    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(1.0);
  });

  it('detects requirement failure', () => {
    const result = ve.verifyRequirement('REQ-2', 'expected', 'actual');
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('verifies artifact existence (async)', async () => {
    const result = await ve.verifyArtifactExists('./package.json');
    expect(result.passed).toBeDefined();
    expect(result.type).toBe('ARTIFACT_EXISTENCE');
  });

  it('compilation verification requires compiler function', () => {
    // Without compiler function, returns not-passed with reason
    const result = ve.verifyCompilation();
    expect(result.passed).toBe(false);
    expect(result.errors[0].code).toBe('NO_COMPILER');
  });

  it('compilation verification with compiler works', () => {
    const result = ve.verifyCompilation(() => ({ success: true, errors: [] }));
    expect(result.passed).toBe(true);
  });

  it('test suite verification requires test runner', () => {
    const result = ve.verifyTestSuite();
    expect(result.passed).toBe(false);
    expect(result.errors[0].code).toBe('NO_TEST_RUNNER');
  });

  it('test suite verification with runner works', () => {
    const result = ve.verifyTestSuite(() => ({ passed: 5, failed: 0, errors: [] }));
    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(1.0);
  });

  it('reports test failures correctly', () => {
    const result = ve.verifyTestSuite(() => ({ passed: 3, failed: 2, errors: ['test_b failed'] }));
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('verifies security policy', () => {
    const policy = { constitutionalInvariants: ['no-ambient-authority'], defaultEffect: 'DENY' };
    const result = ve.verifySecurityPolicy(policy);
    expect(result.passed).toBe(true);
  });

  it('security policy without invariants fails', () => {
    const result = ve.verifySecurityPolicy({});
    // Should detect missing invariants
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('verifies provenance', () => {
    const result = ve.verifyProvenance({ hash: 'abc123', lineage: ['parent-hash'] });
    expect(result.passed).toBe(true);
  });

  it('provenance without lineage fails', () => {
    const result = ve.verifyProvenance({ hash: 'abc123', lineage: [] });
    expect(result.passed).toBe(false);
  });

  it('high-risk verification requires independent verifier', () => {
    const base = ve.verifyRequirement('REQ-HR', 'expected', 'expected');
    const hr = ve.verifyHighRisk(base, 'security-analysis-organ');
    expect(hr.independentVerifier).toBe('security-analysis-organ');
  });

  it('aggregates multiple verification results', () => {
    const r1 = ve.verifyRequirement('R1', 'x', 'x');
    const r2 = ve.verifyRequirement('R2', 'y', 'y');
    const agg = ve.aggregateResults([r1, r2]);
    expect(agg.passed).toBe(true);
    expect(agg.confidence).toBeGreaterThan(0);
  });

  it('aggregation detects any failure', () => {
    const r1 = ve.verifyRequirement('R1', 'x', 'x');
    const r2 = ve.verifyRequirement('R2', 'a', 'b');
    const agg = ve.aggregateResults([r1, r2]);
    expect(agg.passed).toBe(false);
  });
});
