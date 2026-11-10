// The horde view (design §15): generated sprites and tiling textures (sprites.ts) on
// the shared projection and depth sort. Canvas 2D, no rendering library.
import {
  BOSS_SKILL,
  COLUMNS,
  ELITE,
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
  THROW_FALL,
  type BossSkill,
  type SkillId,
  type EnemyKind,
  type Tier,
} from '../core/data.ts';
import {
  reloadIn,
  barbedWire,
  atLevel,
  plated,
  radiusOf,
  roared,
  shocked,
  dazed,
  windingUp,
  took,
  turretState,
  type Bullet,
  type Defender,
  type HordeState,
  type Impact,
  type Layer,
  type Grenade,
  type Post,
  type Burst,
  type Enemy,
  type Fire,
  type Incoming,
  type Pop,
  type Slab,
  type Spit,
  type Trap,
  type Turret,
} from '../core/horde.ts';
import { baseOf } from '../core/armoury.ts';
import { CHAT, CHAT_RANK, type Bubble } from '../core/chatter.ts';
import { professionOf } from '../core/loadout.ts';
import { createRng } from '../core/rng.ts';
import { carpet, throwArea } from '../core/skills.ts';
import {
  BLAST,
  blastLook,
  blastSeed,
  FIREBALL,
  fireFrames,
  paintDiscs,
  paintRing,
  type BlastKind,
  type BlastLook,
} from './explosion.ts';
import { SPIT, spitFly, spitFrames } from './spit.ts';
import {
  CUTS,
  DEATH,
  deathOf,
  deathPose,
  dustOf,
  limbFlight,
  sprayOf,
  type Cut,
  type Death,
  type SpritePoint,
} from './death.ts';
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
  type WireLook,
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
  ANIM,
  defenderPose,
  enemyFrame,
  enemyPose,
  STILL,
  type Animator,
  type EnemyFrame,
  type Pose,
} from './anim.ts';
import {
  BASE_ART,
  DEFENDER_ART,
  ENEMY_ART,
  GUNNER_ART,
  GUNNER_LOOKS,
  lookOf,
  SCORCH_ART,
  BOMB_ART,
  SKILL_ICON,
  TIER_ART,
  TRAP_ART,
  TURRET_ART,
  THROW_LOOKS,
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

/**
 * The dark lip at the field's top and bottom edges in a fight (ID-081): `color` at the
 * edge, fading to `clear` (the same colour, see-through) `depth` units out, over the dim
 * ground past the field.
 */
export const EDGE_LIP = {
  depth: 24,
  color: 'rgba(0, 0, 0, 0.45)',
  clear: 'rgba(0, 0, 0, 0)',
} as const;

const COLOR = {
  sky: '#15171a',
  selected: '#9cc4f0',
  reserved: 'rgba(156, 196, 240, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  focus: '#ffe066',
  aimFill: 'rgba(255, 224, 102, 0.18)',
  aimFire: '#ff9a3c',
  aimFireFill: 'rgba(255, 154, 60, 0.18)',
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
  /** A survivor's speech bubble (ID-085): dark text on a pale card with a dark edge. */
  bubble: '#f4f1ea',
  bubbleText: '#1b1a18',
  bubbleEdge: 'rgba(17, 17, 16, 0.85)',
  /** A segment a repair card heals (ID-075). */
  wallRepair: '#7fe08c',
  hpEdge: '#1b1a18',
  conditionBack: '#111110',
  conditionFill: '#a9c4d6',
  strike: '#f2f2f2',
  slug: '#fffbe8',
  /** The white spark where a bullet hits a body (ID-070). */
  hitSpark: '#ffffff',
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
 * A thrown flashbang or molotov bottle (ID-107): it drops from `height` (world units) over
 * `THROW_FALL`, falling faster as it goes, spinning `spin` turns a second, `size` across;
 * its shadow (`shadow` radius, darkening to `shadowAlpha`) grows under it as it nears the
 * ground. A flashbang is a grey canister, a bottle its icon's art; an airstrike bomb the
 * Heavy Rounds shell, `bomb` long, arcing in from `carry` behind (`fallAt`).
 */
export const THROWN = {
  height: 420,
  spin: 2.5,
  size: 26,
  shadow: 12,
  shadowAlpha: 0.9,
  can: '#8a9097',
  canEdge: '#1d1f22',
  canShine: '#c9ced4',
  bomb: 50,
  bombShadow: 18,
  /** How far an airstrike bomb still travels forward (+x, the plane's way) as it falls. */
  carry: 280,
} as const;

/**
 * Where thrown burst `i` is `fall` of the way down (ID-107). A flashbang or bottle drops
 * straight onto its spot; an airstrike bomb keeps the plane's forward speed (left to
 * right, +x), so it arcs in from `carry` behind its spot: steady along x while gravity
 * speeds its drop, landing nose first.
 */
export function fallAt(i: Incoming, fall: number): { x: number; y: number; z: number } {
  const carry = i.skill === 'airstrike' ? THROWN.carry * (1 - fall) : 0;
  return { x: i.x - carry, y: i.y, z: THROWN.height * (1 - fall * fall) };
}

/**
 * How far thrown burst or airstrike bomb `i` has fallen at `time` (ID-107): 0 just
 * dropped, 1 landing; null before it drops or once it has landed.
 */
export function thrownFall(i: Incoming, time: number): number | null {
  const u = 1 - (i.at - time) / THROW_FALL;
  return u >= 0 && u <= 1 ? u : null;
}
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
 * at 0.5× zoom: an impact's puff and a hit's spark.
 */
const EFFECT = { puff: 6, spark: 4, min: 1.5 } as const;
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
/**
 * A muzzle flash's look (ID-088), in px at zoom 1. Fire leaves the barrel end as `tongues`,
 * each `[turn off the shot in rad, length, width]`: the long one along the shot, short ones
 * flaring out to the sides. Each tongue is an `edge`-coloured flame with a hot pale centre,
 * on a soft `halo` of that colour, with a white-hot dot at the muzzle. A pistol's is small,
 * an SMG's thin and spiky (its flames' lengths vary more, `roll`), a rifle's long, a
 * sniper's a long needle, a shotgun's a wide fan, an LMG's a big star; a turret's is a
 * cold, electric cross, unlike any survivor's.
 */
export type FlashStyle = {
  readonly tongues: readonly (readonly [number, number, number])[];
  readonly halo: number;
  readonly edge: string;
  /** Each flame's length × 1 ± this per shot; `FLASH.tongue` when unset. */
  readonly roll?: number;
};
const GUNFIRE = '#ff9a3c';
export const FLASH_STYLE: Readonly<Record<GunId | 'turret', FlashStyle>> = {
  pistol: {
    tongues: [
      [0, 6, 3],
      [-1.1, 2.5, 1.5],
      [1.1, 2.5, 1.5],
    ],
    halo: 3,
    edge: GUNFIRE,
  },
  smg: {
    tongues: [
      [0, 8, 2.4],
      [-0.9, 3, 1.5],
      [0.9, 3, 1.5],
    ],
    halo: 3.5,
    edge: GUNFIRE,
    roll: 0.4,
  },
  rifle: {
    tongues: [
      [0, 10, 3],
      [-0.9, 3.5, 1.5],
      [0.9, 3.5, 1.5],
    ],
    halo: 4,
    edge: GUNFIRE,
  },
  sniper: {
    tongues: [
      [0, 13, 2.5],
      [-1.2, 2.8, 1.5],
      [1.2, 2.8, 1.5],
    ],
    halo: 4.5,
    edge: GUNFIRE,
  },
  shotgun: {
    tongues: [
      [0, 9, 4],
      [-0.4, 7.5, 3.5],
      [0.4, 7.5, 3.5],
      [-1.2, 3, 1.5],
      [1.2, 3, 1.5],
    ],
    halo: 5,
    edge: GUNFIRE,
  },
  lmg: {
    tongues: [
      [0, 11, 4],
      [-0.8, 5, 2],
      [0.8, 5, 2],
      [-2.2, 2.5, 1.5],
      [2.2, 2.5, 1.5],
    ],
    halo: 5,
    edge: GUNFIRE,
  },
  turret: {
    tongues: [
      [0, 9, 3],
      [-Math.PI / 2, 4, 2],
      [Math.PI / 2, 4, 2],
      [Math.PI, 2.5, 1.5],
    ],
    halo: 4,
    edge: '#8fd3ff',
  },
};
/**
 * A muzzle flash over its `MUZZLE_FLASH` (ID-088): it flares up from `from` of its size
 * over the first `rise` of its life at full brightness, then shrinks by `shrink` and fades
 * fast (squared) to nothing; its glow fades faster still (cubed), so the tail is a thin
 * ember, not a smudge. Each shot rolls its own look (seeded by who fired and when, so a
 * replay matches): the whole flash × 1 ± `size`, turned up to `spin` rad, and each
 * tongue's length × 1 ± `tongue` (or its style's `roll`). The tongues' hot centre (`hot`)
 * is that share of each; the `core` dot's radius is that share of the main tongue's
 * width; the halo peaks at `halo`. The main flame reaches at least `reach` px on screen,
 * so it still points at 0.5× zoom. All of it adds light (drawn `lighter`), so it never
 * covers the sprites behind it.
 */
export const FLASH = {
  rise: 0.15,
  from: 0.6,
  shrink: 0.3,
  size: 0.15,
  spin: 0.12,
  tongue: 0.3,
  hot: 0.55,
  core: 0.6,
  halo: 0.6,
  reach: 2.5,
  edgeAlpha: 0.8,
  centre: '#fff2b0',
  white: '#fffdf2',
} as const;
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
 * A survivor's speech bubble (ID-085), screen px and real seconds: `h` px high, its text
 * `padX` px in from each side, corners `r` round, on a dark `edge`. It sits beside its
 * speaker's name tag (ID-094), its `tail` px point `gap` px off the tag. It keeps `margin`
 * px inside the fight's frame and under the view's top. A line wider than `wrap` px goes
 * onto two lines, the card `lineH` px taller. It grows from `from` of its size over its
 * first `grow` s and fades over its last `fade` s; with reduce motion it just shows and goes.
 */
export const BUBBLE = {
  h: 18,
  wrap: 96,
  lineH: 12,
  padX: 6,
  r: 5,
  tail: 5,
  gap: 3,
  edge: 1,
  grow: 0.12,
  from: 0.6,
  fade: 0.25,
  margin: 4,
} as const;
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
  | 'incoming'
  | 'blasts'
  | 'outcome'
> &
  // A Power Surge lights turrets on an empty bank (design §8); build mode has none.
  // `acc`, the fight time since its last step, carries bullets on between steps (ID-070).
  // The barrier cards taken show on the wall (ID-075); build mode has none.
  // Damage numbers (ID-082); build mode has none.
  // Barbed Wire's rows (ID-090); build mode has none.
  // The fight's seed picks each kill's death (ID-110); build mode has none.
  Partial<
    Pick<
      HordeState,
      | 'wave'
      | 'freeWave'
      | 'acc'
      | 'taken'
      | 'cardLevels'
      | 'barrierAt'
      | 'pops'
      | 'wire'
      | 'slabs'
      | 'seed'
    >
  > & {
    /** The game speed (1×, 2×, 3×) a fight is shown at; bullet tails grow with it (ID-070). */
    pace?: number;
    /** Survivors' speech bubbles (ID-085) and the chat clock they are timed on; build mode has none. */
    chat?: { bubbles: readonly Bubble[]; clock: number };
    /** Real seconds since the fight ended, for its last kills to finish dying (ID-110). */
    ended?: number;
  };
/** An armed skill's reach around the cursor, on the field. */
export interface Aim {
  skill: SkillId;
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

/** A drawable picture: a loaded sprite, or one cut or painted from it. */
type Picture = HTMLImageElement | OffscreenCanvas;

const flashes = new WeakMap<Picture, OffscreenCanvas>();
/** `img`'s shape in plain white, made once per image, for a hit's flash. */
function whiteOf(img: Picture): OffscreenCanvas {
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
  img: Picture,
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
 * it, design §15; a Gunner's shows their primary, or their throw frame mid-throw, ID-119)
 * in `pose`, a shield in front if they carry one, a ring at their feet when selected, and
 * an HP bar once hurt.
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
  throwing: ThrowFrame | null = null,
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
  const sprite = !gun
    ? DEFENDER_ART[professionOf(d.loadout)]
    : throwing
      ? THROW_LOOKS[lookOf(d.id)]![throwing]
      : gun[aim ? 'aim' : 'idle'];
  drawStanding(ctx, art[sprite], feet, STAND.defender, cam, pose);
  if (gun && throwing === 'wind') {
    // The grenade in the drawn-back hand (ID-119), the ball it flies as, so it reads at any zoom.
    // It follows the pose's shift and lift only; a tilt or fade lasts a few frames at most.
    const { held } = THROW_LOOKS[lookOf(d.id)]!;
    const px = (STAND.defender / ART_PX) * cam.zoom;
    const c = {
      sx: feet.sx + held.x * px + pose.dx * cam.zoom,
      sy: feet.sy - held.y * px - pose.lift * cam.zoom,
    };
    drawGrenadeBall(ctx, c, cam, GRENADE.held);
  }
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
 * doesn't change it. The length is today's reload time, Speed Loaders (`cards`, design §8)
 * included, so a stat change mid-reload moves the pie (the sim keeps only the reload's end).
 */
export function reloadShare(
  d: Pick<Defender, 'ammo' | 'reloadedAt' | 'loadout' | 'stats' | 'plain'>,
  time: number,
  cards: Pick<HordeState, 'taken' | 'cardLevels'> = { taken: [], cardLevels: {} },
): number | null {
  const end = d.reloadedAt.primary;
  if (d.ammo.primary > 0 || !(time < end)) return null;
  const total = reloadIn(cards, d, d.loadout.primary);
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
  const gun = gunIdOf(d);
  return gun ? GUNNER_LOOKS[lookOf(d.id)]![gun] : null;
}

/**
 * The gun a Gunner's sprite holds: their primary, or the rifle for any other gun; null for
 * anyone else.
 */
function gunIdOf(d: Pick<Defender, 'loadout'>): GunId | null {
  if (professionOf(d.loadout) !== 'gunner') return null;
  const base = baseOf(d.loadout.primary);
  return Object.hasOwn(GUNNER_ART, base) ? (base as GunId) : 'rifle';
}

/** A turret's shots, bullets and flash name it `turret:<id>`. */
const TURRET_OWNER = 'turret:';

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
  reinforced: boolean;
  /** When the latest barrier card was picked. */
  pickedAt: number | undefined;
  /** The game speed shown: the pulse and repair glow last the same real time at any speed. */
  pace: number;
  /** Reduce motion: a repair's sparks stay put instead of floating up. */
  still: boolean;
}
const NO_CARDS: WallCards = {
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
 * damage, a pulse as any barrier card is picked and a green glow as a repair card heals it.
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
 * How a Barbed Wire row with `durability` left of `max` looks (ID-115): torn at 0, worn at
 * `WIRE.worn.at` of `max` or less, whole above. A share, as `max` grows with the card's level.
 */
export function wireLook(durability: number, max: number): WireLook {
  if (durability <= 0) return 'torn';
  return durability <= WIRE.worn.at * max ? 'worn' : 'whole';
}

/**
 * Barbed Wire (ID-077): the band it slows, out in the field in front of the outermost
 * layer, under every sprite: coils of barbed wire on pickets with no tint (ID-090), painted
 * once (ground.ts) and stretched over the band. A row the enemies broke (ID-090) is
 * taken from the torn band instead, and one worn partway from the worn band (ID-115), each
 * run of rows alike in one draw. Where the browser can't paint it, a steel line down each
 * coil of the working rows shows where the slow applies.
 */
function drawWire(ctx: CanvasRenderingContext2D, art: Art, scene: Scene, cam: Camera): void {
  const band = barbedWire({ taken: scene.taken ?? [], layers: scene.layers });
  if (!band) return;
  const a = project({ x: band.from, y: 0 }, cam);
  const b = project({ x: band.to, y: FIELD.height }, cam);
  const cards = { taken: scene.taken ?? [], cardLevels: scene.cardLevels };
  const max = atLevel(cards, 'barbed-wire', CARD.wire.durability);
  const look = (row: number) => wireLook(scene.wire?.[row]?.durability ?? max, max);
  // Runs of rows alike, top to bottom: [first row, end row, look].
  const runs: [number, number, WireLook][] = [];
  for (let row = 0; row < SEGMENTS; row++) {
    const last = runs[runs.length - 1];
    if (last && last[2] === look(row)) last[1] = row + 1;
    else runs.push([row, row + 1, look(row)]);
  }
  const painted = new Map(runs.map(([, , l]) => [l, wireCanvas(art, l)] as const));
  if ([...painted.values()].every((c) => c)) {
    // A seam between runs on a whole pixel, so the two never blend into a hairline.
    const edge = (row: number) =>
      row === 0
        ? a.sy
        : row === SEGMENTS
          ? b.sy
          : Math.round(a.sy + ((b.sy - a.sy) * row) / SEGMENTS);
    for (const [from, to, l] of runs) {
      const src = painted.get(l)!;
      const sh = src.height / SEGMENTS;
      const dy = edge(from);
      ctx.drawImage(
        src,
        0,
        from * sh,
        src.width,
        (to - from) * sh,
        a.sx,
        dy,
        b.sx - a.sx,
        edge(to) - dy,
      );
    }
    return;
  }
  ctx.strokeStyle = WIRE.steel;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [from, to, l] of runs) {
    if (l === 'torn') continue;
    const [y0, y1] = [
      a.sy + ((b.sy - a.sy) * from) / SEGMENTS,
      a.sy + ((b.sy - a.sy) * to) / SEGMENTS,
    ];
    for (const share of WIRE.coils) {
      const x = a.sx + (b.sx - a.sx) * share;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
  }
  ctx.stroke();
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

/**
 * Everything under the scene's sprites that only the camera moves: the sky, the
 * repeating surround, the dusk or the build's dimming, and within the frame (`left`
 * on) the field's ground, the camp's yard (`yard`), the fight's dusk and its shaded top
 * and bottom edges.
 */
function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  art: Art,
  cam: Camera,
  view: View,
  build: boolean,
  left: number,
  yard: (() => void) | null,
): void {
  const dim = (style: string): void => {
    ctx.fillStyle = style;
    ctx.fillRect(0, 0, view.w, view.h);
  };
  ctx.fillStyle = COLOR.sky;
  ctx.fillRect(0, 0, view.w, view.h);
  drawSurround(ctx, art, cam, view);
  // The build scene dims the land round the camp's plot, so the plot reads as the focus;
  // a fight dims it all to dusk (ID-071).
  dim(build ? COLOR.outside : DUSK);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, Math.max(0, view.w - left), view.h);
  ctx.clip();
  drawGround(ctx, art, cam);
  yard?.();
  // In a fight the ground past the field's top and bottom edges is shaded (ID-068), so
  // the wall's ends read as the map's edge, not a way round; sprites still draw over it.
  // The field's rows take the dusk a second time; the ground past them keeps one dusk
  // and the shade, so a window taller than the frame shows dim ground there, not black
  // bands (ID-081). A dark lip fades out from each edge, so the edge still reads.
  if (!build) {
    const top = project({ x: 0, y: 0 }, cam).sy;
    const bottom = project({ x: 0, y: FIELD.height }, cam).sy;
    const lip = project({ x: 0, y: EDGE_LIP.depth }, cam).sy - top;
    ctx.fillStyle = DUSK;
    ctx.fillRect(0, top, view.w, bottom - top);
    ctx.fillStyle = COLOR.outside;
    if (top > 0) ctx.fillRect(0, 0, view.w, top);
    if (bottom < view.h) ctx.fillRect(0, bottom, view.w, view.h - bottom);
    const edge = (at: number, to: number): void => {
      const fade = ctx.createLinearGradient(0, at, 0, to);
      fade.addColorStop(0, EDGE_LIP.color);
      fade.addColorStop(1, EDGE_LIP.clear);
      ctx.fillStyle = fade;
      ctx.fillRect(0, Math.min(at, to), view.w, lip);
    };
    if (top > 0) edge(top, top - lip);
    if (bottom < view.h) edge(bottom, bottom + lip);
  }
  ctx.restore();
}

/**
 * The steady fight frame's backdrop as last painted on an `under` canvas (ID-087), and
 * what for. Painting the full-view surround and ground textures every frame held Chrome
 * near 10 fps in a busy horde on a 2× display.
 */
let painted: { under: CanvasRenderingContext2D; art: Art; key: string } | null = null;

/** Repaints the backdrop on the next frame: call it after resizing the `under` canvas, which clears it. */
export function forgetBackdrop(): void {
  painted = null;
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
  // Found by who fired (`turret:<id>`, as the shot and its sound name it), like its flash.
  const turret = scene.turrets.find((t) => `${TURRET_OWNER}${t.id}` === owner);
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

/** The newest of `owner`'s shots still flashing and how far into `MUZZLE_FLASH` it is, 0…1. */
function flashOf(scene: Scene, owner: string): { at: number; age: number } | null {
  let shot: { at: number; age: number } | null = null;
  for (const k of scene.shots) {
    const a = (scene.time - k.at) / MUZZLE_FLASH;
    if (k.owner === owner && a >= 0 && a < 1 && (shot === null || a < shot.age)) {
      shot = { at: k.at, age: a };
    }
  }
  return shot;
}

/**
 * Whose flash look `owner` fires with (ID-088): a turret's own; a Gunner's primary's, as
 * their sprite holds it (the rifle's for any other gun); anyone else's sidearm, a pistol's.
 */
function flashStyleOf(scene: Scene, owner: string): FlashStyle {
  if (owner.startsWith(TURRET_OWNER)) return FLASH_STYLE.turret;
  const d = scene.defenders.find((s) => s.id === owner);
  const gun = d ? gunIdOf(d) : null;
  return gun ? FLASH_STYLE[gun] : FLASH_STYLE.pistol;
}

/** A seed for one shot's flash from who fired it and when, so a replay draws it the same. */
function flashSeed(owner: string, at: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < owner.length; i++) h = Math.imul(h ^ owner.charCodeAt(i), 0x01000193);
  return (h ^ Math.round(at * 1000)) >>> 0;
}

/** A muzzle flash as drawn on screen (ID-088): see `FLASH`. */
export interface FlashShape {
  /** The barrel end. */
  at: Point;
  /** How bright its flames are now, 0…1, and its glow (fading faster). */
  alpha: number;
  glow: number;
  halo: number;
  /** Each tongue's outer flame and hot centre, as 4-point outlines. */
  flames: Point[][];
  centres: Point[][];
  /** The white-hot dot's radius at the barrel end. */
  core: number;
  edge: string;
}

/**
 * One shot's muzzle flash (design §15, ID-088) at the barrel end `at` on screen, pointing
 * `turn` rad along the shot, `age` into its `MUZZLE_FLASH` (0…1), in `style` and with the
 * look its `seed` rolls. Every size stays at least `EFFECT.min` px on screen.
 */
export function flashShape(
  at: Point,
  turn: number,
  age: number,
  style: FlashStyle,
  seed: number,
  cam: Camera,
): FlashShape {
  const rng = createRng(seed);
  const roll = (spread: number): number => 1 + (rng() * 2 - 1) * spread;
  const rising = age < FLASH.rise;
  const fade = rising ? 0 : (age - FLASH.rise) / (1 - FLASH.rise);
  const grow =
    (rising ? FLASH.from + ((1 - FLASH.from) * age) / FLASH.rise : 1 - FLASH.shrink * fade) *
    roll(FLASH.size);
  const spin = turn + (rng() * 2 - 1) * FLASH.spin;
  const tongue = (off: number, len: number, w: number, share: number, least: number): Point[] => {
    const a = spin + off;
    const [ux, uy, nx, ny] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    const l = Math.max(least * share, sized(len * grow * share, cam));
    const half = sized(w * grow * share, cam) / 2;
    const along = (d: number, side: number): Point => ({
      sx: at.sx + ux * d + nx * side,
      sy: at.sy + uy * d + ny * side,
    });
    return [along(-half * 0.6, 0), along(l * 0.3, half), along(l, 0), along(l * 0.3, -half)];
  };
  const flames: Point[][] = [];
  const centres: Point[][] = [];
  style.tongues.forEach(([off, len, w], i) => {
    const l = len * roll(style.roll ?? FLASH.tongue);
    // The main flame keeps its point even at 0.5× zoom.
    const least = i === 0 ? FLASH.reach : 0;
    flames.push(tongue(off, l, w, 1, least));
    centres.push(tongue(off, l, w, FLASH.hot, least));
  });
  const main = style.tongues[0]?.[2] ?? 0;
  const left = 1 - fade;
  return {
    at,
    alpha: rising ? 1 : left ** 2,
    glow: rising ? 1 : left ** 3,
    halo: sized(style.halo * grow, cam),
    flames,
    centres,
    core: sized(main * FLASH.core * grow, cam),
    edge: style.edge,
  };
}

/** Fills each outline in `shapes` as one path. */
function fillOutlines(ctx: CanvasRenderingContext2D, shapes: readonly Point[][]): void {
  ctx.beginPath();
  for (const s of shapes) {
    s.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
    ctx.closePath();
  }
  ctx.fill();
}

/** A muzzle flash at the barrel end of whoever shoots from `(x, y)`, over `MUZZLE_FLASH`. */
function drawFlash(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  owner: string,
  x: number,
  y: number,
  cam: Camera,
): void {
  const shot = flashOf(scene, owner);
  if (shot === null) return;
  const c = project(muzzleAt(scene, x, y, owner), cam);
  // It points along the shot (its newest bullet; ahead, into the field, with none).
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
  const f = flashShape(
    c,
    turn,
    shot.age,
    flashStyleOf(scene, owner),
    flashSeed(owner, shot.at),
    cam,
  );
  // All of it adds light, so it never covers what's behind it.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = f.glow;
  const halo = ctx.createRadialGradient(f.at.sx, f.at.sy, 0, f.at.sx, f.at.sy, f.halo);
  halo.addColorStop(0, withAlpha(f.edge, FLASH.halo));
  halo.addColorStop(1, withAlpha(f.edge, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(f.at.sx, f.at.sy, f.halo, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = f.alpha * FLASH.edgeAlpha;
  ctx.fillStyle = f.edge;
  fillOutlines(ctx, f.flames);
  ctx.globalAlpha = f.alpha;
  ctx.fillStyle = FLASH.centre;
  fillOutlines(ctx, f.centres);
  ctx.fillStyle = FLASH.white;
  ctx.beginPath();
  ctx.arc(f.at.sx, f.at.sy, f.core, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
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

/** The share of the dust puff's art, from its top, that is cloud (ID-110). */
const DUST_CLOUD = 0.8;

/** A corpse frame cut along one `Cut` (ID-110): the body without the piece, and the piece alone. */
interface Pieces {
  body: Picture;
  piece: Picture;
}

const cutCache = new WeakMap<Picture, Map<Cut, Pieces | null>>();
/**
 * `img` cut along `cut`, made once per image and cut; null where the browser has no
 * `OffscreenCanvas`, and the death that needs it falls back to a plain fall. The cut
 * canvases serve at once and are swapped for plain images once those load: a canvas can
 * draw many times slower than a decoded image, which a crowd of deaths would feel.
 */
function piecesOf(img: Picture, cut: Cut): Pieces | null {
  let byCut = cutCache.get(img);
  if (!byCut) cutCache.set(img, (byCut = new Map()));
  const known = byCut.get(cut);
  if (known !== undefined) return known;
  const paint = (op: 'destination-out' | 'destination-in'): OffscreenCanvas | null => {
    const canvas = new OffscreenCanvas(img.width, img.height);
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = op;
    g.beginPath();
    for (const [x, y] of cut.poly) g.lineTo(x, y);
    g.closePath();
    g.fill();
    return canvas;
  };
  let made: Pieces | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const body = paint('destination-out');
    const piece = paint('destination-in');
    if (body && piece) {
      made = { body, piece };
      const cache = byCut;
      void Promise.all([asImage(body), asImage(piece)]).then(([b, p]) => {
        if (b && p) cache.set(cut, { body: b, piece: p });
      });
    }
  }
  byCut.set(cut, made);
  return made;
}

/** `canvas` as a loaded image (a `data:` URL, which the page's CSP allows), or null if it can't be. */
async function asImage(canvas: OffscreenCanvas): Promise<HTMLImageElement | null> {
  try {
    if (typeof canvas.convertToBlob !== 'function') return null;
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const url = await new Promise<string>((ok, fail) => {
      const reader = new FileReader();
      reader.onload = () => (typeof reader.result === 'string' ? ok(reader.result) : fail());
      reader.onerror = () => fail();
      reader.readAsDataURL(blob);
    });
    const image = new Image();
    await new Promise<void>((ok, fail) => {
      image.onload = () => ok();
      image.onerror = () => fail();
      image.src = url;
    });
    return image;
  } catch {
    return null;
  }
}

/** A cut's bounding box on its sprite: left, top, right, bottom. */
function boxOf(poly: readonly SpritePoint[]): [number, number, number, number] {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Gore `gore` on a dying body posed `pose` (its frame `img`, `height` as `drawStanding`),
 * at the wound `at` (sprite px) facing `turn` (degrees clockwise from up), `scale` sprite
 * px per gore px, see-through `alpha`. With `rising` its bottom sits on the wound (a spray
 * out of it); otherwise its centre does (a stump over it).
 */
function drawOnBody(
  ctx: CanvasRenderingContext2D,
  img: Picture,
  gore: Picture,
  feet: { sx: number; sy: number },
  height: number,
  cam: Camera,
  pose: Readonly<Pose>,
  at: SpritePoint,
  turn: number,
  scale: number,
  alpha: number,
  rising: boolean,
): void {
  const k = (height / ART_PX) * cam.zoom;
  const w = gore.width * scale * k;
  const h = gore.height * scale * k;
  ctx.save();
  ctx.translate(feet.sx + pose.dx * cam.zoom, feet.sy - pose.lift * cam.zoom);
  ctx.rotate(pose.rot);
  ctx.scale(pose.sx, pose.sy);
  ctx.globalAlpha *= pose.alpha * alpha;
  ctx.translate((at[0] - img.width / 2) * k, (at[1] - img.height) * k);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(gore, -w / 2, rising ? -h : -h / 2, w, h);
  ctx.restore();
}

/**
 * Where a thrown limb is drawn (ID-110): it spins about its own middle as it arcs out
 * from the body's side and drops to lie on the ground, as a pose about the body's feet for
 * `drawStanding` (`k` px at zoom 1 per sprite px of `img`, `big` its elite size).
 */
export function limbPose(
  cut: Cut,
  img: Picture,
  k: number,
  big: number,
  since: number,
  body: Readonly<Pose>,
): Pose {
  const { u, spin } = limbFlight(since);
  const [x0, y0, x1, y1] = boxOf(cut.poly);
  const cx = ((x0 + x1) / 2 - img.width / 2) * k;
  const cy = ((y0 + y1) / 2 - img.height) * k;
  // Its middle comes to rest a little over the ground, as high as it lies thick.
  const rest = -0.4 * Math.min(x1 - x0, y1 - y0) * k;
  const tx = cx + Math.sign(cx || 1) * DEATH.limb.throw * u;
  const ty = cy + (rest - cy) * u * u - DEATH.limb.pop * 4 * u * (1 - u);
  const rx = cx * Math.cos(spin) - cy * Math.sin(spin);
  const ry = cx * Math.sin(spin) + cy * Math.cos(spin);
  return {
    ...STILL,
    dx: tx - rx,
    lift: ry - ty,
    rot: spin,
    sx: big,
    sy: big,
    alpha: body.alpha,
    flash: body.flash,
  };
}

/**
 * An enemy `since` s dead (ID-110), in the death the fight's `seed` picked for it, and its
 * body's pose (for its fire). Reduce motion keeps one plain death, with no limbs, spray
 * or dust; a death whose pieces can't be cut falls back to a plain fall.
 */
function drawDeath(
  ctx: CanvasRenderingContext2D,
  art: Art,
  e: Enemy,
  since: number,
  seed: number,
  feet: { sx: number; sy: number },
  cam: Camera,
  anim: Animator,
): Readonly<Pose> {
  const img = art[ENEMY_ART[e.kind].walk[1]];
  let death: Death = anim.reduced ? 'back' : deathOf(seed, e);
  const cut =
    death === 'head' ? CUTS[e.kind]?.head : death === 'limb' ? CUTS[e.kind]?.limb : undefined;
  const pieces = cut ? piecesOf(img, cut) : null;
  // Without its pieces it falls whole; `cut` then goes unused (the `!pieces` check below).
  if (!pieces && (death === 'head' || death === 'limb')) death = 'back';
  const pose = anim.shown(deathPose(death, since));
  const big = e.elite ? ELITE.size : 1;
  const body = { ...pose, sx: pose.sx * big, sy: pose.sy * big };
  const height = STAND.enemy * (ENEMIES[e.kind].radius / ENEMY_RADIUS);
  drawShadow(ctx, feet, pose.alpha, cam, radiusOf(e) / ENEMY_RADIUS);
  if (!cut || !pieces) {
    // The boss's dust rises behind it, so its outline stays clear through the cloud.
    const dust = death === 'boss' ? dustOf(since) : null;
    if (dust) {
      const puff = art[dust.art];
      const k = (height / ART_PX) * big * cam.zoom;
      // The cloud only: the flat streak of ground the art has under it is left off.
      const sh = puff.height * DUST_CLOUD;
      const w = img.width * k * DEATH.boss.dust * dust.grow;
      const h = (w * sh) / puff.width;
      // It rises where the body lands: half its height in front of its feet.
      const x = feet.sx - (img.height * k) / 2;
      ctx.globalAlpha = dust.alpha;
      ctx.drawImage(puff, 0, 0, puff.width, sh, x - w / 2, feet.sy - h * 0.9, w, h);
      ctx.globalAlpha = 1;
    }
    drawStanding(ctx, img, feet, height, cam, body);
    return body;
  }
  drawStanding(ctx, pieces.body, feet, height, cam, body);
  const [x0, y0, x1, y1] = boxOf(cut.poly);
  const stump = art[DEATH.art.stump];
  const stumpScale = (DEATH.stump * Math.min(x1 - x0, y1 - y0)) / stump.width;
  drawOnBody(ctx, img, stump, feet, height, cam, body, cut.at, cut.turn, stumpScale, 1, false);
  if (death === 'limb') {
    const k = (height * big) / ART_PX;
    const flying = limbPose(cut, img, k, big, since, pose);
    drawStanding(ctx, pieces.piece, feet, height, cam, flying);
    // Its own bloody end, so even a small limb reads as one, not debris.
    const end = cut.turn + 180;
    drawOnBody(ctx, img, stump, feet, height, cam, flying, cut.at, end, stumpScale, 1, false);
  } else {
    const spray = sprayOf(since);
    if (spray) {
      const gore = art[spray.art];
      const scale = (DEATH.head.size * (y1 - y0) * spray.grow) / gore.height;
      drawOnBody(
        ctx,
        img,
        gore,
        feet,
        height,
        cam,
        body,
        cut.at,
        cut.turn,
        scale,
        spray.alpha,
        true,
      );
    }
  }
  return body;
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
function enemyBarAt(art: Art, kind: EnemyKind, x: number, y: number, scale = 1) {
  const size = (scale * ENEMIES[kind].radius) / ENEMY_RADIUS;
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

/** How a speech bubble shows (ID-085), or null once it is gone. */
export interface BubbleLook {
  /** Its size against full size, about the tail's point. */
  scale: number;
  alpha: number;
}

/**
 * Speech bubble `b` at chat clock `clock` (real seconds): it grows in and fades out; with
 * reduce motion (`still`) it is simply there for its life.
 */
export function bubbleLook(b: Bubble, clock: number, still: boolean): BubbleLook | null {
  const age = clock - b.at;
  if (!(age >= 0 && age < CHAT.life)) return null;
  if (still) return { scale: 1, alpha: 1 };
  const grown = Math.min(1, age / BUBBLE.grow);
  const left = CHAT.life - age;
  return {
    scale: BUBBLE.from + (1 - BUBBLE.from) * grown,
    alpha: left < BUBBLE.fade ? left / BUBBLE.fade : 1,
  };
}

/**
 * The speaker's name plate (screen px) for bubble `b`, its name `nameW` px wide: where
 * they stood when they spoke, on the floor of their post (or the ground while walking).
 */
export function bubbleTag(
  b: Bubble,
  layers: readonly Layer[],
  posts: readonly Post[],
  cam: Camera,
  nameW: number,
): ScreenBox {
  const post = b.postId === null ? undefined : posts.find((p) => p.id === b.postId);
  const z0 = post ? postFloor(layers, post) : 0;
  const { at, lift } = tagSpot({ x: b.x, y: b.y, plain: b.plain ? true : undefined }, z0, cam);
  const p = project(at, cam);
  const half = nameW / 2 + OFF_FRAME.pad;
  return { x0: p.sx - half, x1: p.sx + half, y0: p.sy - lift - PLATE_H, y1: p.sy - lift };
}

/**
 * Where a `w`×`h` card goes beside its speaker's name plate `tag` (ID-094): level with
 * it, on its right, its tail's point `BUBBLE.gap` px off the plate; on its left when the
 * right has no room in a `viewW` px view. With room on neither side it slides inside
 * the frame (`left`, where a fight's frame starts showing, to the view's right edge) and
 * its tail leans to keep its aim. `x0`/`y0` is the card's top-left corner.
 */
export function bubbleSide(
  tag: ScreenBox,
  w: number,
  h: number,
  viewW: number,
  left = 0,
): { x0: number; y0: number; tipX: number; tipY: number } {
  const { gap, tail, margin } = BUBBLE;
  const tipY = (tag.y0 + tag.y1) / 2;
  const y0 = tipY - h / 2;
  const right = tag.x1 + gap;
  const leftTip = tag.x0 - gap;
  const lo = left + margin;
  const hi = viewW - margin - w;
  if (right + tail <= hi) return { x0: right + tail, y0, tipX: right, tipY };
  if (leftTip - tail - w >= lo) return { x0: leftTip - tail - w, y0, tipX: leftTip, tipY };
  // Room on neither side: as far right as the view allows, never left of the frame.
  return { x0: Math.max(lo, hi), y0, tipX: right, tipY };
}

/**
 * A bubble's line as it shows (ID-094): one line, or wider than `BUBBLE.wrap` px (by
 * `width`) two, split at the space that leaves the wider half narrowest. One word stays whole.
 */
export function bubbleLines(line: string, width: (text: string) => number): string[] {
  if (width(line) <= BUBBLE.wrap) return [line];
  let best: string[] = [line];
  let widest = Infinity;
  for (let i = line.indexOf(' '); i > 0; i = line.indexOf(' ', i + 1)) {
    const two = [line.slice(0, i), line.slice(i + 1)];
    const w = Math.max(width(two[0]!), width(two[1]!));
    if (w < widest) [best, widest] = [two, w];
  }
  return best;
}

/** A bubble's card to place (screen px): its top-left corner, its size and its event's rank. */
export interface BubbleSpot {
  x0: number;
  y0: number;
  w: number;
  h: number;
  rank: number;
}

/** A screen rect: left, right, top, bottom. */
export interface ScreenBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * How far (px) each bubble's card rises over its spot so it never overlaps another's card
 * or a `blocked` box (the survivors' name tags and reload pies). Higher ranks (then
 * earlier ones) keep their spot; the rest rise clear. One pushed past the view's top is
 * `hidden`.
 */
export function bubbleLayout(
  spots: readonly BubbleSpot[],
  blocked: readonly ScreenBox[] = [],
): { lift: number; hidden: boolean }[] {
  const { gap } = BUBBLE;
  const out = spots.map(() => ({ lift: 0, hidden: false }));
  const order = spots.map((_, i) => i).sort((a, b) => spots[b]!.rank - spots[a]!.rank || a - b);
  const placed: ScreenBox[] = [...blocked];
  for (const i of order) {
    const s = spots[i]!;
    const x0 = s.x0;
    const x1 = x0 + s.w;
    let y1 = s.y0 + s.h;
    // Rise past every card it would overlap until it overlaps none.
    for (let moved = true; moved;) {
      moved = false;
      for (const p of placed) {
        if (x0 < p.x1 + gap && x1 > p.x0 - gap && y1 - s.h < p.y1 + gap && y1 > p.y0 - gap) {
          y1 = p.y0 - gap;
          moved = true;
        }
      }
    }
    out[i]!.lift = s.y0 + s.h - y1;
    if (y1 - s.h < BUBBLE.margin) {
      out[i]!.hidden = true;
      continue;
    }
    placed.push({ x0, x1, y0: y1 - s.h, y1 });
  }
  return out;
}

/**
 * Survivors' speech bubbles (ID-085): each line on a pale rounded card beside its
 * speaker's name tag where they stood when they spoke, level with it, its short tail
 * pointing back at the name (ID-094), so every line reads as its speaker's even in a
 * crowded squad. One that would overlap another bubble, a tag or a reload pie rises
 * clear, its tail leaning to keep its aim.
 */
function drawBubbles(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  still: boolean,
  cam: Camera,
  view: View,
  standing: readonly { d: Defender; z0: number }[],
  left: number,
) {
  const chat = scene.chat;
  if (!chat || chat.bubbles.length === 0) return;
  ctx.save();
  ctx.font = MARK.plate;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Each drawn survivor's name plate and the reload pie's spot over it.
  const pie = RELOAD_PIE.gap + 2 * (RELOAD_PIE.r + RELOAD_PIE.edge);
  const tags: ScreenBox[] = standing.map(({ d, z0 }) => {
    const { at, lift } = tagSpot(d, z0, cam);
    const p = project(at, cam);
    const w = ctx.measureText(d.name).width + 2 * OFF_FRAME.pad;
    return { x0: p.sx - w / 2, x1: p.sx + w / 2, y0: p.sy - lift - PLATE_H - pie, y1: p.sy - lift };
  });
  const width = (t: string) => ctx.measureText(t).width;
  const shown = chat.bubbles.flatMap((b) => {
    const look = bubbleLook(b, chat.clock, still);
    if (!look) return [];
    const name = scene.defenders.find((d) => d.id === b.by)?.name ?? '';
    const tag = bubbleTag(b, scene.layers, scene.posts, cam, width(name));
    const lines = bubbleLines(b.line, width);
    const w = Math.max(...lines.map(width)) + 2 * BUBBLE.padX;
    const h = BUBBLE.h + (lines.length - 1) * BUBBLE.lineH;
    return [{ b, look, side: bubbleSide(tag, w, h, view.w, left), lines, w, h }];
  });
  const layout = bubbleLayout(
    shown.map(({ b, side, w, h }) => ({
      x0: side.x0,
      y0: side.y0,
      w,
      h,
      rank: CHAT_RANK[b.event],
    })),
    tags,
  );
  shown.forEach(({ look, side, lines, w, h }, i) => {
    const { lift, hidden } = layout[i]!;
    if (hidden) return;
    const { r, tail } = BUBBLE;
    ctx.save();
    ctx.globalAlpha = look.alpha;
    // About the card's own centre, so a growing card stays inside the spot laid out for it.
    const cx = side.x0 + w / 2;
    const cy = side.y0 - lift + h / 2;
    ctx.translate(cx, cy);
    ctx.scale(look.scale, look.scale);
    // The card, lifted clear, and the tail from its side to the speaker's name (at
    // `(tx, ty)` from here), its base kept clear of the rounded corners.
    const x0 = -w / 2;
    const y0 = -h / 2;
    const tx = side.tipX - cx;
    const ty = side.tipY - cy;
    const edge = tx < 0 ? x0 : x0 + w;
    const half = Math.min(tail, (h - 2 * r) / 2);
    const base = Math.min(y0 + h - r - half, Math.max(y0 + r + half, ty));
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, r);
    ctx.moveTo(edge, base - half);
    ctx.lineTo(tx, ty);
    ctx.lineTo(edge, base + half);
    ctx.fillStyle = COLOR.bubble;
    ctx.strokeStyle = COLOR.bubbleEdge;
    ctx.lineWidth = BUBBLE.edge * 2;
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = COLOR.bubbleText;
    lines.forEach((t, k) => ctx.fillText(t, 0, (k - (lines.length - 1) / 2) * BUBBLE.lineH));
    ctx.restore();
  });
  ctx.restore();
}

/**
 * A Frag Grenade's flight and burst (ID-077): the grenade's arc height and size, in world
 * units; `held`, its smaller size in the thrower's hand through the wind-up (ID-119).
 */
export const GRENADE = { arc: 40, r: 6.5, held: 3.5, edge: 2, shine: 1 } as const;

/**
 * A survivor's Frag Grenade throw (ID-119), in s from the throw: the wind-up shows until
 * `wind`, when the grenade leaves the hand, then the release until `total`. Drawn on fight
 * time only; the grenade still lands when the sim says.
 */
export const THROW = { wind: 0.15, total: 0.4 } as const;
export type ThrowFrame = 'wind' | 'release';

/** Which throw frame `d` shows at `time` (ID-119): their newest Frag Grenade's while it lasts, else null. */
export function throwFrame(
  d: Pick<Defender, 'id'>,
  grenades: readonly Pick<Grenade, 'by' | 'at'>[],
  time: number,
): ThrowFrame | null {
  let newest = -Infinity;
  for (const g of grenades) if (g.by === d.id && g.at <= time && g.at > newest) newest = g.at;
  const t = time - newest;
  if (!(t < THROW.total)) return null;
  return t < THROW.wind ? 'wind' : 'release';
}

/**
 * Where and when a Frag Grenade leaves its thrower (ID-119): `dx` ahead of where they stand
 * and `z` up, at `at`. A Gunner throws from the release sprite's open hand once the wind-up
 * is over; anyone else (or anyone gone, or out of a fight) from their feet, at the throw.
 */
export interface Launch {
  readonly dx: number;
  readonly z: number;
  readonly at: number;
}
export function launchOf(
  scene: Pick<Scene, 'defenders' | 'posts' | 'layers'>,
  g: Grenade,
  posed: boolean,
): Launch {
  const post = scene.posts.find((p) => p.x === g.fromX && p.y === g.fromY);
  const floor = post ? postFloor(scene.layers, post) : 0;
  const d = scene.defenders.find((x) => x.id === g.by);
  if (!posed || !d || !gunOf(d)) return { dx: 0, z: floor, at: g.at };
  const { hand } = THROW_LOOKS[lookOf(d.id)]!;
  const px = STAND.defender / ART_PX;
  return { dx: hand.x * px, z: floor + (hand.y * px) / HEIGHT_SCALE, at: g.at + THROW.wind };
}

/**
 * Where a Frag Grenade in the air is at `time`: from its launch (`from`, by default its
 * thrower's feet at the throw) to where it lands, `GRENADE.arc` over that line at the middle.
 */
export function grenadeAt(
  g: Grenade,
  time: number,
  from: Launch = { dx: 0, z: 0, at: g.at },
): { x: number; y: number; z: number } {
  const p = Math.min(1, Math.max(0, (time - from.at) / (g.lands - from.at)));
  const x0 = g.fromX + from.dx;
  return {
    x: x0 + (g.x - x0) * p,
    y: g.fromY + (g.y - g.fromY) * p,
    z: from.z * (1 - p) + 4 * GRENADE.arc * p * (1 - p),
  };
}

/**
 * Frag Grenades (design §8): in the air, an olive-drab ball with a dark edge on its arc over its own
 * shadow (not yet while still in the thrower's hand, ID-119); landed, its explosion is drawn
 * with the others (`explosions`, ID-107).
 */
function drawGrenade(
  ctx: CanvasRenderingContext2D,
  g: Grenade,
  time: number,
  cam: Camera,
  from: Launch,
): void {
  if (time < from.at) return;
  if (time < g.lands) {
    const at = grenadeAt(g, time, from);
    groundCircle(ctx, at.x, at.y, GRENADE.r, cam);
    ctx.fillStyle = COLOR.shadow;
    ctx.fill();
    drawGrenadeBall(ctx, project(at, cam), cam);
    return;
  }
  // Landed: its explosion is drawn with the others (`explosions`).
}

/**
 * A Frag Grenade's ball centred on screen point `c`, `r` world units round: olive drab, a dark
 * edge, a pale rim, the edge and rim scaled with it.
 */
function drawGrenadeBall(
  ctx: CanvasRenderingContext2D,
  c: { sx: number; sy: number },
  cam: Camera,
  r: number = GRENADE.r,
): void {
  const k = r / GRENADE.r;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, sized(r, cam), 0, Math.PI * 2);
  ctx.fillStyle = COLOR.grenade;
  ctx.fill();
  ctx.strokeStyle = COLOR.grenadeEdge;
  ctx.lineWidth = sized(GRENADE.edge * k, cam);
  ctx.stroke();
  // A pale rim on its upper left, so it reads over the mossy ground.
  const rim = sized(r, cam) - sized(GRENADE.edge * k, cam);
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, rim, Math.PI, Math.PI * 1.5);
  ctx.strokeStyle = COLOR.grenadeShine;
  ctx.lineWidth = sized(GRENADE.shine * k, cam);
  ctx.stroke();
}

/**
 * How wide a fireball stands on screen (ID-107), world units at zoom 1: an Airstrike bomb's,
 * and a Frag Grenade's, the same blast smaller (PM).
 */
export const FIREBALL_WIDTH = { airstrike: 150, frag: 95 } as const;

/**
 * One explosion on screen (ID-107): its kind, where, its fireball width, life share, and
 * its look this frame (`blastLook`), worked out once for both the ground and air layers.
 */
interface Explosion {
  kind: BlastKind;
  x: number;
  y: number;
  width: number;
  u: number;
  look: BlastLook;
}

/**
 * Every explosion going off in `scene` (ID-107), as `cam` sees it (held still with Reduce
 * motion): each Airstrike bomb's and landed Frag Grenade's fireball, each Flashbang's
 * white pop.
 */
function explosions(
  scene: Pick<Scene, 'blasts' | 'grenades' | 'time'>,
  cam: Camera,
  still: boolean,
): Explosion[] {
  const out: Explosion[] = [];
  const add = (
    kind: BlastKind,
    x: number,
    y: number,
    r: number,
    width: number,
    u: number,
    at: number,
  ) => {
    const look = blastLook(kind, x, y, r, u, blastSeed(x, y, at), cam, still);
    if (look) out.push({ kind, x, y, width, u, look });
  };
  for (const b of scene.blasts) {
    const kind = b.skill === 'flashbang' ? 'white' : 'fire';
    const u = (scene.time - b.at) / SKILL_FLASH;
    add(kind, b.x, b.y, SKILLS[b.skill].radius, FIREBALL_WIDTH.airstrike, u, b.at);
  }
  for (const g of scene.grenades) {
    if (scene.time < g.lands) continue;
    const u = (scene.time - g.lands) / CARD.frag.flash;
    add('fire', g.x, g.y, CARD.frag.radius, FIREBALL_WIDTH.frag, u, g.lands);
  }
  return out;
}

/** Explosions' ground layer (ID-107): scorch, dust and shockwave, under every sprite. */
function drawBlastGround(
  ctx: CanvasRenderingContext2D,
  art: Art,
  all: readonly Explosion[],
  cam: Camera,
): void {
  for (const { look, x, y } of all) {
    if (look.scorch && look.scorch.alpha > 0) {
      ctx.globalAlpha = look.scorch.alpha;
      groundArt(ctx, art[SCORCH_ART], x, y, look.scorch.r, cam);
      ctx.globalAlpha = 1;
    }
    if (look.ring) paintRing(ctx, look.ring);
  }
}

/**
 * Explosions' air layer (ID-107), over every sprite: a fireball's flip-book frames standing
 * on its spot (each frame at its own size in the set, the fireball `width` across), a
 * flashbang's white pop.
 */
function drawBlastAir(
  ctx: CanvasRenderingContext2D,
  art: Art,
  all: readonly Explosion[],
  cam: Camera,
  still: boolean,
): void {
  for (const e of all) {
    if (e.kind === 'white') {
      paintDiscs(ctx, e.look.air, BLAST.white.flash[1]);
      continue;
    }
    const base = art[FIREBALL.art.ball];
    const c = project({ x: e.x, y: e.y }, cam);
    for (const f of fireFrames(e.u, still)) {
      if (f.alpha <= 0) continue;
      const img = art[f.art];
      // The smoke takes over at the fireball's width, so the two read as one blast.
      const fit = f.art === FIREBALL.art.smoke ? base.width / img.width : 1;
      const k = (e.width * cam.zoom * f.grow * fit) / base.width;
      const [w, h] = [img.width * k, img.height * k];
      ctx.globalAlpha = Math.min(1, f.alpha);
      // Standing on its spot, its base a little in front so it sits on the ground.
      const foot = c.sy + h * 0.04 - f.rise * e.width * cam.zoom;
      ctx.drawImage(img, c.sx - w / 2, foot - h, w, h);
    }
    ctx.globalAlpha = 1;
  }
}

/** Draws thrown burst `i` `fall` of the way down (`thrownFall`): spinning as it drops. */
function drawThrown(
  ctx: CanvasRenderingContext2D,
  art: Art,
  i: Incoming,
  fall: number,
  time: number,
  cam: Camera,
): void {
  // It speeds up as it falls.
  const c = project(fallAt(i, fall), cam);
  const size = sized(THROWN.size, cam);
  ctx.save();
  ctx.translate(c.sx, c.sy);
  if (i.skill === 'airstrike') {
    // A bomb points its nose along its path on screen: near level as it leaves the plane,
    // steep as it lands. The art lies at 45°, nose to the upper right.
    const ahead = project(fallAt(i, Math.min(1, fall + 0.02)), cam);
    const back = project(fallAt(i, Math.max(0, fall - 0.02)), cam);
    ctx.rotate(Math.atan2(ahead.sy - back.sy, ahead.sx - back.sx) + Math.PI / 4);
    const img = art[BOMB_ART];
    const h = sized(THROWN.bomb, cam);
    const w = (img.width / img.height) * h;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.rotate((time + i.x) * THROWN.spin * Math.PI * 2);
  if (i.skill === 'molotov') {
    const img = art[SKILL_ICON.molotov];
    const h = size;
    const w = (img.width / img.height) * h;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    // A stun grenade: a short grey canister with a pale shine down one side.
    const [w, h] = [size * 0.45, size * 0.8];
    ctx.fillStyle = THROWN.can;
    ctx.strokeStyle = THROWN.canEdge;
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = THROWN.canShine;
    ctx.fillRect(-w * 0.28, -h * 0.35, w * 0.16, h * 0.7);
    ctx.fillStyle = THROWN.canEdge;
    ctx.fillRect(-w * 0.15, -h / 2 - h * 0.15, w * 0.3, h * 0.15);
  }
  ctx.restore();
}

/**
 * A flashbang's daze (ID-107): `count` stars circle a dazed enemy's head, `spin` turns a
 * second, on a flat ring `rx` × `rx · ry` round a spot `drop` under its HP bar; sizes are
 * at zoom 1, never under `min` px, so they read zoomed out and in a crowd. Pale yellow
 * with a dark edge; the ring's far stars drawn smaller and dimmer.
 */
export const STARS = {
  count: 4,
  spin: 0.7,
  rx: 15,
  ry: 0.35,
  r: 5,
  drop: 6,
  min: { rx: 10, r: 3.5 },
  fill: '#ffe14d',
  edge: '#3a2c00',
} as const;

/** Draws the ring of stars over dazed enemy `e`, whose HP bar sits at `bar`. */
function drawStars(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  bar: { x: number; y: number; z: number },
  clock: number,
  cam: Camera,
): void {
  const c = project({ x: bar.x, y: bar.y, z: bar.z }, cam);
  const big = e.elite ? ELITE.size : 1;
  const rx = Math.max(STARS.min.rx, STARS.rx * big * cam.zoom);
  const cy = c.sy + Math.max(STARS.min.r, STARS.drop * cam.zoom);
  const r0 = Math.max(STARS.min.r, STARS.r * cam.zoom);
  ctx.lineWidth = Math.max(1, r0 * 0.3);
  ctx.strokeStyle = STARS.edge;
  ctx.fillStyle = STARS.fill;
  for (let k = 0; k < STARS.count; k++) {
    const a = (clock * STARS.spin + k / STARS.count + e.id * 0.13) * Math.PI * 2;
    // Nearer the camera (sin > 0) is bigger and brighter.
    const near = (1 + Math.sin(a)) / 2;
    const r = r0 * (0.75 + 0.25 * near);
    ctx.globalAlpha = 0.65 + 0.35 * near;
    starPath(ctx, c.sx + Math.cos(a) * rx, cy + Math.sin(a) * rx * STARS.ry, r);
    ctx.stroke();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Starts a path round a five-point star of outer radius `r` centred on `(x, y)`. */
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
}

/**
 * A burning enemy's fire (Incendiary Rounds, design §8; ID-089). Sizes are shares of the
 * enemy's body height on screen (at least `squat` × its width, so a low Crawler's fire
 * still shows); times are fight seconds.
 *
 * - Catching fire (or again while still dying down) it flares up: × 1 + `boost` at first,
 *   easing back over `flare`. When the burn ends it shrinks and fades over `out`.
 * - `licks` flames (`per` × (1 + size), `min`…`max`) sit across the middle `body` share of
 *   its width, `low`…`low + span` up its body. Each shoots up and dies away on its own
 *   cycle (`period` × 0.7…1.3), curling by `curl` with a shared `wind`, and moves to a new
 *   spot each cycle. Each is drawn in `layers` (colour, size, alpha): a red edge, an
 *   orange flame, a pale hot centre.
 * - A soft `glow` on the body, `embers` rising off it, and two puffs of light `smoke`
 *   over its head.
 *
 * All of it but the smoke adds light (`lighter`), so the sprite always shows through: the
 * hot layers stay dim enough that a big body (a Brute, the Horror) keeps its colour. Like
 * the muzzle flash (ID-088) it has an edge colour, a pale centre and a halo, but no
 * white-hot core: a fire lasts seconds, and a white core that long would wash the body out.
 * Every flame's spot, size and timing comes from the enemy's id, so a replay matches.
 */
export const BURN = {
  flare: 0.3,
  boost: 0.45,
  out: 0.5,
  squat: 0.75,
  licks: { per: 3, min: 4, max: 8 },
  body: 0.3,
  low: 0.18,
  span: 0.42,
  lick: { h: 0.4, w: 0.2, least: 2, period: 0.6, curl: 0.35, wind: 0.35 },
  layers: [
    ['#d8381a', 1, 0.45],
    [COLOR.flame, 0.72, 0.55],
    ['#fff2b0', 0.42, 0.45],
  ],
  glow: { at: 0.45, r: 0.7, alpha: 0.3, colour: '#ff9a3c' },
  embers: { period: 0.9, rise: 0.7, drift: 0.06, r: 0.028, least: 0.8, alpha: 0.9 },
  ember: '#ffd84a',
  smoke: { puffs: 2, at: 0.85, period: 1.4, rise: 0.6, drift: 0.1, r: 0.22, alpha: 0.22 },
  smokeColour: '#5a5650',
} as const;

/**
 * How strongly an enemy burns at `time` (ID-089): 0 out, 1 alight, over 1 in the flare-up
 * after it caught fire at `litAt` (−∞ when unknown: no flare), falling to 0 over
 * `BURN.out` once its burn ends.
 */
export function burnHeat(time: number, e: { burnUntil?: number }, litAt: number): number {
  const until = e.burnUntil ?? 0;
  if (until <= 0) return 0;
  const left = time < until ? 1 : 1 - (time - until) / BURN.out;
  if (left <= 0) return 0;
  const since = Math.max(0, time - litAt);
  const flare = since < BURN.flare ? 1 + BURN.boost * (1 - since / BURN.flare) ** 2 : 1;
  return flare * left;
}

/** One flame: its base on screen, width, height and how far its tip curls aside. */
export interface Lick {
  x: number;
  y: number;
  w: number;
  h: number;
  curl: number;
}

/**
 * A burning enemy's fire as drawn on screen (ID-089): see `BURN`. Its flames are drawn
 * once per layer, each `share` of their size.
 */
export interface FireLook {
  glow: { x: number; y: number; r: number; alpha: number };
  licks: Lick[];
  layers: { colour: string; share: number; alpha: number }[];
  embers: { x: number; y: number; r: number }[];
  emberAlpha: number;
  smoke: { x: number; y: number; r: number; alpha: number }[];
}

/**
 * Which roll `fireRoll` makes: fixed ones are negative; one a flame makes afresh each
 * cycle is `cycle × ROLLS + its slot`, so no two rolls ever share a key.
 */
const ROLL = {
  period: -1,
  start: -2,
  width: -3,
  emberPeriod: -4,
  emberStart: -5,
  smokePeriod: -6,
  smokeStart: -7,
} as const;
/** Per cycle: a flame's spot across, spot up and height; an ember's spot across. */
const ROLLS = 4;

/** A number in [0, 1) from an enemy's id and two indices: the same every replay. */
function fireRoll(id: number, i: number, j: number): number {
  let h =
    Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(i + 7, 0x85ebca6b) ^ Math.imul(j + 3, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Enemy `id`'s fire at `heat` (`burnHeat`, already × its fade), on a body `h` × `w` screen
 * px standing at `feet` in `pose`, its flames `clock` fight seconds into their cycles. The
 * flames sit on the body as it moves (bob, flinch, fall) but always rise straight up.
 */
export function fireLook(
  id: number,
  size: number,
  body: { h: number; w: number },
  feet: Point,
  pose: Readonly<Pose>,
  heat: number,
  clock: number,
  cam: Camera,
): FireLook {
  const H = Math.max(body.h, body.w * BURN.squat);
  const grow = Math.min(1 + BURN.boost, heat);
  const fade = Math.min(1, heat);
  const [cos, sin] = [Math.cos(pose.rot), Math.sin(pose.rot)];
  const ox = feet.sx + pose.dx * cam.zoom;
  const oy = feet.sy - pose.lift * cam.zoom;
  // A spot on the body, `lx` px across and `ly` px down from its feet, moved with it.
  const at = (lx: number, ly: number): { x: number; y: number } => {
    const [x, y] = [lx * pose.sx, ly * pose.sy];
    return { x: ox + x * cos - y * sin, y: oy + x * sin + y * cos };
  };
  const { per, min, max } = BURN.licks;
  const n = Math.max(min, Math.min(max, Math.round(per * (1 + size))));
  const across = body.w * BURN.body * 2;
  const wind = Math.sin(clock * 1.7 + id) * BURN.lick.wind;
  const licks: Lick[] = [];
  for (let i = 0; i < n; i++) {
    const period = BURN.lick.period * (0.7 + 0.6 * fireRoll(id, i, ROLL.period));
    const cycle = clock / period + fireRoll(id, i, ROLL.start);
    const u = cycle - Math.floor(cycle);
    const round = Math.floor(cycle) * ROLLS;
    const lx = (-0.5 + (i + 0.5 + 0.8 * (fireRoll(id, i, round) - 0.5)) / n) * across;
    const ly = -H * (BURN.low + BURN.span * fireRoll(id, i, round + 1));
    const base = at(lx, ly);
    // It shoots up fast, then thins and shrinks away.
    const life = u < 0.3 ? u / 0.3 : 1 - ((u - 0.3) / 0.7) ** 1.5;
    const h = H * BURN.lick.h * (0.55 + 0.7 * fireRoll(id, i, round + 2)) * life * grow;
    // Wide enough that neighbours merge into one sheet of fire.
    const w = Math.max(
      BURN.lick.least,
      H * BURN.lick.w * (1 + 0.5 * fireRoll(id, i, ROLL.width)) * grow * (0.5 + 0.5 * life),
    );
    const sway = Math.sin((clock / period) * Math.PI * 2 + i * 1.9) * BURN.lick.curl;
    licks.push({ x: base.x, y: base.y, w, h, curl: (sway + wind) * h * 0.5 });
  }
  const layers = BURN.layers.map(([colour, share, alpha]) => ({
    colour,
    share,
    alpha: alpha * fade,
  }));
  const embers: FireLook['embers'] = [];
  for (let i = 0; i < n - 1; i++) {
    const e = BURN.embers;
    const cycle =
      clock / (e.period * (0.8 + 0.4 * fireRoll(id, i, ROLL.emberPeriod))) +
      fireRoll(id, i, ROLL.emberStart);
    const u = cycle - Math.floor(cycle);
    const spot = fireRoll(id, i, Math.floor(cycle) * ROLLS + 3);
    const q = at((spot - 0.5) * across, -H * 0.5);
    embers.push({
      x: q.x + Math.sin(u * 6 + i) * H * e.drift,
      y: q.y - u * H * e.rise,
      r: Math.max(e.least, H * e.r * (1 - u)),
    });
  }
  const smoke: FireLook['smoke'] = [];
  for (let i = 0; i < BURN.smoke.puffs; i++) {
    const s = BURN.smoke;
    const cycle =
      clock / (s.period * (0.85 + 0.3 * fireRoll(id, i, ROLL.smokePeriod))) +
      fireRoll(id, i, ROLL.smokeStart);
    const u = cycle - Math.floor(cycle);
    const q = at(0, -H * s.at);
    smoke.push({
      x: q.x + Math.sin(u * 3 + id) * H * s.drift,
      y: q.y - u * H * s.rise,
      r: H * s.r * (0.4 + 0.6 * u),
      alpha: s.alpha * fade * Math.sin(Math.PI * u),
    });
  }
  const c = at(0, -H * BURN.glow.at);
  return {
    glow: { ...c, r: H * BURN.glow.r * grow, alpha: BURN.glow.alpha * fade },
    licks,
    layers,
    embers,
    emberAlpha: BURN.embers.alpha * fade,
    smoke,
  };
}

/**
 * A molotov fire (ID-107). Its scorch (`SCORCH_ART`) lies flat on the ground under
 * every sprite, across `scorch` × its radius at `scorchAlpha`, darkening in over `in` s and
 * fading over the fire's last `out` s. Over it burn `licks` upright flames (`BURN`'s shape
 * and colours), spread over the fire's circle on the ground: each shoots up to `lick.h` ×
 * the radius on screen and dies away on its own cycle (`lick.period` × 0.7…1.3), moving to
 * a new spot each cycle, the fire flaring by `BURN.boost` as it catches and shrinking as it
 * dies. A ground `glow`, `embers` rising and `smoke` puffs above. Spots and timings come
 * from where the fire lies, so a replay matches.
 */
export const MOLOTOV_FIRE = {
  in: 0.15,
  out: 0.5,
  scorch: 1.15,
  scorchAlpha: 0.8,
  licks: 13,
  lick: { h: 0.95, w: 0.3, period: 0.75, curl: 0.3, least: 2 },
  glow: { r: 1.2, alpha: 0.35 },
  embers: 7,
  ember: { rise: 1.2, r: 0.04, period: 1.1 },
  smoke: { puffs: 3, at: 0.9, rise: 0.9, r: 0.35, alpha: 0.2, period: 1.6 },
} as const;

/** How far a molotov fire is lit at `time`: 0 to 1 as it lights, 1, then down to 0 as it dies. */
export function molotovFade(time: number, f: Pick<Fire, 'at' | 'until'>): number {
  const fade = Math.min((time - f.at) / MOLOTOV_FIRE.in, (f.until - time) / MOLOTOV_FIRE.out, 1);
  return Math.max(0, fade);
}

/** How strongly a molotov fire's flames burn at `time`: its fade, over 1 in the flare as it catches. */
export function molotovHeat(time: number, f: Pick<Fire, 'at' | 'until'>): number {
  const since = time - f.at;
  const flare = since < BURN.flare ? 1 + BURN.boost * (1 - since / BURN.flare) ** 2 : 1;
  return molotovFade(time, f) * flare;
}

/**
 * Molotov fire `f`'s flames at `time` (see `MOLOTOV_FIRE`), as a `FireLook` for
 * `paintFire`; null once it is out. `clock` runs its flames (0 holds them still).
 */
export function molotovLook(
  f: Pick<Fire, 'x' | 'y' | 'at' | 'until'>,
  time: number,
  clock: number,
  cam: Camera,
): FireLook | null {
  const heat = molotovHeat(time, f);
  if (heat <= 0) return null;
  const M = MOLOTOV_FIRE;
  const id = Math.round(f.x * 7 + f.y * 13);
  const R = SKILLS.molotov.radius;
  const H = R * cam.zoom;
  const grow = Math.min(1 + BURN.boost, heat);
  const fade = Math.min(1, heat);
  // A spot on the fire's ground circle from two rolls, on screen.
  const spot = (a: number, b: number, share = 0.85) => {
    const d = R * share * Math.sqrt(a);
    const t = 2 * Math.PI * b;
    return project({ x: f.x + d * Math.cos(t), y: f.y + d * Math.sin(t) }, cam);
  };
  const licks: Lick[] = [];
  for (let i = 0; i < M.licks; i++) {
    const period = M.lick.period * (0.7 + 0.6 * fireRoll(id, i, ROLL.period));
    const cycle = clock / period + fireRoll(id, i, ROLL.start);
    const u = cycle - Math.floor(cycle);
    const round = Math.floor(cycle) * ROLLS;
    const base = spot(fireRoll(id, i, round), fireRoll(id, i, round + 1));
    const life = u < 0.3 ? u / 0.3 : 1 - ((u - 0.3) / 0.7) ** 1.5;
    // Those near the middle burn taller.
    const h = H * M.lick.h * (0.5 + 0.7 * fireRoll(id, i, round + 2)) * life * grow;
    const w = Math.max(
      M.lick.least,
      H * M.lick.w * (1 + 0.5 * fireRoll(id, i, ROLL.width)) * grow * (0.5 + 0.5 * life),
    );
    const sway = Math.sin((clock / period) * Math.PI * 2 + i * 1.9) * M.lick.curl;
    licks.push({ x: base.sx, y: base.sy, w, h, curl: sway * h * 0.5 });
  }
  // The nearer flames drawn last, over those behind.
  licks.sort((a, b) => a.y - b.y);
  const embers: FireLook['embers'] = [];
  for (let i = 0; i < M.embers; i++) {
    const cycle =
      clock / (M.ember.period * (0.8 + 0.4 * fireRoll(id, i, ROLL.emberPeriod))) +
      fireRoll(id, i, ROLL.emberStart);
    const u = cycle - Math.floor(cycle);
    const round = Math.floor(cycle) * ROLLS;
    const q = spot(fireRoll(id, i, round + 3), fireRoll(id, i, round + 2), 0.7);
    embers.push({
      x: q.sx + Math.sin(u * 6 + i) * H * 0.08,
      y: q.sy - u * H * M.ember.rise,
      r: Math.max(0.8, H * M.ember.r * (1 - u)),
    });
  }
  const smoke: FireLook['smoke'] = [];
  const c = project({ x: f.x, y: f.y }, cam);
  for (let i = 0; i < M.smoke.puffs; i++) {
    const s = M.smoke;
    const cycle =
      clock / (s.period * (0.85 + 0.3 * fireRoll(id, i, ROLL.smokePeriod))) +
      fireRoll(id, i, ROLL.smokeStart);
    const u = cycle - Math.floor(cycle);
    smoke.push({
      x: c.sx + (fireRoll(id, i, ROLL.smokeStart) - 0.5) * H * 0.8 + Math.sin(u * 3 + id) * H * 0.1,
      y: c.sy - H * s.at - u * H * s.rise,
      r: H * s.r * (0.4 + 0.6 * u),
      alpha: s.alpha * fade * Math.sin(Math.PI * u),
    });
  }
  return {
    glow: { x: c.sx, y: c.sy - H * 0.2, r: H * M.glow.r * grow, alpha: M.glow.alpha * fade },
    licks,
    layers: BURN.layers.map(([colour, share, alpha]) => ({ colour, share, alpha: alpha * fade })),
    embers,
    emberAlpha: BURN.embers.alpha * fade,
    smoke,
  };
}

/**
 * Fills each flame in `licks`, `share` of its size, as one path: an S-curved tongue on a
 * round base.
 */
function fillLicks(ctx: CanvasRenderingContext2D, licks: readonly Lick[], share: number): void {
  ctx.beginPath();
  for (const k of licks) {
    const [w, h, curl] = [k.w * share, k.h * share, k.curl * share];
    const [tx, ty] = [k.x + curl, k.y - h];
    ctx.moveTo(k.x - w / 2, k.y);
    ctx.bezierCurveTo(
      k.x - w * 0.7,
      k.y - h * 0.4,
      tx - curl * 0.9 - w * 0.2,
      k.y - h * 0.7,
      tx,
      ty,
    );
    ctx.bezierCurveTo(
      tx - curl * 0.7 + w * 0.25,
      k.y - h * 0.65,
      k.x + w * 0.7,
      k.y - h * 0.35,
      k.x + w / 2,
      k.y,
    );
    ctx.arc(k.x, k.y, w / 2, 0, Math.PI);
  }
  ctx.fill();
}

/**
 * Shock Rounds' cue (ID-097; art ID-120): a paralysed enemy twitches side to side by `dx` px
 * (at zoom 1) and `rot` radians, flipping every `every` s, while electricity crackles over
 * its body: `crackles` of the `art` (forked bolts; one on a body under `smallBody` px tall),
 * each `size` of the body's height (at least `BURN.squat` of its width, as for fire), the
 * smallest frame never under `least` px (`burningLeast` on a burning body, so the flames
 * don't swamp it), at spots on its torso that jump every `every` s, each turned and
 * mirrored at random, over a cool `glow` of radius `glowR` of its height at `glowAlpha`,
 * flickering by `glowFlicker`. No arcs between enemies. With Reduce motion it holds still.
 */
export const SHOCK = {
  dx: 1.5,
  rot: 0.05,
  every: 0.06,
  art: ['shock-a', 'shock-b', 'shock-c'] as const satisfies readonly ArtId[],
  crackles: 2,
  smallBody: 24,
  size: 0.5,
  least: 12,
  burningLeast: 16,
  glow: '#5ab4ff',
  glowR: 0.55,
  glowAlpha: 0.4,
  glowFlicker: 0.3,
} as const;

/** `pose` with a shocked twitch at `clock` (0 holds it still, as with Reduce motion). */
export function twitch(pose: Readonly<Pose>, id: number, clock: number): Pose {
  if (clock === 0) return { ...pose };
  const side = (Math.floor(clock / SHOCK.every) + id) % 2 === 0 ? 1 : -1;
  return { ...pose, dx: pose.dx + side * SHOCK.dx, rot: pose.rot + side * SHOCK.rot };
}

/**
 * The crackle of a shocked enemy (`SHOCK`) over its body, `kind` at `feet` in `pose`,
 * `burning` or not.
 */
function drawShock(
  ctx: CanvasRenderingContext2D,
  art: Art,
  id: number,
  kind: EnemyKind,
  feet: Point,
  pose: Readonly<Pose>,
  clock: number,
  cam: Camera,
  burning: boolean,
): void {
  const size = ENEMIES[kind].radius / ENEMY_RADIUS;
  const img = art[ENEMY_ART[kind].walk[1]];
  const h = ((STAND.enemy * size * img.height) / ART_PX) * cam.zoom;
  const w = (img.width / img.height) * h;
  // Spots on the torso that jump each flicker; seeded by the enemy and the flicker.
  const tick = Math.floor(clock / SHOCK.every);
  const r = (n: number): number => {
    const x = Math.sin((id * 12.9898 + tick * 78.233 + n * 37.719) * 0.5) * 43758.5453;
    return x - Math.floor(x);
  };
  const mx = feet.sx + pose.dx * cam.zoom;
  const my = feet.sy - pose.lift * cam.zoom - h * 0.55;
  // Sized like a fire: a low, wide Crawler counts as at least `squat` of its width tall.
  const H = Math.max(h, w * BURN.squat);
  ctx.save();
  // A cool glow over the body, flickering a little (steady with Reduce motion).
  const gr = SHOCK.glowR * H;
  const glow = ctx.createRadialGradient(mx, my, 0, mx, my, gr);
  const flick = clock === 0 ? 1 : 1 - SHOCK.glowFlicker * r(0);
  glow.addColorStop(0, withAlpha(SHOCK.glow, SHOCK.glowAlpha * flick));
  glow.addColorStop(1, withAlpha(SHOCK.glow, 0));
  ctx.globalAlpha = pose.alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(mx, my, gr, 0, Math.PI * 2);
  ctx.fill();
  // The crackles keep their dark outline, so they read on pale bodies and over fire too.
  ctx.globalCompositeOperation = 'source-over';
  // One art group: every frame shares one scale, set by its biggest, with even the
  // smallest at least `least` px.
  const sides = SHOCK.art.map((a) => Math.max(art[a].width, art[a].height));
  const least = burning ? SHOCK.burningLeast : SHOCK.least;
  const scale = Math.max(least / Math.min(...sides), (SHOCK.size * H) / Math.max(...sides));
  // A small body on screen gets one, so the crackles never bury it.
  const crackles = H < SHOCK.smallBody ? 1 : SHOCK.crackles;
  for (let k = 0; k < crackles; k++) {
    const n = 1 + k * 5;
    const crackle = art[SHOCK.art[Math.floor(r(n) * SHOCK.art.length) % SHOCK.art.length]!];
    const [iw, ih] = [crackle.width * scale, crackle.height * scale];
    ctx.save();
    ctx.translate(mx + (r(n + 1) - 0.5) * w * 0.45, my + (r(n + 2) - 0.5) * h * 0.4);
    ctx.rotate(r(n + 3) * Math.PI * 2);
    if (r(n + 4) < 0.5) ctx.scale(-1, 1);
    ctx.drawImage(crackle, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * A burning enemy's fire (ID-089) over its sprite, `kind`'s body at `feet` in `pose`,
 * `heat` strong (see `burnHeat`), its flames `clock` s into their cycles (held at 0 with
 * Reduce motion, so they hold still).
 */
function drawBurn(
  ctx: CanvasRenderingContext2D,
  art: Art,
  id: number,
  kind: EnemyKind,
  feet: Point,
  pose: Readonly<Pose>,
  heat: number,
  clock: number,
  cam: Camera,
): void {
  const k = heat * pose.alpha;
  if (k <= 0) return;
  const size = ENEMIES[kind].radius / ENEMY_RADIUS;
  // Its frames share one height, so the walk's passing frame sizes every one.
  const img = art[ENEMY_ART[kind].walk[1]];
  const h = ((STAND.enemy * size * img.height) / ART_PX) * cam.zoom;
  paintFire(
    ctx,
    fireLook(id, size, { h, w: (img.width / img.height) * h }, feet, pose, k, clock, cam),
  );
}

/** Paints a fire (ID-089, ID-107): its glow, its flames layer by layer, embers, then smoke. */
function paintFire(ctx: CanvasRenderingContext2D, f: FireLook): void {
  ctx.globalCompositeOperation = 'lighter';
  const g = f.glow;
  const halo = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
  halo.addColorStop(0, withAlpha(BURN.glow.colour, g.alpha));
  halo.addColorStop(1, withAlpha(BURN.glow.colour, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
  ctx.fill();
  for (const layer of f.layers) {
    ctx.globalAlpha = layer.alpha;
    ctx.fillStyle = layer.colour;
    fillLicks(ctx, f.licks, layer.share);
  }
  ctx.globalAlpha = f.emberAlpha;
  ctx.fillStyle = BURN.ember;
  ctx.beginPath();
  for (const e of f.embers) {
    ctx.moveTo(e.x + e.r, e.y);
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  }
  ctx.fill();
  // The smoke darkens a touch instead; at its faint alpha it never hides the sprite.
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = BURN.smokeColour;
  for (const s of f.smoke) {
    ctx.globalAlpha = s.alpha;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Each timed boss skill's wind-up glow (ID-099): read at a glance, apart from fire's orange. */
const WIND_COLOUR: Readonly<Record<BossSkill, string>> = {
  brood: '#8fd14f',
  charge: '#e8473c',
  roar: '#ffb020',
  slab: '#dfe6ee',
  regen: '#8fd14f',
  plates: '#dfe6ee',
};
/** Boss cue looks (ID-099): px at zoom 1; `lean` radians back, `swell` share taller at full wind-up. */
const BOSS_LOOK = {
  lean: 0.14,
  swell: 0.1,
  roar: 'rgba(255, 176, 32, 0.55)',
  plate: '#4c535a',
  plateLight: '#b8c0c7',
  plateEdge: '#1e2226',
  slab: '#8f897e',
  slabEdge: '#3f3a33',
  slabSize: { w: 36, h: 24 },
  slabArc: 120,
  dust: 'rgba(185, 178, 166, 0.6)',
} as const;

/** The skill `e` winds up and how far along, 0…1 (ID-099); null when none. */
function windCue(
  scene: Pick<HordeState, 'time'>,
  e: Enemy,
): { skill: BossSkill; k: number } | null {
  const skill = windingUp(scene, e);
  const at = skill === null ? undefined : e.horror?.next[skill];
  if (skill === null || at === undefined) return null;
  return { skill, k: Math.min(1, Math.max(0, 1 - (at - scene.time) / BOSS_SKILL.windUp)) };
}

/** A boss's body (ID-099): a mini-boss drawn `ELITE.size` big; a wind-up leans it back and swells it. */
function bossPose(pose: Readonly<Pose>, e: Enemy, wind: { k: number } | null): Readonly<Pose> {
  const big = e.elite ? ELITE.size : 1;
  const k = wind?.k ?? 0;
  if (big === 1 && k === 0) return pose;
  return {
    ...pose,
    rot: pose.rot + BOSS_LOOK.lean * k,
    sx: pose.sx * big * (1 + (BOSS_LOOK.swell / 2) * k),
    sy: pose.sy * big * (1 + BOSS_LOOK.swell * k),
  };
}

/** A wind-up's glow (ID-099): the skill's colour swelling round the body as it nears. */
function drawWindUp(
  ctx: CanvasRenderingContext2D,
  wind: { skill: BossSkill; k: number },
  feet: Point,
  size: number,
  clock: number,
  cam: Camera,
): void {
  const r = ENEMY.shadow * size * (1.6 + 0.8 * wind.k) * cam.zoom;
  const cy = feet.sy - r * 1.3;
  const pulse = 0.85 + 0.15 * Math.sin(clock * 18);
  const glow = ctx.createRadialGradient(feet.sx, cy, 0, feet.sx, cy, r);
  glow.addColorStop(0, withAlpha(WIND_COLOUR[wind.skill], (0.35 + 0.55 * wind.k) * pulse));
  glow.addColorStop(1, withAlpha(WIND_COLOUR[wind.skill], 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(feet.sx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A roared enemy (ID-099): an amber ring on the ground under it. */
function drawRoared(ctx: CanvasRenderingContext2D, e: Enemy, cam: Camera): void {
  groundCircle(ctx, e.x, e.y, radiusOf(e) * 1.3, cam);
  ctx.strokeStyle = BOSS_LOOK.roar;
  ctx.lineWidth = Math.max(1.5, 2.5 * cam.zoom);
  ctx.stroke();
}

/**
 * Armour plates (ID-099) until they break: riveted gunmetal shingles over its back and
 * shoulder and one on its chest. `PLATES`: each plate's centre (shares of the sprite's
 * width from its middle, of its height from the feet), size and tilt.
 */
const PLATES: readonly { x: number; y: number; w: number; h: number; rot: number }[] = [
  { x: 0.0, y: 0.8, w: 0.26, h: 0.14, rot: -0.25 },
  { x: 0.12, y: 0.76, w: 0.22, h: 0.14, rot: 0.35 },
  { x: 0.16, y: 0.6, w: 0.13, h: 0.17, rot: 0.15 },
  { x: -0.1, y: 0.58, w: 0.18, h: 0.15, rot: -0.1 },
];
function drawPlates(
  ctx: CanvasRenderingContext2D,
  art: Art,
  kind: EnemyKind,
  feet: Point,
  pose: Readonly<Pose>,
  cam: Camera,
): void {
  const size = ENEMIES[kind].radius / ENEMY_RADIUS;
  const img = art[ENEMY_ART[kind].walk[1]];
  const h = ((STAND.enemy * size * img.height) / ART_PX) * cam.zoom;
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.translate(feet.sx + pose.dx * cam.zoom, feet.sy - pose.lift * cam.zoom);
  ctx.rotate(pose.rot);
  ctx.scale(pose.sx, pose.sy);
  ctx.globalAlpha *= pose.alpha;
  const line = Math.max(1, 1.5 * cam.zoom);
  for (const p of PLATES) {
    const pw = p.w * w;
    const ph = p.h * h;
    ctx.save();
    ctx.translate(p.x * w, -p.y * h);
    ctx.rotate(p.rot);
    const r = Math.min(pw, ph) * 0.3;
    const metal = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
    metal.addColorStop(0, BOSS_LOOK.plateLight);
    metal.addColorStop(0.35, BOSS_LOOK.plate);
    metal.addColorStop(1, BOSS_LOOK.plateEdge);
    ctx.fillStyle = metal;
    ctx.strokeStyle = BOSS_LOOK.plateEdge;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.roundRect(-pw / 2, -ph / 2, pw, ph, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BOSS_LOOK.plateLight;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * pw * 0.32, 0, Math.max(0.8, line * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** A boss's slab (ID-099): a concrete block arcing to where it lands, then a dust cloud there. */
function drawSlab(ctx: CanvasRenderingContext2D, k: Slab, time: number, cam: Camera): void {
  if (!k.landed) {
    const t = Math.min(1, Math.max(0, (time - k.at) / (k.lands - k.at)));
    const x = k.fromX + (k.x - k.fromX) * t;
    const y = k.fromY + (k.y - k.fromY) * t;
    const shadow = project({ x, y }, cam);
    ctx.fillStyle = COLOR.shadow;
    ctx.beginPath();
    ctx.ellipse(shadow.sx, shadow.sy, 12 * cam.zoom, 5 * cam.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    const c = project({ x, y, z: ENEMY.z + 4 * BOSS_LOOK.slabArc * t * (1 - t) }, cam);
    const { w, h } = BOSS_LOOK.slabSize;
    ctx.save();
    ctx.translate(c.sx, c.sy);
    ctx.rotate(-t * Math.PI * 1.5);
    ctx.fillStyle = BOSS_LOOK.slab;
    ctx.strokeStyle = BOSS_LOOK.slabEdge;
    ctx.lineWidth = Math.max(1.5, 3 * cam.zoom);
    ctx.fillRect((-w / 2) * cam.zoom, (-h / 2) * cam.zoom, w * cam.zoom, h * cam.zoom);
    ctx.strokeRect((-w / 2) * cam.zoom, (-h / 2) * cam.zoom, w * cam.zoom, h * cam.zoom);
    ctx.restore();
    return;
  }
  const age = (time - k.lands) / BOSS_SKILL.slab.flight;
  if (age < 0 || age >= 1) return;
  groundCircle(ctx, k.x, k.y, 20 + 40 * age, cam);
  ctx.globalAlpha = 1 - age;
  ctx.fillStyle = BOSS_LOOK.dust;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Where a Spewer's glob is `fly` of the way along its arc (design §9, ID-023). */
function spitAt(k: Spit, fly: number): { x: number; y: number; z: number } {
  return {
    x: k.fromX + (k.x - k.fromX) * fly,
    y: k.fromY + (k.y - k.fromY) * fly,
    z: ENEMY.z + Math.sin(Math.PI * fly) * 40,
  };
}

/**
 * A Spewer's acid glob arcing to where it lands, then its splash there (design §9, ID-023;
 * art ID-118): the glob points along its path on screen, drips hanging down; the splash
 * bursts on the spot and settles into a stain that fades (held still with Reduce motion).
 */
function drawSpit(
  ctx: CanvasRenderingContext2D,
  art: Art,
  k: Spit,
  time: number,
  cam: Camera,
  still: boolean,
): void {
  const u = (time - k.at) / SPEWER.splash;
  const frames = spitFrames(u, still);
  if (frames.length === 0) return;
  const fly = spitFly(u);
  const c = project(spitAt(k, fly), cam);
  if (frames[0]!.art === SPIT.art.glob) {
    const ahead = project(spitAt(k, Math.min(1, fly + 0.02)), cam);
    const back = project(spitAt(k, Math.max(0, fly - 0.02)), cam);
    const [dx, dy] = [ahead.sx - back.sx, ahead.sy - back.sy];
    const img = art[SPIT.art.glob];
    const w = sized(SPIT.glob, cam);
    const h = (img.height / img.width) * w;
    ctx.save();
    ctx.translate(c.sx, c.sy);
    // The art flies to the left; flying right it is mirrored, so its drips stay below.
    // A spit with no path on screen keeps the art as drawn.
    const moving = Math.abs(dx) >= 1e-6 || Math.abs(dy) >= 1e-6;
    if (moving && dx <= 0) ctx.rotate(Math.atan2(dy, dx) - Math.PI);
    else if (moving) {
      ctx.rotate(Math.atan2(dy, dx));
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  // The splash and its stain share one scale (one art group): sized by the splash.
  const base = art[SPIT.art.splash];
  for (const f of frames) {
    if (f.alpha <= 0) continue;
    const img = art[f.art];
    const s = (sized(SPIT.splash, cam) * f.grow) / base.width;
    const [w, h] = [img.width * s, img.height * s];
    ctx.globalAlpha = Math.min(1, f.alpha);
    ctx.drawImage(img, c.sx - w / 2, c.sy - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}

/**
 * The horde view. With `anim` (a fight), sprites move (anim.ts): it is fed this frame's
 * fight first, and dead enemies fall there before they go. Without it (build mode)
 * everything stands still. `camp` draws the camp's fence and plots (the build scene,
 * ID-065, and Start Horde's ease out of it). Everything but the surround is clipped
 * left of screen x `clip`: by default the fight frame's left edge in a fight, nothing
 * in build mode.
 *
 * With `under` (ID-087), the backdrop (`drawBackdrop`) goes on that canvas, which the
 * page shows beneath `ctx`'s, and `ctx` is cleared to see-through instead. In the steady
 * fight frame the backdrop is only repainted when what it shows changes (see
 * `forgetBackdrop`); the build scene and Start Horde's ease repaint it every frame.
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
  under: CanvasRenderingContext2D | null = null,
): void {
  anim?.observe(scene);
  const defenderPoseOf = (d: Defender): Readonly<Pose> =>
    anim ? anim.shown(defenderPose(d, scene.time, anim.acts(d.id, scene.strikes))) : STILL;
  // A Gunner aims while firing (ID-069); out of a fight (no animator), at rest.
  const aimOf = (d: Defender): boolean =>
    anim ? aiming(d, scene.time, anim.acts(d.id, scene.strikes)) : false;
  // A Gunner mid-throw shows the throw, gun out of hand, so no muzzle flash (ID-119).
  const throwOf = (d: Defender): ThrowFrame | null =>
    anim && gunOf(d) ? throwFrame(d, scene.grenades, scene.time) : null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // In a fight nothing left of the frame shows (ID-064): the camp's yard stays out of
  // view, and an enemy past the frame shows as a marker at its edge instead.
  // On a whole pixel, so the clip's edge doesn't smear a seam into the surround.
  const fightLeft = build ? 0 : project({ x: FIGHT_FRAME.left, y: 0 }, cam).sx;
  const left = Math.max(0, Math.round(clip ?? fightLeft));
  if (under) {
    ctx.clearRect(0, 0, view.w, view.h);
    const steady = !build && !camp && clip === null;
    const key = steady ? `${view.w}x${view.h} ${cam.x},${cam.y},${cam.zoom} ${left}` : null;
    if (key === null || painted?.under !== under || painted.art !== art || painted.key !== key) {
      under.imageSmoothingEnabled = true;
      under.imageSmoothingQuality = 'high';
      const yard = camp ? () => drawCampGround(under, art, camp, cam) : null;
      drawBackdrop(under, art, cam, view, build !== null, left, yard);
      painted = key === null ? null : { under, art, key };
    }
  } else {
    const yard = camp ? () => drawCampGround(ctx, art, camp, cam) : null;
    drawBackdrop(ctx, art, cam, view, build !== null, left, yard);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, Math.max(0, view.w - left), view.h);
  ctx.clip();

  // The barrier cards the wall shows (ID-075); none in the build scene.
  const taken = { taken: scene.taken ?? [] };
  const cards: WallCards = build
    ? NO_CARDS
    : {
        reinforced: took(taken, 'reinforce'),
        pickedAt: scene.barrierAt,
        pace: Math.max(1, scene.pace ?? 1),
        still: anim?.reduced ?? true,
      };
  // Barbed Wire's band (ID-077) and traps lie flat on the ground, under every sprite.
  if (!build) drawWire(ctx, art, scene, cam);
  for (const t of scene.traps) drawTrap(ctx, art, t, cam);
  // A molotov fire's scorch lies on the ground (ID-107), its flames sorted with the sprites.
  for (const f of scene.fires) {
    const heat = molotovFade(scene.time, f);
    if (heat <= 0) continue;
    ctx.globalAlpha = MOLOTOV_FIRE.scorchAlpha * heat;
    const r = SKILLS.molotov.radius * MOLOTOV_FIRE.scorch;
    groundArt(ctx, art[SCORCH_ART], f.x, f.y, r, cam);
    ctx.globalAlpha = 1;
  }
  // Explosions' scorch, dust and shockwave lie on the ground (ID-107).
  const booms = explosions(scene, cam, anim?.reduced ?? false);
  drawBlastGround(ctx, art, booms, cam);
  // Each thrown flashbang or bottle's shadow grows under it as it falls (ID-107).
  for (const i of scene.incoming) {
    const fall = thrownFall(i, scene.time);
    if (fall === null) continue;
    ctx.globalAlpha = THROWN.shadowAlpha * fall;
    const shadow = i.skill === 'airstrike' ? THROWN.bombShadow : THROWN.shadow;
    const under = fallAt(i, fall);
    groundCircle(ctx, under.x, under.y, shadow * (0.4 + 0.6 * fall), cam);
    ctx.fillStyle = COLOR.shadow;
    ctx.fill();
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
          const throwing = throwOf(manned);
          drawDefender(ctx, art, manned, floor, selected, cam, pose, aimOf(manned), throwing);
          if (!throwing) drawFlash(ctx, scene, manned.id, post.x, post.y, cam);
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
        drawFlash(ctx, scene, `${TURRET_OWNER}${t.id}`, t.x, t.y, cam);
      },
    });
  }
  for (const d of scene.defenders) {
    if (!d.walking) continue;
    sprites.push({
      y: d.y,
      x: d.x,
      draw: () => {
        const throwing = throwOf(d);
        const selected = d.id === selectedDefender;
        drawDefender(ctx, art, d, 0, selected, cam, defenderPoseOf(d), aimOf(d), throwing);
        if (!throwing) drawFlash(ctx, scene, d.id, d.x, d.y, cam);
      },
    });
  }
  // A burning enemy's flames (ID-089) run on fight time; with Reduce motion they hold still.
  const flameClock = anim?.reduced ? 0 : scene.time;
  // Dazed enemies' stars, drawn over the explosions so a pop never hides them (ID-107).
  const starred: { e: Enemy; at: { x: number; y: number; z: number } }[] = [];
  for (const e of scene.enemies) {
    sprites.push({
      y: e.y,
      x: e.x,
      draw: () => {
        const ground = project({ x: e.x, y: e.y }, cam);
        const size = radiusOf(e) / ENEMY_RADIUS;
        drawShadow(ctx, ground, 1, cam, size);
        if (roared(scene, e)) drawRoared(ctx, e, cam);
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
        // Shock Rounds (ID-097): a paralysed enemy twitches, crackling with electricity (ID-120).
        const zap = shocked(scene, e);
        const wind = windCue(scene, e);
        const body = bossPose(zap ? twitch(pose, e.id, flameClock) : pose, e, wind);
        if (wind) drawWindUp(ctx, wind, ground, size, flameClock, cam);
        drawEnemy(ctx, art, e.kind, frame, ground, cam, body);
        if (plated(e)) drawPlates(ctx, art, e.kind, ground, body, cam);
        const heat = burnHeat(scene.time, e, anim?.litAt(e.id) ?? -Infinity);
        drawBurn(ctx, art, e.id, e.kind, ground, body, heat, flameClock, cam);
        if (zap) drawShock(ctx, art, e.id, e.kind, ground, body, flameClock, cam, heat > 0);
        const at = enemyBarAt(art, e.kind, e.x, e.y, e.elite ? ELITE.size : 1);
        drawHpBar(ctx, at, e.hp, e.maxHp, cam, undefined, HP_BAR, true);
        // A flashbang's daze (ID-107): stars circle its head until the stun ends.
        if (dazed(scene, e)) starred.push({ e, at });
      },
    });
  }
  // The dead die where they stood (ID-110), with no HP bar, then are gone. A fight's last
  // kill ends it and stops its clock mid-death: those finish on the real seconds since it
  // ended (`ended`), while a win's result waits for them; given none, they are gone.
  const after = scene.outcome === 'fighting' ? 0 : (scene.ended ?? Infinity);
  for (const c of anim?.corpses ?? []) {
    const e = c.enemy;
    const since = scene.time - c.at + after;
    if (!anim || since >= ANIM.fall.time) continue;
    sprites.push({
      y: e.y,
      x: e.x,
      draw: () => {
        const ground = project({ x: e.x, y: e.y }, cam);
        const body = drawDeath(ctx, art, e, since, scene.seed ?? 0, ground, cam, anim);
        // A burning body keeps burning as it dies, fading with it.
        const heat = burnHeat(scene.time, e, c.litAt);
        drawBurn(ctx, art, e.id, e.kind, ground, body, heat, flameClock, cam);
      },
    });
  }
  // A molotov fire's flames stand among the sprites, behind those in front of it (ID-107).
  for (const f of scene.fires) {
    sprites.push({
      y: f.y,
      x: f.x,
      draw: () => {
        const look = molotovLook(f, scene.time, flameClock, cam);
        if (look) paintFire(ctx, look);
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
  // A Spewer's spit over the sprites but under the wall's HP bars (ID-118).
  for (const k of scene.spits) drawSpit(ctx, art, k, scene.time, cam, anim?.reduced ?? false);
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
  for (const k of scene.bursts) drawBurst(ctx, k, scene.time, cam);
  for (const k of scene.slabs ?? []) drawSlab(ctx, k, scene.time, cam);
  for (const g of scene.grenades) {
    drawGrenade(ctx, g, scene.time, cam, launchOf(scene, g, anim !== null));
  }

  // Explosions' fireballs, smoke and flashes over every sprite (ID-107); an armed skill
  // shows its reach at the cursor.
  drawBlastAir(ctx, art, booms, cam, anim?.reduced ?? false);
  for (const { e, at } of starred) drawStars(ctx, e, at, flameClock, cam);
  // Thrown flashbangs and bottles fall from the sky over everything (ID-107).
  for (const i of scene.incoming) {
    const fall = thrownFall(i, scene.time);
    if (fall !== null) drawThrown(ctx, art, i, fall, scene.time, cam);
  }
  if (aim) {
    ctx.strokeStyle = COLOR.focus;
    ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    if (aim.skill === 'airstrike') {
      // An airstrike shows every bomb along its row.
      for (const p of carpet(scene, aim.y)) {
        groundCircle(ctx, p.x, p.y, SKILLS.airstrike.radius, cam);
        ctx.stroke();
      }
    } else {
      // A flashbang or molotov shows the area its bursts land in (ID-107), and one burst's reach.
      // A molotov's area is fire orange, a flashbang's the focus yellow.
      const a = throwArea(scene, aim.skill, aim.x, aim.y);
      const fire = aim.skill === 'molotov';
      if (fire) ctx.strokeStyle = COLOR.aimFire;
      groundCircle(ctx, a.x, a.y, a.r, cam);
      ctx.fillStyle = fire ? COLOR.aimFireFill : COLOR.aimFill;
      ctx.fill();
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      groundCircle(ctx, a.x, a.y, SKILLS[aim.skill].radius, cam);
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // Each defender's name on top of every sprite and effect, so none hides it (ID-074).
  // Only those the sprites above drew: a walker, or the one standing on their post.
  if (!build) {
    const shown = scene.defenders.flatMap((d) => {
      const post = d.walking ? null : scene.posts.find((p) => p.id === d.postId);
      if (post === undefined) return []; // not walking and on no post: not drawn
      return [{ d, z0: post ? postFloor(scene.layers, post) : 0 }];
    });
    // Speech bubbles (ID-085) beside each speaker's name (ID-094), under the damage numbers.
    drawBubbles(ctx, scene, cards.still, cam, view, shown, left);
    // Damage numbers (ID-082) under every name and reload pie, so they never hide one.
    drawPops(ctx, art, scene, cards.still, cam);
    // Over each name, clear of it, while their gun reloads (ID-078). All before the
    // names, so where two survivors crowd together a pie never hides a name.
    for (const { d, z0 } of shown) {
      const share = reloadShare(d, scene.time, {
        taken: scene.taken ?? [],
        cardLevels: scene.cardLevels ?? {},
      });
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
