// ID-043: every thing the horde view draws has bundled art, and the art is
// reproducible from art-src/manifest.json with an allowed model.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildingsOf,
  ENEMIES,
  LOCATION_IDS,
  PLACE_IDS,
  PROFESSIONS,
  TIERS,
  TRAP_KINDS,
  WEAPONS,
} from '../core/data.ts';
import type { TurretState } from '../core/horde.ts';
import { FIREBALL } from './explosion.ts';
import { SPIT } from './spit.ts';
import {
  ART_IDS,
  ART_URLS,
  BASE_ART,
  CARD_ICON,
  DEFENDER_ART,
  ENEMY_ART,
  GUN_ICON,
  GUNNER_ART,
  GUNNER_LOOKS,
  THROW_LOOKS,
  LOAD_TIMEOUT_MS,
  LOOKS,
  lookOf,
  loadArt,
  LAZY_ART,
  MAP_ART,
  MAP_PICTURE,
  TITLE_PICTURE,
  placeArt,
  RESOURCE_ICON,
  RESOURCE_IDS,
  SHOP_ICON,
  SCORCH_ART,
  BOMB_ART,
  SKILL_ICON,
  TIER_ART,
  TRAP_ART,
  TURRET_ART,
} from './sprites.ts';
import { DEATH } from './death.ts';
import { SHOCK } from './render.ts';

const root = new URL('../../', import.meta.url);
type Overlay = { part: string; at: [number, number]; size: number; turn?: number };
const manifest = JSON.parse(readFileSync(new URL('art-src/manifest.json', root), 'utf8')) as {
  assets: {
    id: string;
    kind: string;
    model?: string;
    prompt?: string;
    ref?: string | string[];
    part?: true;
    mutant?: true;
    pose?: string;
    frames?: string;
    overlay?: Overlay | Overlay[];
    draw?: unknown;
    outside?: unknown;
    seed?: number;
    photo?: string;
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

  it('maps every enemy kind, profession, turret state, trap kind, wall tier, map location and the title to art', () => {
    const states: TurretState[] = ['lit', 'dark', 'jammed', 'offline'];
    const used = [
      ...Object.values(ENEMY_ART).flatMap((e) => [...e.walk, e.attack]),
      ...Object.keys(PROFESSIONS).map((p) => DEFENDER_ART[p as keyof typeof DEFENDER_ART]),
      ...GUNNER_LOOKS.flatMap((look) => Object.values(look).flatMap((g) => [g.idle, g.aim])),
      ...THROW_LOOKS.flatMap((t) => [t.wind, t.release]),
      SCORCH_ART,
      BOMB_ART,
      ...Object.values(FIREBALL.art),
      ...Object.values(SPIT.art),
      ...SHOCK.art,
      ...Object.values(DEATH.art),
      ...Object.values(SHOP_ICON),
      ...Object.values(SKILL_ICON),
      ...Object.values(CARD_ICON),
      ...Object.values(RESOURCE_ICON),
      ...Object.values(GUN_ICON),
      ...LOCATION_IDS.map((l) => MAP_ART[l]),
      MAP_PICTURE,
      TITLE_PICTURE,
      ...states.map((s) => TURRET_ART[s]),
      ...TRAP_KINDS.flatMap((k) => [TRAP_ART[k].built, TRAP_ART[k].broken]),
      ...Object.keys(TIERS).flatMap((t) => Object.values(TIER_ART[t as keyof typeof TIER_ART])),
      ...Object.values(BASE_ART).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))),
    ];
    for (const id of used) expect(ids.has(id), String(id)).toBe(true);
    // And no art goes unused.
    expect(new Set(used)).toEqual(ids);
  });

  it("gives every place, plazas included, an icon of its buildings' art, bundled (ID-029)", () => {
    for (const id of PLACE_IDS) {
      expect(placeArt(id), id).toEqual(buildingsOf(id).map((b) => MAP_ART[b]));
      for (const art of placeArt(id)) expect(ART_URLS[art], `${id} ${art}`).toBeTruthy();
    }
    expect(placeArt('riverside')).toHaveLength(3);
    expect(placeArt('gas-station')).toEqual([MAP_ART['gas-station']]);
  });

  it('gives each of the nine resources its own bundled icon (ID-056)', () => {
    expect([...RESOURCE_IDS]).toEqual([
      'scrap',
      'wood',
      'metal',
      'concrete',
      'food',
      'gas',
      'cash',
      'bank',
      'genes',
    ]);
    const icons = RESOURCE_IDS.map((r) => RESOURCE_ICON[r]);
    expect(new Set(icons).size).toBe(RESOURCE_IDS.length);
    for (const icon of icons) {
      expect(ART_URLS[icon], icon).toBeTruthy();
      expect(ids.has(icon), icon).toBe(true);
    }
  });

  it('gives every enemy kind, the Horror included, three walk frames and an attack (ID-069)', () => {
    const kinds = Object.keys(ENEMIES) as (keyof typeof ENEMY_ART)[];
    for (const k of kinds) {
      const frames = [...ENEMY_ART[k].walk, ENEMY_ART[k].attack];
      expect(frames, k).toEqual([`${k}-walk-a`, `${k}-walk-b`, `${k}-walk-c`, `${k}-attack`]);
      expect(new Set(frames).size).toBe(4);
    }
  });

  it('lines up each frame set: one size, posed from puppets, one set per kind and gun (ID-069)', () => {
    const sets = [
      ...Object.values(ENEMY_ART).map((e) => [...e.walk, e.attack]),
      ...GUNNER_LOOKS.flatMap((look) => Object.values(look).map((g) => [g.idle, g.aim])),
      ...THROW_LOOKS.map((t) => [t.wind, t.release]),
    ];
    for (const set of sets) {
      const sizes = new Set(set.map((id) => `${pixels(id).w}x${pixels(id).h}`));
      expect(sizes.size, set[0]).toBe(1);
      const entries = set.map((id) => manifest.assets.find((a) => a.id === id));
      expect(new Set(entries.map((a) => a?.frames)).size, set[0]).toBe(1);
      for (const a of entries) {
        // A survivor look (ID-074) repaints the soldier's frame, so it is posed by that frame.
        const posed = a?.pose ? a : manifest.assets.find((b) => b.id === a?.ref);
        expect(posed?.pose, a?.id).toMatch(/^[a-z]+-[a-z0-9]+$/);
        expect(existsSync(new URL(`art-src/poses/${posed!.pose}.png`, root)), a?.id).toBe(true);
      }
    }
    // Every survivor stands the same height, whatever the reach of their aimed gun.
    const heights = GUNNER_LOOKS.flatMap((look) =>
      Object.values(look).map((g) => pixels(g.idle).h),
    );
    expect(new Set(heights)).toEqual(new Set([192]));
    // The throw stands the same height too (ID-119), so swapping to it doesn't resize anyone.
    const throws = THROW_LOOKS.flatMap((t) => [pixels(t.wind).h, pixels(t.release).h]);
    expect(new Set(throws)).toEqual(new Set([192]));
  });

  it('puts the release hand where the release sprite reaches furthest (ID-119)', () => {
    for (const t of THROW_LOOKS) {
      const { w, h, px } = pixels(t.release);
      let right = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]! > 128) right = Math.max(right, x);
      }
      const rows: number[] = [];
      for (let y = 0; y < h; y++) if (px[(y * w + right) * 4 + 3]! > 128) rows.push(y);
      const mid = rows.reduce((a, b) => a + b, 0) / rows.length;
      expect(Math.abs(right - w / 2 - t.hand.x), t.release).toBeLessThanOrEqual(2);
      expect(Math.abs(h - mid - t.hand.y), t.release).toBeLessThanOrEqual(2);
      // Ahead of the body and up above the shoulder; the held grenade behind the head.
      expect(t.hand.x, t.release).toBeGreaterThan(50);
      expect(t.hand.y / h, t.release).toBeGreaterThan(0.75);
      expect(t.held.x, t.wind).toBeLessThan(0);
      expect(t.held.y / h, t.wind).toBeGreaterThan(0.75);
    }
  });

  it("puts each gun's barrel tip where its aim sprite's gun ends (ID-069)", () => {
    for (const [gun, g] of GUNNER_LOOKS.flatMap((look) => Object.entries(look))) {
      const { w, h, px } = pixels(g.aim);
      let right = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]! > 128) right = Math.max(right, x);
      }
      const rows: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = right - 2; x <= right; x++) if (px[(y * w + x) * 4 + 3]! > 128) rows.push(y);
      }
      rows.sort((a, b) => a - b);
      const mid = rows[Math.floor(rows.length / 2)]!;
      expect(Math.abs(right + 1 - w / 2 - g.barrel.x), gun).toBeLessThanOrEqual(2);
      expect(Math.abs(h - mid - g.barrel.y), gun).toBeLessThanOrEqual(2);
      // Aimed level, out in front: right of the body and about shoulder height.
      expect(g.barrel.x, gun).toBeGreaterThan(60);
      expect(g.barrel.y / h, gun).toBeGreaterThan(0.6);
    }
  });

  it("keeps each turned kind's clothes in colour and the Horror the most saturated (ID-144, §15)", () => {
    const mutant = (id: string): boolean =>
      manifest.assets.find((a) => a.id === id)?.mutant === true;
    const kinds = Object.keys(ENEMY_ART) as (keyof typeof ENEMY_ART)[];
    // Every kind but the Runner keeps its colours (manifest `mutant`): the clothes that tell
    // the kinds apart in a crowd (ID-144). The Runner's orange vest is muted, as before.
    for (const k of kinds) {
      for (const id of [...ENEMY_ART[k].walk, ENEMY_ART[k].attack]) {
        expect(mutant(id), id).toBe(k !== 'runner');
      }
    }
    // The Horror, the one true mutant left, is the most saturated: raw flesh red, about 0.66;
    // the rest are clothed people, at most about 0.45 (the Spewer's sickly skin).
    const share = (k: keyof typeof ENEMY_ART) => Math.max(...ENEMY_ART[k].walk.map(saturatedShare));
    const horror = Math.min(...ENEMY_ART.horror.walk.map(saturatedShare));
    expect(horror).toBeGreaterThan(0.5);
    for (const k of kinds.filter((k) => k !== 'horror'))
      expect(share(k), k).toBeLessThan(horror - 0.1);
  });

  it('gives every tier one sliding gate outline, a solid panel as tall as two widths (ID-075)', () => {
    const sizes = new Set<string>();
    for (const tier of Object.keys(TIERS) as (keyof typeof TIER_ART)[]) {
      const id = TIER_ART[tier].gate;
      const { w, h, px } = pixels(id);
      sizes.add(`${w}x${h}`);
      expect(h / w, id).toBeGreaterThan(1.7);
      expect(h / w, id).toBeLessThan(2.6);
      // Closed: the panel fills its middle row (its end caps are a little wider), no gap onto a passage.
      const mid = Math.floor(h / 2);
      let solid = 0;
      for (let x = 0; x < w; x++) if (px[(mid * w + x) * 4 + 3]! > 128) solid++;
      expect(solid / w, id).toBeGreaterThan(0.85);
    }
    expect(sizes.size).toBe(1);
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

  it('uses every part as a reference or overlay of a shipped sprite', () => {
    // ID-103: the card bullet is pasted onto card icons as an overlay, not edited.
    const used = new Set(
      shipped.flatMap((a) => [
        ...(a.ref === undefined ? [] : [a.ref].flat()),
        ...(a.overlay ? [a.overlay].flat().map((o) => o.part) : []),
      ]),
    );
    for (const a of parts) expect(used.has(a.id), a.id).toBe(true);
  });

  it('uses only allow-listed models, never a service URL', () => {
    const allowed = [...credits.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
    expect(allowed.length).toBeGreaterThan(0);
    for (const a of manifest.assets) {
      // A drawn sprite (ID-103) is a polygon the build draws: no model, no prompt.
      if (a.draw !== undefined) expect([a.model, a.prompt], a.id).toEqual([undefined, undefined]);
      else expect(allowed, a.id).toContain(a.model);
    }
    expect(JSON.stringify(manifest)).not.toMatch(/https?:|\.ai\b/);
  });

  it('commits no generation that still carries its request (references, service URLs)', () => {
    for (const dir of ['art-src/gen/', 'art-concepts/']) {
      for (const name of readdirSync(new URL(dir, root)).filter((n) => n.endsWith('.jpg'))) {
        const bytes = readFileSync(new URL(dir + name, root)).toString('latin1');
        // ID-103: an app's own metadata (XMP, its AI-made tag) is stripped too.
        expect(bytes, dir + name).not.toMatch(/https?:|pollinations|xmpmeta|algorithmicmedia/i);
      }
    }
  });

  it('keeps every overlay a part placed beside or on its sprite at a sane size', () => {
    // ID-103: overlay is one {part, at, size, turn?} or a non-empty list of them.
    const partIds = new Set(parts.map((p) => p.id));
    for (const a of manifest.assets.filter((x) => x.overlay !== undefined)) {
      const list = [a.overlay!].flat();
      expect(list.length, a.id).toBeGreaterThan(0);
      for (const o of list) {
        expect(partIds.has(o.part), a.id).toBe(true);
        expect(
          o.at.every((v) => v >= -1 && v <= 2),
          a.id,
        ).toBe(true);
        expect(o.size > 0 && o.size <= 1, a.id).toBe(true);
      }
    }
  });

  it('marks art made outside the build as such: a sprite with a prompt, no seed, its source kept', () => {
    // ID-103: the owner generated some card icons in an app, so there is no seed to replay.
    const outside = manifest.assets.filter((a) => a.outside !== undefined);
    expect(outside.length).toBeGreaterThan(0);
    for (const a of outside) {
      expect([a.outside, a.kind, a.model], a.id).toEqual([true, 'sprite', 'meta-ai']);
      expect(a.prompt, a.id).toBeTruthy();
      const extra = [a.seed, a.ref, a.pose, a.photo, a.draw, a.frames, a.part];
      expect(
        extra.every((v) => v === undefined),
        a.id,
      ).toBe(true);
      expect(existsSync(new URL(`art-src/gen/${a.id}.jpg`, root)), a.id).toBe(true);
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

  it('never waits for, or fails on, the lazy art', async () => {
    expect(LAZY_ART).toEqual(['world-map', 'title-dusk']);
    fakeImages((url) => (/\/(world-map|title-dusk)/.test(url) ? 'error' : 'load'));
    expect(Object.keys(await loadArt()).sort()).toEqual([...ART_IDS].sort());
    vi.useFakeTimers();
    fakeImages((url) => (/\/(world-map|title-dusk)/.test(url) ? 'hang' : 'load'));
    const art = loadArt();
    await vi.advanceTimersByTimeAsync(0);
    await expect(art).resolves.toBeDefined();
  });

  it('rejects naming the sprites that failed', async () => {
    fakeImages((url) =>
      url.includes('/brute-attack.') || url.includes('/wood-gate.') ? 'error' : 'load',
    );
    await expect(loadArt()).rejects.toThrow('art failed to load: brute-attack, wood-gate');
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

describe('survivor looks (ID-074)', () => {
  it('gives every look its own idle and aim sprite for every gun, the soldier first', () => {
    expect(LOOKS).toBe(4);
    expect(GUNNER_LOOKS[0]).toBe(GUNNER_ART);
    const ids = new Set<string>(ART_IDS);
    const seen = new Set<string>();
    for (const look of GUNNER_LOOKS) {
      expect(Object.keys(look).sort()).toEqual(Object.keys(GUNNER_ART).sort());
      for (const g of Object.values(look)) {
        for (const id of [g.idle, g.aim]) {
          expect(ids.has(id), id).toBe(true);
          expect(seen.has(id), id).toBe(false);
          seen.add(id);
        }
      }
    }
  });

  it('keeps a look per survivor id: consecutive recruits differ, the first is the soldier', () => {
    const looks = [1, 2, 3, 4].map((n) => lookOf(`recruit-${n}`));
    expect(looks).toEqual([0, 1, 2, 3]);
    expect(lookOf('recruit-5')).toBe(lookOf('recruit-1'));
    expect(lookOf('s3-2')).toBe(lookOf('recruit-2'));
    expect(lookOf('c7')).toBe(lookOf('c7'));
    expect(lookOf('bob')).toBe(lookOf('bob'));
  });

  it('stays in range for any id, however long or odd (ids come from saves)', () => {
    const odd = [
      '',
      '0',
      'bob',
      'x'.repeat(100_000),
      '9'.repeat(100_000),
      `a${'1'.repeat(400)}`,
      'recruit-\u202e1',
      'r\u200b1',
      '__proto__',
      '😀',
    ];
    for (const id of odd) {
      const look = lookOf(id);
      expect(Number.isInteger(look), id.slice(0, 20)).toBe(true);
      expect(look).toBeGreaterThanOrEqual(0);
      expect(look).toBeLessThan(LOOKS);
      expect(GUNNER_LOOKS[look]).toBeDefined();
    }
  });
});
