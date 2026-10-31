// The horde view (design §15): generated sprites and tiling textures (sprites.ts) on
// the shared projection and depth sort. Canvas 2D, no rendering library.
import {
  COLUMNS,
  ENEMIES,
  ENEMY_RADIUS,
  FIELD,
  IMPACT_FLASH,
  MAX_CONDITION,
  MUZZLE_FLASH,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  SKILL_FLASH,
  SKILLS,
  SPEWER,
  SWOLLEN,
  CARD,
  TRAP_STRIP,
  WALL,
  type EnemyKind,
  type Profession,
} from '../core/data.ts';
import {
  burning,
  turretState,
  type Arc,
  type Bullet,
  type Defender,
  type HordeState,
  type Impact,
  type Layer,
  type Pop,
  type Post,
  type Burst,
  type Spit,
  type Trap,
  type Turret,
} from '../core/horde.ts';
import { baseOf } from '../core/armoury.ts';
import { professionOf } from '../core/loadout.ts';
import { carpet } from '../core/skills.ts';
import { badgeOf } from '../core/stats.ts';
import {
  depthSort,
  FRAME,
  mountDepth,
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
import { CAMP_YARD, GROUND_TILE, groundCanvas, SURROUND_BLOCK, surroundCanvas } from './ground.ts';
import { defenderPose, enemyPose, fallPose, STILL, type Animator, type Pose } from './anim.ts';
import {
  BASE_ART,
  DEFENDER_ART,
  ENEMY_ART,
  GATE_POSTS,
  GUNNER_ART,
  SKILL_ART,
  TIER_ART,
  TRAP_ART,
  TURRET_ART,
  type GunId,
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
  offFrame: '#d2453c',
  plate: 'rgba(21, 23, 26, 0.6)',
  plateText: '#d8d4cc',
  hpBack: '#c43b3b',
  hpFill: '#5ec24a',
  conditionBack: '#111110',
  conditionFill: '#a9c4d6',
  strike: '#f2f2f2',
  slug: '#fffbe8',
  flash: '#fff2b0',
  flashEdge: 'rgba(255, 170, 60, 0.6)',
  blood: '#8e1f1a',
  dust: '#a8987c',
  acid: '#a6e22e',
  glow: 'rgba(255, 196, 70, 0.45)',
  spark: '#ffd84a',
  smoke: 'rgba(150, 150, 150, 0.55)',
  lightning: '#cfe6ff',
  pop: '#ff9a3c',
  flame: '#ff7a1a',
} as const;
/**
 * A molotov fire's art (ID-041): see-through at `alpha`, flaring up over `in` s once lit
 * and dying down over its last `out` s, its size wavering by `flicker`.
 */
const FIRE = { alpha: 0.7, in: 0.15, out: 0.5, flicker: 0.03 } as const;
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

/** World units one tile of a wall texture covers. */
const TILE = { wall: 48 } as const;
/** Gap drawn between wall segments so they read as separate pieces. */
const SEGMENT_GAP = 2;
/** The camp's huts along the field's depth, in its yard. */
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
/**
 * Where a gun's barrel ends on its shooter's sprite (design §15): `dx` ahead of the
 * shooter's spot, `z` above its floor. Bullets start their drop to body height there.
 */
const MUZZLE = { defender: { dx: 12, z: 12 }, turret: { dx: 13, z: 2 } } as const;
/**
 * Effect sizes in px at zoom 1, each kept at least `min` px on screen so they still read
 * at 0.5× zoom: a bullet's slug and streak width, a muzzle flash, an impact's puff.
 */
const EFFECT = { slug: 1.5, streak: 1.5, flash: 5, puff: 6, min: 1 } as const;
/**
 * The marker at the frame's left edge for a row's enemies past it (ID-064), in screen
 * px: an arrow `arrow` tall pointing at the camp, then the count on a plate, all at `alpha`.
 */
const OFF_FRAME = {
  arrow: 12,
  pad: 4,
  font: 'bold 13px system-ui, sans-serif',
  alpha: 0.85,
} as const;
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
  | 'strikes'
  | 'bullets'
  | 'shots'
  | 'impacts'
  | 'spits'
  | 'bursts'
  | 'arcs'
  | 'pops'
  | 'focusId'
  | 'time'
  | 'fires'
  | 'blasts'
  | 'outcome'
> &
  // A Power Surge lights turrets on an empty bank (design §8); build mode has none.
  Partial<Pick<HordeState, 'wave' | 'freeWave'>>;
/** An armed skill's reach around the cursor, on the field. */
export interface Aim {
  skill: 'airstrike';
  x: number;
  y: number;
}
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

const patterns = new WeakMap<HTMLImageElement | OffscreenCanvas, CanvasPattern>();
/**
 * Fills `r` with a tiling texture fixed to the world, so it pans and zooms with the
 * field: `squash` is how much the face is flattened on screen (TILT for a top face).
 */
function fillTexture(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | OffscreenCanvas,
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

const flashes = new WeakMap<HTMLImageElement, OffscreenCanvas>();
/** `img`'s shape in plain white, made once per image, for a hit's flash. */
function whiteOf(img: HTMLImageElement): OffscreenCanvas {
  let white = flashes.get(img);
  if (!white) {
    white = new OffscreenCanvas(img.width, img.height);
    const g = white.getContext('2d')!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, img.width, img.height);
    flashes.set(img, white);
  }
  return white;
}

/**
 * A sprite with its bottom centre on `feet`, `height` px (at zoom 1) for an `ART_PX`-tall
 * one, moved by its animation `pose` (anim.ts) about its feet.
 */
function drawStanding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  feet: { sx: number; sy: number },
  height: number,
  cam: Camera,
  pose: Readonly<Pose> = STILL,
): void {
  const dh = ((height * img.height) / ART_PX) * cam.zoom;
  const dw = (img.width / img.height) * dh;
  if (pose === STILL) {
    ctx.drawImage(img, feet.sx - dw / 2, feet.sy - dh, dw, dh);
    return;
  }
  ctx.save();
  ctx.translate(feet.sx + pose.dx * cam.zoom, feet.sy - pose.lift * cam.zoom);
  ctx.rotate(pose.rot);
  ctx.scale(pose.sx, pose.sy);
  ctx.globalAlpha *= pose.alpha;
  ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  if (pose.flash > 0) {
    ctx.globalAlpha *= pose.flash;
    ctx.drawImage(whiteOf(img), -dw / 2, -dh, dw, dh);
  }
  ctx.restore();
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
 * it, design §15; a Gunner's shows their primary) in `pose`, a shield in front if they
 * carry one, a ring at their feet when selected, their title badge and an HP bar once hurt.
 */
function drawDefender(
  ctx: CanvasRenderingContext2D,
  art: Art,
  d: Pick<Defender, 'x' | 'y' | 'hp' | 'maxHp' | 'loadout' | 'stats'>,
  z0: number,
  selected: boolean,
  cam: Camera,
  pose: Readonly<Pose> = STILL,
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
  const profession = professionOf(d.loadout);
  const sprite =
    profession === 'gunner'
      ? (GUNNER_ART[baseOf(d.loadout.primary) as GunId] ?? DEFENDER_ART.gunner)
      : DEFENDER_ART[profession];
  drawStanding(ctx, art[sprite], feet, STAND.defender, cam, pose);
  if (d.loadout.item === 'shield') {
    const front = project({ x: d.x + DEFENDER.halfWidth + 2, y: d.y + 2, z: z0 }, cam);
    drawStanding(ctx, art[BASE_ART.shield], front, STAND.shield, cam, pose);
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

/**
 * A post or turret mount: a watchtower, a sandbag pit, or a plank platform on a wall.
 * A standing gate's top is its walk, so its spots get no platform that would hide the
 * gate; whoever stands there keeps the platform's floor. A broken one's rubble gets the
 * platform back, as a broken wall's does.
 */
function drawMount(
  ctx: CanvasRenderingContext2D,
  art: Art,
  layers: readonly Layer[],
  kind: Post['kind'],
  at: { x: number; y: number; column: number; row: number },
  floor: number,
  cam: Camera,
): void {
  const p = kind === 'wall-walk' ? PIECE.walk : PIECE[kind];
  const box = { ...around(at, p), z0: floor - p.height, height: p.height };
  if (kind === 'wall-walk') {
    const seg = segmentOf(layers, at.column, at.row);
    if (seg?.kind === 'gate' && seg.hp > 0) return;
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
  drawMount(ctx, art, scene.layers, t.mount, t, floor, cam);
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
 * through; a gate's top is its tier's gate, posts in line with the wall and the leaves
 * ajar toward the field; a broken one is its tier's rubble.
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
    const gate = art[tier.gate];
    ctx.drawImage(gate, f.top.sx, f.top.sy, f.top.w / GATE_POSTS, f.top.h);
  }
  const damage = 1 - seg.hp / seg.maxHp;
  if (damage > 0) {
    ctx.globalAlpha = Math.min(1, 0.3 + damage);
    drawCover(ctx, art[BASE_ART.cracks], f.front);
    ctx.globalAlpha = 1;
  }
}

/** The ground's block (ground.ts) repeated over the whole view, so no sky shows round the frame. */
function drawSurround(ctx: CanvasRenderingContext2D, art: Art, cam: Camera, view: View): void {
  const surround = surroundCanvas(art);
  if (!surround) return;
  const all = { sx: 0, sy: 0, w: view.w, h: view.h };
  fillTexture(ctx, surround, all, SURROUND_BLOCK * GROUND_TILE, TILT, cam);
}

/**
 * The field's ground with the camp's yard in it (ground.ts), then the huts, behind every
 * sprite. The fixed frame (ID-064) clips the yard and huts away; ID-065's camp scene
 * shows them again.
 */
function drawGround(ctx: CanvasRenderingContext2D, art: Art, cam: Camera): void {
  const field = faces({ x0: 0, x1: FIELD.right, y0: 0, y1: FIELD.height, z0: 0, height: 0 }, cam);
  const ground = groundCanvas(art);
  if (ground) ctx.drawImage(ground, field.top.sx, field.top.sy, field.top.w, field.top.h);
  const step = FIELD.height / CAMP_PROPS.count;
  for (let i = 0; i < CAMP_PROPS.count; i++) {
    const prop = art[BASE_ART.campProps[i % BASE_ART.campProps.length]!];
    const feet = project({ x: (CAMP_YARD.x0 + CAMP_YARD.x1) / 2, y: (i + 0.8) * step }, cam);
    drawStanding(ctx, prop, feet, CAMP_PROPS.height, cam);
  }
}

/** A size `px` at zoom 1, on screen, never under `EFFECT.min`. */
const sized = (px: number, cam: Camera): number => Math.max(EFFECT.min, px * cam.zoom);

/**
 * The barrel end of whoever shoots from `(x, y)`: a turret there, else the defender on
 * the post there (bullets leave their post's or turret's exact coordinates), else a
 * defender walking on the ground.
 */
function muzzleAt(scene: Scene, x: number, y: number): { x: number; y: number; z: number } {
  const turret = scene.turrets.find((t) => t.x === x && t.y === y);
  if (turret) {
    const floor = turretFloor(scene.layers, turret) + MUZZLE.turret.z;
    return { x: x + MUZZLE.turret.dx, y, z: floor };
  }
  const post = scene.posts.find((p) => p.x === x && p.y === y);
  const floor = post ? postFloor(scene.layers, post) : 0;
  return { x: x + MUZZLE.defender.dx, y, z: floor + MUZZLE.defender.z };
}

/** How far into its `life` s the newest of `owner`'s shots is, 0…1; null with none showing. */
function flashAge(scene: Scene, owner: string): number | null {
  let age: number | null = null;
  for (const k of scene.shots) {
    const a = (scene.time - k.at) / MUZZLE_FLASH;
    if (k.owner === owner && a >= 0 && a < 1 && (age === null || a < age)) age = a;
  }
  return age;
}

/** A muzzle flash at the barrel end of whoever shoots from `(x, y)`, fading over `MUZZLE_FLASH`. */
function drawFlash(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  owner: string,
  x: number,
  y: number,
  cam: Camera,
): void {
  const age = flashAge(scene, owner);
  if (age === null) return;
  const c = project(muzzleAt(scene, x, y), cam);
  const r = sized(EFFECT.flash, cam);
  ctx.globalAlpha = 1 - age;
  ctx.fillStyle = COLOR.flashEdge;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOR.flash;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * A bullet at its simulated spot (design §15): a bright slug with its gun's streak behind
 * it, dropping from the muzzle to body height over the distance it was aimed. The streak
 * never reaches back past the muzzle, so nothing joins shooter and target.
 */
function drawBullet(ctx: CanvasRenderingContext2D, scene: Scene, b: Bullet, cam: Camera): void {
  const muzzle = muzzleAt(scene, b.fromX, b.fromY).z;
  const flown = Math.hypot(b.x - b.fromX, b.y - b.fromY);
  const zAt = (d: number): number =>
    muzzle + (ENEMY.z - muzzle) * Math.min(1, b.aim > 0 ? d / b.aim : 1);
  const tail = Math.min(b.tracer.length, flown);
  const a = project({ x: b.x - b.dx * tail, y: b.y - b.dy * tail, z: zAt(flown - tail) }, cam);
  const head = project({ x: b.x, y: b.y, z: zAt(flown) }, cam);
  ctx.strokeStyle = b.tracer.colour;
  ctx.lineWidth = sized(EFFECT.streak, cam);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(head.sx, head.sy);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR.slug;
  ctx.beginPath();
  ctx.arc(head.sx, head.sy, sized(EFFECT.slug, cam), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Where a bullet ended, fading and spreading over `IMPACT_FLASH`: a blood puff at body
 * height on a hit, a dust kick on the ground where a miss fell.
 */
function drawImpact(ctx: CanvasRenderingContext2D, i: Impact, time: number, cam: Camera): void {
  const age = (time - i.at) / IMPACT_FLASH;
  if (age < 0 || age >= 1) return;
  // Three blobs, thrown up and out as they grow.
  const blob = sized((EFFECT.puff / 2) * (0.5 + age), cam);
  const spread = (EFFECT.puff / 2) * (0.5 + age);
  ctx.globalAlpha = 0.8 * (1 - age);
  ctx.fillStyle = i.hit ? COLOR.blood : COLOR.dust;
  for (const [dx, dz] of [
    [-1, 1.2],
    [0, 2.4],
    [1, 0.8],
  ] as const) {
    const at = { x: i.x + dx * spread * 1.2, y: i.y, z: (i.hit ? ENEMY.z : 0) + dz * spread };
    const c = project(at, cam);
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, blob, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** An enemy's shadow on the ground, `size` × a Shambler's, `alpha` as solid as a living one's. */
function drawShadow(
  ctx: CanvasRenderingContext2D,
  at: { sx: number; sy: number },
  alpha: number,
  cam: Camera,
  size = 1,
): void {
  const r = ENEMY.shadow * size * cam.zoom;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLOR.shadow;
  ctx.beginPath();
  ctx.ellipse(at.sx, at.sy, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * An enemy's body, feet on `feet`, in `pose`: its kind's art (design §15), scaled by its
 * radius (a Shambler's is the reference).
 */
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  art: Art,
  kind: EnemyKind,
  feet: { sx: number; sy: number },
  cam: Camera,
  pose: Readonly<Pose>,
): void {
  const size = ENEMIES[kind].radius / ENEMY_RADIUS;
  drawStanding(ctx, art[ENEMY_ART[kind]], feet, STAND.enemy * size, cam, pose);
}

/** A Swollen blowing up: an acid-green ring swelling and fading (design §9, ID-023). */
function drawBurst(ctx: CanvasRenderingContext2D, k: Burst, time: number, cam: Camera): void {
  const age = (time - k.at) / SWOLLEN.burst;
  if (age < 0 || age >= 1) return;
  groundCircle(ctx, k.x, k.y, ENEMIES.swollen.radius * (1 + 2 * age), cam);
  ctx.globalAlpha = 0.7 * (1 - age);
  ctx.fillStyle = COLOR.acid;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Explode on Kill (design §8): an orange ring spreading over the burst's reach. */
function drawPop(ctx: CanvasRenderingContext2D, k: Pop, time: number, cam: Camera): void {
  const age = (time - k.at) / CARD.explode.flash;
  if (age < 0 || age >= 1) return;
  groundCircle(ctx, k.x, k.y, CARD.explode.radius * (0.4 + 0.6 * age), cam);
  ctx.globalAlpha = 0.9 * (1 - age);
  ctx.strokeStyle = COLOR.pop;
  ctx.lineWidth = sized(2, cam);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Chain Lightning (design §8), the one card that draws a beam: a jagged bolt at body
 * height from the enemy hit to the one it arced to, fading out.
 */
function drawArc(ctx: CanvasRenderingContext2D, k: Arc, time: number, cam: Camera): void {
  const age = (time - k.at) / CARD.chain.flash;
  if (age < 0 || age >= 1) return;
  const a = project({ x: k.fromX, y: k.fromY, z: ENEMY.z }, cam);
  const b = project({ x: k.x, y: k.y, z: ENEMY.z }, cam);
  // Fixed kinks (no RNG in the renderer): alternate sides of the line, a fifth of the way each.
  const nx = -(b.sy - a.sy) * 0.08;
  const ny = (b.sx - a.sx) * 0.08;
  ctx.globalAlpha = 1 - age;
  ctx.strokeStyle = COLOR.lightning;
  ctx.lineWidth = sized(1.5, cam);
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  for (let i = 1; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    ctx.lineTo(
      a.sx + ((b.sx - a.sx) * i) / 5 + side * nx,
      a.sy + ((b.sy - a.sy) * i) / 5 + side * ny,
    );
  }
  ctx.lineTo(b.sx, b.sy);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Burning Rounds (design §8): a flickering flame on a burning enemy, scaled by its body. */
function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  time: number,
  cam: Camera,
): void {
  const c = project({ x, y, z: ENEMY.z * size * 1.6 }, cam);
  ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 25);
  ctx.fillStyle = COLOR.flame;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, sized(EFFECT.puff * size * 0.7, cam), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A Spewer's glob arcing to where it lands, then a splash there (design §9, ID-023). */
function drawSpit(ctx: CanvasRenderingContext2D, k: Spit, time: number, cam: Camera): void {
  const age = (time - k.at) / SPEWER.splash;
  if (age < 0 || age >= 1) return;
  const fly = Math.min(1, age * 2);
  const at = {
    x: k.fromX + (k.x - k.fromX) * fly,
    y: k.fromY + (k.y - k.fromY) * fly,
    z: ENEMY.z + Math.sin(Math.PI * fly) * 40,
  };
  const c = project(at, cam);
  ctx.fillStyle = COLOR.acid;
  ctx.globalAlpha = fly < 1 ? 1 : 0.8 * (1 - (age - 0.5) * 2);
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, sized(fly < 1 ? EFFECT.puff / 2 : EFFECT.puff, cam), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * The horde view. With `anim` (a fight), sprites move (anim.ts): it is fed this frame's
 * fight first, and dead enemies fall there before they go. Without it (build mode)
 * everything stands still.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  art: Art,
  scene: Scene,
  cam: Camera,
  view: View,
  build: BuildOverlay | null = null,
  selectedDefender: string | null = null,
  aim: Aim | null = null,
  anim: Animator | null = null,
): void {
  anim?.observe(scene);
  const defenderPoseOf = (d: Defender): Readonly<Pose> =>
    anim ? anim.shown(defenderPose(d, scene.time, anim.acts(d.id, scene.strikes))) : STILL;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = COLOR.sky;
  ctx.fillRect(0, 0, view.w, view.h);
  drawSurround(ctx, art, cam, view);
  // Nothing left of the frame shows (ID-064): the camp's yard and huts stay out of
  // view, and an enemy past the frame shows as a marker at its edge instead.
  // On a whole pixel, so the clip's edge doesn't smear a seam into the surround.
  const left = Math.max(0, Math.round(project({ x: FRAME.left, y: 0 }, cam).sx));
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, Math.max(0, view.w - left), view.h);
  ctx.clip();
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
  // Molotov fires burn on the ground too, see-through, flaring up and dying down.
  for (const f of scene.fires) {
    const fade = Math.min((scene.time - f.at) / FIRE.in, (f.until - scene.time) / FIRE.out, 1);
    if (fade <= 0) continue;
    ctx.globalAlpha = FIRE.alpha * fade;
    const flicker = 1 + FIRE.flicker * Math.sin(scene.time * 12 + f.x);
    groundArt(ctx, art[SKILL_ART.molotov], f.x, f.y, SKILLS.molotov.radius * flicker, cam);
    ctx.globalAlpha = 1;
  }
  // A miss's dust kick is on the ground too.
  for (const i of scene.impacts) if (!i.hit) drawImpact(ctx, i, scene.time, cam);

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
      y: mountDepth(post.kind, post.y, post.row),
      x: post.x,
      draw: () => {
        drawMount(ctx, art, scene.layers, post.kind, post, floor, cam);
        if (reserved) {
          const p = post.kind === 'wall-walk' ? PIECE.walk : PIECE[post.kind];
          ctx.strokeStyle = COLOR.reserved;
          ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
          outline(ctx, around(post, p), floor, cam);
        }
        if (manned) {
          const pose = defenderPoseOf(manned);
          drawDefender(ctx, art, manned, floor, manned.id === selectedDefender, cam, pose);
          drawFlash(ctx, scene, manned.id, post.x, post.y, cam);
        }
      },
    });
  }
  for (const t of scene.turrets) {
    sprites.push({
      y: mountDepth(t.mount, t.y, t.row),
      x: t.x,
      draw: () => {
        drawTurret(ctx, art, scene, t, cam);
        drawFlash(ctx, scene, `turret:${t.id}`, t.x, t.y, cam);
      },
    });
  }
  for (const d of scene.defenders) {
    if (!d.walking) continue;
    sprites.push({
      y: d.y,
      x: d.x,
      draw: () => {
        drawDefender(ctx, art, d, 0, d.id === selectedDefender, cam, defenderPoseOf(d));
        drawFlash(ctx, scene, d.id, d.x, d.y, cam);
      },
    });
  }
  for (const e of scene.enemies) {
    sprites.push({
      y: e.y,
      x: e.x,
      draw: () => {
        const ground = project({ x: e.x, y: e.y }, cam);
        const size = ENEMIES[e.kind].radius / ENEMY_RADIUS;
        drawShadow(ctx, ground, 1, cam, size);
        if (e.id === scene.focusId) {
          const r = ENEMY.shadow * 1.8 * cam.zoom;
          ctx.strokeStyle = COLOR.focus;
          ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
          ctx.beginPath();
          ctx.ellipse(ground.sx, ground.sy, r, r * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        const pose = anim ? anim.shown(enemyPose(e, scene.time, anim.enemy(e.id))) : STILL;
        drawEnemy(ctx, art, e.kind, ground, cam, pose);
        if (burning(scene, e)) drawFlame(ctx, e.x, e.y, size, scene.time, cam);
        drawHpBar(ctx, { x: e.x, y: e.y, z: HP_BAR.z * size }, e.hp, e.maxHp, cam);
      },
    });
  }
  // The dead fall where they stood, with no HP bar, then are gone. A fight's last kill
  // ends it and stops its clock mid-fall, so the result screen shows none.
  const corpses = scene.outcome === 'fighting' ? (anim?.corpses ?? []) : [];
  for (const c of corpses) {
    const e = c.enemy;
    sprites.push({
      y: e.y,
      x: e.x,
      draw: () => {
        const ground = project({ x: e.x, y: e.y }, cam);
        const pose = anim ? anim.shown(fallPose(scene.time - c.at)) : STILL;
        drawShadow(ctx, ground, pose.alpha, cam, ENEMIES[e.kind].radius / ENEMY_RADIUS);
        drawEnemy(ctx, art, e.kind, ground, cam, pose);
      },
    });
  }
  for (const b of scene.bullets) {
    sprites.push({ y: b.y, x: b.x, draw: () => drawBullet(ctx, scene, b, cam) });
  }
  for (const sprite of depthSort(sprites)) sprite.draw();

  // The selected slot: its footprint on the ground, on top of everything.
  if (build?.selected) {
    ctx.strokeStyle = COLOR.focus;
    ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    outline(ctx, footprint(build.selected), 0, cam);
  }

  // On top: a blade or tool strike is a short slash across the enemy; a hit's blood puff.
  ctx.lineWidth = Math.max(1, 2 * cam.zoom);
  ctx.strokeStyle = COLOR.strike;
  for (const k of scene.strikes) {
    const a = project({ x: k.x - STRIKE, y: k.y, z: ENEMY.z + STRIKE }, cam);
    const b = project({ x: k.x + STRIKE, y: k.y, z: ENEMY.z - STRIKE }, cam);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  for (const i of scene.impacts) if (i.hit) drawImpact(ctx, i, scene.time, cam);
  for (const k of scene.spits) drawSpit(ctx, k, scene.time, cam);
  for (const k of scene.bursts) drawBurst(ctx, k, scene.time, cam);
  for (const k of scene.pops) drawPop(ctx, k, scene.time, cam);
  for (const k of scene.arcs) drawArc(ctx, k, scene.time, cam);

  // A skill's flash fades out over its reach; an armed skill shows its reach at the cursor.
  for (const b of scene.blasts) {
    const age = Math.max(0, (scene.time - b.at) / SKILL_FLASH);
    if (age >= 1) continue;
    // Its art swells to fill the reach as it fades.
    ctx.globalAlpha = 1 - age;
    const r = SKILLS[b.skill].radius * (0.85 + 0.15 * age);
    groundArt(ctx, art[SKILL_ART[b.skill]], b.x, b.y, r, cam);
    ctx.globalAlpha = 1;
  }
  if (aim) {
    // An airstrike shows every bomb along its row.
    ctx.strokeStyle = COLOR.focus;
    ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    for (const p of carpet(scene, aim.y)) {
      groundCircle(ctx, p.x, p.y, SKILLS.airstrike.radius, cam);
      ctx.stroke();
    }
  }
  ctx.restore();
  for (const { row, count } of offFrame(scene.enemies)) drawOffFrame(ctx, row, count, left, cam);
}

/** Per row, top to bottom, how many enemies are left of the frame (heading for the camp). */
export function offFrame(
  enemies: readonly { x: number; y: number }[],
): { row: number; count: number }[] {
  const counts = new Array<number>(SEGMENTS).fill(0);
  for (const e of enemies) {
    if (!(e.x < FRAME.left)) continue;
    const row = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(e.y / SEGMENT_HEIGHT)));
    // A NaN `y` stays NaN through the clamp: no row to mark.
    if (Number.isFinite(row)) counts[row]!++;
  }
  return counts.flatMap((count, row) => (count > 0 ? [{ row, count }] : []));
}

/**
 * A row's marker at the frame's left edge `left`: an arrow pointing at the camp and the
 * count, see-through so a defender under it still shows.
 */
function drawOffFrame(
  ctx: CanvasRenderingContext2D,
  row: number,
  count: number,
  left: number,
  cam: Camera,
): void {
  const { sy } = project({ x: FRAME.left, y: (row + 0.5) * SEGMENT_HEIGHT }, cam);
  const a = OFF_FRAME.arrow;
  const x = left + OFF_FRAME.pad;
  const label = String(count);
  ctx.save();
  ctx.globalAlpha = OFF_FRAME.alpha;
  ctx.font = OFF_FRAME.font;
  const w = a / 2 + OFF_FRAME.pad * 3 + ctx.measureText(label).width;
  ctx.fillStyle = COLOR.plate;
  ctx.fillRect(x, sy - a / 2 - OFF_FRAME.pad, w, a + OFF_FRAME.pad * 2);
  ctx.fillStyle = COLOR.offFrame;
  ctx.beginPath();
  ctx.moveTo(x + OFF_FRAME.pad, sy);
  ctx.lineTo(x + OFF_FRAME.pad + a / 2, sy - a / 2);
  ctx.lineTo(x + OFF_FRAME.pad + a / 2, sy + a / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOR.plateText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + OFF_FRAME.pad * 2 + a / 2, sy);
  ctx.restore();
}

/** `img` lying flat on the ground at `(x, y)`, `2r` across, squashed by the camera's tilt. */
function groundArt(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  r: number,
  cam: Camera,
): void {
  const c = project({ x, y }, cam);
  const w = 2 * r * cam.zoom;
  const h = (w * img.height * TILT) / img.width;
  ctx.drawImage(img, c.sx - w / 2, c.sy - h / 2, w, h);
}

/** Starts a path round a circle of radius `r` on the ground at `(x, y)`, as the tilted camera sees it. */
function groundCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  cam: Camera,
): void {
  const c = project({ x, y }, cam);
  ctx.beginPath();
  ctx.ellipse(c.sx, c.sy, r * cam.zoom, r * cam.zoom * TILT, 0, 0, Math.PI * 2);
}
