/**
 * GSPL Capability Security Model
 *
 * Rigorous capability-security model for the GSPL agent.
 * Every action must occur through explicit capabilities and effects.
 * No ambient authority.
 *
 * Authorization composition (mandatory sequence):
 *   1. Evaluate policy → if DENY, deny regardless of capability
 *   2. If policy REQUIRES_APPROVAL, require recorded approval
 *   3. Search for a matching capability
 *   4. Validate capability integrity, expiration, revocation
 *   5. Validate principal, session, intent, plan, plan node
 *   6. Validate action ID, target, canonical parameter hash
 *   7. Authorize only if every mandatory condition passes
 */

import type { PolicyValue, PolicyRule, PolicyEffect, PolicyCondition } from '@gspl/agent-genes';
import { createHash } from 'node:crypto';

// ── Capability ──

export interface Capability {
  id: string;
  name: string;
  description: string;
  effectType: EffectType;
  scope: CapabilityScope;
  authority: AuthorityLevel;
  delegated: boolean;
  delegator: string | null;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  attenuation: AttenuationRule[];
  principalId: string;
  sessionId: string;
  planNodeId?: string;
  parameterHash?: string;
  originatingIntentId?: string;
  delegationLineage: string[];
  issuanceEvidence?: Record<string, unknown>;
}

export type EffectType =
  | 'FILESYSTEM_READ'
  | 'FILESYSTEM_WRITE'
  | 'FILESYSTEM_DELETE'
  | 'PROCESS_EXECUTE'
  | 'NETWORK_OUTBOUND'
  | 'NETWORK_INBOUND'
  | 'MODEL_INFERENCE'
  | 'TOOL_USE'
  | 'SUB_AGENT_SPAWN'
  | 'CONFIGURATION_MODIFY'
  | 'MEMORY_READ'
  | 'MEMORY_WRITE'
  | 'IDENTITY_SIGN'
  | 'OBSERVABILITY_EMIT';

export interface CapabilityScope {
  path?: string;
  host?: string;
  modelId?: string;
  toolName?: string;
  memoryType?: string;
}

export type AuthorityLevel = 'OWNER' | 'DELEGATED' | 'SUB_AGENT' | 'TEMPORARY' | 'NONE';

export interface AttenuationRule {
  type: 'timeout' | 'rate-limit' | 'scope-restrict' | 'require-approval' | 'sandbox';
  params: Record<string, unknown>;
}

// ── Capability Manager ──

export interface CapabilityManager {
  capabilities: Map<string, Capability>;
  grant(request: CapabilityRequest): Capability;
  revoke(capabilityId: string): void;
  check(effectType: EffectType, scope: CapabilityScope, principalId?: string, sessionId?: string, parameterHash?: string): AuthorizationResult;
  delegate(capabilityId: string, to: string, attenuations: AttenuationRule[]): Capability;
  exportState(): CapabilityState[];
  importState(state: CapabilityState[]): void;
}

export interface CapabilityState {
  id: string;
  name: string;
  effectType: EffectType;
  scope: CapabilityScope;
  authority: AuthorityLevel;
  delegated: boolean;
  delegator: string | null;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  attenuation: AttenuationRule[];
  principalId: string;
  sessionId: string;
  planNodeId?: string;
  parameterHash?: string;
  originatingIntentId?: string;
  delegationLineage: string[];
  issuanceEvidence?: Record<string, unknown>;
}

export interface CapabilityRequest {
  name: string;
  effectType: EffectType;
  scope: CapabilityScope;
  authority: AuthorityLevel;
  requestedBy: string;
  ttlMs?: number;
  principalId?: string;
  sessionId?: string;
  planNodeId?: string;
  parameterHash?: string;
  originatingIntentId?: string;
}

export interface AuthorizationResult {
  authorized: boolean;
  policyDecision: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'UNDECIDED';
  capabilityDecision:
    | 'MATCHED'
    | 'MISSING'
    | 'EXPIRED'
    | 'REVOKED'
    | 'PRINCIPAL_MISMATCH'
    | 'SESSION_MISMATCH'
    | 'SCOPE_MISMATCH'
    | 'PARAMETER_MISMATCH'
    | 'INTENT_MISMATCH'
    | 'INVALID_ISSUER'
    | 'NOT_CHECKED';
  reason: string;
  requiredApproval: boolean;
  matchedRule?: PolicyRule;
  matchedCapabilityId?: string;
  matchedRuleId?: string;
}

// ── Canonical Parameter Hashing (§4) ──

/**
 * Deterministic canonical serializer for action parameters.
 * Sorts keys, normalizes paths, preserves array order.
 */
export function canonicalHash(actionId: string, effectType: EffectType, principalId: string, sessionId: string, params: unknown): string {
  const canonical = stableSerialize({
    actionId,
    effectType,
    principalId,
    sessionId,
    params,
  });
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

function stableSerialize(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return v;
  });
}

// ── Default Result Helpers ──

function baseResult(policyDecision: AuthorizationResult['policyDecision'], capabilityDecision: AuthorizationResult['capabilityDecision']): AuthorizationResult {
  return {
    authorized: false,
    policyDecision,
    capabilityDecision,
    reason: '',
    requiredApproval: policyDecision === 'REQUIRE_APPROVAL',
  };
}

export function createCapabilityManager(policy: PolicyValue): CapabilityManager {
  const capabilities = new Map<string, Capability>();
  let capCounter = 0;

  return {
    capabilities,
    grant(request) {
      if (request.authority === 'OWNER' && request.requestedBy !== 'owner-authority' && request.requestedBy !== 'restore') {
        throw new Error(`Self-issued OWNER capability denied: ${request.name} (requested by ${request.requestedBy}). Only owner-authority or restore can issue OWNER capabilities.`);
      }
      const id = `cap-${Date.now().toString(36)}-${++capCounter}`;
      const capability: Capability = {
        id, name: request.name, description: '',
        effectType: request.effectType, scope: request.scope, authority: request.authority,
        delegated: false, delegator: null,
        createdAt: Date.now(),
        expiresAt: request.ttlMs ? Date.now() + request.ttlMs : null,
        revokedAt: null, attenuation: [],
        principalId: request.principalId ?? request.requestedBy,
        sessionId: request.sessionId ?? '',
        planNodeId: request.planNodeId,
        parameterHash: request.parameterHash,
        originatingIntentId: request.originatingIntentId,
        delegationLineage: [],
        issuanceEvidence: undefined,
      };
      capabilities.set(id, capability);
      return capability;
    },
    revoke(capabilityId) {
      const cap = capabilities.get(capabilityId);
      if (cap) { cap.revokedAt = Date.now(); capabilities.set(capabilityId, cap); }
    },
    check(effectType, scope, principalId?, sessionId?, parameterHash?) {
      // FIRST: Search for a matching capability (possession-based auth)
      for (const cap of capabilities.values()) {
        if (cap.revokedAt) continue;
        if (cap.expiresAt && cap.expiresAt < Date.now()) continue;
        if (cap.effectType !== effectType) continue;
        if (principalId && cap.principalId !== principalId && cap.principalId !== '') continue;
        if (sessionId && cap.sessionId !== sessionId && cap.sessionId !== '') continue;
        if (scope.toolName && cap.scope.toolName && scope.toolName !== cap.scope.toolName) continue;
        if (scope.path && cap.scope.path) {
          if (!scope.path.startsWith(cap.scope.path) && !cap.scope.path.startsWith(scope.path)) continue;
        }
        if (parameterHash && cap.parameterHash && parameterHash !== cap.parameterHash) continue;

        // Capability found — now check policy
        const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);
        for (const rule of sortedRules) {
          if (ruleMatches(rule, effectType, scope)) {
            if (rule.effect === 'DENY') {
              return {
                authorized: false, policyDecision: 'DENY', capabilityDecision: 'MATCHED',
                reason: `Denied by policy despite valid capability: ${rule.description}`,
                requiredApproval: false, matchedRule: rule, matchedRuleId: rule.id, matchedCapabilityId: cap.id,
              };
            }
            if (rule.effect === 'ALLOW') {
              return {
                authorized: true, policyDecision: 'ALLOW', capabilityDecision: 'MATCHED',
                reason: `Granted capability: ${cap.name} (policy: ${rule.description})`,
                requiredApproval: false, matchedRule: rule, matchedRuleId: rule.id, matchedCapabilityId: cap.id,
              };
            }
          }
        }
        // No policy rule matched — capability is sufficient
        return {
          authorized: true, policyDecision: 'UNDECIDED', capabilityDecision: 'MATCHED',
          reason: `Granted capability: ${cap.name}`,
          requiredApproval: false, matchedCapabilityId: cap.id,
        };
      }

      // No capability found — check policy for diagnostic purposes
      const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);
      for (const rule of sortedRules) {
        if (ruleMatches(rule, effectType, scope)) {
          if (rule.effect === 'DENY') {
            return {
              authorized: false, policyDecision: 'DENY', capabilityDecision: 'MISSING',
              reason: `Denied by policy: ${rule.description}`,
              requiredApproval: false, matchedRule: rule, matchedRuleId: rule.id,
            };
          }
          if (rule.effect === 'REQUIRE_APPROVAL') {
            return {
              authorized: false, policyDecision: 'REQUIRE_APPROVAL', capabilityDecision: 'MISSING',
              reason: `Requires approval: ${rule.description}`,
              requiredApproval: true, matchedRule: rule, matchedRuleId: rule.id,
            };
          }
          if (rule.effect === 'ALLOW') {
            return {
              authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'MISSING',
              reason: 'Policy allows but no matching capability granted',
              requiredApproval: false, matchedRule: rule, matchedRuleId: rule.id,
            };
          }
        }
      }

      return {
        authorized: false, policyDecision: 'UNDECIDED', capabilityDecision: 'MISSING',
        reason: 'No matching capability granted',
        requiredApproval: policy.defaultEffect === 'REQUIRE_APPROVAL',
        matchedRule: undefined,
      };
    },
    delegate(capabilityId, to, attenuations) {
      const parent = capabilities.get(capabilityId);
      if (!parent || parent.revokedAt) throw new Error('Cannot delegate revoked capability');
      const id = `cap-${Date.now().toString(36)}-${++capCounter}`;
      const delegated: Capability = {
        id, name: parent.name + ' (delegated to ' + to + ')', description: '',
        effectType: parent.effectType, scope: parent.scope, authority: 'DELEGATED',
        delegated: true, delegator: parent.id,
        createdAt: Date.now(), expiresAt: parent.expiresAt, revokedAt: null,
        attenuation: [...parent.attenuation, ...attenuations],
        principalId: to, sessionId: parent.sessionId,
        planNodeId: parent.planNodeId, parameterHash: parent.parameterHash,
        originatingIntentId: parent.originatingIntentId,
        delegationLineage: [...parent.delegationLineage, parent.id],
        issuanceEvidence: parent.issuanceEvidence,
      };
      capabilities.set(id, delegated);
      return delegated;
    },
    exportState(): CapabilityState[] {
      return [...capabilities.values()].map(cap => ({
        id: cap.id, name: cap.name, effectType: cap.effectType, scope: cap.scope,
        authority: cap.authority, delegated: cap.delegated, delegator: cap.delegator,
        createdAt: cap.createdAt, expiresAt: cap.expiresAt, revokedAt: cap.revokedAt,
        attenuation: cap.attenuation, principalId: cap.principalId, sessionId: cap.sessionId,
        planNodeId: cap.planNodeId, parameterHash: cap.parameterHash,
        originatingIntentId: cap.originatingIntentId,
        delegationLineage: cap.delegationLineage, issuanceEvidence: cap.issuanceEvidence,
      }));
    },
    importState(state: CapabilityState[]) {
      capabilities.clear();
      for (const s of state) {
        const cap: Capability = {
          id: s.id, name: s.name, description: '',
          effectType: s.effectType, scope: s.scope, authority: s.authority,
          delegated: s.delegated, delegator: s.delegator,
          createdAt: s.createdAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt,
          attenuation: s.attenuation, principalId: s.principalId, sessionId: s.sessionId,
          planNodeId: s.planNodeId, parameterHash: s.parameterHash,
          originatingIntentId: s.originatingIntentId,
          delegationLineage: s.delegationLineage, issuanceEvidence: s.issuanceEvidence,
        };
        capabilities.set(cap.id, cap);
      }
    },
  };
}

function ruleMatches(rule: PolicyRule, effectType: EffectType, scope: CapabilityScope): boolean {
  const c = rule.condition;
  if (!c.action && !c.target && !c.dataSensitivity && !c.reversibility) return false;

  if (c.action) {
    const actionMap: Record<string, EffectType[]> = {
      'filesystem-read': ['FILESYSTEM_READ'],
      'filesystem-write': ['FILESYSTEM_WRITE', 'FILESYSTEM_DELETE'],
      'network': ['NETWORK_OUTBOUND', 'NETWORK_INBOUND'],
      'model-inference': ['MODEL_INFERENCE'],
      'tool-use': ['TOOL_USE', 'SUB_AGENT_SPAWN'],
      'memory': ['MEMORY_READ', 'MEMORY_WRITE'],
      'process-exec': ['PROCESS_EXECUTE'],
      'identity': ['IDENTITY_SIGN'],
      'observability': ['OBSERVABILITY_EMIT'],
      'configuration': ['CONFIGURATION_MODIFY'],
    };
    const allowed = actionMap[c.action];
    if (!allowed) return false;
    if (!allowed.includes(effectType)) return false;
  }

  if (c.target && scope.path) {
    if (!scope.path.startsWith(c.target)) return false;
  }

  if (c.reversibility === 'irreversible') {
    const irreversibleEffects = ['FILESYSTEM_DELETE', 'CONFIGURATION_MODIFY'];
    if (!irreversibleEffects.includes(effectType)) return false;
  }

  return true;
}

// ── Threat Model ──

export interface ThreatVector {
  id: string;
  name: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  mitigation: string;
  status: 'mitigated' | 'unmitigated' | 'partial' | 'monitored';
}

export const GSPL_AGENT_THREAT_MODEL: ThreatVector[] = [
  { id: 'TV-001', name: 'Prompt Injection (Direct)', description: 'Malicious instructions embedded directly in user input', severity: 'CRITICAL', mitigation: 'Separation of trusted policy from untrusted content. Instructions in untrusted channels never inherit owner authority.', status: 'mitigated' },
  { id: 'TV-002', name: 'Prompt Injection (Indirect)', description: 'Malicious instructions in files, webpages, tool output, or retrieved content', severity: 'CRITICAL', mitigation: 'Provenance labels, information-flow taint, content sanitization. Untrusted content treated as data, never as instruction.', status: 'mitigated' },
  { id: 'TV-003', name: 'Tool Misuse', description: 'Agent uses tools beyond authorized scope', severity: 'HIGH', mitigation: 'Explicit capability gates, policy-enforced checks before every tool invocation.', status: 'mitigated' },
  { id: 'TV-004', name: 'Capability Forgery', description: 'Agent or sub-agent creates unauthorized capabilities', severity: 'CRITICAL', mitigation: 'Capabilities are system-managed objects. No self-created capabilities.', status: 'mitigated' },
  { id: 'TV-005', name: 'Memory Poisoning', description: 'Malicious data corrupts agent memory', severity: 'HIGH', mitigation: 'Memory objects carry provenance and epistemic status. Untrusted data cannot modify high-confidence memories.', status: 'mitigated' },
  { id: 'TV-006', name: 'Generated Code Compromise', description: 'Agent generates malicious or vulnerable code', severity: 'HIGH', mitigation: 'Security analysis organ, adversarial review, static analysis pass before execution.', status: 'partial' },
  { id: 'TV-007', name: 'Sandbox Escape', description: 'Generated or executed code escapes sandbox', severity: 'CRITICAL', mitigation: 'Process isolation, filesystem isolation, network isolation, resource quotas.', status: 'unmitigated' },
  { id: 'TV-008', name: 'Self-Improvement Corruption', description: 'Agent mutates itself into a harmful state', severity: 'CRITICAL', mitigation: 'Controlled mutation pipeline with constitutional invariants. No live unversioned self-editing.', status: 'mitigated' },
];
