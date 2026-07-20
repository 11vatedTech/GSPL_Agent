import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@gspl/canon-foundation': resolve(__dirname, 'packages/canon-foundation/src/index.ts'),
      '@gspl/gene-protocol': resolve(__dirname, 'packages/gene-protocol/src/index.ts'),
      '@gspl/agent-genes': resolve(__dirname, 'packages/agent-genes/src/index.ts'),
      '@gspl/cognitive-kernel': resolve(__dirname, 'packages/cognitive-kernel/src/index.ts'),
      '@gspl/intent-compiler': resolve(__dirname, 'packages/intent-compiler/src/index.ts'),
      '@gspl/epistemic-engine': resolve(__dirname, 'packages/epistemic-engine/src/index.ts'),
      '@gspl/model-fabric': resolve(__dirname, 'packages/model-fabric/src/index.ts'),
      '@gspl/memory-architecture': resolve(__dirname, 'packages/memory-architecture/src/index.ts'),
      '@gspl/capability-security': resolve(__dirname, 'packages/capability-security/src/index.ts'),
      '@gspl/world-model': resolve(__dirname, 'packages/world-model/src/index.ts'),
      '@gspl/runtime-coordinator': resolve(__dirname, 'packages/runtime-coordinator/src/index.ts'),
      '@gspl/context-compiler': resolve(__dirname, 'packages/context-compiler/src/index.ts'),
      '@gspl/planning-execution': resolve(__dirname, 'packages/planning-execution/src/index.ts'),
      '@gspl/action-fabric': resolve(__dirname, 'packages/action-fabric/src/index.ts'),
      '@gspl/transaction-manager': resolve(__dirname, 'packages/transaction-manager/src/index.ts'),
      '@gspl/persistence': resolve(__dirname, 'packages/persistence/src/index.ts'),
      '@gspl/event-history': resolve(__dirname, 'packages/event-history/src/index.ts'),
      '@gspl/observability': resolve(__dirname, 'packages/observability/src/index.ts'),
      '@gspl/verification-engine': resolve(__dirname, 'packages/verification-engine/src/index.ts'),
    },
  },
  test: {
    globals: false,
    include: [
      'packages/*/test/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'tests/**/*.test.ts'
    ],
    exclude: ['node_modules', '**/dist'],
  },
});
