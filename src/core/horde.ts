import { levelUp } from './cards.ts';
import {
  CAMP,
  ENEMIES,
  FIELD_RIGHT,
  LANE_SPACING,
  LANES,
  POSTS,
  SHOT_TRAIL,
  SPAWN_INTERVAL,
  STEP,
  TOWER_RANGE_BONUS,
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
}
export interface Enemy {
  id: number;
  kind: EnemyKind;
  lane: number;
  x: number;
  hp: number;
  maxHp: number;
  nextAttackAt: number;
}
export interface Segment {
  lane: number;
  hp: number;
  maxHp: number;
}
/** One wall layer: one segment per lane. */
export interface Layer {
  x: number;
  segments: Segment[];
}
export interface Post {
  id: number;
  x: number;
  lane: number;
  kind: 'tower';
  defenderId: string | null;
}
export interface Defender extends DefenderSpec {
  nextShotAt: number;
}
export interface Shot {
  fromX: number;
  fromLane: number;
  toX: number;
  toLane: number;
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
  shots: Shot[];
  outcome: Outcome;
}

// Accumulated float time can land a hair before a due time; count it as due.
const EPS = 1e-9;
const due = (time: number, at: number): boolean => time >= at - EPS;

export function newHorde(seed: number, setup: HordeSetup): HordeState {
  const { hordeNumber, roster, startDefenderId } = setup;
  const start = roster.find((d) => d.id === startDefenderId);
  if (!start) throw new RangeError(`newHorde: unknown start defender ${startDefenderId}`);
  const posts: Post[] = POSTS.map((p, id) => ({
    id,
    ...p,
    defenderId: id === 0 ? start.id : null,
  }));
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
    layers: [
      {
        x: WALL.x,
        segments: Array.from({ length: LANES }, (_, lane) => ({
          lane,
          hp: WALL.segmentHp,
          maxHp: WALL.segmentHp,
        })),
      },
    ],
    camp: { hp: CAMP.maxHp, maxHp: CAMP.maxHp },
    posts,
    defenders: [{ ...start, nextShotAt: 0 }],
    bench: roster.filter((d) => d !== start).map((d) => ({ ...d })),
    xp: 0,
    level: 1,
    offer: null,
    mods: { damage: 1, fireRate: 1, range: 1 },
    shots: [],
    outcome: 'fighting',
  };
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
  return (
    WEAPONS[defender.weapon].range *
    (post.kind === 'tower' ? TOWER_RANGE_BONUS : 1) *
    state.mods.range
  );
}

function step(s: HordeState, rng: Rng): void {
  spawn(s, rng);
  fire(s);
  removeDead(s);
  move(s);
  attack(s);
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
      lane: int(rng, 0, LANES - 1),
      x: FIELD_RIGHT,
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
    let target: Enemy | undefined;
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - post.x, (e.lane - post.lane) * LANE_SPACING) > range) continue;
      if (!target || e.x < target.x || (e.x === target.x && e.id < target.id)) target = e;
    }
    if (!target) continue;
    const weapon = WEAPONS[defender.weapon];
    target.hp -= weapon.damage * s.mods.damage;
    defender.nextShotAt = s.time + weapon.fireInterval / s.mods.fireRate;
    s.shots.push({
      fromX: post.x,
      fromLane: post.lane,
      toX: target.x,
      toLane: target.lane,
      at: s.time,
    });
  }
}

function removeDead(s: HordeState): void {
  for (const e of s.enemies) if (e.hp <= 0) s.xp += ENEMIES[e.kind].xp;
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}

/** Where an enemy stops: the nearest standing segment ahead in its lane, else the camp. */
function stopLine(s: HordeState, e: Enemy): { x: number; segment: Segment | null } {
  let best: { x: number; segment: Segment | null } = { x: CAMP.x, segment: null };
  for (const layer of s.layers) {
    const x = layer.x + WALL.depth;
    const segment = layer.segments[e.lane];
    // Only layers not yet passed: a segment patched up behind an enemy never pulls it back.
    if (segment && segment.hp > 0 && x <= e.x && x > best.x) best = { x, segment };
  }
  return best;
}

function move(s: HordeState): void {
  for (const e of s.enemies) {
    e.x = Math.max(stopLine(s, e).x, e.x - ENEMIES[e.kind].speed * STEP);
  }
}

function attack(s: HordeState): void {
  for (const e of s.enemies) {
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
