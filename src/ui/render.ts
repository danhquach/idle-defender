// Placeholder art (design §15): muted boxes for the base, saturated colour
// only on the horde. Canvas 2D, no rendering library.
import {
  CAMP,
  COLUMNS,
  ENEMY_RADIUS,
  FIELD,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  WALL,
} from '../core/data.ts';
import type { Defender, HordeState, Layer } from '../core/horde.ts';
import type { Tier } from '../core/base.ts';
import {
  depthSort,
  PIECE,
  postFloor,
  project,
  wallHeight,
  type Camera,
  type SlotHit,
  type View,
} from './projection.ts';

const COLOR = {
  sky: '#15171a',
  ground: '#2d2f31',
  brokenTop: '#4b4b4b',
  brokenFront: '#363636',
  gateMark: '#2a2722',
  campTop: '#6e675b',
  campFront: '#4a453c',
  postTop: '#655f55',
  postFront: '#45413a',
  groundPostTop: '#5a5f52',
  groundPostFront: '#3f4339',
  walkTop: '#9a8d74',
  walkFront: '#6b604e',
  defenderTop: '#7d9cc0',
  defenderFront: '#4f6f94',
  selected: '#9cc4f0',
  reserved: 'rgba(156, 196, 240, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  slot: 'rgba(216, 212, 204, 0.18)',
  enemy: '#7ccf3a',
  focus: '#ffe066',
  hpBack: '#c43b3b',
  hpFill: '#5ec24a',
  shot: '#e8d36a',
} as const;

/** Muted top and front colours per wall tier. */
const TIER_COLOR: Readonly<Record<Tier, { top: string; front: string }>> = {
  wood: { top: '#8a7f6c', front: '#5e5546' },
  metal: { top: '#7b828c', front: '#535962' },
  concrete: { top: '#a19f97', front: '#706e68' },
  reinforced: { top: '#6c7a86', front: '#46515b' },
};

/** Gap drawn between wall segments so they read as separate pieces. */
const SEGMENT_GAP = 2;
const CAMP_BOX = { x0: CAMP.x - 90, x1: CAMP.x, height: 70 } as const;
const DEFENDER = PIECE.defender;
const ENEMY = { radius: ENEMY_RADIUS * 0.85, z: 10 } as const;
/** `z`: an enemy's bar height; `gap`: a defender's bar above its head. */
const HP_BAR = { w: 24, h: 4, z: 30, gap: 6 } as const;

/** What the renderer needs from a fight; build mode passes the base laid out the same way. */
export type Scene = Pick<
  HordeState,
  'layers' | 'posts' | 'defenders' | 'enemies' | 'shots' | 'focusId'
>;
/** Build mode extras: empty slot outlines and the selected slot. */
export interface BuildOverlay {
  selected: SlotHit | null;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  height: number;
  top: string;
  front: string;
}

/** An extruded box: the top face, then the face toward the viewer. */
function drawBox(ctx: CanvasRenderingContext2D, b: Box, cam: Camera): void {
  const backTop = project({ x: b.x0, y: b.y0, z: b.z0 + b.height }, cam);
  const frontTop = project({ x: b.x1, y: b.y1, z: b.z0 + b.height }, cam);
  const frontBottom = project({ x: b.x1, y: b.y1, z: b.z0 }, cam);
  ctx.fillStyle = b.top;
  ctx.fillRect(backTop.sx, backTop.sy, frontTop.sx - backTop.sx, frontTop.sy - backTop.sy);
  ctx.fillStyle = b.front;
  ctx.fillRect(backTop.sx, frontTop.sy, frontTop.sx - backTop.sx, frontBottom.sy - frontTop.sy);
}

/** A flat rectangle outline at height `z`. */
function outline(
  ctx: CanvasRenderingContext2D,
  r: { x0: number; x1: number; y0: number; y1: number },
  z: number,
  cam: Camera,
): void {
  const a = project({ x: r.x0, y: r.y0, z }, cam);
  const b = project({ x: r.x1, y: r.y1, z }, cam);
  ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
}

/** A slot's ground footprint. */
function footprint(slot: SlotHit): { x0: number; x1: number; y0: number; y1: number } {
  const wx = COLUMNS[slot.column]!;
  const y0 = slot.row * SEGMENT_HEIGHT;
  if (slot.what === 'segment') {
    return {
      x0: wx,
      x1: wx + WALL.depth,
      y0: y0 + SEGMENT_GAP,
      y1: y0 + SEGMENT_HEIGHT - SEGMENT_GAP,
    };
  }
  const p = PIECE[slot.what];
  const x = wx + POST_OFFSET[slot.what];
  const cy = y0 + SEGMENT_HEIGHT / 2;
  return { x0: x - p.halfWidth, x1: x + p.halfWidth, y0: cy - p.halfDepth, y1: cy + p.halfDepth };
}

const segmentOf = (layers: readonly Layer[], column: number, row: number) =>
  layers.find((l) => l.column === column)?.segments[row];

/** An HP bar centred over `(x, y)` at height `z`. */
function drawHpBar(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; z: number },
  hp: number,
  maxHp: number,
  cam: Camera,
): void {
  const bar = project(at, cam);
  const w = HP_BAR.w * cam.zoom;
  const h = HP_BAR.h * cam.zoom;
  ctx.fillStyle = COLOR.hpBack;
  ctx.fillRect(bar.sx - w / 2, bar.sy, w, h);
  ctx.fillStyle = COLOR.hpFill;
  ctx.fillRect(bar.sx - w / 2, bar.sy, w * Math.max(0, hp / maxHp), h);
}

/**
 * A defender standing `z0` up at `(x, y)`, with a ring at its feet when selected and
 * an HP bar once hurt.
 */
function drawDefender(
  ctx: CanvasRenderingContext2D,
  d: Pick<Defender, 'x' | 'y' | 'hp' | 'maxHp'>,
  z0: number,
  selected: boolean,
  cam: Camera,
): void {
  if (selected) {
    const feet = project({ x: d.x, y: d.y, z: z0 }, cam);
    const r = DEFENDER.halfDepth * 1.8 * cam.zoom;
    ctx.strokeStyle = COLOR.selected;
    ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    ctx.beginPath();
    ctx.ellipse(feet.sx, feet.sy, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawBox(
    ctx,
    {
      x0: d.x - DEFENDER.halfWidth,
      x1: d.x + DEFENDER.halfWidth,
      y0: d.y - DEFENDER.halfDepth,
      y1: d.y + DEFENDER.halfDepth,
      z0,
      height: DEFENDER.height,
      top: COLOR.defenderTop,
      front: COLOR.defenderFront,
    },
    cam,
  );
  if (d.hp < d.maxHp) {
    drawHpBar(ctx, { x: d.x, y: d.y, z: z0 + DEFENDER.height + HP_BAR.gap }, d.hp, d.maxHp, cam);
  }
}

type Sprite = { y: number; x: number; draw: () => void };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  cam: Camera,
  view: View,
  build: BuildOverlay | null = null,
  selectedDefender: string | null = null,
): void {
  ctx.fillStyle = COLOR.sky;
  ctx.fillRect(0, 0, view.w, view.h);

  const a = project({ x: 0, y: 0 }, cam);
  const b = project({ x: FIELD.right, y: FIELD.height }, cam);
  ctx.fillStyle = COLOR.ground;
  ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);

  // The camp spans the whole field depth at the back: drawn before the sprites.
  drawBox(
    ctx,
    {
      x0: CAMP_BOX.x0,
      x1: CAMP_BOX.x1,
      y0: 0,
      y1: FIELD.height,
      z0: 0,
      height: CAMP_BOX.height,
      top: COLOR.campTop,
      front: COLOR.campFront,
    },
    cam,
  );

  // Build mode: every empty slot as a faint outline on the ground.
  if (build) {
    ctx.strokeStyle = COLOR.slot;
    ctx.lineWidth = 1;
    for (let row = 0; row < SEGMENTS; row++) {
      COLUMNS.forEach((_, column) => {
        if (!segmentOf(scene.layers, column, row)?.kind) {
          outline(ctx, footprint({ column, row, what: 'segment' }), 0, cam);
        }
        for (const what of ['tower', 'ground'] as const) {
          const taken = scene.posts.some(
            (p) => p.kind === what && p.column === column && p.row === row,
          );
          if (!taken) outline(ctx, footprint({ column, row, what }), 0, cam);
        }
      });
    }
  }

  const sprites: Sprite[] = [];
  for (const layer of scene.layers) {
    for (const seg of layer.segments) {
      if (seg.kind === null || seg.tier === null) continue; // unbuilt: an open gap
      const broken = seg.hp <= 0;
      const colour = broken
        ? { top: COLOR.brokenTop, front: COLOR.brokenFront }
        : TIER_COLOR[seg.tier];
      const y0 = seg.index * SEGMENT_HEIGHT;
      const height = wallHeight(seg.hp, seg.maxHp);
      const gate = seg.kind === 'gate';
      // Keyed just past the wall's front edge so enemies stopped at it draw on top.
      sprites.push({
        y: y0 + SEGMENT_HEIGHT / 2,
        x: layer.x + WALL.depth + 0.5,
        draw: () => {
          drawBox(
            ctx,
            {
              x0: layer.x,
              x1: layer.x + WALL.depth,
              y0: y0 + SEGMENT_GAP,
              y1: y0 + SEGMENT_HEIGHT - SEGMENT_GAP,
              z0: 0,
              height,
              ...colour,
            },
            cam,
          );
          if (!gate) return;
          // A gate: a dark band across the middle of its top face.
          const g0 = project({ x: layer.x, y: y0 + SEGMENT_HEIGHT * 0.3, z: height }, cam);
          const g1 = project(
            { x: layer.x + WALL.depth, y: y0 + SEGMENT_HEIGHT * 0.7, z: height },
            cam,
          );
          ctx.fillStyle = COLOR.gateMark;
          ctx.fillRect(g0.sx, g0.sy, g1.sx - g0.sx, g1.sy - g0.sy);
        },
      });
    }
  }
  for (const post of scene.posts) {
    // Standing on it; a post held only by a walker is reserved.
    const manned = scene.defenders.find((d) => d.postId === post.id && !d.walking);
    const reserved = !manned && post.defenderId !== null;
    const floor = postFloor(scene.layers, post);
    const p = post.kind === 'wall-walk' ? PIECE.walk : PIECE[post.kind];
    const colour =
      post.kind === 'tower'
        ? { top: COLOR.postTop, front: COLOR.postFront }
        : post.kind === 'ground'
          ? { top: COLOR.groundPostTop, front: COLOR.groundPostFront }
          : { top: COLOR.walkTop, front: COLOR.walkFront };
    const footprint = {
      x0: post.x - p.halfWidth,
      x1: post.x + p.halfWidth,
      y0: post.y - p.halfDepth,
      y1: post.y + p.halfDepth,
    };
    sprites.push({
      y: post.y,
      x: post.x,
      draw: () => {
        drawBox(ctx, { ...footprint, z0: floor - p.height, height: p.height, ...colour }, cam);
        if (reserved) {
          ctx.strokeStyle = COLOR.reserved;
          ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
          outline(ctx, footprint, floor, cam);
        }
        if (manned) drawDefender(ctx, manned, floor, manned.id === selectedDefender, cam);
      },
    });
  }
  for (const d of scene.defenders) {
    if (!d.walking) continue;
    sprites.push({
      y: d.y,
      x: d.x,
      draw: () => drawDefender(ctx, d, 0, d.id === selectedDefender, cam),
    });
  }
  for (const e of scene.enemies) {
    sprites.push({
      y: e.y,
      x: e.x,
      draw: () => {
        const ground = project({ x: e.x, y: e.y }, cam);
        const body = project({ x: e.x, y: e.y, z: ENEMY.z }, cam);
        const r = ENEMY.radius * cam.zoom;
        ctx.fillStyle = COLOR.shadow;
        ctx.beginPath();
        ctx.ellipse(ground.sx, ground.sy, r, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (e.id === scene.focusId) {
          ctx.strokeStyle = COLOR.focus;
          ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
          ctx.beginPath();
          ctx.ellipse(ground.sx, ground.sy, r * 1.8, r * 1.8 * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = COLOR.enemy;
        ctx.beginPath();
        ctx.arc(body.sx, body.sy, r, 0, Math.PI * 2);
        ctx.fill();
        drawHpBar(ctx, { x: e.x, y: e.y, z: HP_BAR.z }, e.hp, e.maxHp, cam);
      },
    });
  }
  for (const sprite of depthSort(sprites)) sprite.draw();

  // The selected slot: its footprint on the ground, on top of everything.
  if (build?.selected) {
    ctx.strokeStyle = COLOR.focus;
    ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    outline(ctx, footprint(build.selected), 0, cam);
  }

  // Shots on top: from the defender's chest to the enemy's body.
  ctx.strokeStyle = COLOR.shot;
  ctx.lineWidth = Math.max(1, 2 * cam.zoom);
  for (const shot of scene.shots) {
    // Shots start at their post's exact coordinates, so this finds the shooter's post.
    const from = scene.posts.find((p) => p.x === shot.fromX && p.y === shot.fromY);
    const z = (from ? postFloor(scene.layers, from) : PIECE.tower.height) + DEFENDER.height * 0.7;
    const a0 = project({ x: shot.fromX, y: shot.fromY, z }, cam);
    const to = project({ x: shot.toX, y: shot.toY, z: ENEMY.z }, cam);
    ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy);
    ctx.lineTo(to.sx, to.sy);
    ctx.stroke();
  }
}
