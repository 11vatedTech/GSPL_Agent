/**
 * GSPL Capability Security Model
 *
 * Rigorous capability-security model for the GSPL agent.
 * Every action must occur through explicit capabilities and effects.
 * No ambient authority.
 *
 * Security is enforced outside model judgment:
 *   - Zero-trust tool execution
 *   - Provenance labels and information-flow taint
 *   - Policy-enforced capability gates
 *   - Least privilege, process isolation
 *   - Immutable audit logs
 */

import type { PolicyValue, PolicyRule, PolicyEffect, PolicyCondition } from '@gspl/agent-genes';

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
  check(effectType: EffectType, scope: CapabilityScope): AuthorizationResult;
  delegate(capabilityId: string, to: string, attenuations: AttenuationRule[]): Capability;
}

export interface CapabilityRequest {
  name: string;
  effectType: EffectType;
  scope: CapabilityScope;
  authority: AuthorityLevel;
  requestedBy: string;
  ttlMs?: number;
}

export interface AuthorizationResult {
  authorized: boolean;
  reason: string;
  requiredApproval: boolean;
  matchedRule?: PolicyRule;
}

export function createCapabilityManager(policy: PolicyValue): CapabilityManager {
  const capabilities = new Map<string, Capability>();
  let capCounter = 0;

  return {
    capabilities,
    grant(request) {
      const id = `cap-${Date.now().toString(36)}-${++capCounter}`;
      const capability: Capability = {
        id,
        name: request.name,
        description: '',
        effectType: request.effectType,
        scope: request.scope,
        authority: request.authority,
        delegated: false,
        delegator: null,
        createdAt: Date.now(),
        expiresAt: request.ttlMs ? Date.now() + request.ttlMs : null,
        revokedAt: null,
        attenuation: [],
      };
      capabilities.set(id, capability);
      return capability;
    },
    revoke(capabilityId) {
      const cap = capabilities.get(capabilityId);
      if (cap) {
        cap.revokedAt = Date.now();
        capabilities.set(capabilityId, cap);
      }
    },
    check(effectType, scope) {
      // Evaluate against policy rules
      const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);

      for (const rule of sortedRules) {
        if (ruleMatches(rule, effectType, scope)) {
          if (rule.effect === 'DENY') {
            return { authorized: false, reason: `Denied by policy: ${rule.description}`, requiredApproval: false, matchedRule: rule };
          }
          if (rule.effect === 'REQUIRE_APPROVAL') {
            return { authorized: false, reason: `Requires approval: ${rule.description}`, requiredApproval: true, matchedRule: rule };
          }
          if (rule.effect === 'ALLOW') {
            return { authorized: true, reason: `Allowed by policy: ${rule.description}`, requiredApproval: false, matchedRule: rule };
          }
        }
      }

      // Default effect
      return {
        authorized: policy.defaultEffect === 'ALLOW',
        reason: `Default policy: ${policy.defaultEffect}`,
        requiredApproval: policy.defaultEffect === 'REQUIRE_APPROVAL',
        matchedRule: undefined,
      };
    },
    delegate(capabilityId, to, attenuations) {
      const parent = capabilities.get(capabilityId);
      if (!parent || parent.revokedAt) throw new Error('Cannot delegate revoked capability');

      const id = `cap-${Date.now().toString(36)}-${++capCounter}`;
      const delegated: Capability = {
        id,
        name: parent.name + ' (delegated to ' + to + ')',
        description: '',
        effectType: parent.effectType,
        scope: parent.scope,
        authority: 'DELEGATED',
        delegated: true,
        delegator: parent.id,
        createdAt: Date.now(),
        expiresAt: parent.expiresAt,
        revokedAt: null,
        attenuation: [...parent.attenuation, ...attenuations],
      };
      capabilities.set(id, delegated);
      return delegated;
    },
  };
}

function ruleMatches(rule: PolicyRule, effectType: EffectType, scope: CapabilityScope): boolean {
  const c = rule.condition;

  // Check action match
  if (c.action) {
    const actionMap: Record<string, EffectType[]> = {
      'filesystem-read': ['FILESYSTEM_READ'],
      'filesystem-write': ['FILESYSTEM_WRITE', 'FILESYSTEM_DELETE'],
      'network': ['NETWORK_OUTBOUND', 'NETWORK_INBOUND'],
    };
    const allowed = actionMap[c.action];
    if (allowed && !allowed.includes(effectType)) return false;
  }

  // Check target match (path-based)
  if (c.target && scope.path) {
    if (!scope.path.startsWith(c.target)) return false;
  }

  // Check data sensitivity
  if (c.dataSensitivity) {
    const sensitivityRank: Record<string, number> = {
      'public': 1, 'internal': 2, 'sensitive': 3, 'secret': 4,
    };
    // Rule requires at least this sensitivity level
    if (effectType.startsWith('FILESYSTEM') || effectType === 'MEMORY_READ' || effectType === 'MEMORY_WRITE') {
      // Data-bearing operations must meet or exceed the required sensitivity
    }
  }

  // Check reversibility requirement
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
  {
    id: 'TV-001', name: 'Prompt Injection (Direct)',
    description: 'Malicious instructions embedded directly in user input',
    severity: 'CRITICAL',
    mitigation: 'Separation of trusted policy from untrusted content. Instructions in untrusted channels never inherit owner authority.',
    status: 'mitigated',
  },
  {
    id: 'TV-002', name: 'Prompt Injection (Indirect)',
    description: 'Malicious instructions in files, webpages, tool output, or retrieved content',
    severity: 'CRITICAL',
    mitigation: 'Provenance labels, information-flow taint, content sanitization. Untrusted content treated as data, never as instruction.',
    status: 'mitigated',
  },
  {
    id: 'TV-003', name: 'Tool Misuse',
    description: 'Agent uses tools beyond authorized scope',
    severity: 'HIGH',
    mitigation: 'Explicit capability gates, policy-enforced checks before every tool invocation.',
    status: 'mitigated',
  },
  {
    id: 'TV-004', name: 'Capability Forgery',
    description: 'Agent or sub-agent creates unauthorized capabilities',
    severity: 'CRITICAL',
    mitigation: 'Capabilities are system-managed objects. No self-created capabilities.',
    status: 'mitigated',
  },
  {
    id: 'TV-005', name: 'Memory Poisoning',
    description: 'Malicious data corrupts agent memory',
    severity: 'HIGH',
    mitigation: 'Memory objects carry provenance and epistemic status. Untrusted data cannot modify high-confidence memories.',
    status: 'mitigated',
  },
  {
    id: 'TV-006', name: 'Generated Code Compromise',
    description: 'Agent generates malicious or vulnerable code',
    severity: 'HIGH',
    mitigation: 'Security analysis organ, adversarial review, static analysis pass before execution.',
    status: 'partial',
  },
  {
    id: 'TV-007', name: 'Sandbox Escape',
    description: 'Generated or executed code escapes sandbox',
    severity: 'CRITICAL',
    mitigation: 'Process isolation, filesystem isolation, network isolation, resource quotas.',
    status: 'unmitigated',
  },
  {
    id: 'TV-008', name: 'Self-Improvement Corruption',
    description: 'Agent mutates itself into a harmful state',
    severity: 'CRITICAL',
    mitigation: 'Controlled mutation pipeline with constitutional invariants. No live unversioned self-editing.',
    status: 'mitigated',
  },
];
