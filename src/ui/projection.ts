// Angled overhead view of the open field: depth (y) recedes up the screen, height
// lifts a sprite. Screen units are CSS pixels.
import type { Base } from '../core/base.ts';
import type { HordeState, Layer, Post } from '../core/horde.ts';
import {
  COLUMNS,
  FIELD,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  TRAP_STRIP,
  WALK_SPOTS,
  WALL,
} from '../core/data.ts';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export interface View {
  w: number;
  h: number;
}

/** Field depth (y) squash. */
export const TILT = 0.6;
/** How much world height lifts a sprite on screen. */
export const HEIGHT_SCALE = 0.8;
/** The frame's zoom never goes under this: a narrower window keeps the wall side. */
export const MIN_ZOOM = 0.5;
/** The frame takes in a strip this deep above the field, where the back row's tops show. */
export const MARGIN_Y = 80;
/**
 * Screen px kept clear for the top bar and, at least, for the bottom HUD (shop and
 * skills): the frame fits between them, so neither covers the field.
 */
export const HUD_SPACE = { top: 48, bottom: 64 } as const;

export function project(
  p: { x: number; y: number; z?: number },
  cam: Camera,
): { sx: number; sy: number; scale: number } {
  return {
    sx: (p.x - cam.x) * cam.zoom,
    sy: (p.y - cam.y) * cam.zoom * TILT - (p.z ?? 0) * cam.zoom * HEIGHT_SCALE,
    scale: cam.zoom,
  };
}

/** The ground point (z = 0) under a screen point: the inverse of `project`. */
export function unproject(s: { sx: number; sy: number }, cam: Camera): { x: number; y: number } {
  return { x: s.sx / cam.zoom + cam.x, y: s.sy / (cam.zoom * TILT) + cam.y };
}

/**
 * The depth key `y` of a piece on a slot: a wall-walk post or wall mount never sorts
 * before its own segment (keyed at the row's middle), so it is always drawn on top of
 * it; spot 1 still sorts after spot 0.
 */
export function mountDepth(kind: Post['kind'], y: number, row: number): number {
  return kind === 'wall-walk' ? Math.max(y, (row + 0.5) * SEGMENT_HEIGHT) : y;
}

/** Back to front: y ascending, then x descending. Returns a new array. */
export function depthSort<T extends { y: number; x: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || b.x - a.x);
}

/** Drawn sizes of the base pieces in world units, shared by the renderer and `slotAt`. */
export const PIECE = {
  wall: { height: 40 },
  tower: { halfWidth: 16, halfDepth: 24, height: 50 },
  ground: { halfWidth: 16, halfDepth: 24, height: 12 },
  /** A wall-walk platform on top of its segment: its spots' platforms never touch. */
  walk: { halfWidth: 8, halfDepth: 18, height: 6 },
  defender: { halfWidth: 7, halfDepth: 10, height: 30 },
  /** A turret's head, on top of its tower or wall-walk mount. */
  turret: { halfWidth: 9, halfDepth: 9, height: 12 },
} as const;

/** Ground shown behind column 0's ground posts at the frame's left edge. */
const FRAME_GAP = 24;

/**
 * The one fixed world frame every fight shows (ID-064): from just behind column 0's
 * ground posts to the spawn edge, every row and the strip above. The camp's yard and
 * huts are left of it.
 */
export const FRAME = {
  left: COLUMNS[0]! + POST_OFFSET.ground - PIECE.ground.halfWidth - FRAME_GAP,
  right: FIELD.right,
  top: -MARGIN_Y,
  bottom: FIELD.height,
} as const;

/**
 * The camera on the frame for a `view`: zoomed to fit it (the smaller of width fit and
 * height fit, between the HUD's bands), never under MIN_ZOOM, centred in the spare
 * space. A frame wider or taller than the view keeps its left (wall-side) or top edge.
 * `bottom` is the bottom HUD's measured height; a wrapped shop bar takes more.
 */
export function frameCamera(view: View, bottom = 0): Camera {
  const w = FRAME.right - FRAME.left;
  const h = (FRAME.bottom - FRAME.top) * TILT;
  const below = Math.max(HUD_SPACE.bottom, bottom);
  const band = Math.max(0, view.h - HUD_SPACE.top - below);
  const zoom = Math.max(MIN_ZOOM, Math.min(view.w / w, band / h));
  const spareX = Math.max(0, view.w - w * zoom) / 2;
  const spareY = Math.max(0, band - h * zoom) / 2;
  return {
    x: FRAME.left - spareX / zoom,
    y: FRAME.top - (HUD_SPACE.top + spareY) / (zoom * TILT),
    zoom,
  };
}

/** A segment's drawn height: lower as it takes damage, a stub once broken. */
export function wallHeight(hp: number, maxHp: number): number {
  return hp <= 0 ? PIECE.wall.height * 0.3 : PIECE.wall.height * (0.5 + 0.5 * (hp / maxHp));
}

/** Height of a post's floor, where its defender stands. */
export function postFloor(layers: readonly Layer[], post: Post): number {
  if (post.kind !== 'wall-walk') return PIECE[post.kind].height;
  const seg = layers.find((l) => l.column === post.column)?.segments[post.row];
  return (seg ? wallHeight(seg.hp, seg.maxHp) : 0) + PIECE.walk.height;
}

/** A trap cell sits on the outer layer's strip; its hit names the outermost column. */
export type SlotWhat = 'segment' | 'tower' | 'ground' | 'trap';
export interface SlotHit {
  column: number;
  row: number;
  what: SlotWhat;
}

/** How far behind its footprint (in field `y`) the top of a piece `z` high shows. */
const lift = (z: number): number => (z * HEIGHT_SCALE) / TILT;

/**
 * The grid slot drawn under ground point `(x, y)`, or null. A built piece also covers
 * its top face, a turret's head included; where pieces overlap, the front one (higher
 * row) wins, as drawn. The wall band is always `'segment'`: a wall-walk post or turret
 * is built from its segment's menu. A trap cell is flat on the ground (design §7).
 */
export function slotAt(x: number, y: number, base: Base): SlotHit | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const postAt = (kind: string, column: number, row: number): boolean =>
    base.posts.some((p) => p.kind === kind && p.column === column && p.row === row);
  const turretAt = (kind: string, column: number, row: number): boolean =>
    base.turrets.some((t) => t.mount === kind && t.column === column && t.row === row);
  /** How high a slot's tallest mount stands over its floor: a turret's head, else a post. */
  const mounted = (kind: 'tower' | 'ground' | 'wall-walk', column: number, row: number): number => {
    const piece = (kind === 'wall-walk' ? PIECE.walk : PIECE[kind]).height;
    if (turretAt(kind, column, row)) return piece + PIECE.turret.height;
    return postAt(kind, column, row) ? piece : 0;
  };
  let hit: SlotHit | null = null;
  for (let row = 0; row < SEGMENTS; row++) {
    const y0 = row * SEGMENT_HEIGHT;
    const cy = y0 + SEGMENT_HEIGHT / 2;
    COLUMNS.forEach((wx, column) => {
      const seg = base.layers.find((l) => l.column === column)?.slots[row];
      const z = seg ? wallHeight(seg.hp, seg.maxHp) + mounted('wall-walk', column, row) : 0;
      if (x >= wx && x <= wx + WALL.depth && y >= y0 - lift(z) && y < y0 + SEGMENT_HEIGHT) {
        hit = { column, row, what: 'segment' };
      }
      for (const what of ['tower', 'ground'] as const) {
        const p = PIECE[what];
        const top = mounted(what, column, row);
        if (
          Math.abs(x - (wx + POST_OFFSET[what])) <= p.halfWidth &&
          y >= cy - p.halfDepth - lift(top) &&
          y <= cy + p.halfDepth
        ) {
          hit = { column, row, what };
        }
      }
    });
  }
  if (
    !hit &&
    x >= TRAP_STRIP.x &&
    x <= TRAP_STRIP.x + TRAP_STRIP.width &&
    y >= 0 &&
    y < FIELD.height
  ) {
    hit = { column: COLUMNS.length - 1, row: Math.floor(y / SEGMENT_HEIGHT), what: 'trap' };
  }
  return hit;
}

/** Whether a box `z0…z1` high on footprint `(cx ± hw, cy ± hd)` is drawn over ground point `(x, y)`. */
function covers(
  x: number,
  y: number,
  box: { cx: number; cy: number; hw: number; hd: number; z0: number; z1: number },
): boolean {
  return (
    Math.abs(x - box.cx) <= box.hw &&
    y >= box.cy - box.hd - lift(box.z1) &&
    y <= box.cy + box.hd - lift(box.z0)
  );
}

export type FightHit = { defenderId: string } | { postId: number };

/**
 * What a fight click at ground point `(x, y)` lands on, as drawn: a defender's body
 * first, else a post (a wall-walk post covers its spot's share of the segment). Where pieces overlap,
 * the front one (larger `y`) wins. Null on open ground.
 */
export function fightHitAt(
  x: number,
  y: number,
  scene: Pick<HordeState, 'layers' | 'posts' | 'defenders'>,
): FightHit | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const d = PIECE.defender;
  let best: { y: number; hit: FightHit } | null = null;
  for (const def of scene.defenders) {
    const post = scene.posts[def.postId];
    const z0 = def.walking || !post ? 0 : postFloor(scene.layers, post);
    const box = { cx: def.x, cy: def.y, hw: d.halfWidth, hd: d.halfDepth, z0, z1: z0 + d.height };
    if (covers(x, y, box) && (!best || def.y > best.y)) {
      best = { y: def.y, hit: { defenderId: def.id } };
    }
  }
  if (best) return best.hit;
  for (const post of scene.posts) {
    const p = post.kind === 'wall-walk' ? null : PIECE[post.kind];
    const box = p
      ? { cx: post.x, cy: post.y, hw: p.halfWidth, hd: p.halfDepth, z0: 0, z1: p.height }
      : {
          cx: post.x,
          cy: post.y,
          hw: WALL.depth / 2,
          hd: SEGMENT_HEIGHT / (2 * WALK_SPOTS),
          z0: 0,
          z1: postFloor(scene.layers, post),
        };
    if (covers(x, y, box) && (!best || post.y > best.y)) {
      best = { y: post.y, hit: { postId: post.id } };
    }
  }
  return best?.hit ?? null;
}
