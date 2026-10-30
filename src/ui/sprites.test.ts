// ID-043: every thing the horde view draws has bundled art, and the art is
// reproducible from art-src/manifest.json with an allowed model.
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENEMIES, PROFESSIONS, TIERS, TRAP_KINDS, WEAPONS } from '../core/data.ts';
import type { TurretState } from '../core/horde.ts';
import {
  ART_IDS,
  ART_URLS,
  BASE_ART,
  DEFENDER_ART,
  ENEMY_ART,
  GUNNER_ART,
  LOAD_TIMEOUT_MS,
  loadArt,
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
  }[];
};
/** Generations used only as references of other sprites (ID-046), and the rest. */
const parts = manifest.assets.filter((a) => a.part);
const shipped = manifest.assets.filter((a) => !a.part);
const credits = readFileSync(new URL('docs/art-credits.md', root), 'utf8');
const ids = new Set<string>(ART_IDS);

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
      ...Object.keys(ENEMIES).flatMap((k) => {
        const look = ENEMY_ART[k as keyof typeof ENEMY_ART];
        return 'art' in look ? [look.art] : [];
      }),
      ...Object.keys(PROFESSIONS).map((p) => DEFENDER_ART[p as keyof typeof DEFENDER_ART]),
      ...Object.values(GUNNER_ART),
      ...states.map((s) => TURRET_ART[s]),
      ...TRAP_KINDS.flatMap((k) => [TRAP_ART[k].built, TRAP_ART[k].broken]),
      ...Object.keys(TIERS).flatMap((t) => Object.values(TIER_ART[t as keyof typeof TIER_ART])),
      ...Object.values(BASE_ART).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))),
    ];
    for (const id of used) expect(ids.has(id), String(id)).toBe(true);
    // And no art goes unused.
    expect(new Set(used)).toEqual(ids);
  });

  it('gives every enemy kind art or a placeholder shape of its own; only mutants are saturated (ID-023)', () => {
    const kinds = Object.keys(ENEMIES) as (keyof typeof ENEMY_ART)[];
    const shapes = kinds.flatMap((k) => {
      const look = ENEMY_ART[k];
      return 'shape' in look ? [look.shape] : [];
    });
    expect(shapes.length + kinds.filter((k) => 'art' in ENEMY_ART[k]).length).toBe(kinds.length);
    expect(new Set(shapes).size).toBe(shapes.length);
    const saturation = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r!, g!, b!);
      return max === 0 ? 0 : (max - Math.min(r!, g!, b!)) / max;
    };
    for (const k of kinds) {
      const look = ENEMY_ART[k];
      if (!('colour' in look)) continue;
      const mutant = !['shambler', 'runner'].includes(k);
      expect(saturation(look.colour) > 0.5, k).toBe(mutant);
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
    fakeImages((url) => (url.includes('/gunner.') || url.includes('/gate.') ? 'error' : 'load'));
    await expect(loadArt()).rejects.toThrow('art failed to load: gunner, gate');
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
