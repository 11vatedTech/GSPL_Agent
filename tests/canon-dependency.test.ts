import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const EXPECTED_REVISION = '02a07bc42c9399ccab94d27685409b9ba079a7c0';

describe('GSPL Canon Dependency Boundary', () => {
  it('submodule is initialized', () => {
    expect(existsSync('deps/gspl-canon/.git')).toBe(true);
  });

  it('.gitmodules declares gspl-canon', () => {
    expect(existsSync('.gitmodules')).toBe(true);
  });

  it('is pinned to expected canonical revision', () => {
    const actual = execSync('git -C deps/gspl-canon rev-parse HEAD', { encoding: 'utf-8' }).trim();
    expect(actual).toBe(EXPECTED_REVISION);
  });

  it('canon-foundation package is accessible', () => {
    expect(existsSync('deps/gspl-canon/packages/canon-foundation/src/index.ts')).toBe(true);
  });

  it('gene-protocol package is accessible', () => {
    expect(existsSync('deps/gspl-canon/packages/gene-protocol/src/index.ts')).toBe(true);
  });

  it('no copied canon packages exist in AI packages/', () => {
    expect(existsSync('packages/canon-foundation')).toBe(false);
    expect(existsSync('packages/gene-protocol')).toBe(false);
  });
});
