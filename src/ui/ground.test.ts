// ID-050: one seamless ground: seeded tile variants and decals, the same layout every
// load, painted whole so no tile edge shows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLUMNS, FIELD, WALL } from '../core/data.ts';
import {
  CAMP_YARD,
  GRASS,
  GROUND_SEED,
  GROUND_TILE,
  groundCanvas,
  groundLayout,
  SURROUND_BLOCK,
  surroundCanvas,
  surroundLayout,
} from './ground.ts';
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

describe('green grass (ID-071)', () => {
  const { grass } = groundLayout(GROUND_SEED);

  it('scatters patches of tufts over the field, each tuft whole inside it', () => {
    expect(grass.length).toBeGreaterThanOrEqual(GRASS.patches * GRASS.tufts.min);
    expect(grass.length).toBeLessThanOrEqual(GRASS.patches * GRASS.tufts.max);
    for (const t of grass) {
      expect(t.art).toBe(BASE_ART.grass);
      expect(t.size).toBeGreaterThanOrEqual(GRASS.size.min);
      expect(t.size).toBeLessThanOrEqual(GRASS.size.max);
      expect(t.x - t.size / 2).toBeGreaterThanOrEqual(0);
      expect(t.x + t.size / 2).toBeLessThanOrEqual(FIELD.right);
      expect(t.y - t.size / 2).toBeGreaterThanOrEqual(0);
      expect(t.y + t.size / 2).toBeLessThanOrEqual(FIELD.height);
    }
  });

  it('keeps out of the survivors’ lane behind and just past the first wall', () => {
    expect(GRASS.from).toBeGreaterThan(COLUMNS[0]! + WALL.depth);
    for (const t of grass) expect(t.x - t.size / 2).toBeGreaterThanOrEqual(GRASS.from);
  });

  it('reaches across the whole field, not one corner', () => {
    const xs = grass.map((t) => t.x);
    const ys = grass.map((t) => t.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(FIELD.right / 2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(FIELD.height / 2);
  });

  it('is tinted green: more green than red or blue', () => {
    const [r, g, b] = GRASS.tint.match(/[\d.]+/g)!.map(Number);
    expect(g).toBeGreaterThan(r!);
    expect(g).toBeGreaterThan(b!);
  });
});

describe('ground past the field (ID-057)', () => {
  it('repeats a seeded block of the same tile variants, the same every load', () => {
    const block = surroundLayout(GROUND_SEED);
    expect(block).toEqual(surroundLayout(GROUND_SEED));
    expect(block).toHaveLength(SURROUND_BLOCK);
    for (const row of block) expect(row).toHaveLength(SURROUND_BLOCK);
    for (const id of block.flat()) expect(BASE_ART.groundTiles).toContain(id);
    // Mixed, so the repeat doesn't read as one tile stamped over and over.
    expect(new Set(block.flat()).size).toBeGreaterThan(1);
  });
});

/** Everything the painted canvases were asked to do, in order. */
type Call = { canvas: number; op: string; args: unknown[]; comp?: unknown; style?: unknown };

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
          const ctx: Record<string, unknown> = {
            globalAlpha: 1,
            drawImage: log('drawImage'),
            // With the composite op and style it fills with.
            fillRect: (...args: unknown[]) =>
              calls.push({
                canvas,
                op: 'fillRect',
                args,
                comp: ctx.globalCompositeOperation,
                style: ctx.fillStyle,
              }),
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
          this.ctx = ctx;
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
    // Tiles, then the yard canvas, then every decal in order, then the green grass.
    expect(id(drawn[tiles.flat().length]!)).toBeUndefined();
    const after = drawn.slice(tiles.flat().length + 1);
    expect(after.slice(0, decals.length).map(id)).toEqual(decals.map((d) => d.art));
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

  it('lays the green grass last, from the dry-grass art tinted over its own pixels (ID-071)', () => {
    const a = art();
    groundCanvas(a);
    const { tiles, decals, grass } = groundLayout(GROUND_SEED);
    // Canvas 2 is the tinted tuft: the grass art at its own size, then the tint over it.
    expect(sizes[2]).toEqual({ w: 256, h: 256 });
    const tint = calls.filter((c) => c.canvas === 2);
    expect(tint.map((c) => c.op)).toEqual(['drawImage', 'fillRect']);
    expect(id(tint[0]!)).toBe(BASE_ART.grass);
    // Over the art's own pixels only: without source-atop every tuft is a green square.
    expect(tint[1]).toMatchObject({ comp: 'source-atop', style: GRASS.tint });
    const drawn = calls.filter((c) => c.canvas === 0 && c.op === 'drawImage');
    const tufts = drawn.slice(tiles.flat().length + 1 + decals.length);
    expect(tufts).toHaveLength(grass.length);
    for (const t of tufts) expect(id(t)).toBeUndefined(); // the tinted canvas, not raw art
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

  it("paints the block past the field at its tiles' own size, once per set of art", () => {
    const a = art();
    const block = surroundCanvas(a);
    expect(sizes[0]).toEqual({ w: SURROUND_BLOCK * 256, h: SURROUND_BLOCK * 256 });
    const drawn = calls.filter((c) => c.canvas === 0 && c.op === 'drawImage');
    surroundLayout(GROUND_SEED).forEach((row, r) =>
      row.forEach((variant, c) => {
        const call = drawn[r * SURROUND_BLOCK + c]!;
        expect(id(call)).toBe(variant);
        expect(call.args.slice(1)).toEqual([c * 256, r * 256, 256, 256]);
      }),
    );
    expect(drawn).toHaveLength(SURROUND_BLOCK * SURROUND_BLOCK);
    const n = calls.length;
    expect(surroundCanvas(a)).toBe(block);
    expect(calls.length).toBe(n);
  });

  it('leaves the block out, once, where the browser has no OffscreenCanvas', () => {
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
    expect(surroundCanvas(a)).toBeNull();
    expect(surroundCanvas(a)).toBeNull();
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
