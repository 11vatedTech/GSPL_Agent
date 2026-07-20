/**
 * GSPL Epistemic Engine
 *
 * Prevents plausible language from being confused with truth.
 * Every claim carries provenance, evidence, confidence, and status.
 *
 * The agent must distinguish among:
 *   known · believed · inferred · assumed · simulated · predicted
 *   externally-reported · observed · experimentally-verified
 *   formally-proven · disproven · obsolete · unresolved
 */

import type { EpistemicStatus, BeliefValue } from '@gspl/agent-genes';

// ── Claim ──

export interface Claim {
  id: string;
  proposition: string;
  status: EpistemicStatus;
  source: ClaimSource;
  timestamp: number;
  confidence: number; // 0-1
  authority: string;
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
  dependencies: string[]; // claim IDs this depends on
  validityInterval: { start: number; end?: number } | null;
  revisionHistory: ClaimRevision[];
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'failed';
}

export interface ClaimSource {
  type: 'observation' | 'inference' | 'external-report' | 'model-output' | 'experiment' | 'proof' | 'assumption' | 'simulation';
  identifier: string;
  reliability: number; // 0-1
  description: string;
}

export interface Evidence {
  id: string;
  type: 'observation' | 'test-result' | 'benchmark' | 'formal-proof' | 'external-source' | 'simulation-output';
  description: string;
  strength: 'weak' | 'moderate' | 'strong' | 'conclusive';
  timestamp: number;
  source: string;
  hash?: string;
}

export interface ClaimRevision {
  timestamp: number;
  previousStatus: EpistemicStatus;
  newStatus: EpistemicStatus;
  reason: string;
}

export interface Contradiction {
  claimA: string;
  claimB: string;
  description: string;
  severity: 'minor' | 'significant' | 'fundamental';
  detectedAt: number;
}

// ── Epistemic Engine with explicit ownership ──

export interface EpistemicEngine {
  createClaim(proposition: string, source: ClaimSource, confidence: number, dependencies?: string[]): Claim;
  addEvidence(claim: Claim, evidence: Evidence, supporting: boolean): Claim;
  verifyClaim(claim: Claim, passed: boolean): Claim;
  detectContradictions(claims: Claim[]): Contradiction[];
  expireEvidence(claim: Claim, evidenceId: string): Claim;
  invalidateDependents(claims: Claim[], invalidatedClaimId: string): Claim[];
  calibrateConfidence(claim: Claim, observedAccuracy: number): Claim;
  claimToBelief(claim: Claim): BeliefValue;
}

export function createEpistemicEngine(): EpistemicEngine {
  let claimCounter = 0;

  function evidenceWeight(e: Evidence): number {
    switch (e.strength) {
      case 'conclusive': return 3;
      case 'strong': return 2;
      case 'moderate': return 1;
      case 'weak': return 0.5;
    }
  }

  function recalculateStatus(claim: Claim): Claim {
    const supportingStrength = claim.supportingEvidence.reduce(
      (sum, e) => sum + evidenceWeight(e), 0,
    );
    const contradictingStrength = claim.contradictingEvidence.reduce(
      (sum, e) => sum + evidenceWeight(e), 0,
    );

    // Source reliability affects base confidence
    const adjustedConfidence = claim.confidence * claim.source.reliability;

    let status: EpistemicStatus;
    // FIXED: was `adjustingStrength` (undefined variable) — corrected to `adjustedConfidence`
    if (adjustedConfidence + supportingStrength > contradictingStrength + 2) {
      if (claim.verificationStatus === 'verified') status = 'PROVEN';
      else if (adjustedConfidence > 0.9) status = 'KNOWN';
      else status = 'BELIEVED';
    } else if (contradictingStrength > supportingStrength) {
      status = 'DISPROVEN';
    } else {
      status = 'UNRESOLVED';
    }

    return { ...claim, status };
  }

  return {
    createClaim(proposition, source, confidence, dependencies = []) {
      return {
        id: `claim-${Date.now().toString(36)}-${++claimCounter}`,
        proposition,
        status: confidence > 0.95 ? 'KNOWN' : confidence > 0.7 ? 'BELIEVED' : 'INFERRED',
        source,
        timestamp: Date.now(),
        confidence: Math.max(0, Math.min(1, confidence)),
        authority: source.identifier,
        supportingEvidence: [],
        contradictingEvidence: [],
        dependencies,
        validityInterval: null,
        revisionHistory: [],
        verificationStatus: 'unverified',
      };
    },

    addEvidence(claim, evidence, supporting) {
      const updated = { ...claim };
      if (supporting) {
        updated.supportingEvidence = [...claim.supportingEvidence, evidence];
      } else {
        updated.contradictingEvidence = [...claim.contradictingEvidence, evidence];
      }
      return recalculateStatus(updated);
    },

    verifyClaim(claim, passed) {
      return {
        ...claim,
        verificationStatus: passed ? 'verified' : 'failed',
        revisionHistory: [
          ...claim.revisionHistory,
          {
            timestamp: Date.now(),
            previousStatus: claim.status,
            newStatus: passed ? 'VERIFIED' as EpistemicStatus : 'DISPROVEN' as EpistemicStatus,
            reason: passed ? 'Verification passed' : 'Verification failed',
          },
        ],
        status: passed ? 'VERIFIED' as EpistemicStatus : 'DISPROVEN' as EpistemicStatus,
        confidence: passed ? Math.min(1, claim.confidence + 0.1) : Math.max(0, claim.confidence - 0.3),
      };
    },

    detectContradictions(claims) {
      const contradictions: Contradiction[] = [];
      const activeClaims = claims.filter(
        c => !['DISPROVEN', 'OBSOLETE', 'UNRESOLVED'].includes(c.status),
      );

      for (let i = 0; i < activeClaims.length; i++) {
        for (let j = i + 1; j < activeClaims.length; j++) {
          const a = activeClaims[i];
          const b = activeClaims[j];

          // Direct negation detection (simplified)
          if (
            a.proposition.includes('not ' + b.proposition) ||
            b.proposition.includes('not ' + a.proposition)
          ) {
            contradictions.push({
              claimA: a.id,
              claimB: b.id,
              description: `Direct contradiction: "${a.proposition}" vs "${b.proposition}"`,
              severity: 'fundamental',
              detectedAt: Date.now(),
            });
          }
        }
      }

      return contradictions;
    },

    expireEvidence(claim, evidenceId) {
      return {
        ...claim,
        supportingEvidence: claim.supportingEvidence.filter(e => e.id !== evidenceId),
        contradictingEvidence: claim.contradictingEvidence.filter(e => e.id !== evidenceId),
        revisionHistory: [
          ...claim.revisionHistory,
          {
            timestamp: Date.now(),
            previousStatus: claim.status,
            newStatus: claim.status,
            reason: `Evidence ${evidenceId} expired`,
          },
        ],
      };
    },

    invalidateDependents(claims, invalidatedClaimId) {
      return claims.map(claim => {
        if (claim.dependencies.includes(invalidatedClaimId)) {
          return {
            ...claim,
            status: 'UNRESOLVED' as EpistemicStatus,
            confidence: Math.max(0, claim.confidence - 0.5),
            revisionHistory: [
              ...claim.revisionHistory,
              {
                timestamp: Date.now(),
                previousStatus: claim.status,
                newStatus: 'UNRESOLVED' as EpistemicStatus,
                reason: `Dependency ${invalidatedClaimId} was invalidated`,
              },
            ],
          };
        }
        return claim;
      });
    },

    calibrateConfidence(claim, observedAccuracy) {
      const calibrationDelta = observedAccuracy - claim.confidence;
      return {
        ...claim,
        confidence: Math.max(0, Math.min(1, claim.confidence + calibrationDelta * 0.1)),
        revisionHistory: [
          ...claim.revisionHistory,
          {
            timestamp: Date.now(),
            previousStatus: claim.status,
            newStatus: claim.status,
            reason: `Confidence calibrated by ${calibrationDelta.toFixed(2)} (observed: ${observedAccuracy})`,
          },
        ],
      };
    },

    claimToBelief(claim) {
      return {
        proposition: claim.proposition,
        status: claim.status,
        confidence: claim.confidence,
        source: claim.source.identifier,
        timestamp: claim.timestamp,
        supportingEvidence: claim.supportingEvidence.map(e => e.hash ?? e.id),
        contradictingEvidence: claim.contradictingEvidence.map(e => e.hash ?? e.id),
        dependencies: claim.dependencies,
        validityInterval: claim.validityInterval,
        verificationStatus: claim.verificationStatus,
      };
    },
  };
}
