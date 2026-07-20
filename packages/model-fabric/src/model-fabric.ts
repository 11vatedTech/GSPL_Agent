/**
 * GSPL Model Fabric
 *
 * The model fabric is the agent's interface to inference engines.
 * It is NOT the agent. The model is a replaceable cognitive organ
 * inside the larger GSPL intelligence architecture.
 *
 * Key principles:
 *   - Model-independent: the agent exists independently of any model
 *   - Local-first: no mandatory paid API, no metered tokens
 *   - Specialist routing: different tasks route to different models
 *   - Organ integration: models are cognitive organs with typed contracts
 *   - Graceful degradation: if one model fails, fall back to alternatives
 *   - Capability profiles: models declare what they can and cannot do
 */

import type { OrganContract } from '@gspl/cognitive-kernel';

// ── Model Descriptor ──

export type ModelModality =
  | 'TEXT'
  | 'CODE'
  | 'VISION'
  | 'AUDIO'
  | 'SPEECH_RECOGNITION'
  | 'SPEECH_SYNTHESIS'
  | 'IMAGE_GENERATION'
  | 'EMBEDDING'
  | 'RERANKING';

export type ModelRuntime =
  | 'llama.cpp'
  | 'ollama'
  | 'vllm'
  | 'sglang'
  | 'onnx'
  | 'tensorrt'
  | 'transformers'
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'custom';

export type QuantizationLevel =
  | 'FP32'
  | 'FP16'
  | 'INT8'
  | 'INT4'
  | 'Q4_K_M'
  | 'Q5_K_M'
  | 'Q8_0'
  | 'GGUF';

export interface ModelDescriptor {
  id: string;
  name: string;
  version: string;
  provider: 'local' | 'configured' | 'bundled';
  modality: ModelModality[];
  runtime: ModelRuntime;
  quantization: QuantizationLevel;
  vramRequired: number;
  ramRequired: number;
  contextLength: number;
  maxOutputTokens: number;
  structuredOutput: boolean;
  toolCalling: boolean;
  license: ModelLicense;
  hash: string;
  uri: string; // local path or endpoint
  healthStatus: 'healthy' | 'degraded' | 'unavailable';
  capabilities: ModelCapability[];
}

export interface ModelLicense {
  type: string;
  commercial: boolean;
  redistribution: boolean;
  url: string;
}

export interface ModelCapability {
  taskClass: string;
  reliability: number; // 0-1
  latencyMs: { typical: number; p99: number };
  tokensPerSecond: number;
}

// ── Model Registry ──

export interface ModelRegistry {
  models: Map<string, ModelDescriptor>;
  register(model: ModelDescriptor): void;
  unregister(modelId: string): void;
  find(query: ModelQuery): ModelDescriptor[];
  getActive(): ModelDescriptor[];
}

export interface ModelQuery {
  modality?: ModelModality;
  taskClass?: string;
  minReliability?: number;
  maxVram?: number;
  maxLatencyMs?: number;
  localOnly?: boolean;
  structuredOutputRequired?: boolean;
  toolCallingRequired?: boolean;
}

export function createModelRegistry(): ModelRegistry {
  const models = new Map<string, ModelDescriptor>();

  return {
    models,
    register(model) {
      models.set(model.id, { ...model });
    },
    unregister(modelId) {
      models.delete(modelId);
    },
    find(query) {
      const results: ModelDescriptor[] = [];
      for (const model of models.values()) {
        if (model.healthStatus === 'unavailable') continue;
        if (query.modality && !model.modality.includes(query.modality)) continue;
        if (query.localOnly && model.provider !== 'local') continue;
        if (query.structuredOutputRequired && !model.structuredOutput) continue;
        if (query.toolCallingRequired && !model.toolCalling) continue;
        if (query.maxVram && model.vramRequired > query.maxVram) continue;
        if (query.minReliability) {
          const cap = model.capabilities.find(c => c.taskClass === query.taskClass);
          if (!cap || cap.reliability < query.minReliability) continue;
        }
        if (query.maxLatencyMs) {
          const cap = model.capabilities.find(c => c.taskClass === query.taskClass);
          if (cap && cap.latencyMs.typical > query.maxLatencyMs) continue;
        }
        results.push(model);
      }
      return results.sort((a, b) => {
        const capA = a.capabilities.find(c => c.taskClass === query.taskClass);
        const capB = b.capabilities.find(c => c.taskClass === query.taskClass);
        return (capB?.reliability ?? 0) - (capA?.reliability ?? 0);
      });
    },
    getActive() {
      return [...models.values()].filter(m => m.healthStatus !== 'unavailable');
    },
  };
}

// ── Model Router ──

export interface ModelRoutingRequest {
  taskClass: string;
  modality: ModelModality;
  contextNeeded: number;
  vramBudget: number;
  latencyTarget: number;
  privacyRequired: boolean;
  structuredOutputNeeded: boolean;
  toolCallingNeeded: boolean;
  fallbackPolicy: 'fail' | 'degrade' | 'escalate';
}

export interface ModelRoutingResult {
  primary: ModelDescriptor | null;
  fallbacks: ModelDescriptor[];
  reasoning: string;
}

export function routeModel(
  registry: ModelRegistry,
  request: ModelRoutingRequest,
): ModelRoutingResult {
  const candidates = registry.find({
    modality: request.modality,
    taskClass: request.taskClass,
    maxVram: request.vramBudget,
    maxLatencyMs: request.latencyTarget,
    localOnly: request.privacyRequired,
    structuredOutputRequired: request.structuredOutputNeeded,
    toolCallingRequired: request.toolCallingNeeded,
  });

  const primary = candidates[0] ?? null;
  const fallbacks = candidates.slice(1, 4);

  return {
    primary,
    fallbacks,
    reasoning: primary
      ? `Selected ${primary.name} (${primary.quantization}) for ${request.taskClass}: ${primary.vramRequired}MB VRAM, ${primary.contextLength} ctx`
      : `No suitable model found for ${request.taskClass} with modality ${request.modality}`,
  };
}

// ── Organ-Model Mapping ──

export interface OrganModelBinding {
  organType: string;
  modelId: string;
  priority: number;
  fallbackModelIds: string[];
}

export function bindOrgansToModels(
  organs: OrganContract[],
  registry: ModelRegistry,
  vramBudget: number,
): OrganModelBinding[] {
  const bindings: OrganModelBinding[] = [];
  let remainingVram = vramBudget;

  for (const organ of organs) {
    const modality = organToModality(organ.organType);
    const candidates = registry.find({
      modality,
      maxVram: remainingVram,
      localOnly: true,
    });

    if (candidates.length > 0) {
      const best = candidates[0];
      bindings.push({
        organType: organ.organType,
        modelId: best.id,
        priority: 1,
        fallbackModelIds: candidates.slice(1, 3).map(m => m.id),
      });
      remainingVram -= best.vramRequired;
    } else {
      bindings.push({
        organType: organ.organType,
        modelId: '',
        priority: 0,
        fallbackModelIds: [],
      });
    }
  }

  return bindings;
}

function organToModality(organType: string): ModelModality {
  switch (organType) {
    case 'CODE_REASONING':
    case 'LANGUAGE_REASONING':
    case 'PLANNING':
      return 'CODE';
    case 'VISUAL_PERCEPTION':
    case 'GUI_GROUNDING':
      return 'VISION';
    default:
      return 'TEXT';
  }
}

// ── Default Local Model Registry ──

export function createDefaultLocalRegistry(): ModelRegistry {
  const registry = createModelRegistry();

  // Register commonly available local models (12GB VRAM aware)
  registry.register({
    id: 'qwen2.5-coder-7b-q4',
    name: 'Qwen 2.5 Coder 7B',
    version: '2.5',
    provider: 'local',
    modality: ['CODE', 'TEXT'],
    runtime: 'llama.cpp',
    quantization: 'Q4_K_M',
    vramRequired: 4800,
    ramRequired: 8192,
    contextLength: 32768,
    maxOutputTokens: 8192,
    structuredOutput: true,
    toolCalling: true,
    license: { type: 'Apache 2.0', commercial: true, redistribution: true, url: '' },
    hash: '',
    uri: 'models/qwen2.5-coder-7b-q4_k_m.gguf',
    healthStatus: 'healthy',
    capabilities: [
      { taskClass: 'code-generation', reliability: 0.85, latencyMs: { typical: 200, p99: 800 }, tokensPerSecond: 40 },
      { taskClass: 'reasoning', reliability: 0.80, latencyMs: { typical: 300, p99: 1200 }, tokensPerSecond: 35 },
    ],
  });

  registry.register({
    id: 'llama-3.2-3b-q4',
    name: 'Llama 3.2 3B',
    version: '3.2',
    provider: 'local',
    modality: ['TEXT'],
    runtime: 'llama.cpp',
    quantization: 'Q4_K_M',
    vramRequired: 2200,
    ramRequired: 4096,
    contextLength: 131072,
    maxOutputTokens: 4096,
    structuredOutput: false,
    toolCalling: false,
    license: { type: 'Llama 3.2 Community', commercial: true, redistribution: true, url: '' },
    hash: '',
    uri: 'models/llama-3.2-3b-q4_k_m.gguf',
    healthStatus: 'healthy',
    capabilities: [
      { taskClass: 'chat', reliability: 0.75, latencyMs: { typical: 50, p99: 200 }, tokensPerSecond: 80 },
    ],
  });

  return registry;
}
