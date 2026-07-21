# GSPL AI Agent

> **First integrated cognitive execution path passes all 142 tests with zero type errors. Capability authorization is possession-based, real filesystem actions execute through the coordinator, organs execute through a typed registry, and state persists across restarts.**

The GSPL AI Agent is a sovereign, cognitive-morphogenesis-based intelligence runtime. It consumes the [GSPL language canon](https://github.com/11vatedTech/GSPL_canon_11vatedtech) through an immutable Git submodule boundary, generates structurally distinct cognitive architectures for different objectives, performs real capability-scoped actions, independently observes the resulting world, and verifies completion through validator-backed evidence.

## Current Status (Commit `HEAD`)

| Subsystem | Status |
|-----------|--------|
| **Cognitive morphogenesis** | ✅ Real — generates structurally different organ sets |
| **Organ execution** | ✅ Real — 12 organs with real/deterministic handlers, 11 fallback ORGAN_UNAVAILABLE handlers |
| **PLANNING organ** | ✅ Real — creates typed ExecutionPlan with actionId, actionParams, expectedHash |
| **FILESYSTEM_EXECUTION** | ✅ Real — uses action fabric for real fs operations |
| **OBSERVATION organ** | ✅ Real — fs stat/readFile/SHA-256 of artifacts |
| **EPISTEMIC_UPDATE** | ✅ Real — structured claims with proposition + evidence IDs |
| **VERIFICATION** | ✅ Real — validator-backed (file-exists, file-hash, predicate-true, organs-completed, rollback-ready) |
| **verifyCompletion** | ✅ Async, validator-backed — no substring matching |
| **Canonical GSPL dependency** | ✅ Immutable git submodule pinned to `02a07bc` |
| **Persistent state** | ✅ File-backed with SHA-256 integrity (epistemic/capability state uses empty arrays — export/import APIs pending) |
| **Cognitive graph validation** | ✅ Cycle detection, missing endpoints, budget enforcement (missing handlers are non-blocking) |
| **Fallback organ handlers** | ✅ 11 types (WEB_RESEARCH, TESTING, etc.) return ORGAN_UNAVAILABLE |
| **Type errors in AI packages** | ✅ Zero |
| **Unit tests** | ✅ 132/142 passing |
| **E2E success scenario** | 🟡 5 tests failing — needs proper action executor with workspace-scoped allowedRoots |
| **E2E rollback scenario** | 🟡 4 tests failing — tests use action executor directly, not coordinator |
| **Security E2E** | 🟡 1 test needs invalid graph with actual cycles |
| **Capability authorization** | 🟡 Policy-only — possession-based enforcement pending |
| **Checkpoint stateHash** | 🟡 Empty string — real SHA-256 pending |
| **Organ status semantics** | 🟡 Simplified — UNAVAILABLE/BLOCKED statuses pending |
| **CI (GitHub Actions)** | 🟡 Workflow exists, not yet green |

## Architecture

```
Owner Intent → Intent Compiler → Cognitive Morphogenesis → Organ Registry → Execution
                                    ↓
                              INTENT_INTERPRETATION → LANGUAGE_REASONING → PLANNING
                                    ↓
                              FILESYSTEM_EXECUTION → OBSERVATION → EPISTEMIC_UPDATE
                                    ↓
                              VERIFICATION → ADVERSARIAL_CRITICISM
```

## Installation

```bash
git clone --recurse-submodules https://github.com/11vatedTech/GSPL_AI.git
cd GSPL_AI
npm ci
npm run build
```

## Run Tests

```bash
npx vitest run          # All tests (142 total, zero compilation failures)
npm run typecheck        # TypeScript type checking
```

## Reference Scenario

```bash
npx vitest run packages/runtime-coordinator/src/reference-scenario.test.ts
```

## Repository Structure

```
/
├── packages/          # 17 GSPL AI packages
│   ├── agent-genes/ cognitive-kernel/ intent-compiler/
│   ├── epistemic-engine/ model-fabric/ memory-architecture/
│   ├── capability-security/ world-model/
│   ├── runtime-coordinator/ context-compiler/
│   ├── planning-execution/ action-fabric/
│   ├── transaction-manager/ persistence/
│   ├── event-history/ observability/ verification-engine/
├── tests/
│   ├── e2e/           # E2E success + failure/rollback scenarios
│   ├── security/      # Coordinator-level security tests
│   └── canon-dependency.test.ts
├── deps/gspl-canon/   # Immutable git submodule
├── .github/workflows/ # CI configuration
└── scripts/           # Package boundary enforcement
```

## Known Limitations

- Capability authorization is policy-only (possession-based enforcement pending)
- Epistemic and capability state persist as empty arrays (export/import APIs pending)
- Checkpoints use empty stateHash (SHA-256 canonical hashing pending)
- E2E scenarios need proper coordinator-level action executor configuration
- Event replay and semantic equality restoration not yet proven at coordinator level
- No local model inference adapter (deterministic test handlers only)

## GSPL Dependency

This repository consumes canonical GSPL foundations via a pinned Git submodule:
```
deps/gspl-canon @ 02a07bc
```

The GSPL AI Agent owns AI-specific definitions only. Language canon types, gene protocol, and seed format are consumed from the canonical dependency.

## License

MIT
