// The balance results cache (ID-142): kept results come back as played, and anything
// odd on disk (corrupt, tampered, hostile) is played again rather than trusted.
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheFor } from './cache.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'balance-cache-'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

/** A fresh keeper on `root` and a play that counts its calls. */
function setup<T>(value: T) {
  const keep = cacheFor(import.meta.url, root);
  const play = vi.fn(() => value);
  return { keep, play };
}

/** The one kept entry's path (root/<sim>/<entry>.json). */
function entry(): string {
  const [sim] = readdirSync(root);
  const [file] = readdirSync(join(root, sim!));
  return join(root, sim!, file!);
}

describe('balance results cache (ID-142)', () => {
  it('plays once, then hands back the kept result without playing', () => {
    const { keep, play } = setup({ wins: 7, runs: [{ outcome: 'won' }] });
    expect(keep('a', play)).toEqual({ wins: 7, runs: [{ outcome: 'won' }] });
    expect(keep('a', play)).toEqual({ wins: 7, runs: [{ outcome: 'won' }] });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('keeps each key apart', () => {
    const keep = cacheFor(import.meta.url, root);
    expect(keep('one', () => 1)).toBe(1);
    expect(keep('two', () => 2)).toBe(2);
    expect(keep('one', () => 99)).toBe(1);
  });

  it('keeps Infinity, -Infinity and NaN (a watched fight with no wall is Infinity)', () => {
    const { keep, play } = setup({ nearest: Infinity, low: -Infinity, odd: NaN });
    const fresh = keep('n', play);
    const kept = keep('n', play);
    for (const r of [fresh, kept]) {
      expect(r.nearest).toBe(Infinity);
      expect(r.low).toBe(-Infinity);
      expect(r.odd).toBeNaN();
    }
  });

  it('a just-played result is plain data, as a kept one is', () => {
    const keep = cacheFor(import.meta.url, root);
    const fresh = keep('d', () => ({ at: undefined, map: new Map([[1, 2]]) }));
    expect(fresh).toEqual({ map: {} });
  });

  it('plays again over a corrupt, empty or truncated entry', () => {
    for (const junk of ['{not json', '', '{"key":"c","value":']) {
      const { keep, play } = setup(5);
      keep('c', play);
      writeFileSync(entry(), junk);
      expect(keep('c', play)).toBe(5);
      expect(play).toHaveBeenCalledTimes(2);
      // And the entry is whole again.
      expect(keep('c', play)).toBe(5);
      expect(play).toHaveBeenCalledTimes(2);
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
    }
  });

  it('plays again when the entry names another key, or holds no value or no object', () => {
    for (const tampered of [
      '{"key":"other","value":1000}',
      '{"key":"t"}',
      'null',
      '42',
      '"t"',
      '[1,2]',
    ]) {
      const { keep, play } = setup(3);
      keep('t', play);
      writeFileSync(entry(), tampered);
      expect(keep('t', play), tampered).toBe(3);
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
    }
  });

  it('a hostile __proto__ in a kept entry never reaches Object.prototype', () => {
    const { keep, play } = setup<Record<string, unknown>>({ ok: 1 });
    keep('p', play);
    writeFileSync(
      entry(),
      '{"key":"p","value":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}}',
    );
    const kept = keep('p', play);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
    // Dropped on reading, so spreading it later sets no prototype either.
    expect(Object.hasOwn(kept, '__proto__')).toBe(false);
    expect(Object.getPrototypeOf({ ...kept })).toBe(Object.prototype);
  });

  it('a forged number marker reads as NaN, never throws', () => {
    const { keep, play } = setup<unknown>(0);
    keep('f', play);
    writeFileSync(entry(), '{"key":"f","value":"\\u0000num:abc"}');
    expect(keep('f', play)).toBeNaN();
  });

  it('pruning stays inside the cache folder, and never empties a linked one', () => {
    const outside = mkdtempSync(join(tmpdir(), 'balance-outside-'));
    try {
      writeFileSync(join(outside, 'keep.txt'), 'x');
      // A link inside the cache to a folder outside it: only the link goes.
      symlinkSync(outside, join(root, 'linked-old'));
      cacheFor(import.meta.url, root)('k', () => 1);
      expect(readdirSync(root)).not.toContain('linked-old');
      expect(readdirSync(outside)).toEqual(['keep.txt']);
      // The cache folder itself a link: nothing in its target is dropped.
      const link = join(tmpdir(), `balance-link-${process.pid}`);
      rmSync(link, { force: true });
      symlinkSync(outside, link);
      try {
        cacheFor(import.meta.url, link)('k', () => 1);
        expect(readdirSync(outside)).toContain('keep.txt');
      } finally {
        rmSync(link, { force: true });
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('a kept string that looks like the number marker but is not one stays a string', () => {
    const keep = cacheFor(import.meta.url, root);
    expect(keep('s', () => 'num:Infinity')).toBe('num:Infinity');
    expect(keep('s', () => 'other')).toBe('num:Infinity');
  });

  it('a huge or odd key is hashed into a short file name', () => {
    const keep = cacheFor(import.meta.url, root);
    const key = `${'x'.repeat(100_000)}/../\u202e\u200b\0`;
    expect(keep(key, () => 1)).toBe(1);
    expect(keep(key, () => 2)).toBe(1);
    expect(entry().split('/').at(-1)).toMatch(/^[0-9a-f]{64}\.json$/);
  });

  it('BALANCE_CACHE=off plays every time, and still writes the entry', () => {
    const { keep, play } = setup(1);
    keep('o', play);
    vi.stubEnv('BALANCE_CACHE', 'off');
    keep('o', play);
    keep('o', play);
    expect(play).toHaveBeenCalledTimes(3);
    expect(JSON.parse(readFileSync(entry(), 'utf8'))).toEqual({ key: 'o', value: 1 });
  });

  it("drops older simulation code's results", () => {
    mkdirSync(join(root, 'old-sim-hash'));
    writeFileSync(join(root, 'old-sim-hash', 'x.json'), '{}');
    const keep = cacheFor(import.meta.url, root);
    keep('k', () => 1);
    expect(readdirSync(root)).toHaveLength(1);
    expect(readdirSync(root)).not.toContain('old-sim-hash');
  });
});
