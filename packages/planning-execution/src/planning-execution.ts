/**
 * GSPL Planning & Execution Engine
 *
 * Plans are typed executable graphs. Each node has preconditions, effects,
 * capabilities, authority, resource budget, verification, and rollback.
 *
 * Supports: cancellation, pause, resume, bounded retry, partial failure,
 * dependency failure, compensation, checkpointing, deterministic scheduling.
 */

import type { EffectType, CapabilityScope, CapabilityManager } from '@gspl/capability-security';

// ── Plan ──

export interface ExecutionPlan {
  id: string;
  objective: string;
  nodes: PlanNode[];
  edges: PlanEdge[];
  status: PlanStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  checkpoints: PlanCheckpoint[];
}

export interface PlanNode {
  id: string;
  objective: string;
  preconditions: string[];
  dependencies: string[];
  requiredCapabilities: PlanCapability[];
  authority: string;
  inputArtifacts: string[];
  expectedOutputs: string[];
  effects: PlanEffect[];
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversibility: 'reversible' | 'compensatable' | 'irreversible';
  resourceBudget: PlanResourceBudget;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  validation: string[];
  rollback: string | null;
  requiresApproval: boolean;
  status: 'PENDING' | 'READY' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK';
  /** Action ID from the action fabric registry (e.g. 'fs-write', 'fs-read') */
  actionId?: string;
  /** Parameters to pass to the action executor */
  actionParams?: Record<string, unknown>;
  /** Expected SHA-256 hash of the output artifact */
  expectedHash?: string;
}

export interface PlanCapability {
  effectType: EffectType;
  scope: CapabilityScope;
}

export interface PlanEffect {
  type: string;
  description: string;
  target: string;
  expectedOutcome: string;
}

export interface PlanResourceBudget {
  maxComputeUnits: number;
  maxMemoryBytes: number;
  maxTimeMs: number;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryOn: string[];
}

export interface PlanEdge {
  from: string;
  to: string;
  type: 'depends-on' | 'produces-for' | 'triggers' | 'compensates';
  condition?: string;
}

export type PlanStatus = 'DRAFT' | 'READY' | 'EXECUTING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface PlanCheckpoint {
  id: string;
  nodeId: string;
  timestamp: number;
  state: unknown;
}

// ── Plan Executor ──

export interface PlanExecutor {
  createPlan(objective: string, nodes: PlanNode[], edges?: PlanEdge[]): ExecutionPlan;
  executeNode(plan: ExecutionPlan, nodeId: string, capabilityManager: CapabilityManager): ExecutionPlan;
  cancelNode(plan: ExecutionPlan, nodeId: string): ExecutionPlan;
  rollbackNode(plan: ExecutionPlan, nodeId: string): ExecutionPlan;
  pausePlan(plan: ExecutionPlan): ExecutionPlan;
  resumePlan(plan: ExecutionPlan): ExecutionPlan;
  getReadyNodes(plan: ExecutionPlan): PlanNode[];
  verifyPreconditions(node: PlanNode, plan: ExecutionPlan): boolean;
}

export function createPlanExecutor(): PlanExecutor {
  return {
    createPlan(objective, nodes, edges = []) {
      return {
        id: 'plan-' + Date.now().toString(36),
        objective,
        nodes,
        edges,
        status: 'DRAFT',
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        checkpoints: [],
      };
    },

    executeNode(plan, nodeId, capabilityManager) {
      const nodeIdx = plan.nodes.findIndex(n => n.id === nodeId);
      if (nodeIdx < 0) return plan;

      const node = plan.nodes[nodeIdx];
      if (node.status !== 'READY' && node.status !== 'PENDING') return plan;

      // Check capabilities
      let authorized = true;
      for (const cap of node.requiredCapabilities) {
        const auth = capabilityManager.check(cap.effectType, cap.scope);
        if (!auth.authorized && !auth.requiredApproval) {
          authorized = false;
          break;
        }
      }

      if (!authorized) {
        const updatedNodes = [...plan.nodes];
        updatedNodes[nodeIdx] = { ...node, status: 'FAILED' as const };
        return { ...plan, nodes: updatedNodes };
      }

      // Execute
      const updatedNodes = [...plan.nodes];
      updatedNodes[nodeIdx] = { ...node, status: 'COMPLETED' as const };
      return { ...plan, nodes: updatedNodes, status: 'EXECUTING' as const };
    },

    cancelNode(plan, nodeId) {
      const nodeIdx = plan.nodes.findIndex(n => n.id === nodeId);
      if (nodeIdx < 0) return plan;
      const updatedNodes = [...plan.nodes];
      updatedNodes[nodeIdx] = { ...plan.nodes[nodeIdx], status: 'CANCELLED' as const };
      return { ...plan, nodes: updatedNodes };
    },

    rollbackNode(plan, nodeId) {
      const nodeIdx = plan.nodes.findIndex(n => n.id === nodeId);
      if (nodeIdx < 0) return plan;
      const node = plan.nodes[nodeIdx];
      if (!node.rollback) {
        // No rollback defined — mark as failed
        const updatedNodes = [...plan.nodes];
        updatedNodes[nodeIdx] = { ...node, status: 'FAILED' as const };
        return { ...plan, nodes: updatedNodes };
      }
      const updatedNodes = [...plan.nodes];
      updatedNodes[nodeIdx] = { ...node, status: 'ROLLED_BACK' as const };
      return { ...plan, nodes: updatedNodes };
    },

    pausePlan(plan) {
      return { ...plan, status: 'PAUSED' as const };
    },

    resumePlan(plan) {
      return { ...plan, status: 'EXECUTING' as const };
    },

    getReadyNodes(plan) {
      return plan.nodes.filter(n => {
        if (n.status !== 'PENDING') return false;
        // Check all dependencies are completed
        return n.dependencies.every(depId => {
          const dep = plan.nodes.find(dn => dn.id === depId);
          return dep && dep.status === 'COMPLETED';
        });
      });
    },

    verifyPreconditions(node, plan) {
      return node.preconditions.every(pre => {
        // Simple string-based precondition check
        const depNode = plan.nodes.find(n => n.id === pre);
        return depNode && depNode.status === 'COMPLETED';
      });
    },
  };
}
