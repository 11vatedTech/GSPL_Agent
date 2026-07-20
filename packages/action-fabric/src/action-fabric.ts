/**
 * GSPL Action Fabric — REAL IMPLEMENTATION
 *
 * Typed interface for external actions. Every action requires explicit capability.
 * Filesystem operations use node:fs with path sandboxing.
 * Unsupported effect types return explicit failures (NOT fabricated success).
 */

import type { EffectType, CapabilityScope, CapabilityManager } from '@gspl/capability-security';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { resolve, normalize, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ── Action Descriptor ──

export interface ActionDescriptor {
  id: string;
  name: string;
  description: string;
  effectType: EffectType;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  sideEffects: string[];
  riskClassification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversibility: 'reversible' | 'compensatable' | 'irreversible';
  sandboxRequired: boolean;
  timeoutMs: number;
  resourceLimits: ActionResourceLimits;
}

export interface ActionResourceLimits {
  maxMemoryBytes?: number;
  maxTimeMs?: number;
  maxOutputBytes?: number;
}

// ── Action Result ──

export interface ActionResult {
  actionId: string;
  success: boolean;
  output: unknown;
  artifacts: ActionArtifact[];
  errors: ActionError[];
  effects: ActionEffect[];
  durationMs: number;
  resourceUsed: { memoryBytes: number };
}

export interface ActionArtifact {
  id: string;
  type: string;
  path: string;
  hash: string;
  sizeBytes: number;
  created: boolean;
  modified: boolean;
  deleted: boolean;
}

export interface ActionError {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'fatal';
  recoverable: boolean;
}

export interface ActionEffect {
  type: 'CREATED' | 'MODIFIED' | 'DELETED' | 'EXECUTED' | 'NETWORK' | 'STATE_CHANGE';
  target: string;
  before?: string;
  after?: string;
}

// ── Action Registry ──

export interface ActionRegistry {
  register(action: ActionDescriptor): void;
  unregister(actionId: string): void;
  get(actionId: string): ActionDescriptor | undefined;
  list(): ActionDescriptor[];
  listByEffect(effectType: EffectType): ActionDescriptor[];
}

export function createActionRegistry(): ActionRegistry {
  const actions = new Map<string, ActionDescriptor>();
  return {
    register(action) { actions.set(action.id, { ...action }); },
    unregister(actionId) { actions.delete(actionId); },
    get(actionId) { return actions.get(actionId); },
    list() { return [...actions.values()]; },
    listByEffect(effectType) { return [...actions.values()].filter(a => a.effectType === effectType); },
  };
}

// ── Action Executor ──

export interface FilesystemAdapterConfig {
  allowedRoots: string[];
  maxFileSize: number;
  followSymlinks: boolean;
}

export interface ActionExecutor {
  execute(actionId: string, params: unknown, capabilityManager: CapabilityManager): Promise<ActionResult>;
  dryRun(actionId: string, params: unknown): ActionResult;
  rollback(result: ActionResult): Promise<ActionResult>;
}

function failResult(actionId: string, errors: ActionError[]): ActionResult {
  return { actionId, success: false, output: null, artifacts: [], errors, effects: [], durationMs: 0, resourceUsed: { memoryBytes: 0 } };
}

export function createActionExecutor(
  registry: ActionRegistry,
  fsConfig?: Partial<FilesystemAdapterConfig>,
): ActionExecutor {
  const fsAdapter: FilesystemAdapterConfig = {
    allowedRoots: fsConfig?.allowedRoots ?? [process.cwd()],
    maxFileSize: fsConfig?.maxFileSize ?? 100 * 1024 * 1024,
    followSymlinks: fsConfig?.followSymlinks ?? false,
  };

  function resolveSafePath(inputPath: string): string {
    const resolved = resolve(inputPath);
    const normalized = normalize(resolved);
    const allowed = fsAdapter.allowedRoots.some(root => {
      const rel = relative(resolve(root), normalized);
      if (rel === '') return true;
      return !rel.startsWith('..') && !rel.includes('\\..\\') && !rel.includes('/../');
    });
    if (!allowed) {
      throw new Error('Path ' + inputPath + ' is outside allowed roots');
    }
    return normalized;
  }

  return {
    async execute(actionId, params, capabilityManager) {
      const action = registry.get(actionId);
      if (!action) {
        return failResult(actionId, [{ code: 'ACTION_NOT_FOUND', message: 'Action not registered', severity: 'fatal', recoverable: false }]);
      }
      const scope: CapabilityScope = { toolName: actionId };
      const auth = capabilityManager.check(action.effectType, scope);
      if (!auth.authorized) {
        return failResult(actionId, [{ code: 'UNAUTHORIZED', message: auth.reason, severity: 'fatal', recoverable: false }]);
      }
      return executeActionHandler(action, params, fsAdapter);
    },

    dryRun(actionId, params) {
      const action = registry.get(actionId);
      if (!action) {
        return failResult(actionId, [{ code: 'ACTION_NOT_FOUND', message: 'Action not registered', severity: 'fatal', recoverable: false }]);
      }
      return { actionId, success: true, output: { dryRun: true, params, action: action.name }, artifacts: [], errors: [], effects: [], durationMs: 0, resourceUsed: { memoryBytes: 0 } };
    },

    async rollback(result) {
      const effects: ActionEffect[] = [...result.effects];
      for (const artifact of result.artifacts) {
        try {
          if (artifact.created && !artifact.deleted) {
            await unlink(artifact.path);
            effects.push({ type: 'DELETED', target: artifact.path, after: 'rollback' });
          }
        } catch { /* best-effort */ }
      }
      return { ...result, success: true, output: { rolledBack: true, revertedCount: result.artifacts.filter(a => a.created).length }, effects, durationMs: 0, resourceUsed: { memoryBytes: 0 } };
    },
  };
}

// ── Action Handler Dispatch (REAL implementation) ──

function resolveSafePath(inputPath: string, fsAdapter: FilesystemAdapterConfig): string {
  const resolved = resolve(inputPath);
  const normalized = normalize(resolved);
  const allowed = fsAdapter.allowedRoots.some(root => {
    const rel = relative(resolve(root), normalized);
    if (rel === '') return true;
    return !rel.startsWith('..') && !rel.includes('\\..\\') && !rel.includes('/../');
  });
  if (!allowed) {
    throw new Error('Path ' + inputPath + ' is outside allowed roots');
  }
  return normalized;
}

async function executeActionHandler(
  action: ActionDescriptor,
  params: unknown,
  fsAdapter: FilesystemAdapterConfig,
): Promise<ActionResult> {
  const startTime = Date.now();
  const p = params as Record<string, unknown>;

  try {
    switch (action.effectType) {
      case 'FILESYSTEM_READ': {
        const filePath = resolveSafePath(p.path as string, fsAdapter);
        const fileStat = await stat(filePath);
        if (fileStat.size > fsAdapter.maxFileSize) {
          return failResult(action.id, [{ code: 'FILE_TOO_LARGE', message: 'File exceeds max size ' + fsAdapter.maxFileSize, severity: 'error', recoverable: true }]);
        }
        const content = await readFile(filePath, 'utf-8');
        const fileHash = createHash('sha256').update(content).digest('hex');
        return {
          actionId: action.id, success: true,
          output: { content, path: filePath, sizeBytes: fileStat.size, hash: fileHash },
          artifacts: [{ id: 'art-' + Date.now().toString(36), type: 'file', path: filePath, hash: fileHash, sizeBytes: fileStat.size, created: false, modified: false, deleted: false }],
          errors: [], effects: [{ type: 'STATE_CHANGE', target: filePath, after: 'read' }], durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: fileStat.size },
        };
      }

      case 'FILESYSTEM_WRITE': {
        const filePath = resolveSafePath(p.path as string, fsAdapter);
        const content = p.content as string;
        let beforeHash = '';
        try { beforeHash = createHash('sha256').update(await readFile(filePath, 'utf-8')).digest('hex'); } catch { /* file may not exist */ }
        await mkdir(resolve(filePath, '..'), { recursive: true });
        await writeFile(filePath, content, 'utf-8');
        const fileHash = createHash('sha256').update(content).digest('hex');
        const existed = beforeHash !== '';
        return {
          actionId: action.id, success: true,
          output: { written: true, path: filePath, sizeBytes: content.length, hash: fileHash, existed },
          artifacts: [{ id: 'art-' + Date.now().toString(36), type: 'file', path: filePath, hash: fileHash, sizeBytes: content.length, created: !existed, modified: existed, deleted: false }],
          errors: [], effects: [{ type: existed ? 'MODIFIED' : 'CREATED', target: filePath, before: beforeHash || undefined, after: fileHash }], durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: content.length },
        };
      }

      case 'FILESYSTEM_DELETE': {
        const filePath = resolveSafePath(p.path as string, fsAdapter);
        let beforeContent = '';
        try { beforeContent = await readFile(filePath, 'utf-8'); } catch {
          return failResult(action.id, [{ code: 'FILE_NOT_FOUND', message: 'File not found: ' + filePath, severity: 'error', recoverable: true }]);
        }
        await unlink(filePath);
        return {
          actionId: action.id, success: true,
          output: { deleted: true, path: filePath },
          artifacts: [{ id: 'art-' + Date.now().toString(36), type: 'file', path: filePath, hash: '', sizeBytes: 0, created: false, modified: false, deleted: true }],
          errors: [], effects: [{ type: 'DELETED', target: filePath, before: beforeContent.substring(0, 256) }], durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: 0 },
        };
      }

      case 'PROCESS_EXECUTE': {
        const command = p.command as string;
        const args = (p.args as string[]) ?? [];
        const cwd = p.cwd as string | undefined;
        const timeout = (p.timeoutMs as number) ?? action.timeoutMs;
        try {
          const result = await execFileAsync(command, args, { cwd: cwd ?? process.cwd(), timeout, maxBuffer: fsAdapter.maxFileSize, windowsHide: true });
          const exitCode: number = 0;
          return {
            actionId: action.id, success: true,
            output: { stdout: result.stdout, stderr: result.stderr, exitCode },
            artifacts: [], errors: [], effects: [{ type: 'EXECUTED', target: command, after: 'exitCode=' + exitCode }], durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: 0 },
          };
        } catch (e: unknown) {
          const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
          if (err.killed) {
            return failResult(action.id, [{ code: 'PROCESS_TIMEOUT', message: 'Process timed out after ' + timeout + 'ms', severity: 'error', recoverable: true }]);
          }
          return failResult(action.id, [{ code: 'PROCESS_ERROR', message: err.message, severity: 'error', recoverable: true }]);
        }
      }

      case 'NETWORK_OUTBOUND':
        return failResult(action.id, [{ code: 'UNSUPPORTED_OPERATION', message: 'Network adapter not configured', severity: 'error', recoverable: false }]);

      case 'MODEL_INFERENCE':
        return failResult(action.id, [{ code: 'UNSUPPORTED_OPERATION', message: 'Model adapter not configured', severity: 'error', recoverable: false }]);

      case 'TOOL_USE':
        return failResult(action.id, [{ code: 'UNSUPPORTED_OPERATION', message: 'Tool-use adapter not configured', severity: 'error', recoverable: false }]);

      default:
        return failResult(action.id, [{ code: 'UNSUPPORTED_EFFECT', message: 'No adapter for ' + action.effectType, severity: 'error', recoverable: false }]);
    }
  } catch (e) {
    return failResult(action.id, [{ code: 'ACTION_ERROR', message: e instanceof Error ? e.message : 'Unknown error', severity: 'fatal', recoverable: false }]);
  }
}

// ── Register Standard Actions ──

export function registerStandardActions(registry: ActionRegistry): void {
  const standard: ActionDescriptor[] = [
    { id: 'fs-read', name: 'Filesystem Read', description: 'Read a file from allowed roots', effectType: 'FILESYSTEM_READ', inputSchema: { path: 'string' }, outputSchema: { content: 'string' }, sideEffects: [], riskClassification: 'LOW', reversibility: 'reversible', sandboxRequired: false, timeoutMs: 30000, resourceLimits: {} },
    { id: 'fs-write', name: 'Filesystem Write', description: 'Write a file within allowed roots', effectType: 'FILESYSTEM_WRITE', inputSchema: { path: 'string', content: 'string' }, outputSchema: { written: 'boolean' }, sideEffects: ['file-creation'], riskClassification: 'MEDIUM', reversibility: 'compensatable', sandboxRequired: false, timeoutMs: 60000, resourceLimits: {} },
    { id: 'fs-delete', name: 'Filesystem Delete', description: 'Delete a file within allowed roots', effectType: 'FILESYSTEM_DELETE', inputSchema: { path: 'string' }, outputSchema: { deleted: 'boolean' }, sideEffects: ['file-deletion'], riskClassification: 'HIGH', reversibility: 'irreversible', sandboxRequired: false, timeoutMs: 30000, resourceLimits: {} },
    { id: 'process-exec', name: 'Process Execute', description: 'Execute a command with timeout', effectType: 'PROCESS_EXECUTE', inputSchema: { command: 'string', args: 'string[]' }, outputSchema: { stdout: 'string', exitCode: 'number' }, sideEffects: ['process-spawn'], riskClassification: 'HIGH', reversibility: 'irreversible', sandboxRequired: true, timeoutMs: 120000, resourceLimits: {} },
  ];
  for (const a of standard) registry.register(a);
}
