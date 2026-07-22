/**
 * GSPL Capability Security Model — HARDENED AUTHORITY BOUNDARY
 *
 * Rigorous capability-security model for the GSPL agent.
 * Every action must occur through explicit capabilities and effects.
 * No ambient authority. No self-issued OWNER capabilities.
 *
 * Authorization composition (mandatory sequence — §4):
 *   1. Canonicalize request → evaluate policy
 *   2. If DENY → deny regardless of capability
 *   3. If REQUIRE_APPROVAL → require valid approval evidence
 *   4. If no matching ALLOW rule → deny
 *   5. Search for a matching capability
 *   6. Validate capability integrity, expiration, revocation
 *   7. Validate principal, session, intent, plan, plan node
 *   8. Validate action ID, target, canonical parameter hash
 *   9. Validate delegation and attenuation
 *   10. Authorize only if EVERY mandatory condition passes
 *
 * Policy AND capability possession are BOTH required.
 * Policy alone never authorizes. Capability alone never authorizes.
 */

import type { PolicyValue, PolicyRule, PolicyEffect, PolicyCondition } from '@gspl/agent-genes';
import { createHash } from 'node:crypto';
import { relative, resolve, normalize } from 'node:path';

// ── Capability Binding (§2) ──

export interface CapabilityBinding {
  principalId: string;
  sessionId: string;
  intentId: string;
  planId: string;
  planNodeId: string;
  actionId: string;
  effectType: EffectType;
  canonicalTarget: string | null;
  canonicalParameterHash: string;
}

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
  planNodeId: string;
  planId: string;
  actionId: string;
  intentId: string;
  parameterHash?: string;
  originatingIntentId?: string;
  delegationLineage: string[];
  issuanceEvidence?: Record<string, unknown>;
  binding?: CapabilityBinding;
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

// ── §3: Issuance Envelope ──

export interface CapabilityIssuanceEnvelope {
  version: number;
  providerId: string;
  principalId: string;
  sessionId: string;
  intentId: string;
  planId: string;
  planNodeId: string;
  actionId: string;
  effectType: EffectType;
  canonicalTarget: string | null;
  canonicalParameters: unknown;
  canonicalParameterHash: string;
  requestedScope: CapabilityScope;
  risk: string;
  reversibility: string;
  requiresApproval: boolean;
  requestedTtlMs: number | null;
}

export function computeIssuanceRequestHash(envelope: CapabilityIssuanceEnvelope): string {
  const serializable = {
    v: envelope.version,
    providerId: envelope.providerId,
    principalId: envelope.principalId,
    sessionId: envelope.sessionId,
    intentId: envelope.intentId,
    planId: envelope.planId,
    planNodeId: envelope.planNodeId,
    actionId: envelope.actionId,
    effectType: envelope.effectType,
    canonicalTarget: envelope.canonicalTarget,
    canonicalParameterHash: envelope.canonicalParameterHash,
    requestedScope: normalizeScopeForHashing(envelope.requestedScope),
    risk: envelope.risk,
    reversibility: envelope.reversibility,
    requiresApproval: envelope.requiresApproval,
    requestedTtlMs: envelope.requestedTtlMs,
  };
  const serialized = stableSerialize(serializable);
  return createHash('sha256').update(serialized, 'utf-8').digest('hex');
}

// ── Authorization Context (§1) ──

export interface AuthorizationContext {
  principalId: string;
  sessionId: string;
  intentId: string;
  planId: string;
  planNodeId: string;
  capabilityId: string;
  actionId: string;
  effectType: EffectType;
  canonicalTarget: string | null;
  canonicalParameterHash: string;
  approvalEvidenceId: string | null;
  issuanceRequestHash: string;
  providerId: string;
}

// ── Capability Manager ──

export interface CapabilityManager {
  capabilities: Map<string, Capability>;
  /** Direct grant — only allowed for restore (trusted checkpoint) and external authority import. */
  grant(request: CapabilityRequest): Capability;
  /** Accepts an externally-issued capability with approval evidence. §3 */
  acceptIssuedCapability(capability: Capability, evidence: ApprovalEvidence, requestHash: string): void;
  revoke(capabilityId: string): void;
  /** Policy-first authorization check. §4 */
  check(effectType: EffectType, scope: CapabilityScope, principalId?: string, sessionId?: string, parameterHash?: string): AuthorizationResult;
  /** §1: Exact capability ID authorization — retrieves by ID, validates all binding fields. */
  checkAuthorization(context: AuthorizationContext): AuthorizationResult;
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
  planNodeId: string;
  planId: string;
  actionId: string;
  intentId: string;
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
    | 'PLAN_MISMATCH'
    | 'PLAN_NODE_MISMATCH'
    | 'ACTION_MISMATCH'
    | 'TARGET_MISMATCH'
    | 'INVALID_ISSUER'
    | 'CAPABILITY_NOT_FOUND'
    | 'NOT_CHECKED';
  reason: string;
  requiredApproval: boolean;
  matchedRule?: PolicyRule;
  matchedCapabilityId?: string;
  matchedRuleId?: string;
}

// ── Canonical Parameter Hashing (§4) ──

const CANONICAL_VERSION = 1;

export function canonicalHash(
  effectType: EffectType,
  principalId: string,
  sessionId: string,
  scope: CapabilityScope,
  intentId?: string,
  planId?: string,
  planNodeId?: string,
  params?: unknown,
): string {
  if (params !== undefined) {
    validateSerializable(params, 'params');
  }
  const canonical = stableSerialize({
    v: CANONICAL_VERSION,
    effectType,
    principalId,
    sessionId,
    scope: normalizeScopeForHashing(scope),
    intentId: intentId ?? '',
    planId: planId ?? '',
    planNodeId: planNodeId ?? '',
    params: params ?? {},
  });
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

function normalizeScopeForHashing(scope: CapabilityScope): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  if (scope.path) normalized.path = normalize(scope.path).replace(/\\/g, '/');
  if (scope.toolName) normalized.toolName = scope.toolName;
  if (scope.host) normalized.host = scope.host;
  if (scope.modelId) normalized.modelId = scope.modelId;
  if (scope.memoryType) normalized.memoryType = scope.memoryType;
  return normalized;
}

function validateSerializable(value: unknown, path: string, ancestors: WeakSet<object> = new WeakSet()): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'function') throw new Error(`Unsupported type at ${path}: function`);
  if (typeof value === 'symbol') throw new Error(`Unsupported type at ${path}: symbol`);
  if (typeof value === 'bigint') throw new Error(`Unsupported type at ${path}: bigint (use explicit string encoding)`);
  if (typeof value === 'number' && !isFinite(value)) throw new Error(`Unsupported type at ${path}: non-finite number`);
  if (typeof value === 'object') {
    if (ancestors.has(value)) throw new Error(`Cycle detected at ${path}`);
    ancestors.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) validateSerializable(value[i], `${path}[${i}]`, ancestors);
    } else {
      for (const key of Object.keys(value)) {
        validateSerializable((value as Record<string, unknown>)[key], `${path}.${key}`, ancestors);
      }
    }
    ancestors.delete(value);
  }
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

// ── §8: Boundary-Safe Path Comparison ──

export function isPathWithinScope(requestedPath: string, scopePath: string): boolean {
  const normalizedReq = normalize(resolve(requestedPath)).replace(/\\/g, '/');
  const normalizedScope = normalize(resolve(scopePath)).replace(/\\/g, '/');
  if (normalizedReq === normalizedScope) return true;
  const rel = relative(normalizedScope, normalizedReq);
  if (rel === '' || rel.startsWith('..')) return false;
  if (process.platform === 'win32') {
    if (normalizedReq.toLowerCase() === normalizedScope.toLowerCase()) return true;
    const relLower = relative(normalizedScope.toLowerCase(), normalizedReq.toLowerCase());
    return relLower !== '' && !relLower.startsWith('..');
  }
  return true;
}

// ── Authority Provider (§2) ──

export interface AuthorityProvider {
  requestCapability(request: CapabilityIssuanceRequest): Promise<CapabilityIssuanceDecision>;
}

export interface CapabilityIssuanceRequest {
  name: string;
  effectType: EffectType;
  scope: CapabilityScope;
  principalId: string;
  sessionId: string;
  planNodeId?: string;
  parameterHash?: string;
  originatingIntentId?: string;
  ttlMs?: number;
}

export interface ApprovalEvidence {
  id: string;
  issuer: string;
  issuedAt: number;
  requestHash: string;
  signature?: string;
}

export type CapabilityIssuanceDecision =
  | { decision: 'APPROVED'; capability: Capability; approvalEvidence: ApprovalEvidence }
  | { decision: 'DENIED'; reason: string }
  | { decision: 'REQUIRES_OWNER_APPROVAL'; requestId: string };

export function createTestAuthorityProvider(generateId: (prefix?: string) => string): AuthorityProvider {
  return {
    async requestCapability(req) {
      const capId = `cap-${Date.now().toString(36)}-${generateId('auth')}`;
      const requestHash = canonicalHash(req.effectType, req.principalId, req.sessionId, req.scope);
      const capability: Capability = {
        id: capId, name: req.name, description: '',
        effectType: req.effectType, scope: req.scope, authority: 'OWNER',
        delegated: false, delegator: null,
        createdAt: Date.now(),
        expiresAt: req.ttlMs ? Date.now() + req.ttlMs : null,
        revokedAt: null, attenuation: [],
        principalId: req.principalId, sessionId: req.sessionId,
        planNodeId: req.planNodeId ?? '', parameterHash: req.parameterHash,
        planId: (req as any).planId ?? '', actionId: (req as any).actionId ?? '',
        intentId: req.originatingIntentId ?? '',
        originatingIntentId: req.originatingIntentId,
        delegationLineage: [],
        issuanceEvidence: { issuer: 'test-authority', timestamp: Date.now(), requestHash },
      };
      return {
        decision: 'APPROVED',
        capability,
        approvalEvidence: {
          id: 'approval-' + generateId('ev'),
          issuer: 'test-authority',
          issuedAt: Date.now(),
          requestHash,
        },
      };
    },
  };
}

export function createDenyAllAuthorityProvider(): AuthorityProvider {
  return {
    async requestCapability() {
      return { decision: 'DENIED', reason: 'All capability requests denied by policy' };
    },
  };
}

function baseResult(policyDecision: AuthorizationResult['policyDecision'], capabilityDecision: AuthorizationResult['capabilityDecision']): AuthorizationResult {
  return {
    authorized: false,
    policyDecision,
    capabilityDecision,
    reason: '',
    requiredApproval: policyDecision === 'REQUIRE_APPROVAL',
  };
}

// ── Factory ──

export function createCapabilityManager(policy: PolicyValue): CapabilityManager {
  const capabilities = new Map<string, Capability>();
  let capCounter = 0;

  return {
    capabilities,

    acceptIssuedCapability(capability, evidence, requestHash) {
      if (evidence.requestHash !== requestHash) {
        throw new Error(`Capability acceptance rejected: request hash mismatch (${evidence.requestHash} vs ${requestHash})`);
      }
      if (capability.id && capabilities.has(capability.id)) {
        throw new Error(`Capability acceptance rejected: duplicate ID ${capability.id}`);
      }
      if (!evidence.issuer || evidence.issuer === '') {
        throw new Error('Capability acceptance rejected: missing issuer identity');
      }
      if (!capability.effectType || !capability.principalId) {
        throw new Error('Capability acceptance rejected: missing required fields');
      }
      capability.issuanceEvidence = { issuer: evidence.issuer, approvalId: evidence.id, issuedAt: evidence.issuedAt, requestHash: evidence.requestHash };
      capabilities.set(capability.id, capability);
    },

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
        planNodeId: request.planNodeId ?? '',
        planId: '',
        actionId: '',
        intentId: '',
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
      const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);
      let policyDecision: AuthorizationResult['policyDecision'] = 'UNDECIDED';
      let matchedRule: PolicyRule | undefined;

      for (const rule of sortedRules) {
        if (ruleMatches(rule, effectType, scope)) {
          if (rule.effect === 'DENY') {
            return {
              authorized: false, policyDecision: 'DENY', capabilityDecision: 'NOT_CHECKED',
              reason: `Denied by policy: ${rule.description}`,
              requiredApproval: false, matchedRule: rule, matchedRuleId: rule.id,
            };
          }
          if (rule.effect === 'REQUIRE_APPROVAL') {
            policyDecision = 'REQUIRE_APPROVAL';
            matchedRule = rule;
            break;
          }
          if (rule.effect === 'ALLOW') {
            policyDecision = 'ALLOW';
            matchedRule = rule;
            break;
          }
        }
      }

      if (policyDecision === 'UNDECIDED') {
        if (policy.defaultEffect === 'ALLOW') {
          policyDecision = 'ALLOW';
        } else if (policy.defaultEffect === 'REQUIRE_APPROVAL') {
          policyDecision = 'REQUIRE_APPROVAL';
        } else {
          return {
            authorized: false, policyDecision: 'UNDECIDED', capabilityDecision: 'NOT_CHECKED',
            reason: `Default policy denies: no matching rule for effect ${effectType}`,
            requiredApproval: false,
          };
        }
      }

      if (policyDecision === 'REQUIRE_APPROVAL') {
        return {
          authorized: false, policyDecision: 'REQUIRE_APPROVAL', capabilityDecision: 'NOT_CHECKED',
          reason: `Requires owner approval: ${matchedRule?.description ?? 'policy requirement'}`,
          requiredApproval: true, matchedRule, matchedRuleId: matchedRule?.id,
        };
      }

      for (const cap of capabilities.values()) {
        if (cap.revokedAt) continue;
        if (cap.expiresAt && cap.expiresAt < Date.now()) continue;
        if (cap.effectType !== effectType) continue;
        if (principalId && cap.principalId !== principalId && cap.principalId !== '') continue;
        if (sessionId && cap.sessionId !== sessionId && cap.sessionId !== '') continue;
        if (scope.toolName && cap.scope.toolName && scope.toolName !== cap.scope.toolName) continue;
        if (scope.path && cap.scope.path) {
          if (!isPathWithinScope(scope.path, cap.scope.path)) continue;
        }
        if (parameterHash && cap.parameterHash && parameterHash !== cap.parameterHash) continue;
        return {
          authorized: true, policyDecision: 'ALLOW', capabilityDecision: 'MATCHED',
          reason: `Granted capability: ${cap.name} (policy: ${matchedRule?.description ?? 'default allow'})`,
          requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id,
        };
      }

      return {
        authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'MISSING',
        reason: 'Policy allows but no matching capability granted',
        requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id,
      };
    },

    /** §1: Exact capability ID authorization. */
    checkAuthorization(context: AuthorizationContext): AuthorizationResult {
      const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);
      let policyDecision: AuthorizationResult['policyDecision'] = 'UNDECIDED';
      let matchedRule: PolicyRule | undefined;

      for (const rule of sortedRules) {
        if (ruleMatches(rule, context.effectType, { toolName: context.actionId })) {
          if (rule.effect === 'DENY') {
            return { authorized: false, policyDecision: 'DENY', capabilityDecision: 'NOT_CHECKED', reason: `Denied by policy: ${rule.description}`, requiredApproval: false, matchedRule: rule, matchedRuleId: rule.id };
          }
          if (rule.effect === 'REQUIRE_APPROVAL') {
            policyDecision = 'REQUIRE_APPROVAL'; matchedRule = rule; break;
          }
          if (rule.effect === 'ALLOW') {
            policyDecision = 'ALLOW'; matchedRule = rule; break;
          }
        }
      }

      if (policyDecision === 'UNDECIDED') {
        if (policy.defaultEffect === 'ALLOW') policyDecision = 'ALLOW';
        else if (policy.defaultEffect === 'REQUIRE_APPROVAL') policyDecision = 'REQUIRE_APPROVAL';
        else return { authorized: false, policyDecision: 'UNDECIDED', capabilityDecision: 'NOT_CHECKED', reason: `No policy rule permits ${context.effectType}`, requiredApproval: false };
      }

      if (policyDecision === 'REQUIRE_APPROVAL') {
        // §5: REQUIRE_APPROVAL — requires valid approval evidence bound to the exact capability
        if (!context.approvalEvidenceId) {
          return { authorized: false, policyDecision: 'REQUIRE_APPROVAL', capabilityDecision: 'NOT_CHECKED', reason: `Policy requires approval but no approval evidence provided`, requiredApproval: true, matchedRule, matchedRuleId: matchedRule?.id };
        }
        // Verify the approval evidence exists against the expected capability
        const cap = capabilities.get(context.capabilityId);
        if (!cap) {
          return { authorized: false, policyDecision: 'REQUIRE_APPROVAL', capabilityDecision: 'CAPABILITY_NOT_FOUND', reason: `Policy requires approval but capability ${context.capabilityId} not found`, requiredApproval: true, matchedRule, matchedRuleId: matchedRule?.id };
        }
        // Validate approval evidence is bound to this capability
        const evidence = cap.issuanceEvidence;
        if (!evidence || evidence.approvalId !== context.approvalEvidenceId) {
          return { authorized: false, policyDecision: 'REQUIRE_APPROVAL', capabilityDecision: 'NOT_CHECKED', reason: `Approval evidence ${context.approvalEvidenceId} not bound to capability ${cap.id}`, requiredApproval: true, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
        }
        // Validate request hash matches
        if (context.issuanceRequestHash && evidence.requestHash !== context.issuanceRequestHash) {
          return { authorized: false, policyDecision: 'REQUIRE_APPROVAL', capabilityDecision: 'INVALID_ISSUER', reason: `Issuance request hash mismatch`, requiredApproval: true, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
        }
        // Validate provider identity
        if (context.providerId && evidence.issuer !== context.providerId) {
          return { authorized: false, policyDecision: 'REQUIRE_APPROVAL', capabilityDecision: 'INVALID_ISSUER', reason: `Provider identity mismatch: expected ${context.providerId}, got ${evidence.issuer}`, requiredApproval: true, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
        }
        // Approval evidence valid — fall through to full capability validation
      }

      const cap = capabilities.get(context.capabilityId);
      if (!cap) {
        return { authorized: false, policyDecision: policyDecision, capabilityDecision: 'CAPABILITY_NOT_FOUND', reason: `No capability with ID ${context.capabilityId}`, requiredApproval: policyDecision === 'REQUIRE_APPROVAL', matchedRule, matchedRuleId: matchedRule?.id };
      }

      if (cap.revokedAt) return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'REVOKED', reason: `Capability ${cap.id} revoked`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      if (cap.expiresAt && cap.expiresAt < Date.now()) return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'EXPIRED', reason: `Capability ${cap.id} expired`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };

      if (context.principalId && cap.principalId !== context.principalId && cap.principalId !== '') {
        return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'PRINCIPAL_MISMATCH', reason: `Principal mismatch`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      }
      if (context.sessionId && cap.sessionId !== context.sessionId && cap.sessionId !== '') {
        return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'SESSION_MISMATCH', reason: `Session mismatch`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      }
      if (context.intentId && cap.intentId !== context.intentId && cap.intentId !== '' && cap.originatingIntentId !== context.intentId) {
        return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'INTENT_MISMATCH', reason: `Intent mismatch`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      }
      if (context.planNodeId && cap.planNodeId !== context.planNodeId && cap.planNodeId !== '') {
        return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'PLAN_NODE_MISMATCH', reason: `Plan node mismatch`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      }
      if (context.actionId && cap.actionId !== context.actionId && cap.actionId !== '') {
        return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'ACTION_MISMATCH', reason: `Action mismatch`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      }
      if (context.effectType !== cap.effectType) {
        return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'SCOPE_MISMATCH', reason: `Effect type mismatch`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      }
      if (context.canonicalParameterHash && cap.parameterHash && context.canonicalParameterHash !== cap.parameterHash) {
        return { authorized: false, policyDecision: 'ALLOW', capabilityDecision: 'PARAMETER_MISMATCH', reason: `Parameter hash mismatch`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
      }

      return { authorized: true, policyDecision: 'ALLOW', capabilityDecision: 'MATCHED', reason: `Granted: ${cap.name}`, requiredApproval: false, matchedRule, matchedRuleId: matchedRule?.id, matchedCapabilityId: cap.id };
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
        planNodeId: parent.planNodeId, planId: parent.planId, actionId: parent.actionId, intentId: parent.intentId,
        parameterHash: parent.parameterHash,
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
        planNodeId: cap.planNodeId, planId: cap.planId, actionId: cap.actionId, intentId: cap.intentId,
        parameterHash: cap.parameterHash,
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
          planNodeId: s.planNodeId ?? '', planId: s.planId ?? '', actionId: s.actionId ?? '', intentId: s.intentId ?? '',
          parameterHash: s.parameterHash,
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
    const normalizedTarget = normalize(resolve(c.target)).replace(/\\/g, '/');
    const normalizedPath = normalize(scope.path).replace(/\\/g, '/');
    const rel = relative(normalizedTarget, normalizedPath);
    if (rel.startsWith('..') || rel === '') {
      if (process.platform === 'win32') {
        const relCi = relative(normalizedTarget.toLowerCase(), normalizedPath.toLowerCase());
        if (relCi.startsWith('..') || relCi === '') return false;
      } else {
        return false;
      }
    }
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
  { id: 'TV-004', name: 'Capability Forgery', description: 'Agent or sub-agent creates unauthorized capabilities', severity: 'CRITICAL', mitigation: 'Capabilities are system-managed objects. No self-created capabilities. External authority boundary enforced.', status: 'mitigated' },
  { id: 'TV-005', name: 'Memory Poisoning', description: 'Malicious data corrupts agent memory', severity: 'HIGH', mitigation: 'Memory objects carry provenance and epistemic status. Untrusted data cannot modify high-confidence memories.', status: 'mitigated' },
  { id: 'TV-006', name: 'Generated Code Compromise', description: 'Agent generates malicious or vulnerable code', severity: 'HIGH', mitigation: 'Security analysis organ, adversarial review, static analysis pass before execution.', status: 'partial' },
  { id: 'TV-007', name: 'Sandbox Escape', description: 'Generated or executed code escapes sandbox', severity: 'CRITICAL', mitigation: 'Process isolation, filesystem isolation, network isolation, resource quotas.', status: 'unmitigated' },
  { id: 'TV-008', name: 'Self-Improvement Corruption', description: 'Agent mutates itself into a harmful state', severity: 'CRITICAL', mitigation: 'Controlled mutation pipeline with constitutional invariants. No live unversioned self-editing.', status: 'mitigated' },
];
