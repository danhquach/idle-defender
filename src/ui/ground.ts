// The ground under the field and the camp's yard (design §15, ID-050): seeded tile
// variants that share one seam border, the yard feathered into the field and decals
// scattered over both, painted once into a field-sized canvas the renderer draws whole,
// so no tile edge can show at any zoom. Past the field's edges a seeded block of the
// same tiles repeats without end (ID-057), so no bare background shows at any zoom or pan.
import { CAMP, CARD, COLUMNS, FIELD, SEGMENT_HEIGHT, SEGMENTS, WALL } from '../core/data.ts';
import { createRng, int, pick } from '../core/rng.ts';
import { TILT } from './projection.ts';
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
/**
 * Green grass (ID-071): patches of tufts scattered over the field, `tufts` each within
 * `spread` of the patch's centre, drawn from the dry-grass art tinted `tint` over its
 * own shading, so the grey ground reads as overgrown. None grows left of `from` (the
 * first wall's front plus a margin), so the survivors' lane stays plain behind them.
 */
export const GRASS = {
  from: COLUMNS[0]! + WALL.depth + 60,
  patches: 40,
  tufts: { min: 4, max: 8 },
  spread: 44,
  size: { min: 22, max: 44 },
  tint: 'rgba(104, 168, 56, 0.9)',
} as const;

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
  /** Green grass tufts, drawn after the decals (ID-071). */
  grass: Decal[];
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
  // Drawn from the rng after the decals, so the tiles and decals keep their old layout.
  const grass: Decal[] = [];
  for (let p = 0; p < GRASS.patches; p++) {
    const cx = int(rng, GRASS.from, FIELD.right);
    const cy = int(rng, 0, FIELD.height);
    const tufts = int(rng, GRASS.tufts.min, GRASS.tufts.max);
    for (let t = 0; t < tufts; t++) {
      const size = int(rng, GRASS.size.min, GRASS.size.max);
      const half = Math.ceil(size / 2);
      const at = (c: number, min: number, max: number) =>
        Math.max(min + half, Math.min(max - half, c + int(rng, -GRASS.spread, GRASS.spread)));
      grass.push({
        art: BASE_ART.grass,
        x: at(cx, GRASS.from, FIELD.right),
        y: at(cy, 0, FIELD.height),
        size,
        flip: rng() < 0.5,
      });
    }
  }
  return { tiles, decals, grass };
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
  const stamp = (d: Decal, img: CanvasImageSource & { width: number; height: number }) => {
    const scale = (d.size * px) / Math.max(img.width, img.height);
    g.save();
    g.translate(d.x * px, d.y * px);
    g.scale(d.flip ? -scale : scale, scale);
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  };
  g.globalAlpha = DECALS.alpha;
  for (const d of layout.decals) stamp(d, art[d.art]);
  g.globalAlpha = 1;
  const green = tinted(art[BASE_ART.grass], GRASS.tint);
  if (green) for (const d of layout.grass) stamp(d, green);
  return canvas;
}

/** `img` with `tint` laid over its own pixels only, so its shading and outline stay. */
function tinted(img: HTMLImageElement, tint: string): OffscreenCanvas | null {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = tint;
  g.fillRect(0, 0, img.width, img.height);
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

/**
 * Barbed Wire's band (ID-077, redrawn in ID-090), drawn in code (no art file): coils of
 * concertina wire with razor barbs on steel pickets, with only a light `shadow` under them so
 * the ground shows through. In world units at `px` canvas pixels a unit, painted as seen:
 * `TILT` short down the field, so the loops stay round on screen. A coil at each share of
 * the band's depth in `coils`, nudged by its `jitter` units (kept clear of the band's edges),
 * is a helix lying down the field, `r` across, one loop every `pitch`, seen from above
 * at a tilt (`squash`): its far half dark `steel` lit `mid`, its near half `steel` lit
 * `shine`, each stroke `w` thick over a dark `outline` so it stands out on grey ground; a pair
 * of crossed blades `barb` long every `barbEvery` loop. A steel `post`, `h` tall with a lit
 * cap, stands in each coil every `postEvery` units.
 *
 * A row the enemies broke (ID-090) is drawn `torn`: each coil cut through at `tears`
 * (shares of the row, shifted 0–2 × `shift` down by row and coil so the coils' cuts don't
 * line up), the cut ends
 * sagging `droop` units over `fall` units (none within `calm` units of a row's edge, so a
 * torn row meets a whole one cleanly), its near half lit `mid` (dulled), and every other
 * picket knocked flat at `fallen` radians, toward the band's middle so none hangs past its edge.
 *
 * A row worn to `worn.at` of its durability or less (ID-115) is drawn `worn`, between the two:
 * every coil slack, sagging `slack` units at the row's middle (none within `calm` units of
 * its edges, so it meets a whole or torn row cleanly), and one coil a row, a different one
 * each row, cut once at `tears` (its ends drooping `droop`) with its picket leaning `lean`
 * radians toward the band's middle. The wire keeps its shine: a worn row still holds.
 */
export const WIRE = {
  px: 2,
  coils: [0.1, 0.5, 0.9],
  jitter: [-5, 4, -3],
  r: 12,
  pitch: 11,
  squash: 0.85,
  w: 1.35,
  steel: '#2e3134',
  mid: '#8d9297',
  shine: '#eef1f4',
  outline: '#111315',
  shadow: 'rgba(0, 0, 0, 0.22)',
  barb: 3.1,
  barbEvery: 0.45,
  post: { fill: '#55595d', edge: '#26292b', cap: '#8a8f94', w: 3, h: 16 },
  postEvery: 80,
  torn: {
    tears: [
      [0, 0.3],
      [0.58, 0.8],
    ],
    shift: 0.04,
    droop: 6,
    fall: 20,
    calm: 4,
    fallen: 1.8,
  },
  worn: {
    at: 0.5,
    tears: [[0.34, 0.62]],
    droop: 6,
    slack: 4.5,
    lean: 0.65,
  },
} as const;

/** A row of Barbed Wire's band as it looks: whole, worn partway (ID-115), or torn (ID-090). */
export type WireLook = 'whole' | 'worn' | 'torn';

/** Segments a turn of a coil is drawn in. */
const COIL_STEPS = 24;

/**
 * A damaged coil: none drawn between each of `gaps`' ends, the cut ends drooping `droop`
 * units and the wire `slack` units at each `row`'s middle (canvas pixels), but neither at a
 * row's edge; `dull`, its near half not lit.
 */
interface Tears {
  gaps: readonly (readonly [number, number])[];
  row: number;
  droop: number;
  slack: number;
  dull: boolean;
}

/** A coil down the field at `x0` from `y0` to `y1`, `r` across (canvas pixels); `tears`, torn. */
function coil(
  g: OffscreenCanvasRenderingContext2D,
  x0: number,
  y0: number,
  y1: number,
  r: number,
  tears: Tears | null = null,
): void {
  const { px, w, squash } = WIRE;
  const pitch = WIRE.pitch * px;
  const steps = Math.ceil(((y1 - y0) / pitch) * COIL_STEPS);
  const gaps = tears?.gaps ?? [];
  const cut = (y: number) => gaps.some(([a, b]) => y > a && y < b);
  const fall = WIRE.torn.fall * px;
  // How far the wire sags: slack toward the row's middle, and near a cut end down and away
  // from the gap; none at a row's edge.
  const sag = (y: number): [number, number] => {
    if (!tears) return [0, 0];
    let near = Infinity;
    let side = 0;
    for (const [a, b] of gaps) {
      if (Math.abs(y - a) < near) [near, side] = [Math.abs(y - a), -1];
      if (Math.abs(y - b) < near) [near, side] = [Math.abs(y - b), 1];
    }
    const inRow = ((y % tears.row) + tears.row) % tears.row;
    const fromEdge = Math.max(0, Math.min(inRow, tears.row - inRow) - WIRE.torn.calm * px);
    const settle = Math.min(1, fromEdge / fall);
    const f = Math.max(0, 1 - near / fall) * settle * tears.droop * px;
    // Eased from 0 at the calm edge to 1 at the row's middle.
    const mid = Math.min(1, fromEdge / (tears.row / 2 - WIRE.torn.calm * px));
    const slack = ((1 - Math.cos(Math.PI * mid)) / 2) * tears.slack * px;
    return [f * 0.6 * side, f + slack];
  };
  const at = (s: number) => {
    const t = (s / COIL_STEPS) * Math.PI * 2;
    const y = y0 + (s / COIL_STEPS) * pitch + r * squash * Math.sin(t);
    const [dx, dy] = sag(y);
    return { x: x0 + r * Math.cos(t) + dx, y: y + dy, cut: cut(y), near: Math.sin(t) >= 0 };
  };
  const path = (keep: (s: number) => boolean, dx: number, dy: number) => {
    g.beginPath();
    let on = false;
    for (let s = 0; s <= steps; s++) {
      const p = at(s);
      if (!keep(s) || p.cut) {
        on = false;
        continue;
      }
      if (on) g.lineTo(p.x + dx, p.y + dy);
      else g.moveTo(p.x + dx, p.y + dy);
      on = true;
    }
    g.stroke();
  };
  g.lineCap = 'round';
  g.strokeStyle = WIRE.shadow;
  g.lineWidth = 2.2 * px * w;
  path(() => true, 2 * px, 3 * px);
  for (const near of [false, true]) {
    const width = (near ? 1.3 : 1.1) * px * w;
    const strokes = [
      [WIRE.outline, width + 1.2 * px, 0],
      [WIRE.steel, width, 0],
      [near && !tears?.dull ? WIRE.shine : WIRE.mid, (near ? 0.55 : 0.45) * px * w, -0.5 * px],
    ] as const;
    for (const [colour, lineWidth, dy] of strokes) {
      g.strokeStyle = colour;
      g.lineWidth = lineWidth;
      path((s) => at(s).near === near, 0, dy);
    }
  }
  // The razor barbs: a pair of crossed blades across the wire.
  const b = WIRE.barb * px;
  const every = Math.round(COIL_STEPS * WIRE.barbEvery);
  g.lineCap = 'butt';
  g.lineWidth = 0.7 * px * w;
  for (let s = 3; s <= steps; s += every) {
    const p = at(s);
    if (p.cut) continue;
    const q = at(s + 1);
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const [ux, uy] = [((q.x - p.x) / l) * b * 0.6, ((q.y - p.y) / l) * b * 0.6];
    const [nx, ny] = [(-(q.y - p.y) / l) * b, ((q.x - p.x) / l) * b];
    g.strokeStyle = p.near ? WIRE.steel : WIRE.mid;
    g.beginPath();
    g.moveTo(p.x - nx + ux, p.y - ny + uy);
    g.lineTo(p.x + nx - ux, p.y + ny - uy);
    g.moveTo(p.x - nx - ux, p.y - ny - uy);
    g.lineTo(p.x + nx + ux, p.y + ny + uy);
    g.stroke();
  }
}

/** A steel picket standing at `x, y` (its foot), on a light shadow; knocked over `fallen` radians. */
function picket(g: OffscreenCanvasRenderingContext2D, x: number, y: number, fallen = 0): void {
  const { px } = WIRE;
  const { fill, edge, cap } = WIRE.post;
  const [w, h] = [WIRE.post.w * px, WIRE.post.h * px];
  g.fillStyle = WIRE.shadow;
  g.beginPath();
  g.ellipse(x + 3 * px, y + px, (fallen ? 9 : 4) * px, 1.6 * px, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(x, y);
  g.rotate(fallen);
  g.fillStyle = fill;
  g.fillRect(-w / 2, -h, w, h);
  g.strokeStyle = edge;
  g.lineWidth = 0.8 * px;
  g.strokeRect(-w / 2, -h, w, h);
  g.fillStyle = cap;
  g.fillRect(-w / 2, -h, w, 1.6 * px);
  g.restore();
}

const wires: Readonly<Record<WireLook, Painted>> = {
  whole: new WeakMap(),
  worn: new WeakMap(),
  torn: new WeakMap(),
};

/**
 * Barbed Wire's band painted once per set of art (as every painted canvas), every row with
 * one `look`; the renderer takes each row from the one it needs. Null as `groundCanvas`.
 */
export function wireCanvas(art: Art, look: WireLook = 'whole'): OffscreenCanvas | null {
  return once(wires[look], art, () => paintWire(look));
}

function paintWire(look: WireLook): OffscreenCanvas | null {
  const { px } = WIRE;
  const w = (CARD.wire.to - CARD.wire.from) * px;
  const h = FIELD.height * TILT * px;
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d');
  if (!g) return null;
  const r = WIRE.r * px;
  // A coil's loops, outline and shadow stay inside the band.
  const edge = r + 4 * px;
  for (const [c, share] of WIRE.coils.entries()) {
    const x = Math.min(w - edge, Math.max(edge, w * share + WIRE.jitter[c]! * px));
    const row = SEGMENT_HEIGHT * TILT * px;
    // A worn row has one coil cut: the near one in row 0, the middle in row 1, and so on.
    const wornCut = (i: number) => (i + WIRE.coils.length - c) % WIRE.coils.length === 0;
    const tears: Tears | null =
      look === 'torn'
        ? {
            row,
            droop: WIRE.torn.droop,
            slack: 0,
            dull: true,
            gaps: Array.from({ length: SEGMENTS }, (_, i) => {
              // 0, 1 or 2 shifts: each coil of a row is cut a little lower than its neighbour,
              // its first cut starting that far below the row's top (a short straight stub).
              const o = ((i * 2 + c) % 3) * WIRE.torn.shift;
              return WIRE.torn.tears.map(
                ([a, b]) => [(i + a + o) * row, (i + b + o) * row] as const,
              );
            }).flat(),
          }
        : look === 'worn'
          ? {
              row,
              droop: WIRE.worn.droop,
              slack: WIRE.worn.slack,
              dull: false,
              gaps: Array.from({ length: SEGMENTS }, (_, i) =>
                wornCut(i)
                  ? WIRE.worn.tears.map(([a, b]) => [(i + a) * row, (i + b) * row] as const)
                  : [],
              ).flat(),
            }
          : null;
    // Past the band's ends, so no coil starts or stops in view.
    coil(g, x, -r, h + r, r, tears);
    const every = WIRE.postEvery * TILT * px;
    for (let y = every / 2, i = 0; y <= h; y += every, i++) {
      // Toward the band's middle: the near coil's to the right, the far one's to the left.
      const toward = c === 0 ? 1 : c === WIRE.coils.length - 1 ? -1 : i % 2 ? 1 : -1;
      const tilt =
        look === 'torn' && (i + c) % 2 === 0
          ? WIRE.torn.fallen
          : look === 'worn' && wornCut(i)
            ? WIRE.worn.lean
            : 0;
      picket(g, x, y, toward * tilt);
    }
  }
  return canvas;
}
