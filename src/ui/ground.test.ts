// ID-050: one seamless ground: seeded tile variants and decals, the same layout every
// load, painted whole so no tile edge shows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD } from '../core/data.ts';
import { CAMP_YARD, GROUND_SEED, GROUND_TILE, groundCanvas, groundLayout } from './ground.ts';
import { ART_IDS, BASE_ART, type Art, type ArtId } from './sprites.ts';

describe('ground layout', () => {
  it('is the same for the same seed, and differs for another', () => {
    expect(groundLayout(GROUND_SEED)).toEqual(groundLayout(GROUND_SEED));
    expect(groundLayout(GROUND_SEED + 1)).not.toEqual(groundLayout(GROUND_SEED));
  });

  it('covers the field with tiles, using every variant', () => {
    const { tiles } = groundLayout(GROUND_SEED);
    expect(tiles).toHaveLength(Math.ceil(FIELD.height / GROUND_TILE));
    for (const row of tiles) expect(row).toHaveLength(Math.ceil(FIELD.right / GROUND_TILE));
    expect(new Set(tiles.flat())).toEqual(new Set(BASE_ART.groundTiles));
  });

  it('scatters every kind of decal, each whole inside the field', () => {
    const { decals } = groundLayout(GROUND_SEED);
    expect(new Set(decals.map((d) => d.art))).toEqual(new Set(BASE_ART.decals));
    for (const d of decals) {
      expect(d.x - d.size / 2).toBeGreaterThanOrEqual(0);
      expect(d.x + d.size / 2).toBeLessThanOrEqual(FIELD.right);
      expect(d.y - d.size / 2).toBeGreaterThanOrEqual(0);
      expect(d.y + d.size / 2).toBeLessThanOrEqual(FIELD.height);
    }
  });
});

/** Everything the painted canvases were asked to do, in order. */
type Call = { canvas: number; op: string; args: unknown[] };

describe('painting the ground', () => {
  let calls: Call[];
  let sizes: { w: number; h: number }[];
  beforeEach(() => {
    calls = [];
    sizes = [];
    vi.stubGlobal(
      'DOMMatrix',
      class {
        scale() {
          return this;
        }
      },
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width: number;
        height: number;
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          const canvas = sizes.push({ w: width, h: height }) - 1;
          const log =
            (op: string) =>
            (...args: unknown[]) =>
              calls.push({ canvas, op, args });
          this.ctx = {
            globalAlpha: 1,
            drawImage: log('drawImage'),
            fillRect: log('fillRect'),
            save: log('save'),
            restore: log('restore'),
            translate: log('translate'),
            scale: log('scale'),
            createPattern: () => ({ setTransform: () => {} }),
            createLinearGradient: (...args: unknown[]) => {
              calls.push({ canvas, op: 'gradient', args });
              return { addColorStop: log('stop') };
            },
          };
        }
        ctx: unknown;
        getContext() {
          return this.ctx;
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const art = () =>
    Object.fromEntries(
      ART_IDS.map((id) => [id, { id, width: 256, height: 256 }]),
    ) as unknown as Art;
  const id = (c: Call) => (c.args[0] as { id?: ArtId }).id;

  it('lays each tile at its own size on whole pixels, as the layout says', () => {
    groundCanvas(art());
    const px = 256 / GROUND_TILE;
    expect(sizes[0]).toEqual({ w: FIELD.right * px, h: FIELD.height * px });
    const { tiles } = groundLayout(GROUND_SEED);
    const drawn = calls.filter((c) => c.canvas === 0 && c.op === 'drawImage');
    const tileDraws = drawn.slice(0, tiles.flat().length);
    tiles.forEach((row, r) =>
      row.forEach((variant, c) => {
        const call = tileDraws[r * row.length + c]!;
        expect(id(call)).toBe(variant);
        expect(call.args.slice(1)).toEqual([c * 256, r * 256, 256, 256]);
      }),
    );
  });

  it('blends the yard in, then lays the decals over field and yard', () => {
    groundCanvas(art());
    const { tiles, decals } = groundLayout(GROUND_SEED);
    const drawn = calls.filter((c) => c.canvas === 0 && c.op === 'drawImage');
    // Tiles, then the yard canvas, then every decal in order.
    expect(id(drawn[tiles.flat().length]!)).toBeUndefined();
    expect(drawn.slice(tiles.flat().length + 1).map(id)).toEqual(decals.map((d) => d.art));
    // The yard fades in before its strip and out after it.
    const stops = calls.filter((c) => c.canvas === 1 && c.op === 'stop').map((c) => c.args);
    expect(stops.map((s) => s[1])).toEqual([
      'rgba(0,0,0,0)',
      'rgba(0,0,0,1)',
      'rgba(0,0,0,1)',
      'rgba(0,0,0,0)',
    ]);
    const at = stops.map((s) => s[0] as number);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(sizes[1]!.w).toBeCloseTo(((CAMP_YARD.x1 + CAMP_YARD.feather) * 256) / GROUND_TILE);
  });

  it('gives up once, not every frame, where the browser has no OffscreenCanvas', () => {
    let made = 0;
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {
          made++;
          throw new Error('unsupported');
        }
      },
    );
    const a = art();
    expect(groundCanvas(a)).toBeNull();
    expect(groundCanvas(a)).toBeNull();
    expect(made).toBe(1);
  });

  it('paints once per set of art', () => {
    const a = art();
    const first = groundCanvas(a);
    const n = calls.length;
    expect(groundCanvas(a)).toBe(first);
    expect(calls.length).toBe(n);
  });
});
