import { describe, expect, it } from 'vitest';
import { depsHash } from '../tools/deps-hash.mjs';

const pkg = (version: string, vite = '^8.3.1') =>
  JSON.stringify({ name: 'game', version, devDependencies: { vite } });
const lock = (version: string, vite = '8.3.5') =>
  JSON.stringify({
    name: 'game',
    version,
    lockfileVersion: 3,
    packages: {
      '': { name: 'game', version, devDependencies: { vite: '^8.3.1' } },
      'node_modules/vite': { version: vite },
    },
  });

describe('depsHash', () => {
  it('is a sha256 hex digest', () => {
    expect(depsHash(pkg('0.5.9'), lock('0.5.9'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores the project's own version: a version bump keeps the cache", () => {
    expect(depsHash(pkg('0.5.10'), lock('0.5.10'))).toBe(depsHash(pkg('0.5.9'), lock('0.5.9')));
  });

  it('changes when a locked dependency changes', () => {
    expect(depsHash(pkg('0.5.9'), lock('0.5.9', '8.3.6'))).not.toBe(
      depsHash(pkg('0.5.9'), lock('0.5.9')),
    );
  });

  it('changes when package.json asks for another dependency range', () => {
    expect(depsHash(pkg('0.5.9', '^8.4.0'), lock('0.5.9'))).not.toBe(
      depsHash(pkg('0.5.9'), lock('0.5.9')),
    );
  });

  it("keeps a dependency's own version field: only the project's is left out", () => {
    const a = JSON.parse(lock('0.5.9')) as { packages: Record<string, { version?: string }> };
    delete a.packages['node_modules/vite']!.version;
    expect(depsHash(pkg('0.5.9'), JSON.stringify(a))).not.toBe(
      depsHash(pkg('0.5.9'), lock('0.5.9')),
    );
  });
});
