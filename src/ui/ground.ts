// The ground under the field and the camp's yard (design §15, ID-050): seeded tile
// variants that share one seam border, the yard feathered into the field and decals
// scattered over both, painted once into a field-sized canvas the renderer draws whole,
// so no tile edge can show at any zoom. Past the field's edges a seeded block of the
// same tiles repeats without end (ID-057), so no bare background shows at any zoom or pan.
import { CAMP, FIELD } from '../core/data.ts';
import { createRng, int, pick } from '../core/rng.ts';
import { BASE_ART, type Art, type ArtId } from './sprites.ts';

/** World units one ground tile covers. */
export const GROUND_TILE = 160;
/** The ground's layout seed: every base gets the same layout, every time it loads. */
export const GROUND_SEED = 0x1d050;
/** The camp's yard behind the inner wall, fading into the field over `feather`. */
export const CAMP_YARD = { x0: CAMP.x - 90, x1: CAMP.x, feather: 30 } as const;
/** Tiles a side in the block that repeats past the field's edges. */
export const SURROUND_BLOCK = 4;
/** World units one tile of the yard's texture covers. */
const YARD_TILE = 96;
/** `size`: a decal's longer side in world units. */
const DECALS = { count: 64, size: { min: 22, max: 44 }, alpha: 0.85 } as const;

export interface Decal {
  art: ArtId;
  /** Centre on the field. */
  x: number;
  y: number;
  size: number;
  flip: boolean;
}
export interface GroundLayout {
  /** The tile variant at each `[row][column]`, from the field's top left. */
  tiles: ArtId[][];
  decals: Decal[];
}

/** Which tile variant goes where, and the decals: the same for the same seed. */
export function groundLayout(seed: number): GroundLayout {
  const rng = createRng(seed);
  const rows = Math.ceil(FIELD.height / GROUND_TILE);
  const cols = Math.ceil(FIELD.right / GROUND_TILE);
  const tiles = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => pick(rng, BASE_ART.groundTiles)),
  );
  const decals = Array.from({ length: DECALS.count }, (): Decal => {
    const size = int(rng, DECALS.size.min, DECALS.size.max);
    const half = Math.ceil(size / 2);
    return {
      art: pick(rng, BASE_ART.decals),
      x: int(rng, half, FIELD.right - half),
      y: int(rng, half, FIELD.height - half),
      size,
      flip: rng() < 0.5,
    };
  });
  return { tiles, decals };
}

/** The variant at each `[row][column]` of the block repeated past the field: the same for the same seed. */
export function surroundLayout(seed: number): ArtId[][] {
  const rng = createRng(seed);
  return Array.from({ length: SURROUND_BLOCK }, () =>
    Array.from({ length: SURROUND_BLOCK }, () => pick(rng, BASE_ART.groundTiles)),
  );
}

type Painted = WeakMap<Art, OffscreenCanvas | null>;
/** Each set of art's painted canvases; null when the browser couldn't paint one, so it isn't retried every frame. */
const painted: Painted = new WeakMap();
const surrounds: Painted = new WeakMap();

/** `paint(art)` once per set of art, remembered in `cache`; a throw counts as null. */
function once(cache: Painted, art: Art, paint: (art: Art) => OffscreenCanvas | null) {
  if (!cache.has(art)) {
    let canvas: OffscreenCanvas | null;
    try {
      canvas = paint(art);
    } catch {
      canvas = null;
    }
    cache.set(art, canvas);
  }
  return cache.get(art)!;
}

/**
 * The whole ground at its tiles' own resolution, painted on first use for each set of
 * art. Tiles land on whole pixels at their own size, so neighbours meet exactly.
 * Null (the field left bare) where the browser has no `OffscreenCanvas`.
 */
export function groundCanvas(art: Art): OffscreenCanvas | null {
  return once(painted, art, paintGround);
}

/**
 * The block of tiles repeated past the field's edges, `SURROUND_BLOCK` tiles a side at
 * their own resolution: on the same 160-unit grid as the field's tiles and sharing their
 * seam border, so it meets the field and itself with no edge. Null as `groundCanvas`.
 */
export function surroundCanvas(art: Art): OffscreenCanvas | null {
  return once(surrounds, art, paintSurround);
}

function paintSurround(art: Art): OffscreenCanvas | null {
  const tile = art[BASE_ART.groundTiles[0]].width;
  const canvas = new OffscreenCanvas(SURROUND_BLOCK * tile, SURROUND_BLOCK * tile);
  const g = canvas.getContext('2d');
  if (!g) return null;
  surroundLayout(GROUND_SEED).forEach((row, r) =>
    row.forEach((id, c) => g.drawImage(art[id], c * tile, r * tile, tile, tile)),
  );
  return canvas;
}

function paintGround(art: Art): OffscreenCanvas | null {
  const tile = art[BASE_ART.groundTiles[0]].width;
  const px = tile / GROUND_TILE;
  const canvas = new OffscreenCanvas(Math.round(FIELD.right * px), Math.round(FIELD.height * px));
  const g = canvas.getContext('2d');
  if (!g) return null;
  const layout = groundLayout(GROUND_SEED);
  layout.tiles.forEach((row, r) =>
    row.forEach((id, c) => g.drawImage(art[id], c * tile, r * tile, tile, tile)),
  );
  const yard = paintYard(art, px, canvas.height);
  if (yard) g.drawImage(yard, 0, 0);
  g.globalAlpha = DECALS.alpha;
  for (const d of layout.decals) {
    const img = art[d.art];
    const scale = (d.size * px) / Math.max(img.width, img.height);
    g.save();
    g.translate(d.x * px, d.y * px);
    g.scale(d.flip ? -scale : scale, scale);
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  }
  g.globalAlpha = 1;
  return canvas;
}

/** The yard's texture over its strip, opaque inside it and fading out at both sides. */
function paintYard(art: Art, px: number, height: number): OffscreenCanvas | null {
  const right = (CAMP_YARD.x1 + CAMP_YARD.feather) * px;
  const yard = new OffscreenCanvas(Math.ceil(right), height);
  const g = yard.getContext('2d');
  const img = art[BASE_ART.camp];
  const pattern = g?.createPattern(img, 'repeat');
  if (!g || !pattern) return null;
  const s = (YARD_TILE * px) / img.width;
  pattern.setTransform(new DOMMatrix().scale(s, s));
  g.fillStyle = pattern;
  g.fillRect(0, 0, yard.width, height);
  const fade = g.createLinearGradient(0, 0, right, 0);
  const at = (x: number) => Math.max(0, Math.min(1, (x * px) / right));
  fade.addColorStop(at(CAMP_YARD.x0 - CAMP_YARD.feather), 'rgba(0,0,0,0)');
  fade.addColorStop(at(CAMP_YARD.x0), 'rgba(0,0,0,1)');
  fade.addColorStop(at(CAMP_YARD.x1), 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, yard.width, height);
  return yard;
}
