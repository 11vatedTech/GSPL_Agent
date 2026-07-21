/**
 * GSPL Action Fabric — HARDENED IMPLEMENTATION
 *
 * Typed interface for external actions with real filesystem security:
 * - lstat-based path validation with realpath resolution
 * - Symlink/junction detection and policy enforcement
 * - Real rollback: created→delete, modified→restore, deleted→restore
 * - Environment sanitization for process execution
 * - Output size limits and timeout enforcement
 *
 * Every effect requires explicit capability authorization.
 */

import type { EffectType, CapabilityScope, CapabilityManager } from '@gspl/capability-security';
import { readFile, writeFile, mkdir, unlink, stat, lstat, realpath } from 'node:fs/promises';
import { resolve, normalize, relative, dirname, join, basename } from 'node:path';
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
  /** Complete before-state for rollback */
  beforeState?: BeforeState;
}

export interface BeforeState {
  existed: boolean;
  content?: string;
  hash?: string;
  sizeBytes: number;
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

// ── Rollback Result ──

export interface RollbackResult {
  actionId: string;
  success: boolean;
  status: 'FULLY_ROLLED_BACK' | 'PARTIALLY_ROLLED_BACK' | 'ROLLBACK_FAILED' | 'IRREVERSIBLE';
  revertedCount: number;
  failedCount: number;
  errors: ActionError[];
  residualEffects: ActionEffect[];
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

// ── Filesystem Adapter Config ──

export interface FilesystemAdapterConfig {
  allowedRoots: string[];
  maxFileSize: number;
  followSymlinks: boolean;
  /** Allow write operations */
  allowWrite: boolean;
  /** Allow delete operations */
  allowDelete: boolean;
}

// ── Action Executor ──

export interface ActionExecutor {
  execute(actionId: string, params: unknown, capabilityManager: CapabilityManager): Promise<ActionResult>;
  dryRun(actionId: string, params: unknown): ActionResult;
  rollback(result: ActionResult): Promise<RollbackResult>;
}

function failResult(actionId: string, errors: ActionError[]): ActionResult {
  return { actionId, success: false, output: null, artifacts: [], errors, effects: [], durationMs: 0, resourceUsed: { memoryBytes: 0 } };
}

// ── Real Path Resolution (security boundary) ──

async function resolveAndValidatePath(
  inputPath: string,
  fsAdapter: FilesystemAdapterConfig,
  allowNonExistent: boolean = false,
): Promise<string> {
  // 1. Lexical normalization
  const normalized = normalize(resolve(inputPath));

  // 2. Determine the real path
  let real: string = normalized; // Default to normalized, refined below

  try {
    if (allowNonExistent) {
      // For new files: validate the nearest existing parent
      let parent = dirname(normalized);
      let found = false;
      while (parent && parent !== normalized) {
        try {
          const statResult = await lstat(parent);
          if (statResult.isSymbolicLink()) {
            if (!fsAdapter.followSymlinks) {
              throw new Error('Symlinks not allowed in path: ' + parent);
            }
            real = await realpath(parent);
          } else {
            real = await realpath(parent);
          }
          real = real + normalized.slice(parent.length);
          found = true;
          break;
        } catch {
          parent = dirname(parent);
        }
      }
      if (!found) {
        // No existing parent found — fall back to root-validated normalized path
        for (const root of fsAdapter.allowedRoots) {
          const realRoot = await realpath(root).catch(() => resolve(root));
          if (normalized.startsWith(realRoot)) {
            real = normalized;
            break;
          }
        }
      }
    } else {
      const statResult = await lstat(normalized);
      if (statResult.isSymbolicLink() && !fsAdapter.followSymlinks) {
        throw new Error('Symlinks not allowed in path: ' + normalized);
      }
      real = await realpath(normalized);
    }
  } catch (e) {
    if (allowNonExistent && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      // For new files: resolve the parent and append the filename
      try {
        const parentReal = await realpath(dirname(normalized));
        real = join(parentReal, basename(normalized));
      } catch {
        throw new Error('Cannot resolve parent path for: ' + inputPath);
      }
    } else {
      throw e;
    }
  }

  // 3. Verify real path is within allowed roots
  let withinRoot = false;
  for (const root of fsAdapter.allowedRoots) {
    const realRoot = await realpath(root).catch(() => resolve(root));
    const rel = relative(realRoot, real);
    if (rel === '' || (!rel.startsWith('..') && rel !== '')) {
      withinRoot = true;
      break;
    }
  }

  if (!withinRoot) {
    throw new Error('Path is outside allowed roots: ' + inputPath);
  }

  return real;
}

// ── Hash Helper ──

function fileHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ── Executor Implementation ──

export function createActionExecutor(
  registry: ActionRegistry,
  fsConfig?: Partial<FilesystemAdapterConfig>,
): ActionExecutor {
  const fsAdapter: FilesystemAdapterConfig = {
    allowedRoots: fsConfig?.allowedRoots ?? [process.cwd()],
    maxFileSize: fsConfig?.maxFileSize ?? 100 * 1024 * 1024, // 100MB
    followSymlinks: fsConfig?.followSymlinks ?? false,
    allowWrite: fsConfig?.allowWrite ?? true,
    allowDelete: fsConfig?.allowDelete ?? true,
  };

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
      const revertErrors: ActionError[] = [];
      let revertedCount = 0;
      let failedCount = 0;
      const residualEffects: ActionEffect[] = [];

      for (const artifact of result.artifacts) {
        try {
          const before = artifact.beforeState;
          if (!before) {
            // No before-state captured — can't rollback
            revertErrors.push({ code: 'NO_BEFORE_STATE', message: `No before-state for ${artifact.path}`, severity: 'error', recoverable: false });
            failedCount++;
            residualEffects.push({ type: 'STATE_CHANGE', target: artifact.path, before: 'unknown', after: 'unreverted' });
            continue;
          }

          if (artifact.created && !artifact.deleted) {
            // Created file → delete it
            await unlink(artifact.path);
            revertedCount++;
          } else if (artifact.modified && before.content !== undefined) {
            // Modified file → restore original content
            await writeFile(artifact.path, before.content, 'utf-8');
            const restoredHash = fileHash(before.content);
            if (restoredHash !== before.hash) {
              revertErrors.push({ code: 'RESTORE_HASH_MISMATCH', message: `Restored hash for ${artifact.path} doesn't match original`, severity: 'error', recoverable: false });
              failedCount++;
              residualEffects.push({ type: 'MODIFIED', target: artifact.path, before: 'attempted-restore', after: 'restore-mismatch' });
              continue;
            }
            revertedCount++;
          } else if (artifact.deleted && before.content !== undefined) {
            // Deleted file → restore original content
            await writeFile(artifact.path, before.content, 'utf-8');
            revertedCount++;
          }
        } catch (e) {
          revertErrors.push({ code: 'ROLLBACK_ERROR', message: `Failed to rollback ${artifact.path}: ${e instanceof Error ? e.message : 'unknown'}`, severity: 'error', recoverable: true });
          failedCount++;
          residualEffects.push({ type: 'STATE_CHANGE', target: artifact.path, before: 'attempted-rollback', after: 'rollback-failed' });
        }
      }

      let status: RollbackResult['status'];
      if (revertedCount > 0 && failedCount === 0) status = 'FULLY_ROLLED_BACK';
      else if (revertedCount > 0 && failedCount > 0) status = 'PARTIALLY_ROLLED_BACK';
      else if (revertedCount === 0 && result.artifacts.length === 0) status = 'IRREVERSIBLE';
      else status = 'ROLLBACK_FAILED';

      return {
        actionId: result.actionId,
        success: status === 'FULLY_ROLLED_BACK',
        status,
        revertedCount,
        failedCount,
        errors: revertErrors,
        residualEffects,
      };
    },
  };
}

// ── Action Handler Dispatch ──

async function executeActionHandler(
  action: ActionDescriptor,
  params: unknown,
  fsAdapter: FilesystemAdapterConfig,
): Promise<ActionResult> {
  const startTime = Date.now();
  const p = params as Record<string, unknown>;

  try {
    switch (action.effectType) {
      // ── FILESYSTEM READ ──
      case 'FILESYSTEM_READ': {
        const filePath = await resolveAndValidatePath(p.path as string, fsAdapter);
        const fileStat = await stat(filePath);
        if (fileStat.size > fsAdapter.maxFileSize) {
          return failResult(action.id, [{ code: 'FILE_TOO_LARGE', message: `File exceeds max size ${fsAdapter.maxFileSize}`, severity: 'error', recoverable: true }]);
        }
        const content = await readFile(filePath, 'utf-8');
        const fHash = fileHash(content);
        return {
          actionId: action.id, success: true,
          output: { content, path: filePath, sizeBytes: fileStat.size, hash: fHash },
          artifacts: [{ id: artId(), type: 'file', path: filePath, hash: fHash, sizeBytes: fileStat.size, created: false, modified: false, deleted: false }],
          errors: [], effects: [{ type: 'STATE_CHANGE', target: filePath, after: 'read' }],
          durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: fileStat.size },
        };
      }

      // ── FILESYSTEM WRITE ──
      case 'FILESYSTEM_WRITE': {
        if (!fsAdapter.allowWrite) {
          return failResult(action.id, [{ code: 'WRITE_DISABLED', message: 'Write operations disabled', severity: 'fatal', recoverable: false }]);
        }
        const filePath = await resolveAndValidatePath(p.path as string, fsAdapter, true);
        const content = p.content as string;
        if (Buffer.byteLength(content, 'utf-8') > fsAdapter.maxFileSize) {
          return failResult(action.id, [{ code: 'CONTENT_TOO_LARGE', message: `Content exceeds max size ${fsAdapter.maxFileSize}`, severity: 'error', recoverable: true }]);
        }

        // Capture complete before-state for rollback
        let beforeState: BeforeState = { existed: false, sizeBytes: 0 };
        try {
          const beforeContent = await readFile(filePath, 'utf-8');
          beforeState = {
            existed: true,
            content: beforeContent,
            hash: fileHash(beforeContent),
            sizeBytes: Buffer.byteLength(beforeContent, 'utf-8'),
          };
        } catch { /* file doesn't exist yet — that's fine */ }

        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, 'utf-8');
        const fHash = fileHash(content);
        const existed = beforeState.existed;

        return {
          actionId: action.id, success: true,
          output: { written: true, path: filePath, sizeBytes: content.length, hash: fHash, existed },
          artifacts: [{
            id: artId(), type: 'file', path: filePath, hash: fHash,
            sizeBytes: Buffer.byteLength(content, 'utf-8'),
            created: !existed, modified: existed, deleted: false,
            beforeState,
          }],
          errors: [],
          effects: [{ type: existed ? 'MODIFIED' : 'CREATED', target: filePath, before: beforeState.hash || undefined, after: fHash }],
          durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: Buffer.byteLength(content, 'utf-8') },
        };
      }

      // ── FILESYSTEM DELETE ──
      case 'FILESYSTEM_DELETE': {
        if (!fsAdapter.allowDelete) {
          return failResult(action.id, [{ code: 'DELETE_DISABLED', message: 'Delete operations disabled', severity: 'fatal', recoverable: false }]);
        }
        const filePath = await resolveAndValidatePath(p.path as string, fsAdapter);

        // Capture complete before-state for rollback
        let beforeContent: string;
        try {
          beforeContent = await readFile(filePath, 'utf-8');
        } catch {
          return failResult(action.id, [{ code: 'FILE_NOT_FOUND', message: 'File not found: ' + filePath, severity: 'error', recoverable: true }]);
        }

        const beforeHash = fileHash(beforeContent);
        await unlink(filePath);

        return {
          actionId: action.id, success: true,
          output: { deleted: true, path: filePath },
          artifacts: [{
            id: artId(), type: 'file', path: filePath, hash: '',
            sizeBytes: 0, created: false, modified: false, deleted: true,
            beforeState: { existed: true, content: beforeContent, hash: beforeHash, sizeBytes: Buffer.byteLength(beforeContent, 'utf-8') },
          }],
          errors: [],
          effects: [{ type: 'DELETED', target: filePath, before: beforeHash }],
          durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: 0 },
        };
      }

      // ── PROCESS EXECUTE ──
      case 'PROCESS_EXECUTE': {
        const command = p.command as string;
        const args = (p.args as string[]) ?? [];
        const cwd = p.cwd as string | undefined;
        const timeout = (p.timeoutMs as number) ?? action.timeoutMs;

        // Validate working directory
        const execCwd = cwd ? await resolveAndValidatePath(cwd, fsAdapter) : process.cwd();

        // Sanitize environment: strip known secret keys
        const env = { ...process.env };
        const secretKeys = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'PASS', 'CREDENTIAL', 'AUTH', 'API_KEY', 'ACCESS_KEY', 'PRIVATE_KEY'];
        for (const key of Object.keys(env)) {
          const upper = key.toUpperCase();
          if (secretKeys.some(s => upper.includes(s))) {
            delete env[key];
          }
        }

        try {
          const result = await execFileAsync(command, args, {
            cwd: execCwd,
            timeout,
            maxBuffer: fsAdapter.maxFileSize,
            windowsHide: true,
            env,
            shell: false, // No shell interpolation
          });
          const exitCode: number = 0;
          return {
            actionId: action.id, success: true,
            output: { stdout: result.stdout, stderr: result.stderr, exitCode },
            artifacts: [], errors: [],
            effects: [{ type: 'EXECUTED', target: command, after: 'exitCode=' + exitCode }],
            durationMs: Date.now() - startTime, resourceUsed: { memoryBytes: 0 },
          };
        } catch (e: unknown) {
          const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean; code?: number };
          if (err.killed) {
            return failResult(action.id, [{ code: 'PROCESS_TIMEOUT', message: `Process timed out after ${timeout}ms`, severity: 'error', recoverable: true }]);
          }
          return failResult(action.id, [{
            code: 'PROCESS_ERROR',
            message: `Process exited with code ${err.code ?? 'unknown'}: ${err.stderr ?? err.message}`,
            severity: 'error',
            recoverable: true,
          }]);
        }
      }

      // ── UNSUPPORTED ──
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

// ── Artifact ID Generator ──

let _artCounter = 0;
function artId(): string {
  return 'art-' + (Date.now().toString(36)) + '-' + (_artCounter++).toString(36);
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
