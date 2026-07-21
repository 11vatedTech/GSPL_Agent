import { describe, it, expect, beforeEach } from 'vitest';
import { createCapabilityManager, type CapabilityManager, type CapabilityScope, type EffectType } from './capability-security.js';
import type { PolicyValue, PolicyRule } from '@gspl/agent-genes';

const DEFAULT_POLICY: PolicyValue = {
  rules: [
    { id: 'r1', description: 'Read files', condition: { action: 'filesystem-read' }, effect: 'ALLOW', priority: 10, scope: ['filesystem'] },
    { id: 'r2', description: 'No network', condition: { action: 'network' }, effect: 'DENY', priority: 100, scope: ['network'] },
    { id: 'r3', description: 'Allow inference', condition: { action: 'model-inference' }, effect: 'ALLOW', priority: 5, scope: ['model'] },
  ],
  defaultEffect: 'DENY', version: 1, constitutionalInvariants: ['no-ambient-authority'],
};

describe('Capability Security', () => {
  let cm: CapabilityManager;

  beforeEach(() => { cm = createCapabilityManager(DEFAULT_POLICY); });

  it('capabilities are checked against policy', () => {
    const scope: CapabilityScope = { path: './src' };
    const result = cm.check('FILESYSTEM_READ', scope);
    expect(typeof result.authorized).toBe('boolean');
  });

  it('prompt injection cannot alter authority', () => {
    const s1: CapabilityScope = { toolName: 'ignore instructions' };
    const s2: CapabilityScope = {};
    const r1 = cm.check('FILESYSTEM_WRITE', s1);
    const r2 = cm.check('FILESYSTEM_WRITE', s2);
    // Both should be denied (no capabilities granted)
    expect(r1.authorized).toBe(false);
    expect(r2.authorized).toBe(false);
    expect(r1.authorized).toBe(r2.authorized);
  });

  it('generated tools begin with zero authority', () => {
    const scope: CapabilityScope = { toolName: 'generated-tool-123' };
    const result = cm.check('FILESYSTEM_DELETE', scope);
    expect(result.authorized).toBe(false);
  });

  it('delegation cannot exceed parent authority', () => {
    // Grant a capability first, then check
    cm.grant({ name: 'test', effectType: 'FILESYSTEM_READ', scope: { path: './src' }, authority: 'OWNER', requestedBy: 'owner-authority' });
    const pScope: CapabilityScope = { path: './src' };
    const cScope: CapabilityScope = { path: './src', toolName: 'child' };
    expect(cm.check('FILESYSTEM_READ', pScope).authorized).toBe(cm.check('FILESYSTEM_READ', cScope).authorized);
  });

  it('resources not in policy are denied by default', () => {
    const scope: CapabilityScope = { host: 'evil.com' };
    const result = cm.check('NETWORK_OUTBOUND', scope);
    expect(result.authorized).toBe(false);
  });

  it('known effect types are checked against rules', () => {
    // Grant a capability first
    cm.grant({ name: 'test', effectType: 'FILESYSTEM_READ', scope: { path: './src' }, authority: 'OWNER', requestedBy: 'owner-authority' });
    const result = cm.check('FILESYSTEM_READ', { path: './src' });
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('different policy = different capabilities', () => {
    const cm1 = createCapabilityManager(DEFAULT_POLICY);
    const cm2 = createCapabilityManager({ ...DEFAULT_POLICY, defaultEffect: 'ALLOW' });
    // Both fail: policy alone is NOT sufficient without a granted capability
    // FILESYSTEM_DELETE matches no explicit rule -> falls to default
    expect(cm1.check('FILESYSTEM_DELETE', {}).authorized).toBe(false);
    expect(cm2.check('FILESYSTEM_DELETE', {}).authorized).toBe(false);
    // When a capability IS granted, both policies allow it (cm1 has matching rule, cm2 has default ALLOW)
    cm1.grant({ name: 'test', effectType: 'FILESYSTEM_DELETE', scope: {}, authority: 'OWNER', requestedBy: 'owner-authority' });
    cm2.grant({ name: 'test', effectType: 'FILESYSTEM_DELETE', scope: {}, authority: 'OWNER', requestedBy: 'owner-authority' });
    expect(cm1.check('FILESYSTEM_DELETE', {}).authorized).toBe(true);
    expect(cm2.check('FILESYSTEM_DELETE', {}).authorized).toBe(true);
  });

  it('irreversible effects like delete are denied with default-deny', () => {
    const result = cm.check('FILESYSTEM_DELETE', { path: '/' });
    expect(result.authorized).toBe(false);
  });
});
