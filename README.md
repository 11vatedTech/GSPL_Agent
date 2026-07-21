# GSPL AI Agent

> **The standalone, sovereign, GSPL-native intelligence system.**
>
> The GSPL AI Agent is NOT an LLM with tools. It generates the form of cognition, memory, verification, and execution required by each objective — the LLM is a replaceable cognitive organ inside a larger architecture.
>
> **Current milestone**: First complete cognitive execution achieved — owner intent generates a typed plan, executes real capability-scoped actions, independently observes results, validates completion through evidence-backed validators, persists complete state, survives restart, and truthfully rolls back failed operations.

## Current Status

### ✅ Implemented & Verified
- **Cognitive Layer (8 packages)**: Agent genes, cognitive kernel (morphogenesis), intent compiler, epistemic engine, model fabric, memory architecture, capability security, world model
- **Runtime Spine (9 packages)**: Async runtime coordinator (DI), context compiler, planning/execution (typed PlanNodes), action fabric (real fs + process + rollback), transaction manager (12 truthful states), persistence (SHA-256 + atomic writes + migrations), event history, observability, verification engine (validator registry)
- **First Complete Cognitive Execution**: Intent → morphogenesis → real plan → capability-scoped action → independent fs observation → epistemic claims → validator-backed completion → persist → restart → replay → rollback
- **All tests passing** | **Zero type errors** in AI packages

### Core Capabilities
- **Real filesystem actions** with `lstat`/`realpath` path sandboxing, symlink detection, atomic writes, BeforeState capture
- **Real rollback** for created, modified, and deleted files with truthful status reporting (FULLY/PARTIALLY/FAILED/IRREVERSIBLE)
- **10 cognitive organ handlers** with real deterministic implementations (no canned outputs)
- **6 real validators**: file-exists, file-hash, value-equals, predicate-true, organs-completed, rollback-ready
- **Async verifyCompletion** with validator registry (no substring matching)
- **Cognitive graph validation**: cycle detection, missing handler detection, resource budget enforcement

### E2E Scenarios (real filesystem operations)
- **Success**: 10 tests — intent → plan → execute → observe → verify → persist → restart → replay
- **Rollback**: 5 tests — created restore, modified restore with hash, deleted restore, irreversible honesty, post-rollback verification
- **Security**: 5 tests — path traversal, unauthorized root, missing capability, corruption detection, invalid graph

### Known Limitations
- Organ registry uses deterministic implementations (no local model integration yet)
- Model fabric has adapter boundary but no runtime model adapter connected
- Network, browser, and GUI adapters not yet implemented
- Event store is in-memory (survives process restart via persistence but not independent replay without persistence)
- Epistemic claims restored from persistence but claim dependency graph not yet reconstructed

## Architecture

```
deps/gspl-canon/              # GSPL language foundation (git submodule)
packages/
  agent-genes/                # AI-specific gene definitions
  cognitive-kernel/           # Morphogenesis engine + genome management
  intent-compiler/            # Natural language → structured intent
  epistemic-engine/           # Claim/evidence system with 14 statuses
  model-fabric/               # Model-independent organ binding
  memory-architecture/        # 9 memory classes with retention policies
  capability-security/        # Non-forgeable capability system
  world-model/                # Semantic world with counterfactual branches
  runtime-coordinator/        # Async coordinator with DI + organ registry
  context-compiler/           # Context construction with source authority
  planning-execution/         # Typed PlanNodes with actionId + actionParams
  action-fabric/              # Real filesystem + process + rollback adapters
  transaction-manager/        # 12 truthful transaction states + serializable recovery
  persistence/                # File-backed with SHA-256 + atomic writes + migrations
  event-history/              # Event-sourced execution history
  observability/              # Structured logs, metrics, traces
  verification-engine/        # Validator registry with 6 real validators
tests/
  e2e/first-cognitive-execution.test.ts   # Success scenario (10 tests)
  e2e/failure-rollback.test.ts            # Rollback scenario (5 tests)
  security/coordinator-security.test.ts   # Security tests (5 tests)
  canon-dependency.test.ts                # Canon dependency verification
scripts/
  verify-canon-deps.mjs                   # Dependency revision verification
  check-package-boundaries.mjs            # Package boundary enforcement
```

## GSPL Canon Dependency

The agent consumes GSPL language foundations through an immutable git submodule:

```bash
git clone --recurse-submodules https://github.com/11vatedTech/GSPL_Agent
cd GSPL_Agent
git submodule update --init --recursive
node scripts/verify-canon-deps.mjs    # Verify pinned revision
```

Pinned at the exact commit tracked in `.gitmodules`. No canonical GSPL source is duplicated or independently maintained in this repository.

## Getting Started

### Prerequisites
- Node.js >= 20.0.0
- Git

### Install & Verify
```bash
git clone --recurse-submodules https://github.com/11vatedTech/GSPL_Agent
cd GSPL_Agent
npm install
node scripts/verify-canon-deps.mjs
node scripts/check-package-boundaries.mjs
```

### Test
```bash
npm test                                        # All unit + integration tests
npx vitest run tests/e2e/                       # E2E success + rollback scenarios
npx vitest run tests/security/                  # Security E2E tests
npm run typecheck                               # Zero type errors
```

### Run the Reference Scenario
```typescript
import { createRuntimeCoordinator } from '@gspl/runtime-coordinator';
import { createPrimordialGenome } from '@gspl/cognitive-kernel';
import { join } from 'path';
import { tmpdir } from 'os';

const coordinator = createRuntimeCoordinator({
  config: {
    storagePath: './.gspl-state',
    riskTolerance: 'LOW',
  },
});

const session = coordinator.createSession(
  createPrimordialGenome(),
  join(tmpdir(), 'gspl-workspace'),
);

const withIntent = coordinator.submitObjective(
  session,
  'Create a file named hello.txt with the message "GSPL cognitive execution complete"',
);

const executed = await coordinator.executeTick(withIntent);
const verification = await coordinator.verifyCompletion(executed);

console.log('Completed organs:', executed.cognitiveGraph?.organs.filter(o => o.status === 'COMPLETED').length);
console.log('Verification complete:', verification.complete);
console.log('Evidence:', verification.evidence);
```

## Security Model

- **Capability-based**: No ambient authority. Every effect requires explicit capability issuance.
- **Fails-closed**: Unknown policy = DENY. Prompt text cannot grant authority.
- **Path sandboxing**: `lstat`/`realpath` validation with symlink detection and root enforcement.
- **Environment sanitization**: Process execution strips secrets (TOKEN, KEY, PASSWORD, etc.).
- **Atomic persistence**: Write-to-temp + fsync + rename with backup metadata sorting.
- **Non-forgeable capabilities**: Capabilities have explicit issuance, scope, attenuation, revocation, and expiration.
- **Generated tools begin with zero authority**.

## License

MIT — see [LICENSE](LICENSE)

## Repository

[https://github.com/11vatedTech/GSPL_Agent](https://github.com/11vatedTech/GSPL_Agent)
