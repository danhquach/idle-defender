// Design §9 (ID-023): the enemy roster, its share of each wave and each kind's behaviour.
import { describe, expect, it } from 'vitest';
import { buildPost, buildTurret, newBase, type Base } from './base.ts';
import {
  BLOATER,
  BRUTE,
  CRAWLER,
  ENEMIES,
  ENEMY_MIX,
  MELEE_REACH,
  SCREAMER,
  SEGMENT_HEIGHT,
  SPITTER,
  STEP,
  START_BASE,
  WEAPONS,
  meleeReach,
  type EnemyKind,
  type Stock,
} from './data.ts';
import {
  enemyAt,
  hitDamage,
  newHorde,
  standing,
  tick,
  type Bullet,
  type HordeState,
} from './horde.ts';
import { loadoutFrom } from './loadout.ts';
import { createRng } from './rng.ts';
import { answerOffer } from './sim.ts';
import { enemy, landed, setup } from './testing.ts';
import { kindFor, waveMix } from './waves.ts';

const RICH: Stock = { scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 };
const tough = { hp: 1000, maxHp: 1000 };
/** Row 4's middle: level with defender a on the upper tower (420, 360). */
const ROW4 = 4.5 * SEGMENT_HEIGHT;

/** Horde 1 with nothing left to spawn; defender a on the upper tower (420, 360) never fires. */
function quiet(base: Base = newBase()): HordeState {
  const s = newHorde(1, { ...setup(), base });
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
/** `s` ticked for `seconds`. */
function run(s: HordeState, seconds: number): HordeState {
  let t = s;
  for (let i = 0; i < Math.round(seconds / STEP); i++) t = tick(t, STEP);
  return t;
}
const one = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id);
const hpAt = (s: HordeState, row: number): number => s.layers[0]!.segments[row]!.hp;

describe('the horde mix', () => {
  it('Horde 1 (the tutorial) is Shamblers only; Runners join at Horde 2', () => {
    expect(waveMix(1)).toEqual([['shambler', 1]]);
    expect(waveMix(2)).toEqual([
      ['shambler', 0.85],
      ['runner', 0.15],
    ]);
  });

  it('adds each mutant at its horde (Crawler 5 … Screamer 9), 10% each, Shamblers the rest', () => {
    const joins: [EnemyKind, number][] = [
      ['crawler', 5],
      ['spitter', 6],
      ['bloater', 7],
      ['brute', 8],
      ['screamer', 9],
    ];
    for (const [kind, from] of joins) {
      expect(ENEMY_MIX[kind]).toEqual({ from, share: 0.1 });
      expect(waveMix(from - 1).some(([k]) => k === kind)).toBe(false);
      expect(waveMix(from).some(([k]) => k === kind)).toBe(true);
    }
    for (let n = 1; n <= 12; n++) {
      expect(waveMix(n).reduce((sum, [, share]) => sum + share, 0)).toBeCloseTo(1, 12);
    }
    expect(waveMix(9)[0]).toEqual(['shambler', expect.closeTo(0.35, 12)]);
  });

  it('a roll picks along the mix: the bottom is a Shambler, the top the last kind to join', () => {
    expect(kindFor(9, 0)).toBe('shambler');
    expect(kindFor(9, 0.36)).toBe('runner');
    expect(kindFor(9, 0.999)).toBe('screamer');
    expect(kindFor(1, 0.999)).toBe('shambler');
  });

  it('rolls each kind at its share: 20,000 rolls land within a point of the mix', () => {
    const rng = createRng(11);
    const counts = new Map<EnemyKind, number>();
    for (let i = 0; i < 20_000; i++) {
      const k = kindFor(9, rng());
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [kind, share] of waveMix(9)) {
      expect((counts.get(kind) ?? 0) / 20_000, kind).toBeCloseTo(share, 1.7);
    }
  });

  /** Every enemy's kind by id over the first `seconds` of Horde `n`, seed `seed`. */
  function spawned(n: number, seed: number, seconds: number): Map<number, EnemyKind> {
    const kinds = new Map<number, EnemyKind>();
    let t = newHorde(seed, { ...setup(), hordeNumber: n });
    for (let i = 0; i < seconds / STEP && t.outcome === 'fighting'; i++) {
      t = t.offer || t.replace ? answerOffer(t) : tick(t, STEP);
      for (const e of t.enemies) kinds.set(e.id, e.kind);
    }
    return kinds;
  }

  it('spawns every kind of its mix, seeded: the same seed sends the same enemies', () => {
    const h1 = spawned(1, 3, 60);
    expect(new Set(h1.values())).toEqual(new Set(['shambler']));
    const h9 = spawned(9, 3, 60);
    const seen = new Set([1, 2, 3, 4, 5].flatMap((seed) => [...spawned(9, seed, 60).values()]));
    // Every kind but the Horror, which comes only as a boss (ID-024).
    expect(seen).toEqual(new Set(Object.keys(ENEMIES).filter((k) => k !== 'horror')));
    expect([...spawned(9, 3, 60)]).toEqual([...h9]);
    expect([...spawned(9, 4, 60)]).not.toEqual([...h9]);
  });

  it('spawns each kind with its HP scaled by wave and horde', () => {
    const s = newHorde(1, { ...setup(), hordeNumber: 9 });
    const t = run(s, 10);
    for (const e of t.enemies) {
      expect(e.maxHp).toBe(Math.round(ENEMIES[e.kind].hp * 1.15 ** 8));
    }
  });
});

describe('body size', () => {
  it('bullets hit a Brute 15 px off its centre, and pass a Shambler or a Crawler there', () => {
    for (const [kind, hits] of [
      ['brute', true],
      ['crawler', false],
      ['shambler', false],
    ] as const) {
      const s = quiet();
      const e = enemy(s, { ...tough, kind, x: 800, y: ROW4 + 15, stunnedUntil: 9 });
      const b: Bullet = {
        x: 420,
        y: ROW4,
        dx: 1,
        dy: 0,
        speed: 1800,
        damage: 6,
        owner: 'a',
        fromX: 420,
        fromY: ROW4,
        aim: 380,
        left: 600,
        pierce: 0,
        hit: [],
        tracer: WEAPONS.pistol.tracer,
      };
      s.bullets.push(b);
      expect(one(landed(s), e.id)!.hp < 1000, kind).toBe(hits);
    }
  });

  it('a click focuses an enemy within its radius plus a body of reach', () => {
    const s = quiet();
    const brute = enemy(s, { kind: 'brute', x: 800, y: 200 });
    const crawler = enemy(s, { kind: 'crawler', x: 800, y: 600 });
    expect(enemyAt(s, 830, 200)).toBe(brute.id);
    expect(enemyAt(s, 833, 200)).toBeNull();
    expect(enemyAt(s, 820, 600)).toBe(crawler.id);
    expect(enemyAt(s, 823, 600)).toBeNull();
  });

  it('separation pushes bodies apart by the sum of their radii', () => {
    const s = quiet();
    const a = enemy(s, { kind: 'brute', x: 1200, y: 300, stunnedUntil: 9 });
    const b = enemy(s, { kind: 'brute', x: 1200, y: 330, stunnedUntil: 9 });
    const c = enemy(s, { kind: 'crawler', x: 1200, y: 600, stunnedUntil: 9 });
    const d = enemy(s, { kind: 'crawler', x: 1200, y: 620, stunnedUntil: 9 });
    const t = tick(s, STEP);
    expect(one(t, b.id)!.y - one(t, a.id)!.y).toBeGreaterThan(30);
    expect(one(t, d.id)!.y - one(t, c.id)!.y).toBe(20);
  });

  it('in the camp, an enemy hits a defender from its own radius plus theirs', () => {
    expect(meleeReach('shambler')).toBe(MELEE_REACH);
    expect(meleeReach('brute')).toBe(ENEMIES.brute.radius + ENEMIES.shambler.radius);
    const s = quiet();
    const a = s.defenders[0]!;
    enemy(s, { ...tough, kind: 'brute', x: a.x + meleeReach('brute'), y: a.y, inCamp: true });
    const t = tick(s, STEP);
    expect(t.defenders[0]!.hp).toBe(a.hp - ENEMIES.brute.damage);
    expect(t.defenders[0]!.hitBy).toBe('brute');
  });
});

describe('Runner', () => {
  it('runs at its own speed', () => {
    const s = quiet();
    const e = enemy(s, { ...tough, kind: 'runner', x: 1400, y: 100 });
    expect(one(run(s, 1), e.id)!.x).toBeCloseTo(1400 - ENEMIES.runner.speed, 6);
  });

  it('passes a slower enemy in its way by sliding aside', () => {
    const s = quiet();
    const slow = enemy(s, { ...tough, x: 1250, y: 400 });
    const fast = enemy(s, { ...tough, kind: 'runner', x: 1300, y: 400 });
    const t = run(s, 3);
    expect(one(t, fast.id)!.x).toBeLessThan(one(t, slow.id)!.x);
  });
});

describe('Crawler', () => {
  it('climbs the first standing segment it reaches, then drops behind it, wall untouched', () => {
    const s = quiet();
    const full = hpAt(s, 4);
    const e = enemy(s, { ...tough, kind: 'crawler', x: 530, y: ROW4 });
    const on = run(s, 0.5);
    const c = one(on, e.id)!;
    expect(c.x).toBe(520);
    expect(c.climbUntil).toBeGreaterThan(0);
    expect(c.climbUntil).toBeLessThanOrEqual(0.5 + CRAWLER.climb);
    expect(c.climbed).toBe(false);
    const over = run(on, CRAWLER.climb);
    const d = one(over, e.id)!;
    expect(d.climbed).toBe(true);
    expect(d.climbUntil).toBe(0);
    expect(d.inCamp).toBe(true);
    expect(d.x).toBeLessThanOrEqual(500);
    expect(hpAt(over, 4)).toBe(full);
    // It went over, not through: the defeat screen says so.
    expect(over.breaches).toEqual([{ column: 0, row: 4, wave: 1, through: 'climbed' }]);
  });

  it('skips one layer only: at the next it hits the wall like anyone else', () => {
    const s = quiet();
    s.layers.push({ ...structuredClone(s.layers[0]!), column: 1, x: 760 });
    const full = hpAt(s, 4);
    const e = enemy(s, { ...tough, kind: 'crawler', x: 790, y: ROW4 });
    const over = run(s, 1 + CRAWLER.climb);
    expect(one(over, e.id)!.climbed).toBe(true);
    expect(one(over, e.id)!.x).toBeLessThanOrEqual(760);
    const next = run(over, 8);
    const c = one(next, e.id)!;
    expect(c.x).toBe(520);
    expect(c.climbUntil).toBe(0);
    expect(c.inCamp).toBe(false);
    expect(hpAt(next, 4)).toBeLessThan(full);
  });

  it('is in reach of wall-walk melee while it climbs', () => {
    const built = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: 4 });
    if (!built.ok) throw new Error(built.reason);
    const s = newHorde(1, { ...setup(), base: built.base });
    s.toSpawn = 0;
    s.defenders = [];
    for (const p of s.posts) p.defenderId = null;
    const post = s.posts.find((p) => p.kind === 'wall-walk')!;
    post.defenderId = 'j';
    s.defenders.push(standing({ id: 'j', name: 'J', loadout: loadoutFrom('knife') }, post, 0));
    const e = enemy(s, { ...tough, kind: 'crawler', x: 520, y: post.y, climbUntil: 3 });
    const t = tick(s, STEP);
    expect(one(t, e.id)!.climbUntil).toBe(3);
    expect(one(t, e.id)!.hp).toBe(1000 - WEAPONS.knife.damage);
  });

  it('a segment broken under it ends the climb: it walks on through the gap', () => {
    const s = quiet();
    const e = enemy(s, { ...tough, kind: 'crawler', x: 530, y: ROW4 });
    const on = run(s, 0.5);
    on.layers[0]!.segments[4]!.hp = 0;
    const through = run(on, 1);
    const c = one(through, e.id)!;
    expect(c.climbed).toBe(false);
    expect(c.climbUntil).toBe(0);
    expect(c.inCamp).toBe(true);
  });
});

describe('Bloater', () => {
  it('explodes at a standing segment: big damage there and to the segments above and below', () => {
    const s = quiet();
    const before = [3, 4, 5, 6].map((r) => hpAt(s, r));
    const e = enemy(s, { kind: 'bloater', x: 521, y: ROW4, hp: 60, maxHp: 60 });
    const t = run(s, 0.2);
    expect(one(t, e.id)).toBeUndefined();
    expect(hpAt(t, 4)).toBe(before[1]! - BLOATER.wall);
    expect(hpAt(t, 3)).toBe(before[0]! - BLOATER.splash);
    expect(hpAt(t, 5)).toBe(before[2]! - BLOATER.splash);
    expect(hpAt(t, 6)).toBe(before[3]);
    // A burst, not a death: the renderer shows it blow up, not fall.
    expect(t.bursts).toEqual([{ id: e.id, x: 520, y: ROW4, at: expect.any(Number) }]);
    // It wasn't killed, so it pays nothing.
    expect(t.xp).toBe(0);
    expect(t.cash).toBe(0);
  });

  it('killed first, it pops harmlessly and pays its kill', () => {
    const s = quiet();
    const walls = s.layers[0]!.segments.map((g) => g.hp);
    enemy(s, { kind: 'bloater', x: 540, y: ROW4, hp: 0 });
    const t = tick(s, STEP);
    expect(t.enemies).toEqual([]);
    expect(t.bursts).toEqual([]);
    expect(t.layers[0]!.segments.map((g) => g.hp)).toEqual(walls);
    expect(t.xp).toBe(ENEMIES.bloater.xp);
    expect(t.cash).toBe(ENEMIES.bloater.cash);
  });

  it('in the camp it blows up on the defender it reaches', () => {
    const s = quiet();
    const a = s.defenders[0]!;
    const x = a.x + meleeReach('bloater');
    const e = enemy(s, { kind: 'bloater', x, y: a.y, hp: 60, maxHp: 60, inCamp: true });
    const t = tick(s, STEP);
    expect(one(t, e.id)).toBeUndefined();
    expect(t.bursts.map((b) => b.id)).toEqual([e.id]);
    expect(t.defenders[0]!.hp).toBe(a.hp - ENEMIES.bloater.damage);
  });
});

describe('Spitter', () => {
  it('stops short of the wall and spits at it when nothing else is in range', () => {
    const s = quiet();
    const full = hpAt(s, 0);
    const e = enemy(s, { ...tough, kind: 'spitter', x: 700, y: 40 });
    let t = s;
    let spat = 0;
    for (let i = 0; i < 6 / STEP; i++) {
      t = tick(t, STEP);
      spat += t.spits.filter((k) => Math.abs(k.at - t.time) < 1e-9).length;
    }
    expect(one(t, e.id)!.x).toBe(520 + SPITTER.stop);
    expect(spat).toBeGreaterThan(0);
    expect(hpAt(t, 0)).toBe(full - spat * ENEMIES.spitter.damage);
    expect(t.defenders[0]!.hp).toBe(s.defenders[0]!.hp);
  });

  it('spits at a defender in range first: HP off, and the injury names it', () => {
    const s = quiet();
    const a = s.defenders[0]!;
    const full = hpAt(s, 4);
    enemy(s, { ...tough, kind: 'spitter', x: a.x + SPITTER.range - 1, y: a.y });
    const t = tick(s, STEP);
    expect(t.defenders[0]!.hp).toBe(a.hp - ENEMIES.spitter.damage);
    expect(t.defenders[0]!.hitBy).toBe('spitter');
    expect(t.spits).toEqual([
      { fromX: expect.any(Number), fromY: a.y, x: a.x, y: a.y, at: expect.any(Number) },
    ]);
    expect(hpAt(t, 4)).toBe(full);
    // Never steps back to its stand-off once inside it.
    expect(t.enemies[0]!.x).toBeLessThan(a.x + SPITTER.range);
  });

  it('spits at a turret in range, wearing its condition', () => {
    const built = buildTurret(newBase(), RICH, true, 'tower', 0, 5);
    if (!built.ok) throw new Error(built.reason);
    const s = quiet(built.base);
    s.defenders[0]!.x = -1000;
    const turret = s.turrets[0]!;
    enemy(s, { ...tough, kind: 'spitter', x: turret.x + 180, y: turret.y, stunnedUntil: 0 });
    const t = tick(s, STEP);
    // The turret's own shot wears it too; the spit takes its damage on top.
    const shotWear =
      turret.condition - tick(quietTurretOnly(built.base), STEP).turrets[0]!.condition;
    expect(t.turrets[0]!.condition).toBeCloseTo(
      turret.condition - shotWear - ENEMIES.spitter.damage,
      9,
    );
  });

  it('leaves a turret whose wall broke alone', () => {
    const built = buildTurret(newBase(), RICH, true, 'wall-walk', 0, 4);
    if (!built.ok) throw new Error(built.reason);
    const s = quiet(built.base);
    s.defenders[0]!.x = -1000;
    s.layers[0]!.segments[4]!.hp = 0;
    const turret = s.turrets[0]!;
    enemy(s, { ...tough, kind: 'spitter', x: turret.x + 180, y: turret.y });
    const t = tick(s, STEP);
    expect(t.turrets[0]!.condition).toBe(turret.condition);
    expect(t.spits.some((k) => k.x === turret.x && k.y === turret.y)).toBe(false);
  });

  /** As the turret test, with the Spitter swapped for a Shambler: only the turret's own wear. */
  function quietTurretOnly(base: Base): HordeState {
    const s = quiet(base);
    s.defenders[0]!.x = -1000;
    const turret = s.turrets[0]!;
    enemy(s, { ...tough, x: turret.x + 180, y: turret.y });
    return s;
  }
});

describe('Brute', () => {
  it('armour takes some damage off each bullet, never below the minimum', () => {
    const brute = { kind: 'brute' } as Parameters<typeof hitDamage>[0];
    const shambler = { kind: 'shambler' } as Parameters<typeof hitDamage>[0];
    expect(hitDamage(brute, 6.2)).toBeCloseTo(6.2 - BRUTE.armour, 12);
    expect(hitDamage(brute, 2)).toBe(BRUTE.min);
    expect(hitDamage(shambler, 6.2)).toBe(6.2);
  });

  it('a piercing bullet pays the armour at every Brute it goes through', () => {
    const s = quiet();
    const a = enemy(s, { ...tough, kind: 'brute', x: 600, y: ROW4, stunnedUntil: 9 });
    const b = enemy(s, { ...tough, kind: 'brute', x: 700, y: ROW4, stunnedUntil: 9 });
    s.bullets.push({
      x: 420,
      y: ROW4,
      dx: 1,
      dy: 0,
      speed: 3000,
      damage: 10,
      owner: 'a',
      fromX: 420,
      fromY: ROW4,
      aim: 180,
      left: 900,
      pierce: 1,
      hit: [],
      tracer: WEAPONS.sniper.tracer,
    });
    const t = landed(s);
    expect(one(t, a.id)!.hp).toBe(1000 - (10 - BRUTE.armour));
    expect(one(t, b.id)!.hp).toBe(1000 - (10 - BRUTE.armour));
  });

  it('a blade ignores the armour', () => {
    const gate = START_BASE.gate;
    const built = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: gate });
    if (!built.ok) throw new Error(built.reason);
    const s = newHorde(1, { ...setup(), base: built.base });
    s.toSpawn = 0;
    s.defenders = [];
    for (const p of s.posts) p.defenderId = null;
    const post = s.posts.find((p) => p.kind === 'wall-walk')!;
    post.defenderId = 'j';
    s.defenders.push(standing({ id: 'j', name: 'J', loadout: loadoutFrom('knife') }, post, 0));
    const e = enemy(s, { ...tough, kind: 'brute', x: 520, y: post.y });
    expect(one(tick(s, STEP), e.id)!.hp).toBe(1000 - WEAPONS.knife.damage);
  });
});

describe('Screamer', () => {
  /** x moved in 0.5 s by each enemy, enemies far from the wall. */
  function moved(placed: { kind: EnemyKind; x: number; y: number }[]): number[] {
    const s = quiet();
    const ids = placed.map((p) => enemy(s, { ...tough, ...p }).id);
    const t = run(s, 0.5);
    return ids.map((id, i) => placed[i]!.x - one(t, id)!.x);
  }
  const fast = ENEMIES.shambler.speed * 0.5 * (1 + SCREAMER.speed);
  const plain = ENEMIES.shambler.speed * 0.5;

  it('speeds up other enemies within its radius, not itself', () => {
    const [shambler, screamer] = moved([
      { kind: 'shambler', x: 1000, y: 100 },
      { kind: 'screamer', x: 1100, y: 100 },
    ]);
    expect(shambler).toBeCloseTo(fast, 6);
    expect(screamer).toBeCloseTo(ENEMIES.screamer.speed * 0.5, 6);
    const [far] = moved([
      { kind: 'shambler', x: 1000, y: 100 },
      { kind: 'screamer', x: 1000 + SCREAMER.radius + 20, y: 100 },
    ]);
    expect(far).toBeCloseTo(plain, 6);
  });

  it('several Screamers do not stack', () => {
    const [shambler] = moved([
      { kind: 'shambler', x: 1000, y: 200 },
      { kind: 'screamer', x: 1080, y: 120 },
      { kind: 'screamer', x: 1080, y: 280 },
    ]);
    expect(shambler).toBeCloseTo(fast, 6);
  });
});

describe('a crowd of every kind', () => {
  it('300 enemies of mixed sizes and 200 bullets cost well under the 33 ms step', () => {
    const s = quiet();
    const kinds = Object.keys(ENEMIES) as EnemyKind[];
    for (let i = 0; i < 300; i++) {
      enemy(s, {
        ...tough,
        kind: kinds[i % kinds.length]!,
        x: 560 + (i % 30) * 34,
        y: 20 + Math.floor(i / 30) * 76,
      });
    }
    for (let i = 0; i < 200; i++) {
      s.bullets.push({
        x: 420,
        y: 20 + i * 3.8,
        dx: 1,
        dy: 0,
        speed: 1,
        damage: 0,
        owner: 'a',
        fromX: 420,
        fromY: 20 + i * 3.8,
        aim: 1,
        left: 1e9,
        pierce: 0,
        hit: [],
        tracer: WEAPONS.pistol.tracer,
      });
    }
    let t = tick(s, STEP);
    const start = performance.now();
    for (let i = 0; i < 30; i++) t = tick(t, STEP);
    expect((performance.now() - start) / 30).toBeLessThan(16);
  });
});
