import { describe, it, expect } from 'vitest';
import { compileIntent, reviseIntent } from './intent-compiler.js';

describe('Intent Compiler', () => {
  it('preserves original owner statement', () => {
    const result = compileIntent('Analyze the codebase');
    expect(result.originalStatement).toBe('Analyze the codebase');
  });

  it('extracts goal from natural language', () => {
    const result = compileIntent('Refactor the authentication module to use JWT');
    expect(result.intent.goal).toBeDefined();
    expect(result.intent.goal.length).toBeGreaterThan(0);
  });

  it('derives requirements from stated goal', () => {
    const result = compileIntent('Build a REST API for user management');
    expect(result.requirements.length).toBeGreaterThan(0);
  });

  it('each derived requirement has description and sourceIntent', () => {
    const result = compileIntent('Add error handling to all endpoints');
    for (const req of result.requirements) {
      expect(req.description).toBeDefined();
      expect(req.sourceIntent).toBeDefined();
    }
  });

  it('identifies constraints from input', () => {
    const result = compileIntent('Optimize database queries without changing the schema securely');
    expect(result.intent.constraints.length).toBeGreaterThan(0);
  });

  it('identifies anti-goals when specified', () => {
    const result = compileIntent('Improve performance but do not increase memory usage');
    expect(result.intent.antiGoals.length).toBeGreaterThan(0);
  });

  it('authority is not silently expanded', () => {
    const result = compileIntent('Inspect the repository');
    expect(result.intent.goal).not.toContain('delete');
  });

  it('records ambiguities when present', () => {
    const result = compileIntent('Fix the bug');
    expect(Array.isArray(result.ambiguities)).toBe(true);
  });

  it('records unknowns', () => {
    const result = compileIntent('Integrate with the payment system');
    expect(Array.isArray(result.unknowns)).toBe(true);
  });

  it('intents can be revised while preserving lineage', () => {
    const original = compileIntent('Add search functionality');
    const revised = reviseIntent(original, 'Add full-text search with autocomplete');
    expect(revised.originalStatement).not.toBe(original.originalStatement);
    expect(revised.lineage.revisionNumber).toBeGreaterThan(original.lineage.revisionNumber);
  });
});
