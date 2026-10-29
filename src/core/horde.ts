import { postXY, type Base, type PostKind, type SegmentKind, type Tier } from './base.ts';
import { levelUp, postUsable } from './cards.ts';
import {
  CAMP,
  COLUMNS,
  ENEMIES,
  ENEMY_RADIUS,
  FIELD,
  GAP_SENSE,
  POST_RANGE,
  SEGMENT_HEIGHT,
  SEGMENTS,
  SEPARATION_SPEED,
  SHOT_TRAIL,
  SPAWN_INTERVAL,
  STEP,
  WALL,
  WAVE_BREAK,
  WEAPONS,
  type EnemyKind,
  type WeaponId,
} from './data.ts';
import { int, rngFrom, type Rng, type RngState } from './rng.ts';
import { enemyHp, waveCount, waveSize } from './waves.ts';

export type UpgradeId = 'sharpshooter' | 'rapid-fire' | 'long-sight' | 'patch-up' | 'reinforce';

export interface DefenderSpec {
  id: string;
  name: string;
  weapon: WeaponId;
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
  defenderId: string | null;
}
export interface Defender extends DefenderSpec {
  nextShotAt: number;
}
export interface Shot {
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
  camp: { hp: number; maxHp: number };
  posts: Post[];
  defenders: Defender[];
  bench: DefenderSpec[];
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
    camp: { hp: CAMP.maxHp, maxHp: CAMP.maxHp },
    posts,
    defenders: [{ ...start, nextShotAt: 0 }],
    bench: roster.filter((d) => d !== start).map((d) => ({ ...d })),
    xp: 0,
    level: 1,
    offer: null,
    mods: { damage: 1, fireRate: 1, range: 1 },
    focusId: null,
    shots: [],
    outcome: 'fighting',
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
  if (s.offer !== null || s.outcome !== 'fighting') {
    s.acc = 0;
    return s;
  }
  const rng = rngFrom(s.rng);
  s.acc += dt;
  while (s.acc >= STEP - EPS) {
    s.acc = Math.max(0, s.acc - STEP);
    step(s, rng);
    if (s.offer !== null || s.outcome !== 'fighting') {
      s.acc = 0;
      break;
    }
  }
  return s;
}

export function defenderRange(state: HordeState, post: Post, defender: Defender): number {
  return WEAPONS[defender.weapon].range * POST_RANGE[post.kind] * state.mods.range;
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
  fire(s);
  removeDead(s);
  const sliding = move(s);
  separate(s);
  attack(s, sliding);
  advanceWave(s);
  if (s.camp.hp === 0) s.outcome = 'lost';
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
    });
    s.toSpawn -= 1;
    s.nextSpawnAt = s.time + SPAWN_INTERVAL;
  }
}

function fire(s: HordeState): void {
  s.shots = s.shots.filter((shot) => s.time - shot.at < SHOT_TRAIL);
  for (const post of s.posts) {
    const defender = s.defenders.find((d) => d.id === post.defenderId);
    if (!defender || !due(s.time, defender.nextShotAt)) continue;
    const range = defenderRange(s, post, defender);
    const dist = (e: Enemy): number => Math.hypot(e.x - post.x, e.y - post.y);
    const focus = s.enemies.find((e) => e.id === s.focusId && e.hp > 0);
    let target = focus && dist(focus) <= range ? focus : undefined;
    if (!target) {
      let best = Infinity;
      for (const e of s.enemies) {
        const d = dist(e);
        if (e.hp <= 0 || d > range) continue;
        if (d < best || (d === best && target && e.id < target.id)) {
          target = e;
          best = d;
        }
      }
    }
    if (!target) continue;
    const weapon = WEAPONS[defender.weapon];
    target.hp -= weapon.damage * s.mods.damage;
    defender.nextShotAt = s.time + weapon.fireInterval / s.mods.fireRate;
    s.shots.push({
      fromX: post.x,
      fromY: post.y,
      toX: target.x,
      toY: target.y,
      at: s.time,
    });
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

/** Moves every enemy; returns the slides toward a gap this step, by enemy id. */
function move(s: HordeState): Map<number, Slide> {
  const sliding = new Map<number, Slide>();
  for (const e of s.enemies) {
    const speed = ENEMIES[e.kind].speed * STEP;
    let stop = stopLine(s, e);
    const gap = stop.layer && stop.x >= e.x - GAP_SENSE ? nearestGap(stop.layer, e.y) : null;
    if (gap) {
      const toY = (gap.index + 0.5) * SEGMENT_HEIGHT;
      const dy = toY - e.y;
      sliding.set(e.id, { fromY: e.y, toY });
      e.y += Math.sign(dy) * Math.min(Math.abs(dy), speed);
      stop = stopLine(s, e);
    }
    e.x = Math.max(stop.x, e.x - speed);
  }
  return sliding;
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
 * Enemies at their stop line hit the segment in front (or the camp). One still getting
 * closer to a gap this step (after separation) holds off; one the crowd pushed back
 * attacks, so a packed crowd can't keep it from ever hitting the wall.
 */
function attack(s: HordeState, sliding: Map<number, Slide>): void {
  for (const e of s.enemies) {
    const slide = sliding.get(e.id);
    if (slide && Math.abs(slide.toY - e.y) < Math.abs(slide.toY - slide.fromY)) continue;
    const stop = stopLine(s, e);
    if (e.x > stop.x || !due(s.time, e.nextAttackAt)) continue;
    const enemy = ENEMIES[e.kind];
    const target = stop.segment ?? s.camp;
    target.hp = Math.max(0, target.hp - enemy.damage);
    e.nextAttackAt = s.time + enemy.attackInterval;
  }
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
}
