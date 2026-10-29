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
export const ZOOM = { min: 0.5, max: 2 } as const;
/** The camera may show a strip this deep above the field. */
export const MARGIN_Y = 80;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

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

/** Pans `v` so `[lo, hi]` fills the visible span; centres it when it all fits. */
function fit(v: number, lo: number, hi: number, visible: number): number {
  return visible >= hi - lo ? (lo + hi - visible) / 2 : clamp(v, lo, hi - visible);
}

/** Keeps the zoom in range and the view on the field. */
export function clampCamera(cam: Camera, view: View): Camera {
  const zoom = clamp(cam.zoom, ZOOM.min, ZOOM.max);
  return {
    x: fit(cam.x, 0, FIELD.right, view.w / zoom),
    y: fit(cam.y, -MARGIN_Y, FIELD.height, view.h / (zoom * TILT)),
    zoom,
  };
}

/** Zooms by `factor` keeping the world point under `anchor` in place, then clamps. */
export function zoomAt(
  cam: Camera,
  factor: number,
  anchor: { sx: number; sy: number },
  view: View,
): Camera {
  if (![factor, anchor.sx, anchor.sy].every(Number.isFinite)) return clampCamera(cam, view);
  const zoom = clamp(cam.zoom * factor, ZOOM.min, ZOOM.max);
  const wx = cam.x + anchor.sx / cam.zoom;
  const wy = cam.y + anchor.sy / (cam.zoom * TILT);
  return clampCamera({ x: wx - anchor.sx / zoom, y: wy - anchor.sy / (zoom * TILT), zoom }, view);
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
  /** The wall-walk platform, on top of its segment. */
  walk: { halfWidth: 8, halfDepth: 24, height: 6 },
  defender: { halfWidth: 7, halfDepth: 10, height: 30 },
  /** A turret's head, on top of its tower or wall-walk mount. */
  turret: { halfWidth: 9, halfDepth: 9, height: 12 },
} as const;

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
  /** How high a built mount stands over its floor: the post, plus a turret's head. */
  const mounted = (kind: 'tower' | 'ground' | 'wall-walk', column: number, row: number): number => {
    const piece = (kind === 'wall-walk' ? PIECE.walk : PIECE[kind]).height;
    if (postAt(kind, column, row)) return piece;
    return turretAt(kind, column, row) ? piece + PIECE.turret.height : 0;
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
 * first, else a post (a wall-walk post covers its whole segment). Where pieces overlap,
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
          hd: SEGMENT_HEIGHT / 2,
          z0: 0,
          z1: postFloor(scene.layers, post),
        };
    if (covers(x, y, box) && (!best || post.y > best.y)) {
      best = { y: post.y, hit: { postId: post.id } };
    }
  }
  return best?.hit ?? null;
}
