import { postXY, type Base, type PostKind, type SegmentKind, type Tier } from './base.ts';
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
  MELEE_REACH,
  POST_RANGE,
  SEGMENT_HEIGHT,
  SEGMENTS,
  SEPARATION_SPEED,
  SHIELD,
  SHOT_TRAIL,
  SIDEARM_CLOSE,
  SPAWN_INTERVAL,
  STAT_EFFECT,
  STEP,
  WALK_SPEED,
  WALL,
  WAVE_BREAK,
  type EnemyKind,
  type Stats,
} from './data.ts';
import { pierces, type Held } from './armoury.ts';
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
} from './stats.ts';
import { enemyHp, waveCount, waveSize } from './waves.ts';

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
  x: number;
  y: number;
  /** Occupied by, or reserved for a defender walking to it. */
  defenderId: string | null;
}
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
  /** What the enemy went through: a broken wall or gate, or a slot never built. */
  through: SegmentKind | 'gap';
}
/** The open replacement offer: post `postId` is the injured one's, or null for the player's pick. */
export interface ReplaceOffer {
  injuredId: string;
  postId: number | null;
}
export type MoveResult = { ok: true; state: HordeState } | { ok: false; reason: string };
/** A gun's shot, or a blade or tool strike (drawn short). */
export interface Shot {
  melee: boolean;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
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
  /** Player-picked target; null = each defender shoots the enemy closest to it. */
  focusId: number | null;
  shots: Shot[];
  outcome: Outcome;
}

// Accumulated float time can land a hair before a due time; count it as due.
const EPS = 1e-9;
const due = (time: number, at: number): boolean => time >= at - EPS;
/** Waiting on the player: a card pick or a replacement. */
const paused = (s: HordeState): boolean =>
  s.offer !== null || s.replace !== null || s.outcome !== 'fighting';

export function newHorde(seed: number, setup: HordeSetup): HordeState {
  const { hordeNumber, roster, startDefenderId, base, startPostId } = setup;
  const start = roster.find((d) => d.id === startDefenderId);
  if (!start) throw new RangeError(`newHorde: unknown start defender ${startDefenderId}`);
  const { layers, posts } = layoutOf(base);
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
    focusId: null,
    shots: [],
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

/** The base laid out on the field: layers at their wall `x`, posts unmanned, ids = `base.posts` index. */
export function layoutOf(base: Base): { layers: Layer[]; posts: Post[] } {
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
  return { layers, posts };
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
  if (!match) throw new RangeError('baseAfter: the horde was not fought on this base');
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
  let bestD = 2 * ENEMY_RADIUS;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (e.hp <= 0 || d > bestD || (d === bestD && best && e.id > best.id)) continue;
    best = e;
    bestD = d;
  }
  return best?.id ?? null;
}

function step(s: HordeState, rng: Rng): void {
  spawn(s, rng);
  walk(s);
  fire(s, rng);
  repair(s);
  removeDead(s);
  const moved = move(s);
  separate(s);
  attack(s, moved);
  injure(s);
  drop(s);
  advanceWave(s);
  fall(s);
  // A finished fight has no card to pick, so its XP stays banked.
  if (s.outcome === 'fighting') levelUp(s, rng);
  s.time += STEP;
}

function spawn(s: HordeState, rng: Rng): void {
  while (s.toSpawn > 0 && due(s.time, s.nextSpawnAt) && due(s.time, s.breakUntil)) {
    const hp = enemyHp('shambler', s.hordeNumber, s.wave);
    s.enemies.push({
      id: s.nextEnemyId++,
      kind: 'shambler',
      x: FIELD.right,
      y: int(rng, ENEMY_RADIUS, FIELD.height - ENEMY_RADIUS),
      hp,
      maxHp: hp,
      nextAttackAt: 0,
      inCamp: false,
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
 * The enemy a pierced shot from (x, y) through `target` hits next: the nearest one past
 * the target within `PIERCE.width` of the shot's line and `PIERCE.reach` beyond it.
 */
function behind(s: HordeState, x: number, y: number, target: Enemy): Enemy | null {
  const length = Math.hypot(target.x - x, target.y - y);
  if (length === 0) return null;
  const ux = (target.x - x) / length;
  const uy = (target.y - y) / length;
  let best: Enemy | null = null;
  let bestAlong = Infinity;
  for (const e of s.enemies) {
    if (e === target || e.hp <= 0) continue;
    const along = (e.x - x) * ux + (e.y - y) * uy;
    const across = Math.abs((e.x - x) * uy - (e.y - y) * ux);
    if (along <= length || along > length + PIERCE.reach + EPS || across > PIERCE.width + EPS) {
      continue;
    }
    if (along < bestAlong) {
      best = e;
      bestAlong = along;
    }
  }
  return best;
}

function fire(s: HordeState, rng: Rng): void {
  s.shots = s.shots.filter((shot) => s.time - shot.at < SHOT_TRAIL);
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
      damageFactor(defender, id) *
      (crit > 0 && chance(rng, crit) ? STAT_EFFECT.critDamage : 1);
    target.hp -= hit;
    if (gun && pierces(id)) {
      const next = behind(s, use.x, use.y, target);
      if (next) {
        next.hp -= hit;
        s.shots.push({
          melee: false,
          fromX: target.x,
          fromY: target.y,
          toX: next.x,
          toY: next.y,
          at: s.time,
        });
      }
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
        (s.mods.fireRate * engineerBuff(s, defender) * fireRateFactor(defender, id));
    if (gun) {
      defender.ammo[slot] -= 1;
      if (defender.ammo[slot] === 0) defender.reloadedAt[slot] = s.time + reloadTime(defender, id);
    }
    s.shots.push({
      melee: !gun,
      fromX: use.x,
      fromY: use.y,
      toX: target.x,
      toY: target.y,
      at: s.time,
    });
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

function removeDead(s: HordeState): void {
  for (const e of s.enemies) {
    if (e.hp > 0) continue;
    s.xp += ENEMIES[e.kind].xp;
    if (e.id === s.focusId) s.focusId = null;
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
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
  const stride = Math.min(speed, dist - MELEE_REACH);
  if (stride > 0) {
    e.x += ((target.x - e.x) / dist) * stride;
    e.y += ((target.y - e.y) / dist) * stride;
  }
  if (dist - Math.max(0, stride) <= MELEE_REACH + EPS) reached.set(e.id, target);
}

/** Moves every enemy; returns this step's slides and the enemies in the camp within reach. */
function move(s: HordeState): Moves {
  const sliding = new Map<number, Slide>();
  const reached = new Map<number, Defender>();
  for (const e of s.enemies) {
    const speed = ENEMIES[e.kind].speed * STEP;
    if (e.inCamp) {
      hunt(s, e, speed, reached);
      continue;
    }
    let stop = stopLine(s, e);
    const gap = stop.layer && stop.x >= e.x - GAP_SENSE ? nearestGap(stop.layer, e.y) : null;
    if (gap) {
      const toY = (gap.index + 0.5) * SEGMENT_HEIGHT;
      const dy = toY - e.y;
      sliding.set(e.id, { fromY: e.y, toY });
      e.y += Math.sign(dy) * Math.min(Math.abs(dy), speed);
      stop = stopLine(s, e);
    }
    const fromX = e.x;
    e.x = Math.max(stop.x, e.x - speed);
    breach(s, e, fromX);
    // Only through a gap in every layer; from now on it hunts defenders.
    e.inCamp = s.layers.every((l) => e.x < l.x + WALL.depth);
  }
  return { sliding, reached };
}

/** Records each layer `e` (from outside) crossed this step, the first time any enemy does. */
function breach(s: HordeState, e: Enemy, fromX: number): void {
  for (const l of s.layers) {
    const line = l.x + WALL.depth;
    if (fromX < line || e.x >= line || s.breaches.some((b) => b.column === l.column)) continue;
    const row = segmentAt(e.y);
    s.breaches.push({
      column: l.column,
      row,
      wave: s.wave,
      through: l.segments[row]?.kind ?? 'gap',
    });
  }
}

/**
 * Pushes overlapping enemies apart along `y` only (never `x`, so never through a
 * wall): the upper one up, the lower one down (equal `y` → lower id up), each by
 * half the overlap capped per step. Computed from pre-push positions, then clamped
 * to the field.
 */
function separate(s: HordeState): void {
  const push = new Map<number, number>();
  const cap = SEPARATION_SPEED * STEP;
  const es = s.enemies;
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i]!;
      const b = es[j]!;
      const overlap = 2 * ENEMY_RADIUS - Math.hypot(a.x - b.x, a.y - b.y);
      if (overlap <= 0) continue;
      const aUp = a.y < b.y || (a.y === b.y && a.id < b.id);
      const d = Math.min(overlap / 2, cap);
      push.set(a.id, (push.get(a.id) ?? 0) + (aUp ? -d : d));
      push.set(b.id, (push.get(b.id) ?? 0) + (aUp ? d : -d));
    }
  }
  for (const e of es) {
    const d = push.get(e.id);
    if (d === undefined) continue;
    e.y = Math.min(FIELD.height - ENEMY_RADIUS, Math.max(ENEMY_RADIUS, e.y + d));
  }
}

/**
 * Enemies at their stop line hit the segment in front. One still getting closer to a
 * gap this step (after separation) holds off; one the crowd pushed back attacks, so a
 * packed crowd can't keep it from ever hitting the wall. An enemy in the camp hits the
 * defender it reached this step (before separation, so a crowd can't hold it off).
 */
function attack(s: HordeState, moves: Moves): void {
  for (const e of s.enemies) {
    if (!due(s.time, e.nextAttackAt)) continue;
    const enemy = ENEMIES[e.kind];
    let target: { hp: number } | null;
    let damage = enemy.damage;
    if (e.inCamp) {
      const defender = moves.reached.get(e.id);
      if (defender) defender.hitBy = e.kind;
      if (defender?.loadout.item === 'shield') damage *= 1 - SHIELD.damageTaken;
      target = defender ?? null;
    } else {
      const slide = moves.sliding.get(e.id);
      if (slide && Math.abs(slide.toY - e.y) < Math.abs(slide.toY - slide.fromY)) continue;
      const stop = stopLine(s, e);
      target = e.x > stop.x ? null : stop.segment;
    }
    if (!target) continue;
    target.hp = Math.max(0, target.hp - damage);
    e.nextAttackAt = s.time + enemy.attackInterval;
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
