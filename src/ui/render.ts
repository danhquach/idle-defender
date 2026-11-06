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
  DAMAGE_POP,
  SPEWER,
  SWOLLEN,
  CARD,
  TRAP_STRIP,
  TRAP_DURABILITY,
  WALL,
  type EnemyKind,
  type Tier,
} from '../core/data.ts';
import {
  burning,
  reloadIn,
  barbedWire,
  took,
  turretState,
  type Bullet,
  type Defender,
  type HordeState,
  type Impact,
  type Layer,
  type Grenade,
  type UpgradeId,
  type Post,
  type Burst,
  type Pop,
  type Spit,
  type Trap,
  type Turret,
} from '../core/horde.ts';
import { baseOf } from '../core/armoury.ts';
import { professionOf } from '../core/loadout.ts';
import { carpet } from '../core/skills.ts';
import {
  depthSort,
  FIGHT_FRAME,
  mountDepth,
  HEIGHT_SCALE,
  PIECE,
  postFloor,
  project,
  TILT,
  WALL_CARD,
  WALL_HIT,
  fadeAfter,
  wallPulse,
  wallHeight,
  wallHitFade,
  wallStage,
  type Camera,
  type SlotHit,
  type View,
} from './projection.ts';
import {
  GROUND_TILE,
  groundCanvas,
  WIRE,
  wireCanvas,
  SURROUND_BLOCK,
  surroundCanvas,
} from './ground.ts';
import {
  conditionOf,
  FENCE,
  FENCE_RUNS,
  ghostAt,
  NEEDS_WALL,
  PLOT,
  PLOT_AT,
  TIER_BADGE,
  type Ghost,
  type Plot,
  type Target,
} from './buildscene.ts';
import {
  aiming,
  defenderPose,
  enemyFrame,
  enemyPose,
  fallPose,
  STILL,
  type Animator,
  type EnemyFrame,
  type Pose,
} from './anim.ts';
import {
  BASE_ART,
  DEFENDER_ART,
  ENEMY_ART,
  GUNNER_LOOKS,
  lookOf,
  SKILL_ART,
  TIER_ART,
  TRAP_ART,
  TURRET_ART,
  type GunId,
  type GunnerArt,
  ART_PX,
  type Art,
  type ArtId,
} from './sprites.ts';

/**
 * The fight's dusk (ID-071): a dark, slightly cool wash over the ground and the
 * surround, under every sprite, so the bright ground stops tiring the eyes and the
 * wall, survivors, enemies and bullets (drawn over it at full brightness) stand out.
 */
export const DUSK = 'rgba(8, 10, 16, 0.7)';

const COLOR = {
  sky: '#15171a',
  selected: '#9cc4f0',
  reserved: 'rgba(156, 196, 240, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  focus: '#ffe066',
  offFrame: '#d2453c',
  plate: 'rgba(21, 23, 26, 0.6)',
  plateText: '#d8d4cc',
  /** The share of a reload done, on a reload pie (ID-078). */
  reload: '#ffc94d',
  /** A reload pie's ring: the plate text's colour, see-through. */
  reloadRing: 'rgba(216, 212, 204, 0.7)',
  hpBack: '#c43b3b',
  hpFill: '#5ec24a',
  /** A wall segment's flash as a blow lands (ID-072): warm, so it shows on a pale concrete top. */
  wallHit: '#ffb070',
  /** The wall's pulse as a barrier card is picked (ID-075): cool, so it never reads as a hit. */
  wallPulse: '#b8f4ec',
  /** Damage numbers (ID-082): a hit on an enemy, a crit, a blow on the wall; all on a dark edge. */
  popHit: '#f4f1ea',
  popCrit: '#ffd23f',
  popWall: '#ff8a7a',
  popEdge: 'rgba(17, 17, 16, 0.85)',
  /** A segment a repair card heals (ID-075). */
  wallRepair: '#7fe08c',
  /** Spiked Walls' stakes biting an enemy that strikes the wall (ID-075). */
  spikeHit: '#fff0b8',
  spikeCore: '#e0a020',
  hpEdge: '#1b1a18',
  conditionBack: '#111110',
  conditionFill: '#a9c4d6',
  strike: '#f2f2f2',
  slug: '#fffbe8',
  /** The white spark where a bullet hits a body (ID-070). */
  hitSpark: '#ffffff',
  flash: '#fff2b0',
  flashEdge: 'rgba(255, 170, 60, 0.6)',
  blood: '#8e1f1a',
  dust: '#a8987c',
  acid: '#a6e22e',
  glow: 'rgba(255, 196, 70, 0.45)',
  spark: '#ffd84a',
  smoke: 'rgba(150, 150, 150, 0.55)',
  grenade: '#8a9a4a',
  grenadeShine: 'rgba(216, 220, 174, 0.6)',
  grenadeEdge: '#0b0d06',
  flame: '#ff7a1a',
  ghost: 'rgba(240, 236, 226, 0.85)',
  ghostDim: 'rgba(232, 228, 218, 0.4)',
  edge: 'rgba(17, 17, 16, 0.6)',
  window: '#f2c867',
  outside: 'rgba(0, 0, 0, 0.3)',
  hover: '#cfe3fa',
  broken: '#e0483e',
  badgeText: '#111110',
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
/** A built hut's drawn height (screen px at zoom 1). */
const HUT_HEIGHT = 58;
/**
 * The build scene's marks (ID-065), screen px at zoom 1 unless named: a ghost's "+" arm,
 * a wall-walk spot's ghost square, a tier badge, a broken piece's cross, the dash; a
 * name plate's and a slot reason's fonts are fixed px so they read at any zoom.
 */
const MARK = {
  plus: 6,
  spot: 5,
  badge: 11,
  cross: 7,
  dash: [4, 3],
  plate: 'bold 11px system-ui, sans-serif',
  badgeFont: 'bold 9px system-ui, sans-serif',
} as const;
/** A built Lab's and Generator's boxes: the Generator is the smaller. */
const BUILDING = {
  lab: { halfWidth: PLOT.halfWidth - 8, halfDepth: PLOT.halfDepth - 12, height: PLOT.height },
  generator: { halfWidth: 26, halfDepth: 20, height: 22 },
} as const;
const DEFENDER = PIECE.defender;
/**
 * Drawn heights (screen px at zoom 1) of a standing sprite `ART_PX` tall, feet on its
 * spot. Every sprite keeps its own scale: one less than `ART_PX` tall (a wide one, or a
 * group member smaller than the group's biggest) draws that much shorter.
 */
const STAND = { defender: 40, enemy: 34, shield: 26 } as const;
/**
 * How high a defender's HP bar sits, above their feet: over the head of a
 * full-height (`ART_PX`) sprite, so neither covers the face (ID-069's survivors stand the
 * full height).
 */
const DEFENDER_TOP = STAND.defender / HEIGHT_SCALE;
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
 * at 0.5× zoom: a muzzle flash's halo, an impact's puff and a hit's spark.
 */
const EFFECT = { flash: 5, puff: 6, spark: 4, min: 1.5 } as const;
/**
 * A bullet in flight (ID-070), in px at zoom 1: a white `head` capsule `len` long and `w`
 * wide on a dark backing `edge` px wider each side, with a `glow` halo; a `tail` that thins
 * from `w` to `end` and fades from white through its gun's colour to clear; and a `shadow`
 * of the same shape on the ground under it, `w` wide at its head. Only the head has a rim.
 */
export const BULLET = {
  head: { len: 6, w: 2.5, edge: 1, backing: 'rgba(20, 14, 6, 0.5)' },
  glow: { r: 5, alpha: 0.35 },
  tail: { end: 0.5, white: 0.2, alpha: 0.9 },
  shadow: { w: 1.5, colour: 'rgba(0, 0, 0, 0.22)' },
} as const;
/**
 * A bullet's tail is its gun's `tracer` length plus one 60 fps frame of its flight at the
 * game speed, counted up to `pace` 2 (ID-070): about a frame's travel, so it reads as a
 * bullet and not a beam. At 3× the bright head carries the eye over the small gap.
 */
export const TAIL = { frame: 1 / 60, pace: 2 } as const;
/** A muzzle flash's core (ID-070): a teardrop `len` long and `w` wide along the barrel. */
const FLASH = { len: 8, w: 4, edge: '#ffb347' } as const;
/** The share of `IMPACT_FLASH` a hit's white spark shows for, shrinking and fading (ID-070). */
const SPARK_SHARE = 0.4;
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
/** `gap`: twice how far a bar's bottom sits over its sprite's head. */
const HP_BAR = { w: 24, h: 4, gap: 6 } as const;
/**
 * A survivor's HP bar in the horde-only fight (ID-068): always shown, wider and taller
 * than an enemy's, at least `min` px on screen, with a dark edge, so each reads at a glance.
 */
export const SURVIVOR_BAR = { w: 30, h: 5, min: { w: 30, h: 5 }, edge: 1 } as const;
/**
 * A full-game defender's name tag spot over their HP bar: `z` px higher, lifted half a
 * `h`-px plate (where the title badge sat before titles were parked, ID-084).
 */
const TAG_SPOT = { h: 8, z: 14 } as const;
/** A name plate's height in screen px (its font is `MARK.plate`). */
export const PLATE_H = 14;
/** The screen px between a defender's name tag (ID-074) and the bar or badge under it. */
export const NAME_TAG_GAP = 2;
/**
 * The pie over a reloading defender's name tag (ID-078), in screen px: radius `r`, `gap`
 * over the plate, with a dark `edge` round it.
 */
export const RELOAD_PIE = { r: 6, gap: 2, edge: 1 } as const;
/**
 * Damage numbers (ID-082), screen px and real seconds: a `size` px number, growing to
 * `big` px for a hit of `bigAt` or more (a wall's loss at `wallBigAt`), starts `gap` over
 * the HP bar and rises `rise` px over `life` s, fading over the last `fade` share of it.
 * A crit is `crit` times bigger, and lands `punch.extra` bigger still, settling over its
 * first `punch.time` s, drawn over the plain ones. At most `cap` show, the newest. An
 * enemy's sits `stagger` px (a crit's `critStagger`) left, centred or right by its merge
 * window, so the numbers a target keeps taking where it stands never stack; a wall's sits
 * `gap` px on the camp side of the wall, right-aligned, so what the wall lost never mixes
 * with what the enemies at it took.
 */
export const POP = {
  size: 11,
  big: 15,
  bigAt: 40,
  wallBigAt: 25,
  crit: 1.6,
  punch: { time: 0.15, extra: 0.4 },
  gap: 3,
  rise: 18,
  life: 0.9,
  fade: 0.5,
  cap: 24,
  edge: 3,
  stagger: 9,
  critStagger: 14,
} as const;
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
  | 'grenades'
  | 'focusId'
  | 'time'
  | 'fires'
  | 'blasts'
  | 'outcome'
> &
  // A Power Surge lights turrets on an empty bank (design §8); build mode has none.
  // `acc`, the fight time since its last step, carries bullets on between steps (ID-070).
  // The barrier cards taken show on the wall (ID-075); build mode has none.
  // Damage numbers (ID-082); build mode has none.
  Partial<Pick<HordeState, 'wave' | 'freeWave' | 'acc' | 'taken' | 'barrierAt' | 'pops'>> & {
    /** The game speed (1×, 2×, 3×) a fight is shown at; bullet tails grow with it (ID-070). */
    pace?: number;
  };
/** An armed skill's reach around the cursor, on the field. */
export interface Aim {
  skill: 'airstrike';
  x: number;
  y: number;
}
/** Build mode extras (ID-065): the empty slots' ghosts, the hovered target and the selected slot. */
export interface BuildOverlay {
  selected: SlotHit | null;
  hover: Target | null;
  ghosts: { slots: readonly Ghost[]; lines: readonly number[] };
}
/** The camp around the field in the build scene (ID-065): its fence's tier and its plots. */
export interface CampView {
  fence: Tier;
  plots: readonly Plot[];
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
  size: { w: number; h: number; min?: { w: number; h: number }; edge?: number } = HP_BAR,
  over = false,
): void {
  const w = Math.max(size.min?.w ?? 0, size.w * cam.zoom);
  const h = Math.max(size.min?.h ?? 0, size.h * cam.zoom);
  // `over`: `at` is the point the bar (and its edge) sits on, so it clears a head at any zoom.
  const on = project(at, cam);
  const bar = over ? { sx: on.sx, sy: on.sy - h - (size.edge ?? 0) } : on;
  if (size.edge) {
    ctx.fillStyle = COLOR.hpEdge;
    ctx.fillRect(
      bar.sx - w / 2 - size.edge,
      bar.sy - size.edge,
      w + 2 * size.edge,
      h + 2 * size.edge,
    );
  }
  ctx.fillStyle = colour.back;
  ctx.fillRect(bar.sx - w / 2, bar.sy, w, h);
  ctx.fillStyle = colour.fill;
  ctx.fillRect(bar.sx - w / 2, bar.sy, w * Math.max(0, hp / maxHp), h);
}

/**
 * A defender standing `z0` up at `(x, y)`: their profession's sprite (the weapon tells
 * it, design §15; a Gunner's shows their primary) in `pose`, a shield in front if they
 * carry one, a ring at their feet when selected, and an HP bar once hurt.
 */
function drawDefender(
  ctx: CanvasRenderingContext2D,
  art: Art,
  d: Pick<Defender, 'id' | 'x' | 'y' | 'hp' | 'maxHp' | 'loadout' | 'plain'>,
  z0: number,
  selected: boolean,
  cam: Camera,
  pose: Readonly<Pose> = STILL,
  aim = false,
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
  const gun = gunOf(d);
  const sprite = gun ? gun[aim ? 'aim' : 'idle'] : DEFENDER_ART[professionOf(d.loadout)];
  drawStanding(ctx, art[sprite], feet, STAND.defender, cam, pose);
  if (d.loadout.item === 'shield') {
    const front = project({ x: d.x + DEFENDER.halfWidth + 2, y: d.y + 2, z: z0 }, cam);
    drawStanding(ctx, art[BASE_ART.shield], front, STAND.shield, cam, pose);
  }
  const bar = { x: d.x, y: d.y, z: z0 + DEFENDER_TOP + HP_BAR.gap / 2 };
  // A survivor's bar always shows (ID-068); a full-game defender's once hurt.
  if (d.plain) drawHpBar(ctx, bar, d.hp, d.maxHp, cam, undefined, SURVIVOR_BAR, true);
  else if (d.hp < d.maxHp) drawHpBar(ctx, bar, d.hp, d.maxHp, cam, undefined, HP_BAR, true);
}

/**
 * A defender's name tag in a fight (ID-074), by name: a survivor's just over their HP
 * bar; a full-game defender's a little higher (`TAG_SPOT`). Either way clear of the head.
 */
function drawNameTag(
  ctx: CanvasRenderingContext2D,
  d: Pick<Defender, 'x' | 'y' | 'name' | 'plain'>,
  z0: number,
  cam: Camera,
): void {
  const { at, lift } = tagSpot(d, z0, cam);
  drawPlate(ctx, d.name, at, cam, false, lift);
}

/** Where a defender's name plate sits: its anchor and how far its bottom is lifted over it. */
function tagSpot(
  d: Pick<Defender, 'x' | 'y' | 'plain'>,
  z0: number,
  cam: Camera,
): { at: { x: number; y: number; z: number }; lift: number } {
  const at = { x: d.x, y: d.y, z: z0 + DEFENDER_TOP + HP_BAR.gap / 2 };
  if (d.plain) {
    // The bar sits on `at` with its dark edge round it, above and below.
    const bar = Math.max(SURVIVOR_BAR.min.h, SURVIVOR_BAR.h * cam.zoom) + 2 * SURVIVOR_BAR.edge;
    return { at, lift: bar + NAME_TAG_GAP };
  }
  const half = (TAG_SPOT.h * cam.zoom) / 2;
  return {
    at: { ...at, z: z0 + DEFENDER_TOP + HP_BAR.gap + TAG_SPOT.z },
    lift: half + NAME_TAG_GAP,
  };
}

/**
 * How far `d`'s primary is through its reload at `time` (ID-078), 0 to 1, or null while it
 * has rounds or is ready. Only the primary counts: a Gunner's sidearm firing meanwhile
 * doesn't change it. The length is today's reload time, Speed Loaders (`taken`, design §8)
 * included, so a stat change mid-reload moves the pie (the sim keeps only the reload's end).
 */
export function reloadShare(
  d: Pick<Defender, 'ammo' | 'reloadedAt' | 'loadout' | 'stats' | 'plain'>,
  time: number,
  taken: readonly UpgradeId[] = [],
): number | null {
  const end = d.reloadedAt.primary;
  if (d.ammo.primary > 0 || !(time < end)) return null;
  const total = reloadIn({ taken }, d, d.loadout.primary);
  if (!(total > 0)) return null;
  return Math.min(1, Math.max(0, 1 - (end - time) / total));
}

/**
 * A reload pie (ID-078) just over a defender's name plate: a dark disc in a pale ring,
 * whose wedge fills clockwise from the top as the reload runs.
 */
function drawReloadPie(
  ctx: CanvasRenderingContext2D,
  d: Pick<Defender, 'x' | 'y' | 'plain'>,
  share: number,
  z0: number,
  cam: Camera,
): void {
  const { at, lift } = tagSpot(d, z0, cam);
  const p = project(at, cam);
  const { r, gap, edge } = RELOAD_PIE;
  const cx = p.sx;
  const cy = p.sy - lift - PLATE_H - gap - edge - r;
  // A see-through disc, so what is behind it still shows.
  ctx.fillStyle = COLOR.plate;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (share > 0) {
    const start = -Math.PI / 2;
    ctx.fillStyle = COLOR.reload;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + share * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  // A pale ring, so even an empty disc reads on the dark ground.
  ctx.strokeStyle = COLOR.reloadRing;
  ctx.lineWidth = edge;
  ctx.beginPath();
  ctx.arc(cx, cy, r + edge / 2, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * A Gunner's gun art (ID-046, ID-069) in their own look (ID-074): their primary's, or the
 * rifle's for any other gun.
 */
function gunOf(d: Pick<Defender, 'id' | 'loadout'>): GunnerArt | null {
  if (professionOf(d.loadout) !== 'gunner') return null;
  const look = GUNNER_LOOKS[lookOf(d.id)]!;
  return look[baseOf(d.loadout.primary) as GunId] ?? look.rifle;
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
  // A firing-line slot is bare ground (ID-068): the survivor stands there with no mount.
  if (kind === 'line') return;
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

/** A wall segment's HP bar in a fight (ID-072): narrower than the wall's top, at least `min` px, with a dark edge. */
export const WALL_BAR = { w: 16, h: 4, min: { w: 14, h: 4 }, edge: 1 } as const;
/** How far down its segment a wall bar sits from the middle, clear of the seam above. */
const WALL_BAR_DROP = 2;

/**
 * Each standing segment's HP bar in a fight, over every sprite so the enemies at the wall
 * never hide it: none at full HP, shown once it is hit (ID-072); a broken one shows rubble.
 */
function drawWallBars(ctx: CanvasRenderingContext2D, layers: readonly Layer[], cam: Camera) {
  for (const layer of layers) {
    for (const seg of layer.segments) {
      if (seg.kind === null || conditionOf(seg.hp, seg.maxHp) !== 'damaged') continue;
      const top = wallHeight(seg.hp, seg.maxHp) + HP_BAR.gap;
      const at = {
        x: layer.x + WALL.depth / 2,
        y: (seg.index + 0.5) * SEGMENT_HEIGHT + WALL_BAR_DROP,
        z: top,
      };
      drawHpBar(ctx, at, seg.hp, seg.maxHp, cam, undefined, WALL_BAR, true);
    }
  }
}

/**
 * Where each damage overlay lies on a segment's top, as shares of it (ID-072). The top is
 * a long thin strip along the wall, so the damage follows it: the chips are gouges down
 * each long edge (the right one mirrored), hanging partly past it and clipped to the
 * top so each reads as a cut in the edge; the breach is a band across the whole width.
 */
const WALL_DAMAGE = {
  cracks: [0, 0.7, 1, 1],
  chips: [
    { x: -0.2, y: 0.06, w: 0.5, h: 0.42, flip: false },
    { x: 0.7, y: 0.52, w: 0.5, h: 0.42, flip: true },
  ],
  breach: { x: 0, y: 1 / 3, w: 1, h: 1 / 3, flip: false },
} as const;

/** `img` stretched over the part `at` of `r`, mirrored left to right when `at.flip`. */
function drawOnPart(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  r: Rect,
  at: { x: number; y: number; w: number; h: number; flip: boolean },
): void {
  const w = r.w * at.w;
  const x = r.sx + r.w * at.x;
  const y = r.sy + r.h * at.y;
  if (!at.flip) {
    ctx.drawImage(img, x, y, w, r.h * at.h);
    return;
  }
  ctx.save();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, r.h * at.h);
  ctx.restore();
}

/** The barrier cards a fight's wall shows (ID-075); none in the build scene. */
interface WallCards {
  spiked: boolean;
  reinforced: boolean;
  /** When the latest barrier card was picked. */
  pickedAt: number | undefined;
  /** The game speed shown: the pulse and repair glow last the same real time at any speed. */
  pace: number;
  /** Reduce motion: a repair's sparks stay put instead of floating up. */
  still: boolean;
}
const NO_CARDS: WallCards = {
  spiked: false,
  reinforced: false,
  pickedAt: undefined,
  pace: 1,
  still: true,
};

/**
 * A wall segment in its tier's textures, lower as it takes damage, looking worse in
 * stages (ID-072): cracks, then pieces chipped out, then a section broken through; a
 * gate's top is its tier's sliding gate, closed and flush with the segments beside it
 * (ID-075); a broken one is its tier's rubble. Just hit, it flashes pale orange and
 * shakes. Standing, it shows the barrier cards taken (ID-075): Reinforce's brace under the
 * damage, Spiked Walls' bite as its stakes (drawn under every sprite) hurt an enemy, a
 * pulse as any barrier card is picked and a green glow as a repair card heals it.
 */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  art: Art,
  layer: Layer,
  seg: Layer['segments'][number],
  time: number,
  cam: Camera,
  cards: WallCards = NO_CARDS,
): void {
  const standing = seg.hp > 0;
  const hit = standing ? wallHitFade(time, seg.hitAt) : 0;
  if (hit > 0) {
    ctx.save();
    ctx.translate(Math.sin(hit * Math.PI * 6) * hit * WALL_HIT.shake * cam.zoom, 0);
  }
  drawSegmentBody(ctx, art, layer, seg, cam, standing && cards.reinforced);
  // Worked out only when a glow shows, so a quiet segment costs no more than before.
  let f: ReturnType<typeof faces> | undefined;
  const glow = (style: string, alpha: number): void => {
    if (alpha <= 0) return;
    f ??= faces(segmentBox(layer, seg), cam);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = style;
    ctx.fillRect(f.top.sx, f.top.sy, f.top.w, f.top.h);
    ctx.fillRect(f.front.sx, f.front.sy, f.front.w, f.front.h);
    ctx.globalAlpha = 1;
  };
  if (standing) {
    if (cards.spiked) drawSpikeBite(ctx, layer, seg, time, cam);
    glow(COLOR.wallPulse, WALL_CARD.pulse.alpha * wallPulse(time, cards.pickedAt, cards.pace));
    const repair = fadeAfter(time, seg.repairAt, WALL_CARD.repair.time * cards.pace);
    glow(COLOR.wallRepair, WALL_CARD.repair.alpha * repair);
    if (repair > 0) drawRepairSparks(ctx, layer, seg, repair, cards.still, cam);
  }
  if (hit > 0) {
    glow(COLOR.wallHit, WALL_HIT.flash * hit);
    ctx.restore();
  }
}

/**
 * Spiked Walls (ID-075): a row of stakes along each standing segment's field edge, on its
 * top and reaching over the ground in front, where the camera sees it. Drawn before every
 * sprite, so the enemies stopped at the wall (inside the stakes' reach) stand over them;
 * the segment drawn later covers the stakes' foot on its top.
 */
function drawStakes(
  ctx: CanvasRenderingContext2D,
  art: Art,
  layers: readonly Layer[],
  cam: Camera,
) {
  for (const layer of layers) {
    for (const seg of layer.segments) {
      if (seg.kind === null || seg.tier === null || !(seg.hp > 0)) continue;
      const box = segmentBox(layer, seg);
      const face = layer.x + WALL.depth;
      const a = project({ x: face - WALL_CARD.spike.in, y: box.y0, z: box.height }, cam);
      const b = project({ x: face + WALL_CARD.spike.out, y: box.y1, z: box.height }, cam);
      ctx.drawImage(art[BASE_ART.spikes], a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
    }
  }
}

/** As the stakes hurt an enemy striking the wall, a short pale burst with a warm core at their middle. */
function drawSpikeBite(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  seg: Layer['segments'][number],
  time: number,
  cam: Camera,
): void {
  const box = segmentBox(layer, seg);
  const z = box.height;
  const face = layer.x + WALL.depth;
  const bite = fadeAfter(time, seg.spikeAt, WALL_CARD.spike.time);
  if (bite <= 0) return;
  const c = project({ x: face + WALL_CARD.spike.out / 2, y: (box.y0 + box.y1) / 2, z }, cam);
  const reach = (2 + 4 * bite) * cam.zoom;
  ctx.save();
  ctx.globalAlpha = WALL_CARD.spike.alpha * bite;
  ctx.strokeStyle = COLOR.spikeHit;
  ctx.lineWidth = Math.max(1, cam.zoom);
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const ang = -Math.PI / 2 + (k * Math.PI) / 4;
    ctx.moveTo(c.sx, c.sy);
    ctx.lineTo(c.sx + Math.cos(ang) * reach, c.sy + Math.sin(ang) * reach * TILT);
  }
  ctx.stroke();
  // A warm core, so the bite shows on a pale concrete wall as well as a dark one.
  ctx.fillStyle = COLOR.spikeCore;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, Math.max(1.5, 1.6 * cam.zoom * bite), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A repair's sparks (ID-075): three small pale-green crosses over the healed top, floating up as they fade. */
function drawRepairSparks(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  seg: Layer['segments'][number],
  left: number,
  still: boolean,
  cam: Camera,
): void {
  const box = segmentBox(layer, seg);
  const rise = still ? 0 : WALL_CARD.repair.rise * (1 - left);
  const arm = 2.5 * cam.zoom;
  ctx.save();
  ctx.globalAlpha = left;
  ctx.strokeStyle = COLOR.wallRepair;
  ctx.lineWidth = Math.max(1, 1.2 * cam.zoom);
  ctx.beginPath();
  for (const [x, y] of [
    [0.3, 0.25],
    [0.7, 0.5],
    [0.35, 0.78],
  ] as const) {
    const p = project(
      {
        x: layer.x + WALL.depth * x,
        y: box.y0 + (box.y1 - box.y0) * y,
        z: box.height + 2 + rise,
      },
      cam,
    );
    ctx.moveTo(p.sx - arm, p.sy);
    ctx.lineTo(p.sx + arm, p.sy);
    ctx.moveTo(p.sx, p.sy - arm);
    ctx.lineTo(p.sx, p.sy + arm);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Barbed Wire (ID-077): the band it slows, out in the field in front of the outermost
 * layer, under every sprite: a faint dirt tint with coils of wire on stakes, painted once
 * (ground.ts) and stretched over the band. Where the browser can't paint it, the tint
 * alone shows.
 */
function drawWire(ctx: CanvasRenderingContext2D, art: Art, scene: Scene, cam: Camera): void {
  const band = barbedWire({ taken: scene.taken ?? [], layers: scene.layers });
  if (!band) return;
  const a = project({ x: band.from, y: 0 }, cam);
  const b = project({ x: band.to, y: FIELD.height }, cam);
  const painted = wireCanvas(art);
  if (painted) {
    ctx.drawImage(painted, a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
    return;
  }
  ctx.globalAlpha = WIRE.tint.alpha;
  ctx.fillStyle = WIRE.tint.colour;
  ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
  ctx.globalAlpha = 1;
}

/** A segment's box: its slot, as tall as its HP leaves it. */
function segmentBox(layer: Layer, seg: Layer['segments'][number]) {
  const y0 = seg.index * SEGMENT_HEIGHT;
  return {
    x0: layer.x,
    x1: layer.x + WALL.depth,
    y0: y0 + SEGMENT_GAP,
    y1: y0 + SEGMENT_HEIGHT - SEGMENT_GAP,
    z0: 0,
    height: wallHeight(seg.hp, seg.maxHp),
  };
}

function drawSegmentBody(
  ctx: CanvasRenderingContext2D,
  art: Art,
  layer: Layer,
  seg: Layer['segments'][number],
  cam: Camera,
  reinforced: boolean,
): void {
  const tier = TIER_ART[seg.tier!];
  const box = segmentBox(layer, seg);
  const stage = wallStage(seg.hp, seg.maxHp);
  if (stage === 4) {
    drawOnBox(ctx, art[tier.rubble], box, cam);
    return;
  }
  drawBox(ctx, box, art[tier.top], art[tier.front], cam);
  const f = faces(box, cam);
  // The sliding gate fills the segment's top, closed and flush with its neighbours (ID-075).
  if (seg.kind === 'gate') ctx.drawImage(art[tier.gate], f.top.sx, f.top.sy, f.top.w, f.top.h);
  // Reinforce's brace lies under the damage, so the damage stages still show (ID-075).
  if (reinforced) {
    ctx.globalAlpha = WALL_CARD.brace.alpha;
    ctx.drawImage(art[BASE_ART.brace], f.top.sx, f.top.sy, f.top.w, f.top.h);
    ctx.drawImage(art[BASE_ART.brace], f.front.sx, f.front.sy, f.front.w, f.front.h);
    ctx.globalAlpha = 1;
  }
  if (stage === 0) return;
  // The top is what the fight's camera sees most of; the cracks run down the front too.
  ctx.globalAlpha = WALL_DAMAGE.cracks[stage];
  drawCover(ctx, art[BASE_ART.cracks], f.top);
  drawCover(ctx, art[BASE_ART.cracks], f.front);
  ctx.globalAlpha = 1;
  if (stage >= 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.top.sx, f.top.sy, f.top.w, f.top.h);
    ctx.clip();
    for (const at of WALL_DAMAGE.chips) drawOnPart(ctx, art[BASE_ART.chips], f.top, at);
    ctx.restore();
  }
  if (stage === 3) drawOnPart(ctx, art[BASE_ART.breach], f.top, WALL_DAMAGE.breach);
}

/** The ground's block (ground.ts) repeated over the whole view, so no sky shows round the frame. */
function drawSurround(ctx: CanvasRenderingContext2D, art: Art, cam: Camera, view: View): void {
  const surround = surroundCanvas(art);
  if (!surround) return;
  const all = { sx: 0, sy: 0, w: view.w, h: view.h };
  fillTexture(ctx, surround, all, SURROUND_BLOCK * GROUND_TILE, TILT, cam);
}

/**
 * The field's ground with the camp's yard in it (ground.ts), behind every sprite. The
 * fixed fight frame (ID-064) clips the yard away; the build scene (ID-065) shows it.
 */
function drawGround(ctx: CanvasRenderingContext2D, art: Art, cam: Camera): void {
  const field = faces({ x0: 0, x1: FIELD.right, y0: 0, y1: FIELD.height, z0: 0, height: 0 }, cam);
  const ground = groundCanvas(art);
  if (ground) ctx.drawImage(ground, field.top.sx, field.top.sy, field.top.w, field.top.h);
}

/** One run of the camp's fence: a low wall in `tier`'s textures. */
function drawFence(
  ctx: CanvasRenderingContext2D,
  art: Art,
  run: (typeof FENCE_RUNS)[number],
  tier: Tier,
  cam: Camera,
): void {
  const t = TIER_ART[tier];
  drawBox(ctx, { ...run, z0: 0, height: FENCE.height }, art[t.top], art[t.front], cam);
}

/**
 * A name plate over `(x, y, z)` (or under it, `below`): fixed-size text on a see-through
 * plate, centred; `lift` screen px higher still.
 */
function drawPlate(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: { x: number; y: number; z: number },
  cam: Camera,
  below = false,
  lift = 0,
): void {
  if (text === '') return;
  const p = project(at, cam);
  ctx.font = MARK.plate;
  const w = ctx.measureText(text).width + 2 * OFF_FRAME.pad;
  const h = PLATE_H;
  const top = below ? p.sy + 2 : p.sy - h - lift;
  ctx.fillStyle = COLOR.plate;
  ctx.fillRect(p.sx - w / 2, top, w, h);
  ctx.fillStyle = COLOR.plateText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.sx, top + h / 2);
}

/**
 * Strokes the path `trace` lays down in `colour` over a dark edge 2 px wider, so a mark
 * stands out on the busy ground.
 */
function strokeEdged(
  ctx: CanvasRenderingContext2D,
  colour: string,
  width: number,
  trace: () => void,
): void {
  for (const [style, w] of [
    [COLOR.edge, width + 2],
    [colour, width],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    trace();
    ctx.stroke();
  }
}

/** Lays down a flat rectangle at height `z` as a path. */
function rectPath(
  ctx: CanvasRenderingContext2D,
  r: { x0: number; x1: number; y0: number; y1: number },
  z: number,
  cam: Camera,
): void {
  const a = project({ x: r.x0, y: r.y0, z }, cam);
  const b = project({ x: r.x1, y: r.y1, z }, cam);
  ctx.rect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
}

/**
 * An empty slot: a flat dashed outline at height `z`, then a "+" at `plus`; with no
 * `plus`, only a dimmed outline (a slot that can't be built yet, a plot kept free).
 */
function drawGhost(
  ctx: CanvasRenderingContext2D,
  r: { x0: number; x1: number; y0: number; y1: number },
  plus: { x: number; y: number; z: number } | null,
  z: number,
  cam: Camera,
): void {
  ctx.setLineDash([...MARK.dash]);
  if (plus) strokeEdged(ctx, COLOR.ghost, 1, () => rectPath(ctx, r, z, cam));
  else {
    ctx.strokeStyle = COLOR.ghostDim;
    ctx.lineWidth = 1;
    outline(ctx, r, z, cam);
  }
  ctx.setLineDash([]);
  if (plus) drawPlus(ctx, plus, cam);
}

/** A "+" standing at `(x, y, z)`. */
function drawPlus(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; z: number },
  cam: Camera,
): void {
  const c = project(at, cam);
  const a = Math.max(3, MARK.plus * cam.zoom);
  strokeEdged(ctx, COLOR.ghost, Math.max(1.5, 2 * cam.zoom), () => {
    ctx.moveTo(c.sx - a, c.sy);
    ctx.lineTo(c.sx + a, c.sy);
    ctx.moveTo(c.sx, c.sy - a);
    ctx.lineTo(c.sx, c.sy + a);
  });
}

/** A free wall-walk spot on a wall's top: a small ring round a "+", unlike the wall's texture. */
function drawSpotGhost(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; z: number },
  cam: Camera,
): void {
  const c = project(at, cam);
  const r = Math.max(4, MARK.spot * cam.zoom);
  strokeEdged(ctx, COLOR.ghost, 1.5, () => ctx.ellipse(c.sx, c.sy, r, r * TILT, 0, 0, Math.PI * 2));
  const a = r * 0.5;
  strokeEdged(ctx, COLOR.ghost, 1.5, () => {
    ctx.moveTo(c.sx - a, c.sy);
    ctx.lineTo(c.sx + a, c.sy);
    ctx.moveTo(c.sx, c.sy - a);
    ctx.lineTo(c.sx, c.sy + a);
  });
}

/** A broken piece's mark: a red cross at `(x, y, z)`. */
function drawCross(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; z: number },
  cam: Camera,
): void {
  const c = project(at, cam);
  const a = Math.max(4, MARK.cross * cam.zoom);
  ctx.setLineDash([]);
  strokeEdged(ctx, COLOR.broken, Math.max(2, 2.5 * cam.zoom), () => {
    ctx.moveTo(c.sx - a, c.sy - a);
    ctx.lineTo(c.sx + a, c.sy + a);
    ctx.moveTo(c.sx + a, c.sy - a);
    ctx.lineTo(c.sx - a, c.sy + a);
  });
}

/** A plot's footprint on the ground. */
const plotFootprint = (p: Plot) => around(PLOT_AT[p.id], PLOT);

/**
 * The camp's ground pieces, behind every sprite: the fence's left and top runs, an
 * unbuilt plot's ghost. Built buildings and the bottom fence go in the depth sort.
 */
function drawCampGround(
  ctx: CanvasRenderingContext2D,
  art: Art,
  camp: CampView,
  cam: Camera,
): void {
  drawFence(ctx, art, FENCE_RUNS[0], camp.fence, cam);
  drawFence(ctx, art, FENCE_RUNS[1], camp.fence, cam);
  // The Workbench's plot is kept free (ID-034): a faint footprint, nothing to click.
  drawGhost(ctx, around(PLOT_AT.workbench, PLOT), null, 0, cam);
  for (const p of camp.plots) {
    if (p.built) continue;
    const at = PLOT_AT[p.id];
    drawGhost(ctx, plotFootprint(p), { ...at, z: 0 }, 0, cam);
    drawPlate(ctx, p.label, { x: at.x, y: at.y + PLOT.halfDepth, z: 0 }, cam);
  }
}

/** The camp's sprites for the depth sort: the bottom fence run, each built building and hut. */
function campSprites(
  ctx: CanvasRenderingContext2D,
  art: Art,
  camp: CampView,
  cam: Camera,
): Sprite[] {
  const run = FENCE_RUNS[2];
  const sprites: Sprite[] = [
    { y: run.y1, x: run.x1, draw: () => drawFence(ctx, art, run, camp.fence, cam) },
  ];
  camp.plots.forEach((p, i) => {
    if (!p.built) return;
    const at = PLOT_AT[p.id];
    if (p.kind === 'hut') {
      const hut = art[BASE_ART.campProps[i % BASE_ART.campProps.length]!];
      sprites.push({
        y: at.y,
        x: at.x,
        draw: () => drawStanding(ctx, hut, project({ ...at, z: 0 }, cam), HUT_HEIGHT, cam),
      });
      return;
    }
    const size = BUILDING[p.kind];
    const box = { ...around(at, size), z0: 0, height: size.height };
    const look =
      p.kind === 'lab'
        ? { top: art['concrete-top'], front: art['concrete-front'] }
        : { top: art['metal-top'], front: art['metal-front'] };
    sprites.push({
      y: at.y + size.halfDepth,
      x: at.x,
      draw: () => {
        // A running generator glows round its block, as a lit turret does.
        if (p.running) {
          const c = project({ ...at, z: size.height / 2 }, cam);
          const r = size.halfWidth * 1.8 * cam.zoom;
          const glow = ctx.createRadialGradient(c.sx, c.sy, 0, c.sx, c.sy, r);
          glow.addColorStop(0, COLOR.glow);
          glow.addColorStop(1, 'rgba(255, 196, 70, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(c.sx - r, c.sy - r, 2 * r, 2 * r);
        }
        drawBox(ctx, box, look.top, look.front, cam);
        const f = faces(box, cam);
        // A dark roof edge, and the Lab's lit window, so neither reads as a bare slab.
        ctx.strokeStyle = COLOR.edge;
        ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
        ctx.strokeRect(f.top.sx, f.top.sy, f.top.w, f.top.h);
        if (p.kind === 'lab') {
          // Two small panes, so it reads as a window rather than a bar.
          ctx.fillStyle = COLOR.window;
          for (const left of [0.3, 0.55]) {
            ctx.fillRect(
              f.front.sx + f.front.w * left,
              f.front.sy + f.front.h * 0.3,
              f.front.w * 0.15,
              f.front.h * 0.35,
            );
          }
        }
        // Under the block, clear of the fence above.
        drawPlate(ctx, p.label, { x: at.x, y: at.y + size.halfDepth, z: 0 }, cam, true);
      },
    });
  });
  return sprites;
}

/** A segment's tier badge: its tier's letter on its colour, on the ground just in front of the wall. */
function drawTierBadge(
  ctx: CanvasRenderingContext2D,
  tier: Tier,
  at: { x: number; y: number },
  cam: Camera,
): void {
  const badge = TIER_BADGE[tier];
  const c = project(at, cam);
  const s = Math.max(9, MARK.badge * cam.zoom);
  ctx.fillStyle = badge.colour;
  ctx.fillRect(c.sx - s / 2, c.sy - s / 2, s, s);
  ctx.font = MARK.badgeFont;
  ctx.fillStyle = COLOR.badgeText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge.text, c.sx, c.sy);
}

/**
 * The build scene's marks, over every sprite: a ghost line on each unbuilt column, a
 * ghost "+" on each empty slot (or why it can't be built yet), each segment's tier
 * badge, each damaged piece's bar and each broken one's cross, then the hovered target.
 */
function drawBuildMarks(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  build: BuildOverlay,
  camp: CampView | null,
  cam: Camera,
): void {
  ctx.setLineDash([...MARK.dash]);
  for (const column of build.ghosts.lines) {
    const wx = COLUMNS[column]!;
    const band = { x0: wx, x1: wx + WALL.depth, y0: 0, y1: FIELD.height };
    strokeEdged(ctx, COLOR.ghost, 1, () => rectPath(ctx, band, 0, cam));
  }
  ctx.setLineDash([]);
  const hover = build.hover;
  for (const g of build.ghosts.slots) {
    if (g.what === 'walk') {
      const seg = segmentOf(scene.layers, g.column, g.row);
      drawSpotGhost(ctx, ghostAt(g, seg ? wallHeight(seg.hp, seg.maxHp) : 0), cam);
    } else if ((g.what === 'tower' || g.what === 'ground') && g.needsWall) {
      // Can't be built yet: a dimmed outline; why shows once on its column, and here on hover.
      const slot: SlotHit = { column: g.column, row: g.row, what: g.what };
      drawGhost(ctx, footprint(slot), null, 0, cam);
    } else {
      const slot: SlotHit =
        g.what === 'trap'
          ? { column: COLUMNS.length - 1, row: g.row, what: 'trap' }
          : { column: g.column, row: g.row, what: g.what };
      drawGhost(ctx, footprint(slot), ghostAt(g), 0, cam);
    }
  }
  for (const layer of scene.layers) {
    for (const seg of layer.segments) {
      if (seg.kind === null || seg.tier === null) continue;
      const y = (seg.index + 0.5) * SEGMENT_HEIGHT;
      const top = { x: layer.x + WALL.depth / 2, y, z: wallHeight(seg.hp, seg.maxHp) };
      drawTierBadge(ctx, seg.tier, { x: layer.x + WALL.depth + MARK.badge, y }, cam);
      const condition = conditionOf(seg.hp, seg.maxHp);
      if (condition === 'broken') drawCross(ctx, top, cam);
      else if (condition === 'damaged') {
        drawHpBar(ctx, { ...top, z: top.z + HP_BAR.gap }, seg.hp, seg.maxHp, cam);
      }
    }
  }
  // A turret always shows its condition bar (drawTurret); a jammed one is crossed too.
  for (const t of scene.turrets) {
    if (conditionOf(t.condition, MAX_CONDITION) !== 'broken') continue;
    drawCross(ctx, { x: t.x, y: t.y, z: turretFloor(scene.layers, t) + PIECE.turret.height }, cam);
  }
  for (const t of scene.traps) {
    const r = footprint({ column: COLUMNS.length - 1, row: t.row, what: 'trap' });
    const at = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, z: 0 };
    const condition = conditionOf(t.durability, TRAP_DURABILITY);
    if (condition === 'broken') drawCross(ctx, at, cam);
    else if (condition === 'damaged') {
      drawHpBar(ctx, { ...at, z: HP_BAR.gap }, t.durability, TRAP_DURABILITY, cam, {
        back: COLOR.conditionBack,
        fill: COLOR.conditionFill,
      });
    }
  }
  for (const column of build.ghosts.lines) {
    // Once per column, between its tower and ground-post lines; a hovered post slot there
    // says it on itself instead.
    const onPost =
      hover && 'slot' in hover && (hover.slot.what === 'tower' || hover.slot.what === 'ground');
    if (onPost && hover.slot.column === column) continue;
    const x = COLUMNS[column]! + (POST_OFFSET.tower + POST_OFFSET.ground) / 2;
    drawPlate(ctx, NEEDS_WALL, { x, y: FIELD.height / 2, z: 0 }, cam);
  }
  if (!hover) return;
  ctx.strokeStyle = COLOR.hover;
  ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
  if ('plot' in hover) {
    if (camp?.plots.some((p) => p.id === hover.plot.id))
      outline(ctx, plotFootprint(hover.plot), 0, cam);
    return;
  }
  const { slot, spot } = hover;
  if (spot !== undefined) {
    // A wall-walk spot: its ring, on the wall's top.
    const seg = segmentOf(scene.layers, slot.column, slot.row);
    const at = project(
      ghostAt(
        { what: 'walk', column: slot.column, row: slot.row, spot },
        seg ? wallHeight(seg.hp, seg.maxHp) : 0,
      ),
      cam,
    );
    const r = Math.max(4, MARK.spot * cam.zoom) + 2;
    ctx.beginPath();
    ctx.ellipse(at.sx, at.sy, r, r * TILT, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  outline(ctx, footprint(slot), 0, cam);
  const blocked = build.ghosts.slots.some(
    (g) =>
      (g.what === 'tower' || g.what === 'ground') &&
      g.needsWall &&
      g.what === slot.what &&
      g.column === slot.column &&
      g.row === slot.row,
  );
  if (blocked && (slot.what === 'tower' || slot.what === 'ground')) {
    const at = ghostAt({ what: slot.what, column: slot.column, row: slot.row, needsWall: true });
    drawPlate(ctx, NEEDS_WALL, { ...at, y: at.y - PIECE[slot.what].halfDepth }, cam);
  }
}

/** A size `px` at zoom 1, on screen, never under `EFFECT.min`. */
const sized = (px: number, cam: Camera): number => Math.max(EFFECT.min, px * cam.zoom);

/**
 * The barrel end of whoever shoots from `(x, y)`: a turret there, else the defender on
 * the post there (bullets leave their post's or turret's exact coordinates), else a
 * defender walking on the ground.
 */
function muzzleAt(
  scene: Scene,
  x: number,
  y: number,
  owner: string,
): { x: number; y: number; z: number } {
  const turret = scene.turrets.find((t) => t.x === x && t.y === y);
  if (turret) {
    const floor = turretFloor(scene.layers, turret) + MUZZLE.turret.z;
    return { x: x + MUZZLE.turret.dx, y, z: floor };
  }
  const post = scene.posts.find((p) => p.x === x && p.y === y);
  const floor = post ? postFloor(scene.layers, post) : 0;
  // A Gunner fires with their gun aimed: its muzzle is where the aim sprite's barrel ends.
  // Found by who fired, since a shooter walking between posts has moved on from `(x, y)`.
  const shooter = scene.defenders.find((d) => d.id === owner);
  const gun = shooter ? gunOf(shooter) : null;
  if (!gun) return { x: x + MUZZLE.defender.dx, y, z: floor + MUZZLE.defender.z };
  const px = STAND.defender / ART_PX;
  return { x: x + gun.barrel.x * px, y, z: floor + (gun.barrel.y * px) / HEIGHT_SCALE };
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
  const c = project(muzzleAt(scene, x, y, owner), cam);
  const shooter = scene.defenders.find((d) => d.id === owner);
  const scale = shooter ? (gunOf(shooter)?.flash ?? 1) : 1;
  const r = sized(EFFECT.flash * scale, cam);
  ctx.globalAlpha = 1 - age;
  ctx.fillStyle = COLOR.flashEdge;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  // The core points along the shot (its newest bullet; ahead, into the field, with none):
  // white at the muzzle, orange at its tip (ID-070).
  let newest: Bullet | null = null;
  let least = Infinity;
  for (const b of scene.bullets) {
    const flown = Math.hypot(b.x - b.fromX, b.y - b.fromY);
    if (b.owner === owner && flown < least) [newest, least] = [b, flown];
  }
  const ahead = newest
    ? project({ x: newest.fromX + newest.dx, y: newest.fromY + newest.dy }, cam)
    : null;
  const from = newest ? project({ x: newest.fromX, y: newest.fromY }, cam) : null;
  const turn = ahead && from ? Math.atan2(ahead.sy - from.sy, ahead.sx - from.sx) : 0;
  const len = sized(FLASH.len * scale, cam);
  const core = ctx.createRadialGradient(c.sx, c.sy, 0, c.sx, c.sy, len);
  core.addColorStop(0, COLOR.flash);
  core.addColorStop(1, FLASH.edge);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(
    c.sx + (Math.cos(turn) * len) / 2,
    c.sy + (Math.sin(turn) * len) / 2,
    len / 2,
    sized(FLASH.w * scale, cam) / 2,
    turn,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** `#rrggbb` at `alpha`, for a gradient stop. */
const withAlpha = (hex: string, alpha: number): string =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

type Point = { sx: number; sy: number };
/** Where a bullet is drawn on screen (ID-070): its head and tail, and both on the ground. */
export interface BulletShape {
  head: Point;
  tail: Point;
  groundHead: Point;
  groundTail: Point;
  /** The tail's length in world px along the flight. */
  length: number;
}

/**
 * A bullet's shape on screen (design §15, ID-070). Its head is carried on from its last
 * step by the fight's `acc` (the sim moves it in whole steps; drawn there, it would jump),
 * never past the spot it was aimed at before it gets there, nor past the end of its
 * flight. It drops from the muzzle to body height over the distance it was aimed. Its tail
 * is its gun's tracer plus one frame of flight at the game speed (counted to `TAIL.pace`),
 * and never reaches back past the muzzle.
 */
export function bulletShape(scene: Scene, b: Bullet, cam: Camera): BulletShape {
  const muzzle = muzzleAt(scene, b.fromX, b.fromY, b.owner).z;
  const flown = Math.hypot(b.x - b.fromX, b.y - b.fromY);
  let lead = Math.max(0, Math.min(b.speed * (scene.acc ?? 0), b.left));
  if (flown < b.aim) lead = Math.min(lead, b.aim - flown);
  const at = flown + lead;
  const pace = Math.min(Math.max(scene.pace ?? 1, 1), TAIL.pace);
  const length = Math.min(b.tracer.length + b.speed * TAIL.frame * pace, at);
  const zAt = (d: number): number =>
    muzzle + (ENEMY.z - muzzle) * Math.min(1, b.aim > 0 ? d / b.aim : 1);
  const hx = b.x + b.dx * lead;
  const hy = b.y + b.dy * lead;
  const tx = hx - b.dx * length;
  const ty = hy - b.dy * length;
  return {
    head: project({ x: hx, y: hy, z: zAt(at) }, cam),
    tail: project({ x: tx, y: ty, z: zAt(at - length) }, cam),
    groundHead: project({ x: hx, y: hy }, cam),
    groundTail: project({ x: tx, y: ty }, cam),
    length,
  };
}

/** A quad from `head` (`wHead` wide) thinning to `tail` (`wTail` wide), filled with `fill`. */
function taper(
  ctx: CanvasRenderingContext2D,
  head: Point,
  tail: Point,
  wHead: number,
  wTail: number,
  fill: string | CanvasGradient,
): void {
  const len = Math.hypot(head.sx - tail.sx, head.sy - tail.sy);
  if (len === 0) return;
  // The unit normal to the flight on screen.
  const nx = -(head.sy - tail.sy) / len;
  const ny = (head.sx - tail.sx) / len;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(head.sx + (nx * wHead) / 2, head.sy + (ny * wHead) / 2);
  ctx.lineTo(tail.sx + (nx * wTail) / 2, tail.sy + (ny * wTail) / 2);
  ctx.lineTo(tail.sx - (nx * wTail) / 2, tail.sy - (ny * wTail) / 2);
  ctx.lineTo(head.sx - (nx * wHead) / 2, head.sy - (ny * wHead) / 2);
  ctx.closePath();
  ctx.fill();
}

/**
 * Bullets in flight (design §15, ID-070), as bullets and not beams: a white head capsule on
 * a dark backing with a soft glow in its gun's colour, a tail that thins and fades to clear,
 * and a faint shadow on the ground under it. `bullets` share a muzzle (a shotgun's pellets):
 * every shadow and backing goes down before any tail or head, so none darkens another.
 */
function drawBullets(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  bullets: readonly Bullet[],
  cam: Camera,
): void {
  const shapes = bullets.map((b) => ({ ...bulletShape(scene, b, cam), colour: b.tracer.colour }));
  const w = sized(BULLET.head.w, cam);
  const end = BULLET.tail.end * cam.zoom;
  const capsule = (s: (typeof shapes)[number], colour: string, width: number): void => {
    const len = Math.hypot(s.head.sx - s.tail.sx, s.head.sy - s.tail.sy);
    const reach = Math.min(Math.max(0, sized(BULLET.head.len, cam) - width), len);
    const ux = len > 0 ? (s.head.sx - s.tail.sx) / len : 1;
    const uy = len > 0 ? (s.head.sy - s.tail.sy) / len : 0;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.head.sx - ux * reach, s.head.sy - uy * reach);
    ctx.lineTo(s.head.sx, s.head.sy);
    ctx.stroke();
    ctx.restore();
  };
  ctx.globalAlpha = 1;
  for (const s of shapes) {
    taper(ctx, s.groundHead, s.groundTail, sized(BULLET.shadow.w, cam), end, BULLET.shadow.colour);
  }
  for (const s of shapes) capsule(s, BULLET.head.backing, w + 2 * BULLET.head.edge);
  for (const s of shapes) {
    const glow = ctx.createRadialGradient(
      s.head.sx,
      s.head.sy,
      0,
      s.head.sx,
      s.head.sy,
      sized(BULLET.glow.r, cam),
    );
    glow.addColorStop(0, withAlpha(s.colour, BULLET.glow.alpha));
    glow.addColorStop(1, withAlpha(s.colour, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.head.sx, s.head.sy, sized(BULLET.glow.r, cam), 0, Math.PI * 2);
    ctx.fill();
    const fade = ctx.createLinearGradient(s.head.sx, s.head.sy, s.tail.sx, s.tail.sy);
    fade.addColorStop(0, '#ffffff');
    fade.addColorStop(BULLET.tail.white, withAlpha(s.colour, BULLET.tail.alpha));
    fade.addColorStop(1, withAlpha(s.colour, 0));
    taper(ctx, s.head, s.tail, w, end, fade);
    capsule(s, COLOR.slug, w);
  }
}

/**
 * Where a bullet ended, fading and spreading over `IMPACT_FLASH`: a blood puff at body
 * height on a hit, a dust kick on the ground where a miss fell. A hit also flashes a white
 * spark on the body for its first `SPARK_SHARE`, shrinking and fading (ID-070).
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
  const spark = age / SPARK_SHARE;
  if (i.hit && spark < 1) {
    const c = project({ x: i.x, y: i.y, z: ENEMY.z }, cam);
    ctx.globalAlpha = 1 - spark;
    ctx.fillStyle = COLOR.hitSpark;
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, sized(EFFECT.spark * (1 - spark / 2), cam), 0, Math.PI * 2);
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
  frame: EnemyFrame,
  feet: { sx: number; sy: number },
  cam: Camera,
  pose: Readonly<Pose>,
): void {
  const size = ENEMIES[kind].radius / ENEMY_RADIUS;
  const frames = ENEMY_ART[kind];
  const img = art[frame === 'attack' ? frames.attack : frames.walk[frame]];
  drawStanding(ctx, img, feet, STAND.enemy * size, cam, pose);
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

/**
 * Where an enemy's HP bar sits: just over its sprite's top (its frames share one height),
 * so it never covers the head.
 */
function enemyBarAt(art: Art, kind: EnemyKind, x: number, y: number) {
  const size = ENEMIES[kind].radius / ENEMY_RADIUS;
  const top = (STAND.enemy * size * art[ENEMY_ART[kind].walk[1]].height) / ART_PX;
  return { x, y, z: top / HEIGHT_SCALE + HP_BAR.gap / 2 };
}

/** How a damage number shows (ID-082), or null once it is gone. */
export interface PopLook {
  text: string;
  /** Font size, px. */
  px: number;
  colour: string;
  alpha: number;
  /** Screen px off its target's centre: left, none or right (a wall's: none). */
  dx: number;
  /** Screen px risen so far. */
  rise: number;
}

/**
 * Damage number `p` at fight time `time` shown at game speed `pace` (it lasts the same
 * real time at any speed): its rounded amount (at least 1), a crit's with "!" and a
 * blow on the wall's as a loss; reduce motion (`still`) fades it in place, with no punch.
 */
export function popLook(p: Pop, time: number, pace: number, still: boolean): PopLook | null {
  const real = (time - p.at) / Math.max(1, pace);
  const age = real / POP.life;
  if (!(age >= 0 && age < 1)) return null;
  const n = Math.max(1, Math.round(p.amount));
  const wall = p.on === 'wall';
  const grow = Math.min(1, p.amount / (wall ? POP.wallBigAt : POP.bigAt));
  const punch = p.crit && !still ? 1 + POP.punch.extra * Math.max(0, 1 - real / POP.punch.time) : 1;
  const px = (POP.size + (POP.big - POP.size) * grow) * (p.crit ? POP.crit * punch : 1);
  return {
    text: wall ? `−${n}` : p.crit ? `${n}!` : `${n}`,
    px: Math.round(px),
    colour: wall ? COLOR.popWall : p.crit ? COLOR.popCrit : COLOR.popHit,
    alpha: age < 1 - POP.fade ? 1 : (1 - age) / POP.fade,
    dx: wall
      ? 0
      : ((Math.floor(p.at / DAMAGE_POP.merge + 1e-9) % 3) - 1) *
        (p.crit ? POP.critStagger : POP.stagger),
    rise: still ? 0 : POP.rise * age,
  };
}

/** The damage numbers still showing, oldest first: the newest `POP.cap` of them. */
export function shownPops(pops: readonly Pop[], time: number, pace: number): Pop[] {
  return pops.filter((p) => popLook(p, time, pace, true)).slice(-POP.cap);
}

/** Each damage number over what took the hit (ID-082), on a dark edge so it reads on any ground. */
function drawPops(
  ctx: CanvasRenderingContext2D,
  art: Art,
  scene: Scene,
  still: boolean,
  cam: Camera,
) {
  const pace = scene.pace ?? 1;
  const pops = shownPops(scene.pops ?? [], scene.time, pace);
  if (pops.length === 0) return;
  ctx.save();
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = POP.edge;
  ctx.strokeStyle = COLOR.popEdge;
  // Crits last, so a plain hit beside one never paints over it.
  for (const p of [...pops.filter((k) => !k.crit), ...pops.filter((k) => k.crit)]) {
    const look = popLook(p, scene.time, pace, still)!;
    // Clear of the HP bar: over the enemy's, or over the whole wall's (a segment only gets lower).
    const bar =
      p.on === 'wall'
        ? {
            at: { x: p.x, y: p.y, z: PIECE.wall.height + HP_BAR.gap },
            h: Math.max(WALL_BAR.min.h, WALL_BAR.h * cam.zoom),
          }
        : { at: enemyBarAt(art, p.on, p.x, p.y), h: HP_BAR.h * cam.zoom };
    const at = project(bar.at, cam);
    const h = bar.h;
    ctx.globalAlpha = look.alpha;
    ctx.font = `bold ${look.px}px system-ui, sans-serif`;
    const y = at.sy - h - POP.gap - look.rise;
    // A wall's loss on the camp side of its back face; an enemy's centred over it.
    ctx.textAlign = p.on === 'wall' ? 'right' : 'center';
    const x = p.on === 'wall' ? at.sx - POP.gap : at.sx + look.dx;
    ctx.strokeText(look.text, x, y);
    ctx.fillStyle = look.colour;
    ctx.fillText(look.text, x, y);
  }
  ctx.restore();
}

/** A Frag Grenade's flight and burst (ID-077): the grenade's arc height and size, in world units. */
export const GRENADE = { arc: 40, r: 6.5, edge: 2, shine: 1 } as const;

/** Where a Frag Grenade in the air is at `time`: along its throw, `GRENADE.arc` high at the middle. */
export function grenadeAt(g: Grenade, time: number): { x: number; y: number; z: number } {
  const p = Math.min(1, Math.max(0, (time - g.at) / (g.lands - g.at)));
  return {
    x: g.fromX + (g.x - g.fromX) * p,
    y: g.fromY + (g.y - g.fromY) * p,
    z: 4 * GRENADE.arc * p * (1 - p),
  };
}

/**
 * Frag Grenades (design §8): in the air, an olive-drab ball with a dark edge on its arc over its own
 * shadow; landed, the airstrike's blast art swells over its reach and fades out.
 */
function drawGrenade(
  ctx: CanvasRenderingContext2D,
  art: Art,
  g: Grenade,
  time: number,
  cam: Camera,
): void {
  if (time < g.lands) {
    const at = grenadeAt(g, time);
    groundCircle(ctx, at.x, at.y, GRENADE.r, cam);
    ctx.fillStyle = COLOR.shadow;
    ctx.fill();
    const c = project(at, cam);
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, sized(GRENADE.r, cam), 0, Math.PI * 2);
    ctx.fillStyle = COLOR.grenade;
    ctx.fill();
    ctx.strokeStyle = COLOR.grenadeEdge;
    ctx.lineWidth = sized(GRENADE.edge, cam);
    ctx.stroke();
    // A pale rim on its upper left, so it reads over the mossy ground.
    const rim = sized(GRENADE.r, cam) - sized(GRENADE.edge, cam);
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, rim, Math.PI, Math.PI * 1.5);
    ctx.strokeStyle = COLOR.grenadeShine;
    ctx.lineWidth = sized(GRENADE.shine, cam);
    ctx.stroke();
    return;
  }
  const age = (time - g.lands) / CARD.frag.flash;
  if (age >= 1) return;
  ctx.globalAlpha = 1 - age;
  groundArt(ctx, art[SKILL_ART.airstrike], g.x, g.y, CARD.frag.radius * (0.85 + 0.15 * age), cam);
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
 * everything stands still. `camp` draws the camp's fence and plots (the build scene,
 * ID-065, and Start Horde's ease out of it). Everything but the surround is clipped
 * left of screen x `clip`: by default the fight frame's left edge in a fight, nothing
 * in build mode.
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
  camp: CampView | null = null,
  clip: number | null = null,
): void {
  anim?.observe(scene);
  const defenderPoseOf = (d: Defender): Readonly<Pose> =>
    anim ? anim.shown(defenderPose(d, scene.time, anim.acts(d.id, scene.strikes))) : STILL;
  // A Gunner aims while firing (ID-069); out of a fight (no animator), at rest.
  const aimOf = (d: Defender): boolean =>
    anim ? aiming(d, scene.time, anim.acts(d.id, scene.strikes)) : false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = COLOR.sky;
  ctx.fillRect(0, 0, view.w, view.h);
  drawSurround(ctx, art, cam, view);
  // In a fight nothing left of the frame shows (ID-064): the camp's yard stays out of
  // view, and an enemy past the frame shows as a marker at its edge instead.
  // On a whole pixel, so the clip's edge doesn't smear a seam into the surround.
  const fightLeft = build ? 0 : project({ x: FIGHT_FRAME.left, y: 0 }, cam).sx;
  const left = Math.max(0, Math.round(clip ?? fightLeft));
  const dim = (style: string): void => {
    ctx.fillStyle = style;
    ctx.fillRect(0, 0, view.w, view.h);
  };
  // The build scene dims the land round the camp's plot, so the plot reads as the focus;
  // a fight dims it all to dusk (ID-071).
  dim(build ? COLOR.outside : DUSK);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, Math.max(0, view.w - left), view.h);
  ctx.clip();
  drawGround(ctx, art, cam);
  if (camp) drawCampGround(ctx, art, camp, cam);
  if (!build) dim(DUSK);
  // In a fight the ground past the field's top and bottom edges is shaded (ID-068), so
  // the wall's ends read as the map's edge, not a way round; sprites still draw over it.
  if (!build) {
    const top = project({ x: 0, y: 0 }, cam).sy;
    const bottom = project({ x: 0, y: FIELD.height }, cam).sy;
    ctx.fillStyle = COLOR.outside;
    if (top > 0) ctx.fillRect(0, 0, view.w, top);
    if (bottom < view.h) ctx.fillRect(0, bottom, view.w, view.h - bottom);
  }

  // The barrier cards the wall shows (ID-075); none in the build scene.
  const taken = { taken: scene.taken ?? [] };
  const cards: WallCards = build
    ? NO_CARDS
    : {
        spiked: took(taken, 'spiked-walls'),
        reinforced: took(taken, 'reinforce'),
        pickedAt: scene.barrierAt,
        pace: Math.max(1, scene.pace ?? 1),
        still: anim?.reduced ?? true,
      };
  // Barbed Wire's band (ID-077) and traps lie flat on the ground, under every sprite,
  // and Spiked Walls' stakes go under them too, so the enemies at the wall stand over them.
  if (!build) drawWire(ctx, art, scene, cam);
  if (cards.spiked) drawStakes(ctx, art, scene.layers, cam);
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

  const sprites: Sprite[] = camp ? campSprites(ctx, art, camp, cam) : [];
  for (const layer of scene.layers) {
    for (const seg of layer.segments) {
      if (seg.kind === null || seg.tier === null) continue; // unbuilt: an open gap
      // Keyed just past the wall's front edge so enemies stopped at it draw on top.
      sprites.push({
        y: seg.index * SEGMENT_HEIGHT + SEGMENT_HEIGHT / 2,
        x: layer.x + WALL.depth + 0.5,
        draw: () => drawSegment(ctx, art, layer, seg, scene.time, cam, cards),
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
          const selected = manned.id === selectedDefender;
          drawDefender(ctx, art, manned, floor, selected, cam, pose, aimOf(manned));
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
        drawDefender(ctx, art, d, 0, d.id === selectedDefender, cam, defenderPoseOf(d), aimOf(d));
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
        const acts = anim?.enemy(e.id);
        const pose = anim && acts ? anim.shown(enemyPose(e, scene.time, acts)) : STILL;
        const frame = anim && acts ? anim.shownFrame(enemyFrame(e, scene.time, acts)) : 1;
        drawEnemy(ctx, art, e.kind, frame, ground, cam, pose);
        if (burning(scene, e)) drawFlame(ctx, e.x, e.y, size, scene.time, cam);
        const at = enemyBarAt(art, e.kind, e.x, e.y);
        drawHpBar(ctx, at, e.hp, e.maxHp, cam, undefined, HP_BAR, true);
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
        drawEnemy(ctx, art, e.kind, 1, ground, cam, pose);
      },
    });
  }
  // One shot's bullets (a shotgun's pellets: one muzzle, flown as far) draw together,
  // shadows and backings under every tail and head; each later shot sorts on its own.
  const volleys = new Map<string, Bullet[]>();
  for (const b of scene.bullets) {
    const flown = Math.round(Math.hypot(b.x - b.fromX, b.y - b.fromY));
    const key = `${b.owner}@${b.fromX},${b.fromY}:${flown}`;
    const v = volleys.get(key);
    if (v) v.push(b);
    else volleys.set(key, [b]);
  }
  for (const v of volleys.values()) {
    const b = v[0]!;
    sprites.push({ y: b.y, x: b.x, draw: () => drawBullets(ctx, scene, v, cam) });
  }
  for (const sprite of depthSort(sprites)) sprite.draw();
  if (build) drawBuildMarks(ctx, scene, build, camp, cam);
  else drawWallBars(ctx, scene.layers, cam);

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
  for (const g of scene.grenades) drawGrenade(ctx, art, g, scene.time, cam);

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
  // Each defender's name on top of every sprite and effect, so none hides it (ID-074).
  // Only those the sprites above drew: a walker, or the one standing on their post.
  if (!build) {
    // Damage numbers (ID-082) under every name and reload pie, so they never hide one.
    drawPops(ctx, art, scene, cards.still, cam);
    const shown = scene.defenders.flatMap((d) => {
      const post = d.walking ? null : scene.posts.find((p) => p.id === d.postId);
      if (post === undefined) return []; // not walking and on no post: not drawn
      return [{ d, z0: post ? postFloor(scene.layers, post) : 0 }];
    });
    // Over each name, clear of it, while their gun reloads (ID-078). All before the
    // names, so where two survivors crowd together a pie never hides a name.
    for (const { d, z0 } of shown) {
      const share = reloadShare(d, scene.time, scene.taken);
      if (share !== null) drawReloadPie(ctx, d, share, z0, cam);
    }
    for (const { d, z0 } of shown) drawNameTag(ctx, d, z0, cam);
  }
  ctx.restore();
  if (build) return;
  for (const { row, count } of offFrame(scene.enemies)) drawOffFrame(ctx, row, count, left, cam);
}

/** Per row, top to bottom, how many enemies are left of the frame (heading for the camp). */
export function offFrame(
  enemies: readonly { x: number; y: number }[],
): { row: number; count: number }[] {
  const counts = new Array<number>(SEGMENTS).fill(0);
  for (const e of enemies) {
    if (!(e.x < FIGHT_FRAME.left)) continue;
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
  const { sy } = project({ x: FIGHT_FRAME.left, y: (row + 0.5) * SEGMENT_HEIGHT }, cam);
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
