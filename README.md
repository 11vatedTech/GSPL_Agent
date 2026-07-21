# GSPL AI Agent

> **The standalone, sovereign, GSPL-native intelligence system.**

The GSPL AI Agent is NOT an LLM with tools. It is a cognitive intelligence system built on GSPL (Generative Seed Programming Language) principles. The agent generates the form of cognition, memory, verification, and execution required by each specific objective — the LLM is merely a replaceable cognitive organ inside a larger architecture.

## Current Status

### Implemented & Verified
- **Cognitive Layer (8 packages)**: Agent genes, cognitive kernel, intent compiler, epistemic engine, model fabric, memory architecture, capability security, world model
- **Runtime Spine (9 packages)**: Runtime coordinator (async + DI), context compiler, planning/execution, action fabric (real fs + process), transaction manager (12 states), persistence (file-backed + SHA-256), event history, observability, verification engine (validator registry)
- **122/122 tests passing** | **Zero type errors** in AI packages

### Infrastructure
- **Persistence**: Atomic file-backed with SHA-256 integrity hashing
- **Actions**: Real filesystem read/write/delete with path sandboxing, process execution with environment sanitization
- **Transactions**: 12 truthful states, serializable recovery descriptors, exposed rollback errors
- **Organs**: 10 registered organ handlers with real deterministic implementations
- **Verification**: Validator registry with file-exists, file-hash, value-equals, predicate-true, organs-completed, rollback-ready validators

### Known Limitations
- Organ registry uses deterministic implementations (no local model integration yet)
- Model fabric has adapter boundary but no runtime model adapter
- Network and browser adapters not yet implemented
- No local model inference runtime integrated
- Epistemic state (claims, evidence) not fully restored on restart

## Architecture

```
deps/gspl-canon/          # GSPL language foundation (git submodule)
packages/
  agent-genes/            # AI-specific gene definitions
  cognitive-kernel/       # Morphogenesis engine + genome management
  intent-compiler/        # Natural language → structured intent
  epistemic-engine/       # Claim/evidence system with 14 statuses
  model-fabric/           # Model-independent organ binding
  memory-architecture/    # 9 memory classes with retention policies
  capability-security/    # Non-forgeable capability system
  world-model/            # Semantic world with counterfactual branches
  runtime-coordinator/    # Async coordinator with dependency injection
  context-compiler/       # Context construction with source authority
  planning-execution/     # Typed executable plan graphs
  action-fabric/          # Real filesystem + process adapters
  transaction-manager/    # 12 truthful transaction states
  persistence/            # File-backed with SHA-256 + migrations
  event-history/          # Event-sourced execution history
  observability/          # Structured logs, metrics, traces
  verification-engine/    # Validator registry with real validators
tests/
  e2e-scenarios.test.ts   # Success + failure/rollback E2E tests
```

## GSPL Canon Dependency

The agent consumes GSPL language foundations through an immutable git submodule:

```bash
git submodule update --init --recursive
node scripts/verify-canon-deps.mjs  # Verify pinned revision
```

The submodule is pinned at the exact commit tracked in `.gitmodules`. The agent repository does NOT duplicate or claim ownership of GSPL canon packages.

## Getting Started

### Prerequisites
- Node.js >= 20.0.0
- Git

### Install
```bash
git clone --recurse-submodules https://github.com/11vatedTech/GSPL_Agent
cd GSPL_Agent
npm install
node scripts/verify-canon-deps.mjs
```

### Build & Test
```bash
npm run typecheck    # Zero type errors
npm test             # 122+ tests passing
npx vitest run tests/e2e-scenarios.test.ts  # E2E scenarios
```

### Run the Reference Scenario
```typescript
import { createRuntimeCoordinator } from '@gspl/runtime-coordinator';
import { createPrimordialGenome } from '@gspl/cognitive-kernel';

const coordinator = createRuntimeCoordinator({
  config: { storagePath: './.gspl-state' },
});

const session = coordinator.createSession(createPrimordialGenome());
const withIntent = coordinator.submitObjective(session, 'Analyze the repository');
const executed = await coordinator.executeTick(withIntent);

console.log('Phase:', executed.phase);
console.log('Organs executed:', executed.cognitiveGraph?.organs.filter(o => o.status === 'COMPLETED').length);
```

## Security Model

- **Capability-based security**: No ambient authority. Every effect requires explicit capability.
- **Fails-closed**: Unknown policy = DENY. Prompt text cannot grant authority.
- **Path sandboxing**: lstat/realpath validation with symlink detection and root enforcement.
- **Environment sanitization**: Process execution strips secrets (TOKEN, KEY, PASSWORD, etc.).
- **Atomic persistence**: Write-to-temp + fsync + rename with backup metadata sorting.

## License

MIT — see [LICENSE](LICENSE)

## Repository

[https://github.com/11vatedTech/GSPL_Agent](https://github.com/11vatedTech/GSPL_Agent)
