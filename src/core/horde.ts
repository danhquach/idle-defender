import {
  postXY,
  spotOf,
  type Base,
  type PostKind,
  type SegmentKind,
  type Tier,
  type TrapKind,
  type TurretMount,
} from './base.ts';
import { levelUp, postUsable } from './cards.ts';
import {
  CAMP,
  COLUMNS,
  ENEMIES,
  ENGINEER_BUFF,
  ENEMY_RADIUS,
  PIERCE,
  FALL_WARNING,
  FIELD,
  GAP_SENSE,
  MAX_CONDITION,
  POST_RANGE,
  SEGMENT_HEIGHT,
  SEGMENTS,
  SEPARATION_SPEED,
  SHIELD,
  SIDEARM_CLOSE,
  SPAWN_INTERVAL,
  STAT_EFFECT,
  STEP,
  STRIKE_FLASH,
  MUZZLE_FLASH,
  IMPACT_FLASH,
  TRAP_STRIP,
  TRAPS,
  TURRET,
  TURRET_RANGE,
  WALK_SPEED,
  WALL,
  WAVE_BREAK,
  SHOP,
  SKILL_FLASH,
  SKILLS,
  BLOATER,
  BRUTE,
  CRAWLER,
  SCREAMER,
  SPITTER,
  meleeReach,
  type BuffId,
  type EnemyKind,
  type SkillId,
  type Stats,
  type Tracer,
} from './data.ts';
import { pierceOf, type Held } from './armoury.ts';
import {
  gunOf,
  isGun,
  isSidearm,
  meleeOf,
  professionOf,
  toolOf,
  weaponOf,
  type Loadout,
} from './loadout.ts';
import { openReplace } from './replace.ts';
import { chance, int, rngFrom, type Rng, type RngState } from './rng.ts';
import {
  cleaveShare,
  critChance,
  damageFactor,
  fireRateFactor,
  maxHpOf,
  reloadTime,
  repairFactor,
  spreadOf,
} from './stats.ts';
import { enemyHp, kindFor, waveCount, waveMix, waveSize } from './waves.ts';

export type UpgradeId = 'sharpshooter' | 'rapid-fire' | 'long-sight' | 'patch-up' | 'reinforce';

export interface DefenderSpec {
  id: string;
  name: string;
  loadout: Loadout;
  /** Permanent stats from the roster (design §6); none means all 0. */
  stats?: Readonly<Stats>;
}

/** The spec a fight defender came from, stats and all. */
export function specOf(d: DefenderSpec): DefenderSpec {
  const { id, name, stats } = d;
  const loadout = { ...d.loadout };
  return stats ? { id, name, loadout, stats: { ...stats } } : { id, name, loadout };
}
export interface HordeSetup {
  hordeNumber: number;
  roster: DefenderSpec[];
  startDefenderId: string;
  base: Base;
  /** Index into `base.posts`; valid only for this `base` (building a post re-sorts them). */
  startPostId: number;
  /** The battery bank's charge at the start (design §7). */
  bank: number;
  /** When the fight started (ms since the epoch), so the generator skips it. */
  startedAt: number;
  /** Active skills researched at the Lab (design §4). */
  skills: readonly SkillId[];
}
export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  nextAttackAt: number;
  /** Past every layer: it hunts defenders and walls no longer stop it (sticky). */
  inCamp: boolean;
  /** Fight time a flashbang stuns it until (no moving, no attacking); 0 = never. */
  stunnedUntil: number;
  /** Velocity over the last step in px/s, which shooters lead (design §6 Ballistics). */
  vx: number;
  vy: number;
  /** A Crawler on a wall: fight time it drops behind it; 0 = not climbing. */
  climbUntil: number;
  /** A Crawler that has climbed a wall: it climbs only once (design §9). */
  climbed: boolean;
}
/** An unbuilt slot is `{ kind: null, tier: null, hp: 0, maxHp: 0 }`: an open gap. */
export interface Segment {
  index: number;
  kind: SegmentKind | null;
  tier: Tier | null;
  hp: number;
  maxHp: number;
}
/** One wall layer: `SEGMENTS` segments, top to bottom. */
export interface Layer {
  column: number;
  x: number;
  segments: Segment[];
}
export interface Post {
  id: number;
  kind: PostKind;
  column: number;
  row: number;
  /** A wall-walk's spot on its segment; absent = 0. */
  spot?: number;
  x: number;
  y: number;
  /** Occupied by, or reserved for a defender walking to it. */
  defenderId: string | null;
}
/** A turret in the fight; ids = `base.turrets` index. */
export interface Turret {
  id: number;
  mount: TurretMount;
  column: number;
  row: number;
  /** A wall mount's spot on its segment; absent = 0. */
  spot?: number;
  x: number;
  y: number;
  condition: number;
  nextShotAt: number;
}
/** A trap in the fight; ids = `base.traps` index. Its cell spans `TRAP_STRIP` along `x` and row `row`. */
export interface Trap {
  id: number;
  kind: TrapKind;
  row: number;
  durability: number;
  /** Ids of the enemies that triggered it: each one only once (design §7). */
  hit: number[];
}
/** How a turret looks and whether it fires: lit, dark (no charge), jammed (0 condition), or offline (its wall broke). */
export type TurretState = 'lit' | 'dark' | 'jammed' | 'offline';
export type Slot = 'primary' | 'secondary';
/** A defender in the fight always holds a post: it stands on it, or walks to it. */
export interface Defender extends DefenderSpec {
  nextShotAt: number;
  /** Rounds left in each gun's magazine (0 for a blade, a tool or none). */
  ammo: Record<Slot, number>;
  /** When an empty gun's reload ends. */
  reloadedAt: Record<Slot, number>;
  x: number;
  y: number;
  postId: number;
  walking: boolean;
  hp: number;
  maxHp: number;
  /** The kind of enemy that hit them last; null before any hit. */
  hitBy: EnemyKind | null;
}
/** A defender injured in this fight, and the post they held (stood on or walked to). */
export interface Injury {
  defender: DefenderSpec;
  postId: number;
  /** Fight time of the injury, in s: rest is timed from here (design §11). */
  at: number;
  /** A replacement was offered (taken or skipped); each injury gets one offer. */
  offered: boolean;
  /** The kind of enemy that landed the last hit; null if none did. */
  by: EnemyKind | null;
}
/** The first crossing of a layer by an enemy from outside, for the defeat screen (design §2). */
export interface Breach {
  column: number;
  row: number;
  /** The wave under way at the crossing. */
  wave: number;
  /**
   * What the enemy went through: a broken wall or gate, a slot never built, or over a
   * standing segment (a Crawler, `climbed`).
   */
  through: SegmentKind | 'gap' | 'climbed';
}
/** The open replacement offer: post `postId` is the injured one's, or null for the player's pick. */
export interface ReplaceOffer {
  injuredId: string;
  postId: number | null;
}
export type MoveResult = { ok: true; state: HordeState } | { ok: false; reason: string };
/** A blade or tool strike by defender `owner` landing on `(x, y)`, drawn for `STRIKE_FLASH` s. */
export interface Strike {
  x: number;
  y: number;
  at: number;
  owner: string;
}
/**
 * A gun's bullet in flight (design §6 Ballistics): it moves `speed` px/s along the unit
 * heading `(dx, dy)` and hits the first living enemy whose body it crosses.
 */
export interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  /** Dealt on a hit; the crit was rolled at the trigger. */
  damage: number;
  /** The shooter: a defender's id, or `turret:<id>`. */
  owner: string;
  /** The muzzle, and how far from it the shot was aimed (the renderer drops it to body height over that). */
  fromX: number;
  fromY: number;
  aim: number;
  /** Px it can still fly; at 0 it falls with no damage. */
  left: number;
  /** Enemies it can still go through; after each it flies at most `PIERCE.reach` on. */
  pierce: number;
  /** Ids of the enemies it hit: never the same one twice. */
  hit: number[];
  /** How it looks in flight: its gun's. */
  tracer: Tracer;
}
/**
 * A gun going off: `owner` (as on its bullet) fired in the step ending at `at`, when it
 * is first drawn; drawn for `MUZZLE_FLASH` s.
 */
export interface Shot {
  owner: string;
  at: number;
}
/**
 * Where a bullet ended in the step ending at `at`, drawn for `IMPACT_FLASH` s: on an
 * enemy it hit (`hit`), or where it fell past its range with no damage.
 */
export interface Impact {
  x: number;
  y: number;
  hit: boolean;
  at: number;
}
/** A Spitter's glob flying from `(fromX, fromY)` to `(x, y)`, from `at` for `SPITTER.splash` s. */
export interface Spit {
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  at: number;
}
/** Bloater `id` blowing up at `(x, y)` in the step ending at `at` (not a kill), drawn for `BLOATER.burst` s. */
export interface Burst {
  id: number;
  x: number;
  y: number;
  at: number;
}
/** A molotov's fire on the ground, burning enemies inside until `until` (fight time). */
export interface Fire {
  x: number;
  y: number;
  until: number;
}
/** A skill landing at `(x, y)`, drawn for `SKILL_FLASH` seconds. */
export interface Blast {
  skill: SkillId;
  x: number;
  y: number;
  at: number;
}
/** Multipliers from upgrade cards; all start at 1. */
export interface Mods {
  damage: number;
  fireRate: number;
  range: number;
}
export type Card = { kind: 'upgrade'; id: UpgradeId } | { kind: 'recruit'; defender: DefenderSpec };
export type Outcome = 'fighting' | 'won' | 'lost';
export interface HordeState {
  time: number;
  acc: number;
  rng: RngState;
  hordeNumber: number;
  wave: number;
  waveCount: number;
  toSpawn: number;
  nextSpawnAt: number;
  breakUntil: number;
  enemies: Enemy[];
  nextEnemyId: number;
  layers: Layer[];
  posts: Post[];
  turrets: Turret[];
  traps: Trap[];
  /** Battery bank charge left (design §7). */
  energy: number;
  /** When the fight started (ms since the epoch). */
  startedAt: number;
  defenders: Defender[];
  bench: DefenderSpec[];
  /** In injury order; never on the bench, so never back in this fight. */
  injured: Injury[];
  /** At most one per layer, in crossing order. */
  breaches: Breach[];
  /** Ids of everyone who took part (starter, recruits, replacements), in join order. */
  tookPart: string[];
  /** Seconds the camp has been falling (an enemy inside, no defender left); 0 when not. */
  fallingFor: number;
  replace: ReplaceOffer | null;
  xp: number;
  level: number;
  offer: Card[] | null;
  mods: Mods;
  /** Horde cash from kills (design §4); spent in the shop, never kept after the horde. */
  cash: number;
  /** Fight time each bought buff runs until; 0 = never bought. */
  buffs: Record<BuffId, number>;
  /** Active skills researched at the Lab; only these can be used. */
  skills: SkillId[];
  /** Fight time each skill is ready again at; 0 = never used. */
  cooldowns: Record<SkillId, number>;
  fires: Fire[];
  blasts: Blast[];
  /** Player-picked target; null = each defender shoots the enemy closest to it. */
  focusId: number | null;
  strikes: Strike[];
  /** In flight; cleared when the horde ends and never saved. */
  bullets: Bullet[];
  /** Recent muzzle flashes and bullet ends, for the renderer; cleared when the horde ends. */
  shots: Shot[];
  impacts: Impact[];
  spits: Spit[];
  bursts: Burst[];
  outcome: Outcome;
}

// Accumulated float time can land a hair before a due time; count it as due.
const EPS = 1e-9;
const due = (time: number, at: number): boolean => time >= at - EPS;
/** Waiting on the player: a card pick or a replacement. */
const paused = (s: HordeState): boolean =>
  s.offer !== null || s.replace !== null || s.outcome !== 'fighting';

export function newHorde(seed: number, setup: HordeSetup): HordeState {
  const { hordeNumber, roster, startDefenderId, base, startPostId, bank, startedAt, skills } =
    setup;
  const start = roster.find((d) => d.id === startDefenderId);
  if (!start) throw new RangeError(`newHorde: unknown start defender ${startDefenderId}`);
  const { layers, posts, turrets, traps } = layoutOf(base);
  const startPost = posts[startPostId];
  if (!Number.isInteger(startPostId) || !startPost || !postUsable(layers, startPost)) {
    throw new RangeError(`newHorde: start post ${startPostId} is not usable`);
  }
  startPost.defenderId = start.id;
  return {
    time: 0,
    acc: 0,
    rng: { s: seed >>> 0 },
    hordeNumber,
    wave: 1,
    waveCount: waveCount(hordeNumber),
    toSpawn: waveSize(hordeNumber, 1),
    nextSpawnAt: 0,
    breakUntil: 0,
    enemies: [],
    nextEnemyId: 0,
    layers,
    posts,
    turrets,
    traps,
    energy: bank,
    startedAt,
    defenders: [standing(start, startPost, 0)],
    bench: roster.filter((d) => d !== start).map((d) => ({ ...d })),
    injured: [],
    breaches: [],
    tookPart: [start.id],
    fallingFor: 0,
    replace: null,
    xp: 0,
    level: 1,
    offer: null,
    mods: { damage: 1, fireRate: 1, range: 1 },
    cash: 0,
    buffs: { adrenaline: 0, overdrive: 0 },
    skills: [...skills],
    cooldowns: { flashbang: 0, molotov: 0, airstrike: 0 },
    fires: [],
    blasts: [],
    focusId: null,
    strikes: [],
    bullets: [],
    shots: [],
    impacts: [],
    spits: [],
    bursts: [],
    outcome: 'fighting',
  };
}

/** `spec` at full HP standing on `post`, ready to fire at `nextShotAt`. Does not touch the post. */
export function standing(spec: DefenderSpec, post: Post, nextShotAt: number): Defender {
  const hp = maxHpOf(spec);
  const full = (id: Held | null): number => (id !== null && isGun(id) ? gunOf(id).magazine : 0);
  return {
    ...specOf(spec),
    nextShotAt,
    ammo: { primary: full(spec.loadout.primary), secondary: full(spec.loadout.secondary) },
    reloadedAt: { primary: 0, secondary: 0 },
    x: post.x,
    y: post.y,
    postId: post.id,
    walking: false,
    hp,
    maxHp: hp,
    hitBy: null,
  };
}

/** The base laid out on the field: layers at their wall `x`, posts unmanned, ids = `base.posts` / `base.turrets` / `base.traps` index. */
export function layoutOf(base: Base): {
  layers: Layer[];
  posts: Post[];
  turrets: Turret[];
  traps: Trap[];
} {
  const layers: Layer[] = base.layers.map((l) => ({
    column: l.column,
    x: COLUMNS[l.column]!,
    segments: l.slots.map((slot, index) =>
      slot
        ? { index, kind: slot.kind, tier: slot.tier, hp: slot.hp, maxHp: slot.maxHp }
        : { index, kind: null, tier: null, hp: 0, maxHp: 0 },
    ),
  }));
  const posts: Post[] = base.posts.map((p, id) => ({
    id,
    ...p,
    ...postXY(p),
    defenderId: null,
  }));
  const turrets: Turret[] = base.turrets.map((t, id) => ({
    id,
    ...t,
    ...postXY({ kind: t.mount, column: t.column, row: t.row, spot: spotOf(t) }),
    nextShotAt: 0,
  }));
  const traps: Trap[] = base.traps.map((t, id) => ({ id, ...t, hit: [] }));
  return { layers, posts, turrets, traps };
}

/** Advances the fight by `dt` seconds in fixed steps; returns a new state. */
export function tick(state: HordeState, dt: number): HordeState {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError(`tick: bad dt ${dt}`);
  const s = structuredClone(state);
  if (paused(s)) {
    s.acc = 0;
    return s;
  }
  const rng = rngFrom(s.rng);
  s.acc += dt;
  while (s.acc >= STEP - EPS) {
    s.acc = Math.max(0, s.acc - STEP);
    step(s, rng);
    if (paused(s)) {
      s.acc = 0;
      break;
    }
  }
  return s;
}

/** How far `weapon` (a gun) reaches from `post`: its range × the post's × the cards'. */
export function gunRange(state: HordeState, post: Pick<Post, 'kind'>, weapon: Held): number {
  return gunOf(weapon).range * POST_RANGE[post.kind] * state.mods.range;
}

/** Whether the bought buff `id` is still running (fight time stops during picks, so it does too). */
export function buffOn(state: Pick<HordeState, 'time' | 'buffs'>, id: BuffId): boolean {
  return !due(state.time, state.buffs[id]);
}

/** The `damage` or `fireRate` factor the running shop buffs give defenders and turrets. */
export function boost(
  state: Pick<HordeState, 'time' | 'buffs'>,
  stat: 'damage' | 'fireRate',
): number {
  let f = 1;
  if (buffOn(state, 'adrenaline')) f *= SHOP.adrenaline[stat];
  if (buffOn(state, 'overdrive')) f *= SHOP.overdrive[stat];
  return f;
}

/** Fire-rate factor for `defender` from a standing Engineer within reach (never stacked, never self). */
export function engineerBuff(state: HordeState, defender: Defender): number {
  if (defender.walking) return 1;
  const near = state.defenders.some(
    (e) =>
      e !== defender &&
      !e.walking &&
      professionOf(e.loadout) === 'engineer' &&
      Math.hypot(e.x - defender.x, e.y - defender.y) <=
        toolOf(e.loadout.secondary!).buffRadius + EPS,
  );
  return near ? 1 + ENGINEER_BUFF : 1;
}

/** Whether `t` can fire, and how it shows: a broken wall under a wall mount, then jammed, then the bank. */
export function turretState(state: Pick<HordeState, 'layers' | 'energy'>, t: Turret): TurretState {
  if (t.mount === 'wall-walk') {
    const seg = state.layers.find((l) => l.column === t.column)?.segments[t.row];
    if (!seg || seg.hp <= 0) return 'offline';
  }
  if (t.condition <= 0) return 'jammed';
  return state.energy > 0 ? 'lit' : 'dark';
}

/**
 * Damage and fire-rate factor a turret gets from the best standing Engineer within
 * their tool's reach (never stacked): `ENGINEER_BUFF`, scaled by Tech and title.
 */
export function turretBuff(state: HordeState, t: Turret): number {
  let best = 1;
  for (const e of engineersNear(state, t))
    best = Math.max(best, 1 + ENGINEER_BUFF * repairFactor(e));
  return best;
}

/** Standing Engineers whose tool reaches `t`. */
function engineersNear(state: HordeState, t: Turret): Defender[] {
  return state.defenders.filter(
    (e) =>
      !e.walking &&
      professionOf(e.loadout) === 'engineer' &&
      Math.hypot(e.x - t.x, e.y - t.y) <= toolOf(e.loadout.secondary!).buffRadius + EPS,
  );
}

/**
 * The base after a fight: each built segment keeps the fight's HP, rounded up (a
 * sliver left standing stays standing) and capped at the base's max HP (so an
 * in-fight Reinforce never sticks). Returns a new base.
 */
export function baseAfter(base: Base, horde: HordeState): Base {
  const b = structuredClone(base);
  const match =
    b.layers.length === horde.layers.length &&
    b.layers.every(
      (l, i) =>
        l.column === horde.layers[i]!.column &&
        l.slots.every((slot, row) => {
          const seg = horde.layers[i]!.segments[row];
          return (
            seg !== undefined &&
            seg.kind === (slot?.kind ?? null) &&
            seg.tier === (slot?.tier ?? null)
          );
        }),
    );
  const sameTurrets =
    b.turrets.length === horde.turrets.length &&
    b.turrets.every((t, i) => {
      const h = horde.turrets[i]!;
      return (
        h.mount === t.mount && h.column === t.column && h.row === t.row && spotOf(h) === spotOf(t)
      );
    });
  const sameTraps =
    b.traps.length === horde.traps.length &&
    b.traps.every((t, i) => horde.traps[i]!.kind === t.kind && horde.traps[i]!.row === t.row);
  if (!match || !sameTurrets || !sameTraps) {
    throw new RangeError('baseAfter: the horde was not fought on this base');
  }
  // Turrets keep their exact wear, so a few shots per horde still add up (a whole-point
  // round-up would erase every shot's 0.2).
  b.turrets.forEach((t, i) => {
    t.condition = Math.min(MAX_CONDITION, Math.max(0, horde.turrets[i]!.condition));
  });
  b.traps.forEach((t, i) => {
    t.durability = Math.min(t.durability, Math.max(0, horde.traps[i]!.durability));
  });
  b.layers.forEach((l, i) => {
    l.slots.forEach((slot, row) => {
      // EPS: float noise from card maths (150 + 1e-12) must not round up a whole point.
      if (slot) {
        const hp = Math.ceil(horde.layers[i]!.segments[row]!.hp - EPS);
        slot.hp = Math.min(slot.maxHp, Math.max(0, hp));
      }
    });
  });
  return b;
}

/** Focuses every defender on enemy `enemyId` (null clears); returns a new state. */
export function setFocus(state: HordeState, enemyId: number | null): HordeState {
  if (
    enemyId !== null &&
    !(Number.isSafeInteger(enemyId) && state.enemies.some((e) => e.id === enemyId && e.hp > 0))
  ) {
    throw new RangeError(`setFocus: no living enemy ${String(enemyId)}`);
  }
  const s = structuredClone(state);
  s.focusId = enemyId;
  return s;
}

/**
 * Sends a defender walking to post `postId`: its old post is free at once and the new
 * one is reserved. Refuses with a player-facing reason; throws on an unknown id.
 */
export function moveDefender(state: HordeState, defenderId: string, postId: number): MoveResult {
  const defender = state.defenders.find((d) => d.id === defenderId);
  if (!defender) throw new RangeError(`moveDefender: no defender ${String(defenderId)}`);
  const target = Number.isInteger(postId) ? state.posts[postId] : undefined;
  if (!target) throw new RangeError(`moveDefender: no post ${postId}`);
  const refuse = (reason: string): MoveResult => ({ ok: false, reason });
  if (state.outcome !== 'fighting') return refuse('The fight is over');
  if (state.offer !== null) return refuse('Pick a card first');
  if (state.replace !== null) return refuse('Pick a replacement first');
  if (defender.postId === postId) {
    return refuse(defender.walking ? 'Already on the way' : 'Already there');
  }
  if (target.defenderId !== null) {
    const holder = state.defenders.find((d) => d.id === target.defenderId);
    return refuse(holder?.walking ? 'Post reserved' : 'Post taken');
  }
  if (!postUsable(state.layers, target)) return refuse('No wall to stand on');
  const s = structuredClone(state);
  const d = s.defenders.find((x) => x.id === defenderId)!;
  s.posts[d.postId]!.defenderId = null;
  s.posts[postId]!.defenderId = d.id;
  d.postId = postId;
  d.walking = true;
  return { ok: true, state: s };
}

/** The living enemy nearest `(x, y)` within reach of a click (ties → lowest id), else null. */
export function enemyAt(state: HordeState, x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (e.hp <= 0 || d > ENEMIES[e.kind].radius + ENEMY_RADIUS) continue;
    if (d > bestD || (d === bestD && best && e.id > best.id)) continue;
    best = e;
    bestD = d;
  }
  return best?.id ?? null;
}

function step(s: HordeState, rng: Rng): void {
  spawn(s, rng);
  walk(s);
  fire(s, rng);
  fireTurrets(s, rng);
  fly(s);
  burn(s);
  repair(s);
  repairTurrets(s);
  springTraps(s);
  removeDead(s);
  // Moving and separating keep the enemies' order, so their old places line up by index.
  const wasX = s.enemies.map((e) => e.x);
  const wasY = s.enemies.map((e) => e.y);
  const moved = move(s);
  separate(s);
  s.enemies.forEach((e, i) => {
    e.vx = (e.x - wasX[i]!) / STEP;
    e.vy = (e.y - wasY[i]!) / STEP;
  });
  attack(s, moved);
  injure(s);
  drop(s);
  advanceWave(s);
  fall(s);
  if (s.outcome !== 'fighting') {
    s.bullets = [];
    s.shots = [];
    s.impacts = [];
    s.spits = [];
    s.bursts = [];
  }
  // A finished fight has no card to pick, so its XP stays banked.
  if (s.outcome === 'fighting') levelUp(s, rng);
  s.time += STEP;
}

function spawn(s: HordeState, rng: Rng): void {
  while (s.toSpawn > 0 && due(s.time, s.nextSpawnAt) && due(s.time, s.breakUntil)) {
    // Shamblers only (the tutorial) roll nothing, so its seeds play as before.
    const kind = waveMix(s.hordeNumber).length > 1 ? kindFor(s.hordeNumber, rng()) : 'shambler';
    const hp = enemyHp(kind, s.hordeNumber, s.wave);
    const r = ENEMIES[kind].radius;
    s.enemies.push({
      id: s.nextEnemyId++,
      kind,
      x: FIELD.right,
      y: int(rng, r, FIELD.height - r),
      hp,
      maxHp: hp,
      nextAttackAt: 0,
      inCamp: false,
      stunnedUntil: 0,
      vx: 0,
      vy: 0,
      climbUntil: 0,
      climbed: false,
    });
    s.toSpawn -= 1;
    s.nextSpawnAt = s.time + SPAWN_INTERVAL;
  }
}

/** Walkers step straight toward their post at `WALK_SPEED` (slower with a shield) and take it on arrival. */
function walk(s: HordeState): void {
  for (const d of s.defenders) {
    if (!d.walking) continue;
    const stride = WALK_SPEED * (d.loadout.item === 'shield' ? 1 - SHIELD.walk : 1) * STEP;
    const post = s.posts[d.postId]!;
    const dist = Math.hypot(post.x - d.x, post.y - d.y);
    if (dist <= stride + EPS) {
      d.x = post.x;
      d.y = post.y;
      d.walking = false;
    } else {
      d.x += ((post.x - d.x) / dist) * stride;
      d.y += ((post.y - d.y) / dist) * stride;
    }
  }
}

/** The focused enemy if within `range` of `(x, y)`, else the nearest within it (ties → lowest id). */
function targetFrom(s: HordeState, x: number, y: number, range: number): Enemy | undefined {
  const dist = (e: Enemy): number => Math.hypot(e.x - x, e.y - y);
  const focus = s.enemies.find((e) => e.id === s.focusId && e.hp > 0);
  if (focus && dist(focus) <= range) return focus;
  let target: Enemy | undefined;
  let best = Infinity;
  for (const e of s.enemies) {
    const d = dist(e);
    if (e.hp <= 0 || d > range) continue;
    if (d < best || (d === best && target && e.id < target.id)) {
      target = e;
      best = d;
    }
  }
  return target;
}

/** Refills every empty gun whose reload has ended. */
function reload(s: HordeState, d: Defender): void {
  for (const slot of ['primary', 'secondary'] as const) {
    const id = d.loadout[slot];
    if (id !== null && isGun(id) && d.ammo[slot] === 0 && due(s.time, d.reloadedAt[slot])) {
      d.ammo[slot] = gunOf(id).magazine;
    }
  }
}

/** A gun in `slot` with a round in it. */
function loaded(d: Defender, slot: Slot): boolean {
  const id = d.loadout[slot];
  return id !== null && isGun(id) && d.ammo[slot] > 0;
}

/**
 * What `d` uses this step and at whom (design §6 Loadout), or null: a blade or tool
 * on an enemy in reach (standing, not on a tower); else the primary; else, for a
 * Gunner whose primary reloads, a sidearm secondary at an enemy within
 * `SIDEARM_CLOSE`. On the move only a sidearm fires, at ground-post range.
 */
function choose(
  s: HordeState,
  d: Defender,
  post: Post,
): { slot: Slot; target: Enemy; x: number; y: number } | null {
  const { primary, secondary } = d.loadout;
  if (d.walking) {
    const slot: Slot | null =
      isSidearm(primary) && loaded(d, 'primary')
        ? 'primary'
        : isSidearm(secondary) && loaded(d, 'secondary')
          ? 'secondary'
          : null;
    if (slot === null) return null;
    const target = targetFrom(s, d.x, d.y, gunRange(s, { kind: 'ground' }, d.loadout[slot]!));
    return target ? { slot, target, x: d.x, y: d.y } : null;
  }
  if (secondary !== null && !isGun(secondary) && post.kind !== 'tower') {
    const target = targetFrom(s, post.x, post.y, meleeOf(secondary).reach);
    if (target) return { slot: 'secondary', target, x: post.x, y: post.y };
  }
  if (loaded(d, 'primary')) {
    const target = targetFrom(s, post.x, post.y, gunRange(s, post, primary));
    return target ? { slot: 'primary', target, x: post.x, y: post.y } : null;
  }
  if (professionOf(d.loadout) === 'gunner' && isSidearm(secondary) && loaded(d, 'secondary')) {
    const range = Math.min(SIDEARM_CLOSE, gunRange(s, post, secondary!));
    const target = targetFrom(s, post.x, post.y, range);
    if (target) return { slot: 'secondary', target, x: post.x, y: post.y };
  }
  return null;
}

/**
 * Where to aim from `(x, y)` at `e` with a bullet at `speed` px/s: where `e` will be when
 * the bullet gets there, if it keeps its current velocity (design §6 Ballistics).
 */
export function leadPoint(x: number, y: number, e: Enemy, speed: number): { x: number; y: number } {
  const ox = e.x - x;
  const oy = e.y - y;
  // |o + v t| = speed × t. Bullets outrun enemies (a < 0), so one root is ≥ 0.
  const a = e.vx * e.vx + e.vy * e.vy - speed * speed;
  const b = 2 * (ox * e.vx + oy * e.vy);
  const c = ox * ox + oy * oy;
  const t = a < 0 ? (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a) : 0;
  return { x: e.x + e.vx * t, y: e.y + e.vy * t };
}

/**
 * Fires `pellets` bullets from `(x, y)` at where `target` will be, each turned off by up
 * to `spread`° on its own roll (seeded); one muzzle flash for the lot.
 */
function launch(
  s: HordeState,
  rng: Rng,
  shot: Pick<Bullet, 'owner' | 'speed' | 'damage' | 'pierce' | 'tracer'> & {
    x: number;
    y: number;
    target: Enemy;
    spread: number;
    range: number;
    pellets: number;
  },
): void {
  const { x, y, target, spread, range, pellets, ...rest } = shot;
  const aim = leadPoint(x, y, target, rest.speed);
  const heading = Math.atan2(aim.y - y, aim.x - x);
  const distance = Math.hypot(aim.x - x, aim.y - y);
  for (let i = 0; i < pellets; i++) {
    const angle = heading + ((rng() * 2 - 1) * spread * Math.PI) / 180;
    s.bullets.push({
      ...rest,
      x,
      y,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      fromX: x,
      fromY: y,
      aim: distance,
      left: range,
      hit: [],
    });
  }
  s.shots.push({ owner: rest.owner, at: s.time + STEP });
}

/**
 * The first living enemy `b` has not hit whose body (its kind's radius) its next
 * `travel` px cross, and how far along; ties → lowest id. One already overlapping the
 * bullet is crossed at 0, even behind its heading: point-blank, a shot at an enemy
 * against the post always lands.
 */
function crossed(s: HordeState, b: Bullet, travel: number): { enemy: Enemy; at: number } | null {
  let best: { enemy: Enemy; at: number } | null = null;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const wx = b.x - e.x;
    const wy = b.y - e.y;
    const along = b.dx * wx + b.dy * wy;
    const r = ENEMIES[e.kind].radius;
    const gap = wx * wx + wy * wy - r * r;
    let at: number;
    if (gap <= 0) at = 0;
    else {
      const disc = along * along - gap;
      if (disc < 0) continue;
      at = -along - Math.sqrt(disc);
      if (at < 0 || at > travel + EPS) continue;
    }
    if (b.hit.includes(e.id)) continue;
    if (!best || at < best.at || (at === best.at && e.id < best.enemy.id)) best = { enemy: e, at };
  }
  return best;
}

/** What a bullet of `damage` does to `e`: a Brute's armour takes some off (design §9). */
export const hitDamage = (e: Enemy, damage: number): number =>
  e.kind === 'brute' ? Math.max(BRUTE.min, damage - BRUTE.armour) : damage;

/**
 * Design §6 Ballistics: each bullet flies one step along its swept path (so a fast one
 * never tunnels) and hits the first enemy it crosses, once; a piercing one goes on to
 * the next within `PIERCE.reach`. Spent, or past its range, it is gone.
 */
function fly(s: HordeState): void {
  s.bullets = s.bullets.filter((b) => {
    let travel = Math.min(b.speed * STEP, b.left);
    for (let hit = crossed(s, b, travel); hit; hit = crossed(s, b, travel)) {
      hit.enemy.hp -= hitDamage(hit.enemy, b.damage);
      b.hit.push(hit.enemy.id);
      b.x += b.dx * hit.at;
      b.y += b.dy * hit.at;
      b.left -= hit.at;
      travel -= hit.at;
      s.impacts.push({ x: b.x, y: b.y, hit: true, at: s.time + STEP });
      if (b.pierce <= 0) return false;
      b.pierce -= 1;
      b.left = Math.min(b.left, PIERCE.reach);
      travel = Math.min(travel, b.left);
    }
    b.x += b.dx * travel;
    b.y += b.dy * travel;
    b.left -= travel;
    if (b.left > EPS) return true;
    s.impacts.push({ x: b.x, y: b.y, hit: false, at: s.time + STEP });
    return false;
  });
}

function fire(s: HordeState, rng: Rng): void {
  s.strikes = s.strikes.filter((k) => s.time - k.at < STRIKE_FLASH);
  s.shots = s.shots.filter((k) => s.time - k.at < MUZZLE_FLASH);
  s.impacts = s.impacts.filter((k) => s.time - k.at < IMPACT_FLASH);
  s.spits = s.spits.filter((k) => s.time - k.at < SPITTER.splash);
  s.bursts = s.bursts.filter((k) => s.time - k.at < BLOATER.burst);
  for (const post of s.posts) {
    const defender = s.defenders.find((d) => d.id === post.defenderId);
    if (!defender) continue;
    reload(s, defender);
    if (!due(s.time, defender.nextShotAt)) continue;
    const use = choose(s, defender, post);
    if (!use) continue;
    const { slot, target } = use;
    const id = defender.loadout[slot]!;
    const weapon = weaponOf(id);
    const gun = isGun(id);
    // Crits roll only when the chance is above 0, so a Ripper or Engineer without Aim leaves the RNG alone.
    const crit = gun ? critChance(defender) : 0;
    const hit =
      weapon.damage *
      s.mods.damage *
      boost(s, 'damage') *
      damageFactor(defender, id) *
      (crit > 0 && chance(rng, crit) ? STAT_EFFECT.critDamage : 1);
    if (gun) {
      launch(s, rng, {
        owner: defender.id,
        x: use.x,
        y: use.y,
        target,
        speed: gunOf(id).speed,
        spread: spreadOf(defender, id),
        range: gunRange(s, defender.walking ? { kind: 'ground' } : post, id),
        damage: hit,
        pierce: pierceOf(id),
        pellets: gunOf(id).pellets,
        tracer: gunOf(id).tracer,
      });
    } else {
      target.hp -= hit;
      s.strikes.push({ x: target.x, y: target.y, at: s.time, owner: defender.id });
    }
    const cleave = weapon.kind === 'blade' ? cleaveShare(defender) : 0;
    if (cleave > 0) {
      for (const e of s.enemies) {
        const near = Math.hypot(e.x - target.x, e.y - target.y) <= STAT_EFFECT.cleaveRadius + EPS;
        if (e !== target && e.hp > 0 && near) e.hp -= hit * cleave;
      }
    }
    defender.nextShotAt =
      s.time +
      weapon.fireInterval /
        (s.mods.fireRate *
          boost(s, 'fireRate') *
          engineerBuff(s, defender) *
          fireRateFactor(defender, id));
    if (gun) {
      defender.ammo[slot] -= 1;
      if (defender.ammo[slot] === 0) defender.reloadedAt[slot] = s.time + reloadTime(defender, id);
    }
  }
}

/**
 * Design §7: each turret that can fire and has a target draws `TURRET.draw` charge per
 * second, and shoots a bullet when due; each shot wears it. Below `slowBelow` condition it fires
 * slower, down to half speed. The bank never goes below 0.
 */
function fireTurrets(s: HordeState, rng: Rng): void {
  // In id order, so when the bank runs dry the lower ids get the last charge.
  for (const t of s.turrets) {
    if (turretState(s, t) !== 'lit') continue;
    const range = TURRET.range * TURRET_RANGE[t.mount];
    const target = targetFrom(s, t.x, t.y, range);
    if (!target) continue;
    s.energy = Math.max(0, s.energy - TURRET.draw * STEP);
    if (!due(s.time, t.nextShotAt)) continue;
    const buff = turretBuff(s, t);
    launch(s, rng, {
      owner: `turret:${t.id}`,
      x: t.x,
      y: t.y,
      target,
      speed: TURRET.speed,
      spread: TURRET.spread,
      range,
      damage: TURRET.damage * buff * boost(s, 'damage'),
      pierce: 0,
      pellets: 1,
      tracer: TURRET.tracer,
    });
    const slow = Math.min(1, 0.5 + (0.5 * t.condition) / TURRET.slowBelow);
    t.nextShotAt = s.time + TURRET.fireInterval / (buff * slow * boost(s, 'fireRate'));
    wear(t, TURRET.shotWear);
  }
}

/**
 * Design §7: each standing Engineer restores `TURRET.engineerRepair` condition/s (Tech
 * and title scale it) to the most worn turret within their tool's reach (ties → lower
 * id). A jammed turret waits for build mode.
 */
function repairTurrets(s: HordeState): void {
  for (const d of s.defenders) {
    if (d.walking || professionOf(d.loadout) !== 'engineer') continue;
    let worst: Turret | undefined;
    for (const t of s.turrets) {
      if (t.condition <= 0 || t.condition >= MAX_CONDITION) continue;
      if (!engineersNear(s, t).includes(d)) continue;
      if (!worst || t.condition < worst.condition) worst = t;
    }
    if (worst) {
      const gain = TURRET.engineerRepair * repairFactor(d) * STEP;
      worst.condition = Math.min(MAX_CONDITION, worst.condition + gain);
    }
  }
}

/**
 * Design §6: each standing Engineer restores HP to the most damaged standing segment
 * (lowest HP share; ties → lower row) of its post's layer, within one row of the post.
 * Broken segments wait for build mode.
 */
function repair(s: HordeState): void {
  for (const d of s.defenders) {
    if (d.walking || professionOf(d.loadout) !== 'engineer') continue;
    const w = toolOf(d.loadout.secondary!);
    const post = s.posts[d.postId]!;
    const layer = s.layers.find((l) => l.column === post.column);
    let worst: Segment | undefined;
    for (const seg of layer?.segments ?? []) {
      if (Math.abs(seg.index - post.row) > 1 || seg.hp <= 0 || seg.hp >= seg.maxHp) continue;
      if (!worst || seg.hp / seg.maxHp < worst.hp / worst.maxHp) worst = seg;
    }
    if (worst) worst.hp = Math.min(worst.maxHp, worst.hp + w.repair * repairFactor(d) * STEP);
  }
}

/** Pays XP and cash for every enemy at 0 HP and takes it off the field. */
export function removeDead(s: HordeState): void {
  for (const e of s.enemies) {
    if (e.hp > 0) continue;
    s.xp += ENEMIES[e.kind].xp;
    s.cash += ENEMIES[e.kind].cash;
    if (e.id === s.focusId) s.focusId = null;
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}

/** Whether a flashbang still holds `e` (fight time, so it waits out picks too). */
export const stunned = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  !due(s.time, e.stunnedUntil);

/**
 * Design §4, as built ID-019: each molotov fire burns every enemy inside it until it
 * goes out; the flash of a skill fades after `SKILL_FLASH`.
 */
function burn(s: HordeState): void {
  s.fires = s.fires.filter((f) => !due(s.time, f.until));
  s.blasts = s.blasts.filter((b) => s.time - b.at < SKILL_FLASH);
  for (const f of s.fires) {
    for (const e of s.enemies) {
      if (Math.hypot(e.x - f.x, e.y - f.y) <= SKILLS.molotov.radius + EPS) {
        e.hp = Math.max(0, e.hp - SKILLS.molotov.dps * STEP);
      }
    }
  }
}

const segmentAt = (y: number): number =>
  Math.min(SEGMENTS - 1, Math.max(0, Math.floor(y / SEGMENT_HEIGHT)));

/**
 * Where an enemy stops: the standing segment in front of it on the nearest layer
 * not yet crossed, else (through gaps) the camp. Walls ignore the enemy's radius.
 */
function stopLine(
  s: HordeState,
  e: Enemy,
): { x: number; segment: Segment | null; layer: Layer | null } {
  // Only layers not yet crossed: a segment patched up behind an enemy never pulls it back.
  const ahead = s.layers.filter((l) => l.x + WALL.depth <= e.x).sort((a, b) => b.x - a.x);
  for (const layer of ahead) {
    const segment = layer.segments[segmentAt(e.y)];
    if (segment && segment.hp > 0) return { x: layer.x + WALL.depth, segment, layer };
  }
  return { x: CAMP.x, segment: null, layer: null };
}

/** The broken segment of `layer` whose centre is nearest `y` (ties → lower index). */
function nearestGap(layer: Layer, y: number): Segment | null {
  let best: Segment | null = null;
  let bestD = Infinity;
  for (const seg of layer.segments) {
    const d = Math.abs((seg.index + 0.5) * SEGMENT_HEIGHT - y);
    if (seg.hp <= 0 && d < bestD) {
      best = seg;
      bestD = d;
    }
  }
  return best;
}

/** An enemy sliding toward a gap: where it started this step and the gap centre it heads for. */
type Slide = { fromY: number; toY: number };
/** This step's moves, by enemy id: slides toward a gap, and enemies in the camp within reach of a defender. */
type Moves = { sliding: Map<number, Slide>; reached: Map<number, Defender> };

/** The defender in the fight nearest `e` (ties → lower index), standing or walking. */
function nearestDefender(s: HordeState, e: Enemy): Defender | undefined {
  let best: Defender | undefined;
  let bestD = Infinity;
  for (const d of s.defenders) {
    const dist = Math.hypot(d.x - e.x, d.y - e.y);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

/**
 * Design §4: an enemy inside the camp walks straight to the nearest defender (walls
 * don't stop it from the camp side) and stops within reach; with no defender left it
 * walks to the camp line and waits.
 */
function hunt(s: HordeState, e: Enemy, speed: number, reached: Map<number, Defender>): void {
  const target = nearestDefender(s, e);
  if (!target) {
    if (e.x > CAMP.x) e.x = Math.max(CAMP.x, e.x - speed);
    return;
  }
  const dist = Math.hypot(target.x - e.x, target.y - e.y);
  const reach = meleeReach(e.kind);
  const stride = Math.min(speed, dist - reach);
  if (stride > 0) {
    e.x += ((target.x - e.x) / dist) * stride;
    e.y += ((target.y - e.y) / dist) * stride;
  }
  if (dist - Math.max(0, stride) <= reach + EPS) reached.set(e.id, target);
}

/** How far short of its stop line `e` halts: a Spitter at `SPITTER.stop`, the rest at it. */
const standOff = (e: Enemy): number => (e.kind === 'spitter' ? SPITTER.stop : 0);

/** Design §9: a Screamer speeds up the other enemies near it; several don't stack. */
function screamed(screamers: readonly Enemy[], e: Enemy): number {
  const near = screamers.some(
    (o) => o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= SCREAMER.radius + EPS,
  );
  return near ? 1 + SCREAMER.speed : 1;
}

/**
 * Design §9: a Crawler that reaches a standing segment for the first time climbs it
 * for `CRAWLER.climb` s, then drops behind that layer. If the segment breaks under it,
 * it stops climbing and walks on. Returns whether it is (still) on the wall.
 */
function climb(s: HordeState, e: Enemy, stop: ReturnType<typeof stopLine>, speed: number): boolean {
  if (e.kind !== 'crawler' || e.climbed) return false;
  const onWall = stop.segment !== null && e.x <= stop.x + speed + EPS;
  if (e.climbUntil === 0) {
    if (!onWall) return false;
    e.x = stop.x;
    e.climbUntil = s.time + CRAWLER.climb;
    return true;
  }
  if (!onWall) {
    e.climbUntil = 0;
    return false;
  }
  if (!due(s.time, e.climbUntil)) return true;
  const fromX = e.x;
  e.x = stop.layer!.x;
  e.climbUntil = 0;
  e.climbed = true;
  breach(s, e, fromX, true);
  return true;
}

/** Moves every enemy; returns this step's slides and the enemies in the camp within reach. */
function move(s: HordeState): Moves {
  const sliding = new Map<number, Slide>();
  const reached = new Map<number, Defender>();
  const screamers = s.enemies.filter((e) => e.kind === 'screamer' && e.hp > 0);
  for (const e of s.enemies) {
    if (stunned(s, e)) continue;
    const speed = ENEMIES[e.kind].speed * STEP * trapSlow(s, e) * screamed(screamers, e);
    if (e.inCamp) {
      hunt(s, e, speed, reached);
      continue;
    }
    let stop = stopLine(s, e);
    const sense = stop.layer && stop.x + standOff(e) >= e.x - GAP_SENSE;
    const gap = sense && e.climbUntil === 0 ? nearestGap(stop.layer!, e.y) : null;
    if (gap) {
      const toY = (gap.index + 0.5) * SEGMENT_HEIGHT;
      const dy = toY - e.y;
      sliding.set(e.id, { fromY: e.y, toY });
      e.y += Math.sign(dy) * Math.min(Math.abs(dy), speed);
      stop = stopLine(s, e);
    }
    if (climb(s, e, stop, speed)) {
      e.inCamp = s.layers.every((l) => e.x < l.x + WALL.depth);
      continue;
    }
    const fromX = e.x;
    // Never backwards: a Spitter pushed into a walled row inside its range stays put.
    e.x = Math.min(e.x, Math.max(stop.x + (stop.layer ? standOff(e) : 0), e.x - speed));
    breach(s, e, fromX);
    // Only through a gap in every layer; from now on it hunts defenders.
    e.inCamp = s.layers.every((l) => e.x < l.x + WALL.depth);
  }
  return { sliding, reached };
}

/** The trap whose cell `e` stands in, if any. */
function trapUnder(s: HordeState, e: Enemy): Trap | undefined {
  if (e.inCamp || e.x < TRAP_STRIP.x || e.x > TRAP_STRIP.x + TRAP_STRIP.width) return undefined;
  const row = segmentAt(e.y);
  return s.traps.find((t) => t.row === row);
}

/**
 * Design §7: an enemy in a working trap's cell that has not triggered it yet does
 * so: the trap loses 1 durability and deals its damage. A broken trap (0) does nothing.
 */
function springTraps(s: HordeState): void {
  for (const e of s.enemies) {
    const t = trapUnder(s, e);
    if (!t || t.durability <= 0 || t.hit.includes(e.id)) continue;
    t.hit.push(e.id);
    t.durability -= 1;
    e.hp = Math.max(0, e.hp - TRAPS[t.kind].damage);
  }
}

/**
 * Speed factor for `e`: the slow of the trap it stands in, if it triggered that trap.
 * An enemy that triggered barbed wire stays caught until it leaves the cell, even if
 * that trigger (or a later one) broke the wire; a broken trap catches no one new.
 */
function trapSlow(s: HordeState, e: Enemy): number {
  const t = trapUnder(s, e);
  return t?.hit.includes(e.id) ? TRAPS[t.kind].slow : 1;
}

/**
 * Records each layer `e` (from outside) crossed this step, the first time any enemy
 * does; a Crawler dropping over a standing segment went over it, not through.
 */
function breach(s: HordeState, e: Enemy, fromX: number, over = false): void {
  for (const l of s.layers) {
    const line = l.x + WALL.depth;
    if (fromX < line || e.x >= line || s.breaches.some((b) => b.column === l.column)) continue;
    const row = segmentAt(e.y);
    s.breaches.push({
      column: l.column,
      row,
      wave: s.wave,
      through: over ? 'climbed' : (l.segments[row]?.kind ?? 'gap'),
    });
  }
}

/**
 * Pushes overlapping enemies (bodies of their kind's radius) apart along `y` only
 * (never `x`, so never through a wall): the upper one up, the lower one down (equal
 * `y` → lower id up), each by half the overlap capped per step. Computed from
 * pre-push positions, then clamped to the field by each body's radius. An enemy in
 * the camp and one still outside never push each other: a wall stands between them,
 * so one pressed against it can't hold a hunter off for good.
 */
function separate(s: HordeState): void {
  const push = new Map<number, number>();
  const cap = SEPARATION_SPEED * STEP;
  const es = s.enemies;
  const radius = es.map((e) => ENEMIES[e.kind].radius);
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i]!;
      const b = es[j]!;
      if (a.inCamp !== b.inCamp) continue;
      const reach = radius[i]! + radius[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      // Most pairs are far apart: skip them before the square root.
      if (dx >= reach || -dx >= reach || dy >= reach || -dy >= reach) continue;
      const overlap = reach - Math.hypot(dx, dy);
      if (overlap <= 0) continue;
      const aUp = a.y < b.y || (a.y === b.y && a.id < b.id);
      const d = Math.min(overlap / 2, cap);
      push.set(a.id, (push.get(a.id) ?? 0) + (aUp ? -d : d));
      push.set(b.id, (push.get(b.id) ?? 0) + (aUp ? d : -d));
    }
  }
  es.forEach((e, i) => {
    const d = push.get(e.id);
    if (d === undefined) return;
    const r = radius[i]!;
    e.y = Math.min(FIELD.height - r, Math.max(r, e.y + d));
  });
}

/**
 * Enemies at their stop line hit the segment in front. One still getting closer to a
 * gap this step (after separation) holds off; one the crowd pushed back attacks, so a
 * packed crowd can't keep it from ever hitting the wall. An enemy in the camp hits the
 * defender it reached this step (before separation, so a crowd can't hold it off).
 * Design §9: a climbing Crawler doesn't attack; a Spitter spits from its stand-off; a
 * Bloater's hit is its blast, which takes it off the field with no kill paid.
 */
function attack(s: HordeState, moves: Moves): void {
  const blown = new Set<number>();
  for (const e of s.enemies) {
    if (stunned(s, e) || e.climbUntil > 0 || !due(s.time, e.nextAttackAt)) continue;
    const enemy = ENEMIES[e.kind];
    if (e.inCamp) {
      const defender = moves.reached.get(e.id);
      if (!defender) continue;
      defender.hitBy = e.kind;
      const damage =
        enemy.damage * (defender.loadout.item === 'shield' ? 1 - SHIELD.damageTaken : 1);
      defender.hp = Math.max(0, defender.hp - damage);
      if (e.kind === 'bloater') blown.add(e.id);
      e.nextAttackAt = s.time + enemy.attackInterval;
      continue;
    }
    const slide = moves.sliding.get(e.id);
    if (slide && Math.abs(slide.toY - e.y) < Math.abs(slide.toY - slide.fromY)) continue;
    if (e.kind === 'spitter' && spit(s, e)) {
      e.nextAttackAt = s.time + enemy.attackInterval;
      continue;
    }
    const stop = stopLine(s, e);
    if (!stop.segment || !stop.layer || e.x > stop.x + standOff(e) + EPS) continue;
    if (e.kind === 'bloater') {
      blast(s, stop.layer, stop.segment.index);
      blown.add(e.id);
      continue;
    }
    hitSegment(s, stop.layer, stop.segment, enemy.damage);
    if (e.kind === 'spitter') {
      s.spits.push({ fromX: e.x, fromY: e.y, x: stop.x, y: e.y, at: s.time + STEP });
    }
    e.nextAttackAt = s.time + enemy.attackInterval;
  }
  if (blown.size === 0) return;
  for (const e of s.enemies) {
    if (blown.has(e.id)) s.bursts.push({ id: e.id, x: e.x, y: e.y, at: s.time + STEP });
  }
  for (const id of blown) if (s.focusId === id) s.focusId = null;
  s.enemies = s.enemies.filter((e) => !blown.has(e.id));
}

/** Takes `damage` off a standing segment; only the damage it actually takes wears its turret. */
function hitSegment(s: HordeState, layer: Layer, segment: Segment, damage: number): void {
  if (segment.hp <= 0) return;
  wearMounted(s, layer.column, segment.index, Math.min(damage, segment.hp));
  segment.hp = Math.max(0, segment.hp - damage);
}

/** Design §9: a Bloater's blast on segment `row` of `layer`, and on its standing neighbours. */
function blast(s: HordeState, layer: Layer, row: number): void {
  const centre = layer.segments[row]!;
  hitSegment(s, layer, centre, BLOATER.wall);
  for (const n of [row - 1, row + 1]) {
    const seg = layer.segments[n];
    if (seg) hitSegment(s, layer, seg, BLOATER.splash);
  }
}

/**
 * Design §9: a Spitter spits at the nearest defender or working turret (not jammed,
 * its wall standing) within `SPITTER.range` (ties → defenders first, then lower
 * index): HP off a defender (a shield blocks its share), condition off a turret.
 * Returns false when there is none.
 */
function spit(s: HordeState, e: Enemy): boolean {
  let best: { x: number; y: number; hit: () => void } | null = null;
  let bestD = Infinity;
  const damage = ENEMIES.spitter.damage;
  for (const d of s.defenders) {
    const dist = Math.hypot(d.x - e.x, d.y - e.y);
    if (dist > SPITTER.range + EPS || dist >= bestD) continue;
    bestD = dist;
    best = {
      x: d.x,
      y: d.y,
      hit: () => {
        d.hitBy = 'spitter';
        const taken = damage * (d.loadout.item === 'shield' ? 1 - SHIELD.damageTaken : 1);
        d.hp = Math.max(0, d.hp - taken);
      },
    };
  }
  for (const t of s.turrets) {
    const state = turretState(s, t);
    if (state === 'jammed' || state === 'offline') continue;
    const dist = Math.hypot(t.x - e.x, t.y - e.y);
    if (dist > SPITTER.range + EPS || dist >= bestD) continue;
    bestD = dist;
    best = { x: t.x, y: t.y, hit: () => wear(t, damage) };
  }
  if (!best) return false;
  best.hit();
  s.spits.push({ fromX: e.x, fromY: e.y, x: best.x, y: best.y, at: s.time + STEP });
  return true;
}

/** Takes `amount` off `t`'s condition; float noise near 0 (1 − 5 × 0.2) jams it rather than leaving a sliver. */
function wear(t: Turret, amount: number): void {
  const c = t.condition - amount;
  t.condition = c <= EPS ? 0 : c;
}

/** Design §7: a hit on a segment wears the turret on its wall mount by `hitWear` per point. */
function wearMounted(s: HordeState, column: number, row: number, damage: number): void {
  for (const t of s.turrets) {
    if (t.mount !== 'wall-walk' || t.column !== column || t.row !== row) continue;
    wear(t, TURRET.hitWear * damage);
  }
}

/** Design §4: a defender at 0 HP is injured and leaves the fight; their post is free at once. */
function injure(s: HordeState): void {
  const kept: Defender[] = [];
  for (const d of s.defenders) {
    if (d.hp > 0) {
      kept.push(d);
      continue;
    }
    s.posts[d.postId]!.defenderId = null;
    s.injured.push({
      defender: specOf(d),
      postId: d.postId,
      at: s.time,
      offered: false,
      by: d.hitBy,
    });
  }
  s.defenders = kept;
}

/** Design §2: an enemy in the camp and no defender left for `FALL_WARNING` s loses the horde. */
function fall(s: HordeState): void {
  if (s.outcome !== 'fighting') return;
  if (s.defenders.length > 0 || !s.enemies.some((e) => e.inCamp)) {
    s.fallingFor = 0;
    return;
  }
  s.fallingFor += STEP;
  if (due(s.fallingFor, FALL_WARNING)) s.outcome = 'lost';
}

/**
 * Design §3: a defender holding (standing on or walking to) a wall-walk post whose
 * segment has broken falls back, in `defenders` order, to the nearest free ground post
 * behind that layer (ties → lowest id), or to the bench when none is free.
 */
function drop(s: HordeState): void {
  const kept: Defender[] = [];
  for (const d of s.defenders) {
    const post = s.posts[d.postId]!;
    if (postUsable(s.layers, post)) {
      kept.push(d);
      continue;
    }
    post.defenderId = null;
    let best: Post | undefined;
    let bestD = Infinity;
    for (const p of s.posts) {
      if (p.kind !== 'ground' || p.defenderId !== null || p.x >= COLUMNS[post.column]!) continue;
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist < bestD) {
        best = p;
        bestD = dist;
      }
    }
    if (best) {
      best.defenderId = d.id;
      d.postId = best.id;
      d.walking = true;
      kept.push(d);
    } else {
      s.bench.push(specOf(d));
    }
  }
  s.defenders = kept;
}

function advanceWave(s: HordeState): void {
  if (s.toSpawn > 0 || s.enemies.length > 0) return;
  if (s.wave >= s.waveCount) {
    s.outcome = 'won';
    return;
  }
  s.wave += 1;
  s.toSpawn = waveSize(s.hordeNumber, s.wave);
  s.breakUntil = s.time + WAVE_BREAK;
  openReplace(s);
}
