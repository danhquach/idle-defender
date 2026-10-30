// ID-043: every thing the horde view draws has bundled art, and the art is
// reproducible from art-src/manifest.json with an allowed model.
import { readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENEMIES, PROFESSIONS, TIERS, TRAP_KINDS, WEAPONS } from '../core/data.ts';
import type { TurretState } from '../core/horde.ts';
import {
  ART_IDS,
  ART_URLS,
  BASE_ART,
  DEFENDER_ART,
  ENEMY_ART,
  GATE_POSTS,
  GUNNER_ART,
  LOAD_TIMEOUT_MS,
  loadArt,
  SHOP_ICON,
  SKILL_ART,
  SKILL_ICON,
  TIER_ART,
  TRAP_ART,
  TURRET_ART,
} from './sprites.ts';

const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('art-src/manifest.json', root), 'utf8')) as {
  assets: {
    id: string;
    kind: string;
    model?: string;
    prompt?: string;
    ref?: string | string[];
    part?: true;
    mutant?: true;
  }[];
};
/** Generations used only as references of other sprites (ID-046), and the rest. */
const parts = manifest.assets.filter((a) => a.part);
const shipped = manifest.assets.filter((a) => !a.part);
const credits = readFileSync(new URL('docs/art-credits.md', root), 'utf8');
const ids = new Set<string>(ART_IDS);

/** HSV saturation of 0–255 channels, 0 to 1. */
const saturation = (r: number, g: number, b: number): number => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};

/** A sprite's pixels: decodes the 8-bit RGBA, non-interlaced PNG the art build writes. */
function pixels(id: string): { w: number; h: number; px: Uint8Array } {
  const png = readFileSync(new URL(`src/assets/art/${id}.png`, root));
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  expect([png[24], png[25], png[28]], id).toEqual([8, 6, 0]);
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
      idat.push(png.subarray(at + 8, at + 8 + len));
    at += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const row = w * 4;
  const px = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (row + 1)]!;
    for (let x = 0; x < row; x++) {
      const v = raw[y * (row + 1) + 1 + x]!;
      const a = x >= 4 ? px[y * row + x - 4]! : 0;
      const b = y > 0 ? px[(y - 1) * row + x]! : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * row + x - 4]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][filter]!;
      px[y * row + x] = (v + pred) & 0xff;
    }
  }
  return { w, h, px };
}

/** The share of a sprite's opaque pixels (alpha over half) that are saturated (over 0.5). */
function saturatedShare(id: string): number {
  const { px } = pixels(id);
  let opaque = 0;
  let saturated = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! <= 128) continue;
    opaque++;
    if (saturation(px[i]!, px[i + 1]!, px[i + 2]!) > 0.5) saturated++;
  }
  return saturated / opaque;
}

/** The PNG colour type from its header: 6 is RGBA (has transparency), 2 is RGB. */
const colourType = (id: string): number =>
  readFileSync(new URL(`src/assets/art/${id}.png`, root))[25]!;

describe('art coverage', () => {
  it('bundles a file for every art id, and no file without one', () => {
    expect(Object.keys(ART_URLS).sort()).toEqual([...ART_IDS].sort());
  });

  it('maps every enemy kind, profession, turret state, trap kind and wall tier to art', () => {
    const states: TurretState[] = ['lit', 'dark', 'jammed', 'offline'];
    const used = [
      ...Object.keys(ENEMIES).map((k) => ENEMY_ART[k as keyof typeof ENEMY_ART]),
      ...Object.keys(PROFESSIONS).map((p) => DEFENDER_ART[p as keyof typeof DEFENDER_ART]),
      ...Object.values(GUNNER_ART),
      ...Object.values(SKILL_ART),
      ...Object.values(SHOP_ICON),
      ...Object.values(SKILL_ICON),
      ...states.map((s) => TURRET_ART[s]),
      ...TRAP_KINDS.flatMap((k) => [TRAP_ART[k].built, TRAP_ART[k].broken]),
      ...Object.keys(TIERS).flatMap((t) => Object.values(TIER_ART[t as keyof typeof TIER_ART])),
      ...Object.values(BASE_ART).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))),
    ];
    for (const id of used) expect(ids.has(id), String(id)).toBe(true);
    // And no art goes unused.
    expect(new Set(used)).toEqual(ids);
  });

  it('gives every enemy kind its own art, the Horror included (ID-041)', () => {
    const kinds = Object.keys(ENEMIES) as (keyof typeof ENEMY_ART)[];
    expect(kinds.map((k) => ENEMY_ART[k])).toEqual(kinds);
  });

  it('keeps the mutants and the Horror saturated and mutes the Runner (ID-051, ID-041, §15)', () => {
    const mutant = (id: string): boolean =>
      manifest.assets.find((a) => a.id === id)?.mutant === true;
    for (const k of ['crawler', 'swollen', 'spewer', 'brute', 'screamer', 'horror']) {
      expect(mutant(k), k).toBe(true);
      // The Brute's grey armour makes it the least saturated mutant: about 0.38.
      expect(saturatedShare(k), k).toBeGreaterThan(0.35);
    }
    expect(mutant('runner')).toBe(false);
    expect(saturatedShare('runner')).toBeLessThan(0.2);
  });

  it("fills each tier gate's width with its posts as the renderer expects (ID-054)", () => {
    for (const tier of Object.keys(TIERS) as (keyof typeof TIER_ART)[]) {
      const id = TIER_ART[tier].gate;
      const { w, px } = pixels(id);
      // The top post's rows: the posts' right edge, the leaves never reach that high.
      let posts = 0;
      for (let x = 0; x < w; x++) if (px[(2 * w + x) * 4 + 3]! > 128) posts = x + 1;
      expect(Math.abs(posts / w - GATE_POSTS), id).toBeLessThan(1 / w + 0.01);
    }
  });

  it('gives every gun a Gunner sprite of its own (ID-046)', () => {
    const guns = Object.keys(WEAPONS).filter((id) =>
      ['sidearm', 'gun'].includes(WEAPONS[id as keyof typeof WEAPONS].kind),
    );
    expect(Object.keys(GUNNER_ART).sort()).toEqual(guns.sort());
    expect(new Set(Object.values(GUNNER_ART)).size).toBe(guns.length);
  });

  it('draws each turret state and each broken trap in a sprite of its own', () => {
    expect(new Set([TURRET_ART.lit, TURRET_ART.dark, TURRET_ART.jammed]).size).toBe(3);
    for (const k of TRAP_KINDS) expect(TRAP_ART[k].broken).not.toBe(TRAP_ART[k].built);
  });
});

describe('art sources', () => {
  it('records every art id in the manifest, and nothing else', () => {
    expect(shipped.map((a) => a.id).sort()).toEqual([...ART_IDS].sort());
  });

  it('uses every part as a reference of a shipped sprite', () => {
    const refs = new Set(shipped.flatMap((a) => (a.ref === undefined ? [] : [a.ref].flat())));
    for (const a of parts) expect(refs.has(a.id), a.id).toBe(true);
  });

  it('uses only allow-listed models, never a service URL', () => {
    const allowed = [...credits.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
    expect(allowed.length).toBeGreaterThan(0);
    for (const a of manifest.assets) expect(allowed, a.id).toContain(a.model);
    expect(JSON.stringify(manifest)).not.toMatch(/https?:|\.ai\b/);
  });

  it('commits no generation that still carries its request (references, service URLs)', () => {
    for (const dir of ['art-src/gen/', 'art-concepts/']) {
      for (const name of readdirSync(new URL(dir, root)).filter((n) => n.endsWith('.jpg'))) {
        const bytes = readFileSync(new URL(dir + name, root)).toString('latin1');
        expect(bytes, dir + name).not.toMatch(/https?:|pollinations/i);
      }
    }
  });

  it('gives every sprite a transparent background', () => {
    for (const a of shipped) {
      if (a.kind === 'sprite') expect(colourType(a.id), a.id).toBe(6);
    }
  });
});

/** A stand-in for the page's `Image`: loads, fails or hangs by its URL. */
function fakeImages(fate: (url: string) => 'load' | 'error' | 'hang') {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        const f = fate(url);
        if (f !== 'hang') queueMicrotask(() => (f === 'load' ? this.onload : this.onerror)?.());
      }
    },
  );
}

describe('loading the art', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads every sprite by id', async () => {
    fakeImages(() => 'load');
    expect(Object.keys(await loadArt()).sort()).toEqual([...ART_IDS].sort());
  });

  it('rejects naming the sprites that failed', async () => {
    fakeImages((url) =>
      url.includes('/gunner.') || url.includes('/wood-gate.') ? 'error' : 'load',
    );
    await expect(loadArt()).rejects.toThrow('art failed to load: gunner, wood-gate');
  });

  it('gives up on a sprite that never loads', async () => {
    vi.useFakeTimers();
    fakeImages((url) => (url.includes('/tent') ? 'hang' : 'load'));
    const loading = loadArt();
    const settled = expect(loading).rejects.toThrow('art failed to load: tent');
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    await settled;
  });
});
