// The horde view (design §15): generated sprites and tiling textures (sprites.ts) on
// the shared projection and depth sort. Canvas 2D, no rendering library.
import {
  CAMP,
  COLUMNS,
  FIELD,
  MAX_CONDITION,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  TRAP_STRIP,
  WALL,
  type Profession,
} from '../core/data.ts';
import {
  turretState,
  type Defender,
  type HordeState,
  type Layer,
  type Post,
  type Trap,
  type Turret,
} from '../core/horde.ts';
import { professionOf } from '../core/loadout.ts';
import { badgeOf } from '../core/stats.ts';
import {
  depthSort,
  HEIGHT_SCALE,
  PIECE,
  postFloor,
  project,
  TILT,
  wallHeight,
  type Camera,
  type SlotHit,
  type View,
} from './projection.ts';
import {
  BASE_ART,
  DEFENDER_ART,
  ENEMY_ART,
  TIER_ART,
  TRAP_ART,
  TURRET_ART,
  ART_PX,
  type Art,
  type ArtId,
} from './sprites.ts';

/** Title badge colour per profession: muted, so the horde keeps the saturated colours. */
export const BADGE_COLOUR: Readonly<Record<Profession, string>> = {
  gunner: '#b9a35c',
  ripper: '#a8615c',
  engineer: '#c47f3c',
};

const COLOR = {
  sky: '#15171a',
  selected: '#9cc4f0',
  reserved: 'rgba(156, 196, 240, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  slot: 'rgba(216, 212, 204, 0.18)',
  focus: '#ffe066',
  hpBack: '#c43b3b',
  hpFill: '#5ec24a',
  conditionBack: '#111110',
  conditionFill: '#a9c4d6',
  shot: '#e8d36a',
  strike: '#f2f2f2',
  glow: 'rgba(255, 196, 70, 0.45)',
  spark: '#ffd84a',
  smoke: 'rgba(150, 150, 150, 0.55)',
} as const;

/** How a trap shows (design §7, §15): its kind's sprite, or its broken one. */
export function trapLook(t: Pick<Trap, 'kind' | 'durability'>): { art: ArtId; broken: boolean } {
  const broken = t.durability <= 0;
  return { art: TRAP_ART[t.kind][broken ? 'broken' : 'built'], broken };
}

/** Where wear shows on a turret. */
const TURRET_WEAR = { sparkBelow: 50, smokeBelow: 25 } as const;

/**
 * How a turret shows its state (design §15): lit (with a glow) while powered, dark with
 * no charge or with its wall broken, scorched and bent when jammed; sparks below half
 * condition and smoke below a quarter, unless jammed.
 */
export function turretLook(
  scene: Pick<Scene, 'layers' | 'energy'>,
  t: Turret,
): { art: ArtId; glow: boolean; jammed: boolean; sparks: boolean; smoke: boolean } {
  const state = turretState(scene, t);
  const jammed = state === 'jammed';
  const share = (t.condition / MAX_CONDITION) * 100;
  return {
    art: TURRET_ART[state],
    glow: state === 'lit',
    jammed,
    sparks: !jammed && share < TURRET_WEAR.sparkBelow,
    smoke: !jammed && share < TURRET_WEAR.smokeBelow,
  };
}

/** World units one tile of a texture covers. */
const TILE = { wall: 48, ground: 160 } as const;
/** Gap drawn between wall segments so they read as separate pieces. */
const SEGMENT_GAP = 2;
/** The camp's yard behind the inner wall, and its huts along the field's depth. */
const CAMP_YARD = { x0: CAMP.x - 90, x1: CAMP.x } as const;
const CAMP_PROPS = { count: 5, height: 58 } as const;
const DEFENDER = PIECE.defender;
/**
 * Drawn heights (screen px at zoom 1) of a standing sprite `ART_PX` tall, feet on its
 * spot. Every sprite keeps its own scale: one less than `ART_PX` tall (a wide one, or a
 * group member smaller than the group's biggest) draws that much shorter.
 */
const STAND = { defender: 40, enemy: 34, shield: 26 } as const;
const ENEMY = { shadow: 10, z: 10 } as const;
/** Half the length of a Ripper's strike mark across the enemy, in px. */
const STRIKE = 7;
/** `z`: an enemy's bar height; `gap`: a defender's bar above its head. */
const HP_BAR = { w: 24, h: 4, z: 36, gap: 6 } as const;
/** The title badge over a defender (design §15): a plate of `pip`-wide pips, above the HP bar. */
const BADGE = { pip: 4, gap: 2, pad: 2, z: 14, pipColour: '#1b1a18' } as const;
/** How much wider than its footprint a piece's sprite may draw. */
const OVERSPILL = 1.6;

/** What the renderer needs from a fight; build mode passes the base laid out the same way. */
export type Scene = Pick<
  HordeState,
  | 'layers'
  | 'posts'
  | 'turrets'
  | 'traps'
  | 'energy'
  | 'defenders'
  | 'enemies'
  | 'shots'
  | 'focusId'
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
}
interface Rect {
  sx: number;
  sy: number;
  w: number;
  h: number;
}

/** A box's top face and the face toward the viewer, on screen. */
function faces(b: Box, cam: Camera): { top: Rect; front: Rect } {
  const backTop = project({ x: b.x0, y: b.y0, z: b.z0 + b.height }, cam);
  const frontTop = project({ x: b.x1, y: b.y1, z: b.z0 + b.height }, cam);
  const frontBottom = project({ x: b.x1, y: b.y1, z: b.z0 }, cam);
  const w = frontTop.sx - backTop.sx;
  return {
    top: { sx: backTop.sx, sy: backTop.sy, w, h: frontTop.sy - backTop.sy },
    front: { sx: backTop.sx, sy: frontTop.sy, w, h: frontBottom.sy - frontTop.sy },
  };
}

const patterns = new WeakMap<HTMLImageElement, CanvasPattern>();
/**
 * Fills `r` with a tiling texture fixed to the world, so it pans and zooms with the
 * field: `squash` is how much the face is flattened on screen (TILT for a top face).
 */
function fillTexture(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  r: Rect,
  tile: number,
  squash: number,
  cam: Camera,
): void {
  let pattern = patterns.get(img);
  if (!pattern) {
    pattern = ctx.createPattern(img, 'repeat') ?? undefined;
    if (!pattern) return;
    patterns.set(img, pattern);
  }
  const origin = project({ x: 0, y: 0 }, cam);
  const s = (tile * cam.zoom) / img.width;
  pattern.setTransform(new DOMMatrix().translate(origin.sx, origin.sy).scale(s, s * squash));
  ctx.fillStyle = pattern;
  ctx.fillRect(r.sx, r.sy, r.w, r.h);
}

/** An extruded box with textured faces. */
function drawBox(
  ctx: CanvasRenderingContext2D,
  b: Box,
  top: HTMLImageElement,
  front: HTMLImageElement,
  cam: Camera,
): void {
  const f = faces(b, cam);
  fillTexture(ctx, top, f.top, TILE.wall, TILT, cam);
  fillTexture(ctx, front, f.front, TILE.wall, HEIGHT_SCALE, cam);
}

/**
 * A sprite standing on a box's footprint: as tall as the box shows on screen, no wider
 * than `OVERSPILL` × its footprint, its bottom centre on the box's front bottom edge.
 * `stretch` fills the box instead (flat pieces such as traps).
 */
function drawOnBox(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  b: Box,
  cam: Camera,
  stretch = false,
): void {
  const f = faces(b, cam);
  const w = f.top.w;
  const h = f.top.h + f.front.h;
  if (stretch) {
    ctx.drawImage(img, f.top.sx, f.top.sy, w, h);
    return;
  }
  const scale = Math.min(h / img.height, (w * OVERSPILL) / img.width);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, f.top.sx + (w - dw) / 2, f.top.sy + h - dh, dw, dh);
}

/** A sprite with its bottom centre on `feet`, `height` px (at zoom 1) for an `ART_PX`-tall one. */
function drawStanding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  feet: { sx: number; sy: number },
  height: number,
  cam: Camera,
): void {
  const dh = ((height * img.height) / ART_PX) * cam.zoom;
  const dw = (img.width / img.height) * dh;
  ctx.drawImage(img, feet.sx - dw / 2, feet.sy - dh, dw, dh);
}

/** Fills `r` with the middle of `img` cut to `r`'s shape, so it is never squashed. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect): void {
  const scale = Math.max(r.w / img.width, r.h / img.height);
  const sw = r.w / scale;
  const sh = r.h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, r.sx, r.sy, r.w, r.h);
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
  if (slot.what === 'trap') {
    return {
      x0: TRAP_STRIP.x,
      x1: TRAP_STRIP.x + TRAP_STRIP.width,
      y0: y0 + SEGMENT_GAP,
      y1: y0 + SEGMENT_HEIGHT - SEGMENT_GAP,
    };
  }
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
  colour: { back: string; fill: string } = { back: COLOR.hpBack, fill: COLOR.hpFill },
): void {
  const bar = project(at, cam);
  const w = HP_BAR.w * cam.zoom;
  const h = HP_BAR.h * cam.zoom;
  ctx.fillStyle = colour.back;
  ctx.fillRect(bar.sx - w / 2, bar.sy, w, h);
  ctx.fillStyle = colour.fill;
  ctx.fillRect(bar.sx - w / 2, bar.sy, w * Math.max(0, hp / maxHp), h);
}

/** A titled defender's badge: their top title's colour, one dark pip per rank. */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  d: Pick<Defender, 'x' | 'y' | 'stats'>,
  z0: number,
  cam: Camera,
): void {
  const badge = d.stats ? badgeOf(d.stats) : null;
  if (!badge) return;
  const at = project({ x: d.x, y: d.y, z: z0 + DEFENDER.height + HP_BAR.gap + BADGE.z }, cam);
  const pip = BADGE.pip * cam.zoom;
  const gap = BADGE.gap * cam.zoom;
  const pad = BADGE.pad * cam.zoom;
  const w = badge.pips * pip + (badge.pips - 1) * gap + 2 * pad;
  const h = pip + 2 * pad;
  ctx.fillStyle = BADGE_COLOUR[badge.profession];
  ctx.fillRect(at.sx - w / 2, at.sy - h / 2, w, h);
  ctx.fillStyle = BADGE.pipColour;
  for (let i = 0; i < badge.pips; i++) {
    ctx.fillRect(at.sx - w / 2 + pad + i * (pip + gap), at.sy - pip / 2, pip, pip);
  }
}

/**
 * A defender standing `z0` up at `(x, y)`: their profession's sprite (the weapon tells
 * it, design §15), a shield in front if they carry one, a ring at their feet when
 * selected, their title badge and an HP bar once hurt.
 */
function drawDefender(
  ctx: CanvasRenderingContext2D,
  art: Art,
  d: Pick<Defender, 'x' | 'y' | 'hp' | 'maxHp' | 'loadout' | 'stats'>,
  z0: number,
  selected: boolean,
  cam: Camera,
): void {
  const feet = project({ x: d.x, y: d.y, z: z0 }, cam);
  if (selected) {
    const r = DEFENDER.halfDepth * 1.8 * cam.zoom;
    ctx.strokeStyle = COLOR.selected;
    ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    ctx.beginPath();
    ctx.ellipse(feet.sx, feet.sy, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawStanding(ctx, art[DEFENDER_ART[professionOf(d.loadout)]], feet, STAND.defender, cam);
  if (d.loadout.item === 'shield') {
    const front = project({ x: d.x + DEFENDER.halfWidth + 2, y: d.y + 2, z: z0 }, cam);
    drawStanding(ctx, art[BASE_ART.shield], front, STAND.shield, cam);
  }
  drawBadge(ctx, d, z0, cam);
  if (d.hp < d.maxHp) {
    drawHpBar(ctx, { x: d.x, y: d.y, z: z0 + DEFENDER.height + HP_BAR.gap }, d.hp, d.maxHp, cam);
  }
}

type Sprite = { y: number; x: number; draw: () => void };

/** Where a turret's head sits: on top of its tower, or on its wall's walk platform. */
function turretFloor(layers: readonly Layer[], t: Turret): number {
  return postFloor(layers, { kind: t.mount, column: t.column, row: t.row } as Post);
}

/** A footprint `half` wide and deep around `(x, y)`. */
const around = (
  at: { x: number; y: number },
  half: { halfWidth: number; halfDepth: number },
): { x0: number; x1: number; y0: number; y1: number } => ({
  x0: at.x - half.halfWidth,
  x1: at.x + half.halfWidth,
  y0: at.y - half.halfDepth,
  y1: at.y + half.halfDepth,
});

/** A post or turret mount: a watchtower, a sandbag pit, or a plank platform on a wall. */
function drawMount(
  ctx: CanvasRenderingContext2D,
  art: Art,
  kind: Post['kind'],
  at: { x: number; y: number },
  floor: number,
  cam: Camera,
): void {
  const p = kind === 'wall-walk' ? PIECE.walk : PIECE[kind];
  const box = { ...around(at, p), z0: floor - p.height, height: p.height };
  if (kind === 'wall-walk') {
    drawBox(ctx, box, art[BASE_ART.walk.top], art[BASE_ART.walk.front], cam);
  } else {
    drawOnBox(ctx, art[kind === 'tower' ? BASE_ART.tower : BASE_ART.groundPost], box, cam);
  }
}

/** A turret: its mount, its head in its state's sprite, its wear and its condition bar. */
function drawTurret(
  ctx: CanvasRenderingContext2D,
  art: Art,
  scene: Scene,
  t: Turret,
  cam: Camera,
): void {
  const floor = turretFloor(scene.layers, t);
  drawMount(ctx, art, t.mount, t, floor, cam);
  const look = turretLook(scene, t);
  const top = floor + PIECE.turret.height;
  if (look.glow) {
    const c = project({ x: t.x, y: t.y, z: floor + PIECE.turret.height / 2 }, cam);
    const r = PIECE.turret.halfWidth * 2.2 * cam.zoom;
    const glow = ctx.createRadialGradient(c.sx, c.sy, 0, c.sx, c.sy, r);
    glow.addColorStop(0, COLOR.glow);
    glow.addColorStop(1, 'rgba(255, 196, 70, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(c.sx - r, c.sy - r, 2 * r, 2 * r);
  }
  drawOnBox(
    ctx,
    art[look.art],
    { ...around(t, PIECE.turret), z0: floor, height: PIECE.turret.height },
    cam,
  );
  if (look.sparks) {
    ctx.fillStyle = COLOR.spark;
    for (const [dx, dz] of [
      [-6, 4],
      [5, 8],
      [10, 2],
    ] as const) {
      const p = project({ x: t.x + dx, y: t.y, z: top + dz }, cam);
      ctx.fillRect(p.sx - cam.zoom, p.sy - cam.zoom, 2 * cam.zoom, 2 * cam.zoom);
    }
  }
  if (look.smoke) {
    ctx.fillStyle = COLOR.smoke;
    for (const [dx, dz, r] of [
      [-2, 10, 5],
      [4, 18, 7],
    ] as const) {
      const p = project({ x: t.x + dx, y: t.y, z: top + dz }, cam);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Clear of the head and its sparks, in a steel colour no HP bar uses.
  drawHpBar(ctx, { x: t.x, y: t.y, z: top + 2 * HP_BAR.gap }, t.condition, MAX_CONDITION, cam, {
    back: COLOR.conditionBack,
    fill: COLOR.conditionFill,
  });
}

/**
 * A trap's sprite flat across its cell, stretched to it like the ground under it is:
 * the cell is wider on screen than the sprite, and a trap covers its whole cell.
 */
function drawTrap(ctx: CanvasRenderingContext2D, art: Art, t: Trap, cam: Camera): void {
  const r = footprint({ column: COLUMNS.length - 1, row: t.row, what: 'trap' });
  drawOnBox(ctx, art[trapLook(t).art], { ...r, z0: 0, height: 8 }, cam, true);
}

/**
 * A wall segment in its tier's textures, lower as it takes damage with cracks showing
 * through; a gate's door across its top; a broken one is its tier's rubble.
 */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  art: Art,
  layer: Layer,
  seg: Layer['segments'][number],
  cam: Camera,
): void {
  const tier = TIER_ART[seg.tier!];
  const y0 = seg.index * SEGMENT_HEIGHT;
  const box = {
    x0: layer.x,
    x1: layer.x + WALL.depth,
    y0: y0 + SEGMENT_GAP,
    y1: y0 + SEGMENT_HEIGHT - SEGMENT_GAP,
    z0: 0,
    height: wallHeight(seg.hp, seg.maxHp),
  };
  if (seg.hp <= 0) {
    drawOnBox(ctx, art[tier.rubble], box, cam);
    return;
  }
  drawBox(ctx, box, art[tier.top], art[tier.front], cam);
  const f = faces(box, cam);
  if (seg.kind === 'gate') {
    const band = SEGMENT_HEIGHT * 0.2;
    const door = faces({ ...box, y0: y0 + band, y1: y0 + SEGMENT_HEIGHT - band }, cam).top;
    ctx.drawImage(art[BASE_ART.gate], door.sx, door.sy, door.w, door.h);
  }
  const damage = 1 - seg.hp / seg.maxHp;
  if (damage > 0) {
    ctx.globalAlpha = Math.min(1, 0.3 + damage);
    drawCover(ctx, art[BASE_ART.cracks], f.front);
    ctx.globalAlpha = 1;
  }
}

/** The ground, then the camp's yard with its huts at the back, behind every sprite. */
function drawGround(ctx: CanvasRenderingContext2D, art: Art, cam: Camera): void {
  const field = faces({ x0: 0, x1: FIELD.right, y0: 0, y1: FIELD.height, z0: 0, height: 0 }, cam);
  fillTexture(ctx, art[BASE_ART.ground], field.top, TILE.ground, TILT, cam);
  const yard = faces({ ...CAMP_YARD, y0: 0, y1: FIELD.height, z0: 0, height: 0 }, cam);
  fillTexture(ctx, art[BASE_ART.camp], yard.top, TILE.wall * 2, TILT, cam);
  const step = FIELD.height / CAMP_PROPS.count;
  for (let i = 0; i < CAMP_PROPS.count; i++) {
    const prop = art[BASE_ART.campProps[i % BASE_ART.campProps.length]!];
    const feet = project({ x: (CAMP_YARD.x0 + CAMP_YARD.x1) / 2, y: (i + 0.8) * step }, cam);
    drawStanding(ctx, prop, feet, CAMP_PROPS.height, cam);
  }
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  art: Art,
  scene: Scene,
  cam: Camera,
  view: View,
  build: BuildOverlay | null = null,
  selectedDefender: string | null = null,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = COLOR.sky;
  ctx.fillRect(0, 0, view.w, view.h);
  drawGround(ctx, art, cam);

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
          const taken =
            scene.posts.some((p) => p.kind === what && p.column === column && p.row === row) ||
            scene.turrets.some((t) => t.mount === what && t.column === column && t.row === row);
          if (!taken) outline(ctx, footprint({ column, row, what }), 0, cam);
        }
      });
      if (!scene.traps.some((t) => t.row === row)) {
        outline(ctx, footprint({ column: COLUMNS.length - 1, row, what: 'trap' }), 0, cam);
      }
    }
  }

  // Traps lie flat on the ground, under every sprite.
  for (const t of scene.traps) drawTrap(ctx, art, t, cam);

  const sprites: Sprite[] = [];
  for (const layer of scene.layers) {
    for (const seg of layer.segments) {
      if (seg.kind === null || seg.tier === null) continue; // unbuilt: an open gap
      // Keyed just past the wall's front edge so enemies stopped at it draw on top.
      sprites.push({
        y: seg.index * SEGMENT_HEIGHT + SEGMENT_HEIGHT / 2,
        x: layer.x + WALL.depth + 0.5,
        draw: () => drawSegment(ctx, art, layer, seg, cam),
      });
    }
  }
  for (const post of scene.posts) {
    // Standing on it; a post held only by a walker is reserved.
    const manned = scene.defenders.find((d) => d.postId === post.id && !d.walking);
    const reserved = !manned && post.defenderId !== null;
    const floor = postFloor(scene.layers, post);
    sprites.push({
      y: post.y,
      x: post.x,
      draw: () => {
        drawMount(ctx, art, post.kind, post, floor, cam);
        if (reserved) {
          const p = post.kind === 'wall-walk' ? PIECE.walk : PIECE[post.kind];
          ctx.strokeStyle = COLOR.reserved;
          ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
          outline(ctx, around(post, p), floor, cam);
        }
        if (manned) drawDefender(ctx, art, manned, floor, manned.id === selectedDefender, cam);
      },
    });
  }
  for (const t of scene.turrets) {
    sprites.push({ y: t.y, x: t.x, draw: () => drawTurret(ctx, art, scene, t, cam) });
  }
  for (const d of scene.defenders) {
    if (!d.walking) continue;
    sprites.push({
      y: d.y,
      x: d.x,
      draw: () => drawDefender(ctx, art, d, 0, d.id === selectedDefender, cam),
    });
  }
  for (const e of scene.enemies) {
    sprites.push({
      y: e.y,
      x: e.x,
      draw: () => {
        const ground = project({ x: e.x, y: e.y }, cam);
        const r = ENEMY.shadow * cam.zoom;
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
        drawStanding(ctx, art[ENEMY_ART[e.kind]], ground, STAND.enemy, cam);
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

  // Shots on top: from the defender's chest to the enemy's body; a Ripper's strike is a
  // short slash across the enemy instead.
  ctx.lineWidth = Math.max(1, 2 * cam.zoom);
  for (const shot of scene.shots) {
    if (shot.melee) {
      const a = project({ x: shot.toX - STRIKE, y: shot.toY, z: ENEMY.z + STRIKE }, cam);
      const b = project({ x: shot.toX + STRIKE, y: shot.toY, z: ENEMY.z - STRIKE }, cam);
      ctx.strokeStyle = COLOR.strike;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      continue;
    }
    ctx.strokeStyle = COLOR.shot;
    // Shots start at their post's or turret's exact coordinates, so this finds the shooter.
    const turret = scene.turrets.find((t) => t.x === shot.fromX && t.y === shot.fromY);
    const from = scene.posts.find((p) => p.x === shot.fromX && p.y === shot.fromY);
    const z = turret
      ? turretFloor(scene.layers, turret) + PIECE.turret.height / 2
      : (from ? postFloor(scene.layers, from) : PIECE.tower.height) + DEFENDER.height * 0.7;
    const a0 = project({ x: shot.fromX, y: shot.fromY, z }, cam);
    const to = project({ x: shot.toX, y: shot.toY, z: ENEMY.z }, cam);
    ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy);
    ctx.lineTo(to.sx, to.sy);
    ctx.stroke();
  }
}
