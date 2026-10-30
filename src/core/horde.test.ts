import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment, newBase, spotOf, type Base, type Result } from './base.ts';
import { chooseCard } from './cards.ts';
import {
  FIELD,
  MELEE_REACH,
  SEGMENT_HEIGHT,
  SEGMENTS,
  START_BASE,
  STEP,
  WALK_SPEED,
  WEAPONS,
  type PostKind,
  type Stock,
  stockOf,
} from './data.ts';
import {
  baseAfter,
  gunRange,
  enemyAt,
  moveDefender,
  newHorde,
  setFocus,
  standing,
  tick,
  type HordeState,
} from './horde.ts';
import { enemy, landed, setup } from './testing.ts';
import { loadoutFrom } from './loadout.ts';

/** The starting base's gate row, and the `y` at the middle of a row. */
const GATE = START_BASE.gate;
const rowY = (row: number): number => (row + 0.5) * SEGMENT_HEIGHT;
/** Segment HP across the starting layer: walls 200, the gate 150, with `at` rows overridden. */
const hpsWith = (at: Record<number, number> = {}): number[] =>
  Array.from({ length: SEGMENTS }, (_, row) => at[row] ?? (row === GATE ? 150 : 200));

/** A horde with nobody on the posts, so nothing dies. */
function unmanned(): HordeState {
  const s = newHorde(1, setup());
  s.defenders = [];
  for (const p of s.posts) p.defenderId = null;
  return s;
}

/** Unmanned, with no spawns left: only placed enemies move. */
function still(): HordeState {
  const s = unmanned();
  s.toSpawn = 0;
  return s;
}

/** A horde with no spawns left. */
/**
 * No spawns left, and `a` on its tower carrying a plain pistol: a Ripper on a tower
 * shoots with no Gunner handling and no crit roll, so cadence and damage are exact.
 */
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders[0]!.loadout = loadoutFrom('knife');
  return s;
}

const withoutAcc = (s: HordeState) => ({ ...s, acc: 0 });

describe('newHorde', () => {
  it('starts wave 1 with one defender on post 0', () => {
    const s = newHorde(1, setup());
    expect(s.wave).toBe(1);
    expect(s.toSpawn).toBe(8);
    expect(s.posts[0]?.defenderId).toBe('a');
    expect(s.posts[1]?.defenderId).toBeNull();
    expect(s.bench.map((d) => d.id)).toEqual(['b', 'c']);
    expect(s.layers[0]?.segments).toHaveLength(SEGMENTS);
    expect(s.defenders[0]).toMatchObject({ hp: 100, maxHp: 100 });
    expect(s.injured).toEqual([]);
    expect(s.tookPart).toEqual(['a']);
    expect(s.fallingFor).toBe(0);
    expect(s.replace).toBeNull();
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.outcome).toBe('fighting');
  });

  it('rejects an unknown start defender', () => {
    expect(() => newHorde(1, { ...setup(), startDefenderId: 'x' })).toThrow(RangeError);
  });

  it('rejects a bad horde number', () => {
    expect(() => newHorde(1, { ...setup(), hordeNumber: 0 })).toThrow(RangeError);
  });

  it('does not alias the setup roster', () => {
    const roster = setup();
    const s = newHorde(1, roster);
    s.bench[0]!.name = 'changed';
    s.defenders[0]!.name = 'changed';
    expect(roster.roster.map((d) => d.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('tick', () => {
  it.each([-1, NaN, Infinity])('rejects dt %s and leaves state untouched', (dt) => {
    const s = newHorde(1, setup());
    const before = structuredClone(s);
    expect(() => tick(s, dt)).toThrow(RangeError);
    expect(s).toEqual(before);
  });

  it('same seed, same result', () => {
    expect(tick(newHorde(1, setup()), 5)).toEqual(tick(newHorde(1, setup()), 5));
  });

  it('different seeds, different spawn points', () => {
    const ys = (seed: number) => tick(newHorde(seed, setup()), 8).enemies.map((e) => e.y);
    expect(ys(1)).not.toEqual(ys(2));
  });

  it('leaves the input state untouched', () => {
    const s = newHorde(1, setup());
    const before = structuredClone(s);
    tick(s, 1);
    expect(s).toEqual(before);
  });

  it('same result for one big tick and many small ticks', () => {
    const big = tick(unmanned(), 2);
    let small = unmanned();
    for (let i = 0; i < 120; i++) small = tick(small, 1 / 60);
    expect(withoutAcc(small)).toEqual(withoutAcc(big));
    expect(Math.abs(small.acc - big.acc)).toBeLessThan(1e-9);
  });

  it('spawns at the right edge every 0.8 s', () => {
    const s = tick(unmanned(), 1);
    expect(s.enemies).toHaveLength(2);
    for (const e of s.enemies) {
      expect(e.x).toBeLessThanOrEqual(1600);
      expect(e.y).toBeGreaterThanOrEqual(12);
      expect(e.y).toBeLessThanOrEqual(FIELD.height - 12);
    }
  });

  it('spreads spawns over the full height: every row gets some', () => {
    // Wave 1's first 8 spawns on 10 seeds, seen as they appear at the right edge.
    const ys: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const s = newHorde(seed, setup());
      s.defenders = [];
      ys.push(...tick(s, 7).enemies.map((e) => e.y));
    }
    expect(ys).toHaveLength(80);
    expect(new Set(ys.map((y) => Math.floor(y / SEGMENT_HEIGHT))).size).toBe(SEGMENTS);
  });

  it('enemies stop at the wall and hit their segment', () => {
    const s = still();
    enemy(s, { x: 530, y: rowY(GATE) });
    const after = tick(s, 1.5);
    expect(after.enemies[0]?.x).toBe(520);
    expect(after.enemies[0]?.y).toBe(rowY(GATE));
    // The gate row (150 HP) takes two hits of 5.
    expect(after.layers[0]?.segments.map((g) => g.hp)).toEqual(hpsWith({ [GATE]: 140 }));
  });

  it('a breach pulls nearby enemies through', () => {
    const s = still();
    s.layers[0]!.segments[GATE]!.hp = 0;
    enemy(s, { x: 530, y: rowY(GATE) });
    enemy(s, { x: 530, y: rowY(GATE) + 100 });
    // 10 s: the camp is falling from the first one inside, but not fallen yet.
    const after = tick(s, 10);
    expect(after.outcome).toBe('fighting');
    const [a, b] = after.enemies;
    expect(a?.x).toBeCloseTo(230);
    expect(a?.inCamp).toBe(true);
    expect(b?.inCamp).toBe(true);
    expect(b?.y).toBeLessThan(rowY(GATE) + 40);
    expect(b?.x).toBeLessThan(500);
    expect(after.layers[0]?.segments[GATE + 1]?.hp).toBe(200);
  });

  it('slides toward the nearest gap, ties to the lower index', () => {
    const s = still();
    s.layers[0]!.segments[GATE - 1]!.hp = 0;
    s.layers[0]!.segments[GATE + 1]!.hp = 0;
    // The gate row's middle is 80 from both gap centres (the rows above and below).
    enemy(s, { x: 530, y: rowY(GATE) });
    expect(tick(s, STEP).enemies[0]?.y).toBeCloseTo(rowY(GATE) - 1);
  });

  it('an enemy the crowd pushes back from a gap still hits the wall', () => {
    const s = still();
    s.layers[0]!.segments[GATE]!.hp = 0;
    // Both slide up toward the gap; separation pushes the lower one down faster than it slides.
    enemy(s, { x: 520, y: rowY(GATE) + 90 });
    enemy(s, { x: 520, y: rowY(GATE) + 100 });
    expect(tick(s, STEP).layers[0]?.segments[GATE + 1]?.hp).toBe(195);
  });

  it('an enemy on a segment boundary belongs to the lower segment', () => {
    const s = still();
    s.layers[0]!.segments[1]!.hp = 0;
    // y 80 is the top edge of segment 1 (the gap), not the bottom of segment 0.
    enemy(s, { x: 530, y: 80 });
    const after = tick(s, 2);
    expect(after.enemies[0]?.x).toBeLessThan(500);
    expect(after.layers[0]?.segments[0]?.hp).toBe(200);
  });

  it('walks through a gap in an outer layer and stops at the next one', () => {
    const s = still();
    s.layers.push({
      column: 1,
      x: 800,
      segments: s.layers[0]!.segments.map((g) => ({ ...g, hp: g.index === GATE ? 0 : g.hp })),
    });
    enemy(s, { x: 900, y: rowY(GATE) });
    const after = tick(s, 15);
    expect(after.enemies[0]?.x).toBe(520);
    expect(after.layers[1]?.segments.map((g) => g.hp)).toEqual(
      Array.from({ length: SEGMENTS }, (_, row) => (row === GATE ? 0 : 200)),
    );
  });

  it("far enemies don't steer yet", () => {
    const s = still();
    s.layers[0]!.segments[GATE]!.hp = 0;
    enemy(s, { x: 900, y: 300 });
    const after = tick(s, STEP);
    expect(after.enemies[0]?.y).toBe(300);
    expect(after.enemies[0]?.x).toBeCloseTo(899);
  });

  it('nobody crosses a standing segment', () => {
    const s = still();
    // Sturdy enough that 20 shamblers can't break a segment in 10 s.
    for (const g of s.layers[0]!.segments) g.hp = g.maxHp = 10_000;
    for (let i = 0; i < 20; i++) enemy(s, { x: 530, y: 20 + ((FIELD.height - 40) * i) / 19 });
    const after = tick(s, 10);
    for (const e of after.enemies) expect(e.x).toBeGreaterThanOrEqual(520);
  });

  it('enemies push apart and stay in the field', () => {
    const s = still();
    enemy(s, { x: 520, y: 200 });
    enemy(s, { x: 520, y: 200 });
    const [e0, e1] = tick(s, 1).enemies;
    expect(e0!.y).toBeLessThan(e1!.y);
    expect(Math.abs(e0!.y - e1!.y)).toBeGreaterThanOrEqual(24 - 1e-6);
    for (const e of [e0!, e1!]) {
      expect(e.y).toBeGreaterThanOrEqual(12);
      expect(e.y).toBeLessThanOrEqual(FIELD.height - 12);
    }
    const edge = still();
    enemy(edge, { x: 520, y: 12 });
    enemy(edge, { x: 520, y: 12 });
    for (const e of tick(edge, 1).enemies) expect(e.y).toBeGreaterThanOrEqual(12);
  });

  it('an enemy outside, pressed to the wall, never holds off a hunter in the camp behind it', () => {
    // a stands on the wall-walk at (510, 20); row 9 is broken, row 8 stands. The hunter
    // walks up the wall line past an enemy pressed against row 8, 24 px away.
    const s = fightOn(postsBase([]), ['wall-walk', 0]);
    s.layers[0]!.segments[9]!.hp = 0;
    enemy(s, { x: 520, y: 716, hp: 1e6, maxHp: 1e6 });
    const hunter = enemy(s, { x: 510, y: 738, hp: 1e6, maxHp: 1e6, inCamp: true });
    const after = tick(s, 30);
    const h = after.enemies.find((e) => e.id === hunter.id)!;
    expect(h.y).toBeLessThan(20 + 2 * MELEE_REACH);
    expect(after.defenders[0]!.hp).toBeLessThan(after.defenders[0]!.maxHp);
  });

  it('separation does not depend on enemy order', () => {
    const make = (reverse: boolean) => {
      const s = still();
      const placed = [
        { x: 700, y: 100 },
        { x: 705, y: 108 },
        { x: 698, y: 115 },
      ];
      for (const p of placed) enemy(s, p);
      if (reverse) s.enemies.reverse();
      return tick(s, STEP).enemies.sort((a, b) => a.id - b.id);
    };
    expect(make(true)).toEqual(make(false));
  });

  it('a segment repaired behind an enemy never pulls it back', () => {
    const s = still();
    enemy(s, { x: 510, y: 200 });
    const after = tick(s, STEP);
    expect(after.enemies[0]?.x).toBe(509);
  });
});

describe('combat', () => {
  it('tower range is 750 for a pistol', () => {
    const s = newHorde(1, setup());
    expect(gunRange(s, s.posts[0]!, 'pistol')).toBe(750);
  });

  it('shoots the enemy closest to the defender', () => {
    const s = quiet();
    enemy(s, { x: 800, y: 630 });
    enemy(s, { x: 850, y: 360 });
    const fired = tick(s, STEP);
    expect(fired.bullets).toHaveLength(1);
    expect(fired.bullets[0]).toMatchObject({ fromX: 420, fromY: 360, owner: 'a' });
    expect(landed(fired).enemies.map((e) => e.hp)).toEqual([20, 20 - 6.2]);
  });

  it('breaks a tie on distance by the lowest id', () => {
    const s = quiet();
    enemy(s, { x: 800, y: 460 });
    enemy(s, { x: 800, y: 260 });
    const after = landed(tick(s, STEP));
    expect(after.enemies.map((e) => e.hp)).toEqual([20 - 6.2, 20]);
  });

  it("doesn't shoot out of range", () => {
    const s = quiet();
    enemy(s, { x: 1300, y: 360 });
    const after = tick(s, STEP);
    expect(after.enemies[0]?.hp).toBe(20);
    expect(after.bullets).toEqual([]);
  });

  it('fires every 0.6 s', () => {
    const s = quiet();
    enemy(s, { hp: 1000, maxHp: 1000 });
    expect(landed(tick(s, 1.25)).enemies[0]?.hp).toBeCloseTo(1000 - 6.2 * 3, 9);
  });

  it('keeps the 0.6 s cadence and 1.5 s reloads over a long fight despite float drift', () => {
    const s = quiet();
    enemy(s, { hp: 10_000, maxHp: 10_000 });
    // A magazine is 10 shots 0.6 s apart, then a 1.5 s reload: one every 6.9 s. In 60 s,
    // 8 full magazines (to 55.2 s) and 8 more shots (55.2 … 59.4 s).
    expect(landed(tick(s, 60)).enemies[0]?.hp).toBeCloseTo(10_000 - 6.2 * 88, 9);
  });

  it('a gun leaves no line behind: its bullet is in flight, then gone once it lands', () => {
    const s = quiet();
    enemy(s, { hp: 1000, maxHp: 1000 });
    const fired = tick(s, STEP);
    expect(fired.strikes).toEqual([]);
    expect(fired.bullets).toHaveLength(1);
    expect(tick(s, 0.3).bullets).toEqual([]);
  });

  it('a kill gives XP and levels up at 10', () => {
    const s = quiet();
    for (let i = 0; i < 10; i++) enemy(s, { hp: 1, x: 600 + i * 10 });
    const after = tick(s, 7);
    expect(after.enemies).toEqual([]);
    expect(after.level).toBe(2);
    expect(after.xp).toBe(0);
  });

  it('next wave after a 3 s break', () => {
    let s = quiet();
    s = tick(s, STEP);
    expect(s.wave).toBe(2);
    expect(s.toSpawn).toBe(12);
    s = tick(s, 2.9);
    expect(s.enemies).toEqual([]);
    s = tick(s, 0.2);
    expect(s.enemies).toHaveLength(1);
  });

  it('wins after the last wave', () => {
    const s = quiet();
    s.wave = s.waveCount;
    const after = tick(s, STEP);
    expect(after.outcome).toBe('won');
    expect(tick(after, 1)).toEqual(after);
  });

  it('a killed enemy deals no damage that step', () => {
    const s = newHorde(1, setup());
    const e = enemy(s, { hp: 1, x: 520, y: 120, nextAttackAt: 0 });
    // A bullet about to land on it this step.
    s.bullets.push({
      x: e.x - 20,
      y: e.y,
      dx: 1,
      dy: 0,
      speed: 1800,
      damage: 6,
      owner: 'a',
      fromX: 420,
      fromY: 120,
      aim: 100,
      left: 500,
      pierce: 0,
      hit: [],
      tracer: WEAPONS.pistol.tracer,
    });
    const after = tick(s, STEP);
    expect(after.layers[0]?.segments[1]?.hp).toBe(200);
  });

  it('a finished fight leaves no card offer open', () => {
    const s = quiet();
    s.wave = s.waveCount;
    s.xp = 9;
    enemy(s, { hp: 1 });
    const after = landed(tick(s, STEP));
    expect(after.outcome).toBe('won');
    expect(after.bullets).toEqual([]);
    expect(after.offer).toBeNull();
    expect(after.level).toBe(1);
    expect(after.xp).toBe(10);
  });
});

describe('focus', () => {
  /** P is nearer the camp, Q nearer post 0 at (420, 360). */
  function pq(): { s: HordeState; p: number; q: number } {
    const s = quiet();
    const p = enemy(s, { x: 800, y: 630 }).id;
    const q = enemy(s, { x: 850, y: 360 }).id;
    return { s, p, q };
  }
  const hp = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)?.hp;

  it('focus beats closest', () => {
    const { s, p, q } = pq();
    const after = landed(tick(setFocus(s, p), STEP));
    expect(hp(after, p)).toBe(20 - 6.2);
    expect(hp(after, q)).toBe(20);
  });

  it('focus out of range falls back to closest', () => {
    const { s, q } = pq();
    const r = enemy(s, { x: 1300, y: 360 }).id;
    const after = landed(tick(setFocus(s, r), STEP));
    expect(hp(after, q)).toBe(20 - 6.2);
    expect(hp(after, r)).toBe(20);
    expect(after.focusId).toBe(r);
  });

  it('focus clears when the target dies', () => {
    const { s, p } = pq();
    s.enemies.find((e) => e.id === p)!.hp = 1;
    const after = landed(tick(setFocus(s, p), STEP));
    expect(hp(after, p)).toBeUndefined();
    expect(after.focusId).toBeNull();
  });

  it.each([99, NaN, 1.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 2])(
    'setFocus rejects %s and leaves the state untouched',
    (id) => {
      const { s } = pq();
      const before = structuredClone(s);
      expect(() => setFocus(s, id)).toThrow(RangeError);
      expect(s).toEqual(before);
    },
  );

  it('setFocus sets and clears without touching its input', () => {
    const { s, p } = pq();
    const before = structuredClone(s);
    const focused = setFocus(s, p);
    expect(focused.focusId).toBe(p);
    expect(s).toEqual(before);
    expect(setFocus(focused, null).focusId).toBeNull();
  });

  it('setFocus rejects a dead enemy', () => {
    const { s, p } = pq();
    s.enemies.find((e) => e.id === p)!.hp = 0;
    expect(() => setFocus(s, p)).toThrow(RangeError);
  });

  it('enemyAt picks the nearest within reach', () => {
    const { s, q } = pq();
    expect(enemyAt(s, 852, 358)).toBe(q);
    expect(enemyAt(s, 600, 490)).toBeNull();
  });

  it('enemyAt breaks a tie by the lowest id', () => {
    const s = quiet();
    const a = enemy(s, { x: 700, y: 100 }).id;
    enemy(s, { x: 700, y: 120 });
    expect(enemyAt(s, 700, 110)).toBe(a);
  });

  it.each([
    [NaN, 0],
    [0, NaN],
    [Infinity, 120],
    [850, -Infinity],
  ])('enemyAt(%s, %s) is null', (x, y) => {
    const { s } = pq();
    expect(enemyAt(s, x, y)).toBeNull();
  });
});

/** The starting base changed by `steps` (each a build action with plenty of stock). */
function baseWith(...steps: ((b: Base, s: Stock) => Result)[]): Base {
  let base = newBase();
  let stock: Stock = stockOf({ scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 });
  for (const step of steps) {
    const r = step(base, stock);
    if (!r.ok) throw new Error(r.reason);
    ({ base, stock } = r);
  }
  return base;
}

/** Unmanned, no spawns, on `base`. */
function stillOn(base: Base): HordeState {
  const s = newHorde(1, { ...setup(), base });
  s.defenders = [];
  for (const p of s.posts) p.defenderId = null;
  s.toSpawn = 0;
  return s;
}

describe('fighting on the base', () => {
  it('an unbuilt row is an open gap', () => {
    const base = newBase();
    base.layers[0]!.slots[4] = null;
    const s = stillOn(base);
    expect(s.layers[0]!.segments[4]).toEqual({ index: 4, kind: null, tier: null, hp: 0, maxHp: 0 });
    enemy(s, { x: 530, y: 360 });
    const after = tick(s, 10);
    expect(after.enemies[0]?.x).toBeLessThan(500);
    expect(after.enemies[0]?.inCamp).toBe(true);
  });

  it('a layer with no segments is no wall', () => {
    const base = newBase();
    base.layers[0]!.slots = base.layers[0]!.slots.map(() => null);
    base.posts = [{ kind: 'ground', column: 0, row: 0 }];
    const s = stillOn(base);
    enemy(s, { x: 600, y: 40 });
    const after = tick(s, 12);
    expect(after.enemies[0]?.x).toBeCloseTo(240);
    expect(after.enemies[0]?.inCamp).toBe(true);
  });

  it('two layers: enemies stop at the outer one first', () => {
    const base = baseWith(
      ...Array.from({ length: SEGMENTS }, (_, row) => row).map(
        (row) => (b: Base, s: Stock) => buildSegment(b, s, ['wood'], 1, row, 'wall', 'wood'),
      ),
    );
    const s = stillOn(base);
    expect(s.layers.map((l) => l.x)).toEqual([500, 760]);
    enemy(s, { x: 900, y: rowY(GATE) });
    const after = tick(s, 10);
    expect(after.enemies[0]?.x).toBe(780);
    expect(after.layers[1]!.segments[GATE]!.hp).toBeLessThan(200);
    expect(after.layers[0]!.segments[GATE]!.hp).toBe(150);
  });

  it('shares nothing with the base', () => {
    const base = newBase();
    const before = structuredClone(base);
    const s = newHorde(1, { ...setup(), base });
    s.layers[0]!.segments[0]!.hp = -1;
    s.layers[0]!.segments.pop();
    s.posts[0]!.x = -1;
    s.posts[0]!.row = 9;
    expect(base).toEqual(before);
  });

  it('starts on the chosen post', () => {
    const s = newHorde(1, { ...setup(), startPostId: 1 });
    expect(s.posts.map((p) => p.defenderId)).toEqual([null, 'a']);
  });

  it.each([2, -1, 0.5, Number.NaN])('rejects start post %s', (startPostId) => {
    expect(() => newHorde(1, { ...setup(), startPostId })).toThrow(RangeError);
  });

  it('rejects a wall-walk start post over a broken segment', () => {
    const base = baseWith((b, s) => buildPost(b, s, { kind: 'wall-walk', column: 0, row: 0 }));
    base.layers[0]!.slots[0]!.hp = 0;
    const id = base.posts.findIndex((p) => p.kind === 'wall-walk');
    expect(() => newHorde(1, { ...setup(), base, startPostId: id })).toThrow(RangeError);
    base.layers[0]!.slots[0]!.hp = 1;
    expect(newHorde(1, { ...setup(), base, startPostId: id }).posts[id]!.defenderId).toBe('a');
  });

  it('range by post kind: tower 1.25×, wall-walk 1×, ground 0.75×', () => {
    const base = baseWith(
      (b, s) => buildPost(b, s, { kind: 'ground', column: 0, row: 0 }),
      (b, s) => buildPost(b, s, { kind: 'wall-walk', column: 0, row: 0 }),
    );
    const s = newHorde(1, { ...setup(), base });
    expect(s.posts.map((p) => [p.kind, gunRange(s, p, 'pistol')])).toEqual([
      ['ground', 450],
      ['tower', 750],
      ['tower', 750],
      ['wall-walk', 600],
    ]);
  });
});

describe('baseAfter', () => {
  it('carries the fight damage back to the base', () => {
    const s = stillOn(newBase());
    enemy(s, { x: 530, y: 40 });
    const after = tick(s, 1.5);
    const base = baseAfter(newBase(), after);
    expect(base.layers[0]!.slots.map((g) => g?.hp)).toEqual(hpsWith({ 0: 190 }));
    expect(base.posts).toEqual(newBase().posts);
  });

  it('rounds up and caps at the base max HP', () => {
    const s = stillOn(newBase());
    s.layers[0]!.segments[0]!.hp = 0.4;
    s.layers[0]!.segments[1]!.maxHp = 250; // Reinforce, then patched to full
    s.layers[0]!.segments[1]!.hp = 250;
    s.layers[0]!.segments[3]!.hp = 0;
    const base = baseAfter(newBase(), s);
    const expected = Array.from({ length: SEGMENTS }, (_, row) =>
      row === GATE ? [150, 150] : [200, 200],
    );
    expected[0] = [1, 200];
    expected[3] = [0, 200];
    expect(base.layers[0]!.slots.map((g) => [g?.hp, g?.maxHp])).toEqual(expected);
  });

  it('leaves its inputs untouched', () => {
    const base = newBase();
    const s = stillOn(base);
    s.layers[0]!.segments[0]!.hp = 7;
    const before = structuredClone({ base, s });
    baseAfter(base, s);
    expect({ base, s }).toEqual(before);
  });

  it('ignores float noise when rounding up', () => {
    const s = stillOn(newBase());
    s.layers[0]!.segments[0]!.hp = 150 + 1e-12;
    s.layers[0]!.segments[1]!.hp = 150.01;
    const slots = baseAfter(newBase(), s).layers[0]!.slots;
    expect([slots[0]?.hp, slots[1]?.hp]).toEqual([150, 151]);
  });

  it('rejects a horde fought on another base', () => {
    const s = stillOn(newBase());
    const bigger = baseWith((b, st) => buildSegment(b, st, ['wood'], 1, 0, 'wall', 'wood'));
    expect(() => baseAfter(bigger, s)).toThrow(RangeError);
    const holed = newBase();
    holed.layers[0]!.slots[4] = null;
    expect(() => baseAfter(holed, s)).toThrow(RangeError);
    const upgraded = newBase();
    upgraded.layers[0]!.slots[0]!.tier = 'metal';
    expect(() => baseAfter(upgraded, s)).toThrow(RangeError);
    const regated = newBase();
    regated.layers[0]!.slots[0]!.kind = 'gate';
    expect(() => baseAfter(regated, s)).toThrow(RangeError);
  });
});

/**
 * Column 0 of the starting base with wall-walk posts on rows 0 and 1 and ground posts
 * on `groundRows`, plus `extra` build steps. Post ids follow (column, kind, row).
 */
function postsBase(groundRows: number[], ...extra: ((b: Base, s: Stock) => Result)[]): Base {
  return baseWith(
    ...groundRows.map(
      (row) => (b: Base, s: Stock) => buildPost(b, s, { kind: 'ground', column: 0, row }),
    ),
    (b, s) => buildPost(b, s, { kind: 'wall-walk', column: 0, row: 0 }),
    (b, s) => buildPost(b, s, { kind: 'wall-walk', column: 0, row: 1 }),
    ...extra,
  );
}

const postId = (s: HordeState, kind: PostKind, row: number, column = 0): number =>
  s.posts.findIndex((p) => p.kind === kind && p.column === column && p.row === row);

/** No spawns; `a` on (startKind, startRow), and `b` from the bench on (bKind, bRow) if given. */
function fightOn(base: Base, start: [PostKind, number], b?: [PostKind, number]): HordeState {
  const probe = stillOn(base);
  const s = newHorde(1, { ...setup(), base, startPostId: postId(probe, ...start) });
  s.toSpawn = 0;
  if (b) {
    const post = s.posts[postId(s, ...b)]!;
    const [spec] = s.bench.splice(0, 1);
    s.defenders.push(standing(spec!, post, 0));
    post.defenderId = spec!.id;
  }
  return s;
}

/** Breaks segment `row` of column 0 on the next step: 5 HP left and a tough enemy on it. */
function breakNext(s: HordeState, row: number): void {
  s.layers[0]!.segments[row]!.hp = 5;
  enemy(s, { x: 520, y: (row + 0.5) * 80, hp: 1e6, maxHp: 1e6 });
}

const mustMove = (s: HordeState, id: string, post: number): HordeState => {
  const r = moveDefender(s, id, post);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('moving defenders', () => {
  it('frees the old post, reserves the new one and arrives after distance / speed', () => {
    const s = fightOn(postsBase([]), ['tower', 4]);
    const from = postId(s, 'tower', 4);
    const to = postId(s, 'wall-walk', 0);
    const before = structuredClone(s);
    const moved = mustMove(s, 'a', to);
    expect(s).toEqual(before);
    expect(moved.posts[from]!.defenderId).toBeNull();
    expect(moved.posts[to]!.defenderId).toBe('a');
    expect(moved.defenders[0]).toMatchObject({ postId: to, walking: true, x: 420, y: 360 });

    const time = Math.hypot(510 - 420, 20 - 360) / WALK_SPEED;
    const early = tick(moved, time - STEP);
    expect(early.defenders[0]!.walking).toBe(true);
    expect(early.defenders[0]!.x).toBeGreaterThan(420);
    expect(early.defenders[0]!.x).toBeLessThan(510);
    const late = tick(moved, time + STEP);
    expect(late.defenders[0]).toMatchObject({ walking: false, x: 510, y: 20, postId: to });
  });

  it('fires a pistol (a sidearm) on the move, from where the walker is, and on arrival', () => {
    const s = fightOn(postsBase([]), ['tower', 4]);
    const moved = mustMove(s, 'a', postId(s, 'wall-walk', 0));
    const target = enemy(moved, { x: 700, y: 20, hp: 1000, maxHp: 1000 });
    const first = tick(moved, STEP);
    expect(first.defenders[0]!.walking).toBe(true);
    expect(first.bullets).toEqual([
      expect.objectContaining({ fromX: first.defenders[0]!.x, fromY: first.defenders[0]!.y }),
    ]);
    // The whole walk from the tower again, so it has certainly arrived.
    const arrived = tick(first, Math.hypot(510 - 420, 20 - 360) / WALK_SPEED);
    expect(arrived.defenders[0]!.walking).toBe(false);
    expect(arrived.enemies.find((e) => e.id === target.id)!.hp).toBeLessThan(1000);
  });

  it('a walker can be sent on from where it is', () => {
    const s = fightOn(postsBase([]), ['tower', 4]);
    const halfway = tick(mustMove(s, 'a', postId(s, 'wall-walk', 0)), 0.5);
    const { x, y } = halfway.defenders[0]!;
    const back = mustMove(halfway, 'a', postId(s, 'tower', 4));
    expect(back.posts[postId(s, 'wall-walk', 0)]!.defenderId).toBeNull();
    expect(back.defenders[0]).toMatchObject({ x, y, walking: true });
    expect(tick(back, 1).defenders[0]).toMatchObject({ x: 420, y: 360, walking: false });
  });

  it('walking never advances while a card offer is open', () => {
    const s = fightOn(postsBase([]), ['tower', 4]);
    const moved = mustMove(s, 'a', postId(s, 'wall-walk', 0));
    moved.offer = [{ kind: 'upgrade', id: 'sharpshooter' }];
    expect(tick(moved, 1).defenders[0]).toMatchObject({ x: 420, y: 360 });
  });

  const refusals: [string, string, (s: HordeState) => [HordeState, string, number]][] = [
    ['to a taken post', 'Post taken', (s) => [s, 'a', postId(s, 'tower', 6)]],
    [
      'to a reserved post',
      'Post reserved',
      (s) => [mustMove(s, 'b', postId(s, 'wall-walk', 0)), 'a', postId(s, 'wall-walk', 0)],
    ],
    [
      'to a wall-walk post over a broken segment',
      'No wall to stand on',
      (s) => {
        s.layers[0]!.segments[0]!.hp = 0;
        return [s, 'a', postId(s, 'wall-walk', 0)];
      },
    ],
    ['to its own post', 'Already there', (s) => [s, 'a', postId(s, 'tower', 4)]],
    [
      'to the post it is walking to',
      'Already on the way',
      (s) => [mustMove(s, 'a', postId(s, 'wall-walk', 0)), 'a', postId(s, 'wall-walk', 0)],
    ],
    [
      'during a card offer',
      'Pick a card first',
      (s) => {
        s.offer = [{ kind: 'upgrade', id: 'sharpshooter' }];
        return [s, 'a', postId(s, 'wall-walk', 0)];
      },
    ],
    [
      'after the outcome',
      'The fight is over',
      (s) => {
        s.outcome = 'won';
        return [s, 'a', postId(s, 'wall-walk', 0)];
      },
    ],
  ];
  it.each(refusals)('refuses a move %s and changes nothing', (_, reason, make) => {
    const [s, id, post] = make(fightOn(postsBase([]), ['tower', 4], ['tower', 6]));
    const before = structuredClone(s);
    expect(moveDefender(s, id, post)).toEqual({ ok: false, reason });
    expect(s).toEqual(before);
  });

  it.each([
    ['x', 0],
    ['a', 99],
    ['a', -1],
    ['a', 1.5],
    ['a', Number.NaN],
  ])('throws for defender %s, post %s', (id, post) => {
    const s = fightOn(postsBase([]), ['tower', 4]);
    expect(() => moveDefender(s, id, post)).toThrow(RangeError);
  });

  it('a benched defender cannot be moved', () => {
    const s = fightOn(postsBase([]), ['tower', 4]);
    expect(() => moveDefender(s, 'b', postId(s, 'tower', 6))).toThrow(RangeError);
  });

  it('same seed and same moves at the same times give the same fight', () => {
    const run = (): HordeState => {
      const base = postsBase([2]);
      const probe = stillOn(base);
      let s = newHorde(7, { ...setup(), base, startPostId: postId(probe, 'tower', 4) });
      s = tick(s, 2);
      if (s.offer) s = chooseCard(s, 0);
      s = mustMove(s, 'a', postId(s, 'wall-walk', 0));
      s = tick(s, 4);
      if (s.offer) s = chooseCard(s, 0);
      return tick(s, 6);
    };
    expect(run()).toEqual(run());
  });
});

describe('dropping off a broken wall', () => {
  it('drops each defender in array order to the nearest free ground post behind', () => {
    // a (ww row 0) is nearer ground row 1 than row 4; so is b (ww row 1), but a goes first.
    const s = fightOn(postsBase([1, 4]), ['wall-walk', 0], ['wall-walk', 1]);
    breakNext(s, 0);
    breakNext(s, 1);
    const after = tick(s, STEP);
    const [a, b] = after.defenders;
    expect(a).toMatchObject({ id: 'a', postId: postId(s, 'ground', 1), walking: true });
    expect(b).toMatchObject({ id: 'b', postId: postId(s, 'ground', 4), walking: true });
    expect(after.posts[postId(s, 'wall-walk', 0)]!.defenderId).toBeNull();
    expect(after.posts[postId(s, 'wall-walk', 1)]!.defenderId).toBeNull();
    expect(after.posts[postId(s, 'ground', 1)]!.defenderId).toBe('a');
    expect(after.posts[postId(s, 'ground', 4)]!.defenderId).toBe('b');
    const landed = tick(after, 6);
    expect(landed.defenders[0]).toMatchObject({ x: 340, y: 120, walking: false });
    expect(landed.defenders[1]).toMatchObject({ x: 340, y: 360, walking: false });
  });

  it('goes to the bench with no free ground post behind, and can be recruited back', () => {
    const s = fightOn(postsBase([1]), ['wall-walk', 0], ['wall-walk', 1]);
    breakNext(s, 0);
    breakNext(s, 1);
    const after = tick(s, STEP);
    expect(after.defenders.map((d) => d.id)).toEqual(['a']);
    expect(after.bench).toEqual([
      { id: 'c', name: 'C', loadout: loadoutFrom('pistol') },
      { id: 'b', name: 'B', loadout: loadoutFrom('pistol') },
    ]);
    expect(after.posts.filter((p) => p.defenderId === 'b')).toEqual([]);

    after.offer = [
      { kind: 'recruit', defender: { id: 'b', name: 'B', loadout: loadoutFrom('pistol') } },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    const back = chooseCard(after, 0);
    expect(back.defenders.map((d) => d.id)).toEqual(['a', 'b']);
    expect(back.bench.map((d) => d.id)).toEqual(['c']);
  });

  it('three drop, two ground posts: the first two in array order get them, the third is benched', () => {
    const base = postsBase([3, 4], (b, s) =>
      buildPost(b, s, { kind: 'wall-walk', column: 0, row: 2 }),
    );
    const s = fightOn(base, ['wall-walk', 2], ['wall-walk', 1]);
    const post = s.posts[postId(s, 'wall-walk', 0)]!;
    const [c] = s.bench.splice(0, 1);
    s.defenders.push(standing(c!, post, 0));
    post.defenderId = c!.id;
    for (const row of [0, 1, 2]) breakNext(s, row);
    const after = tick(s, STEP);
    // a (row 2) is nearest ground row 3; b (row 1) then takes row 4; c (row 0) is left out.
    expect(after.defenders.map((d) => [d.id, d.postId])).toEqual([
      ['a', postId(s, 'ground', 3)],
      ['b', postId(s, 'ground', 4)],
    ]);
    expect(after.bench.map((d) => d.id)).toEqual(['c']);
  });

  it('drops both defenders off the two spots of one broken segment (ID-048)', () => {
    const base = postsBase([0, 3], (b, st) =>
      buildPost(b, st, { kind: 'wall-walk', column: 0, row: 0, spot: 1 }),
    );
    const spot1 = (st: HordeState) =>
      st.posts.findIndex((p) => p.kind === 'wall-walk' && p.row === 0 && spotOf(p) === 1);
    const probe = fightOn(base, ['tower', 4]);
    expect(probe.posts[spot1(probe)]).toMatchObject({ x: 510, y: 60 });
    expect(probe.posts[postId(probe, 'wall-walk', 0)]).toMatchObject({ x: 510, y: 20 });
    // a starts on spot 2, b stands on spot 1 of the same segment.
    const s = newHorde(1, { ...setup(), base, startPostId: spot1(probe) });
    s.toSpawn = 0;
    const post = s.posts[postId(s, 'wall-walk', 0)]!;
    const [b] = s.bench.splice(0, 1);
    s.defenders.push(standing(b!, post, 0));
    post.defenderId = b!.id;
    breakNext(s, 0);
    const after = tick(s, STEP);
    // Both are nearest ground row 0; a goes first in array order, b takes row 3.
    expect(after.defenders.map((d) => [d.id, d.postId, d.walking])).toEqual([
      ['a', postId(s, 'ground', 0), true],
      ['b', postId(s, 'ground', 3), true],
    ]);
    expect(after.posts[spot1(s)]!.defenderId).toBeNull();
    expect(after.posts[postId(s, 'wall-walk', 0)]!.defenderId).toBeNull();
  });

  it('ignores ground posts ahead of the broken layer', () => {
    const base = postsBase(
      [],
      (b, s) => buildSegment(b, s, ['wood'], 1, 0, 'wall', 'wood'),
      (b, s) => buildPost(b, s, { kind: 'ground', column: 1, row: 0 }),
    );
    const s = fightOn(base, ['wall-walk', 0]);
    breakNext(s, 0);
    const after = tick(s, STEP);
    expect(after.defenders).toEqual([]);
    expect(after.posts[postId(s, 'ground', 0, 1)]!.defenderId).toBeNull();
  });

  it('leaves defenders on other posts alone', () => {
    const s = fightOn(postsBase([1]), ['wall-walk', 1], ['tower', 4]);
    breakNext(s, 0);
    const after = tick(s, STEP);
    expect(after.defenders.map((d) => [d.id, d.postId, d.walking])).toEqual([
      ['a', postId(s, 'wall-walk', 1), false],
      ['b', postId(s, 'tower', 4), false],
    ]);
  });

  it('a walker whose target segment breaks re-targets from where it is', () => {
    const s = fightOn(postsBase([4]), ['tower', 6]);
    const walking = tick(mustMove(s, 'a', postId(s, 'wall-walk', 0)), 0.5);
    const { x, y } = walking.defenders[0]!;
    breakNext(walking, 0);
    const after = tick(walking, STEP);
    expect(after.posts[postId(s, 'wall-walk', 0)]!.defenderId).toBeNull();
    expect(after.posts[postId(s, 'ground', 4)]!.defenderId).toBe('a');
    const d = after.defenders[0]!;
    expect(d).toMatchObject({ postId: postId(s, 'ground', 4), walking: true });
    // The break comes after this step's walk, so it heads off from the next step on.
    expect(Math.hypot(d.x - x, d.y - y)).toBeCloseTo(WALK_SPEED * STEP);
    const next = tick(after, STEP).defenders[0]!;
    const toGround = (p: { x: number; y: number }) => Math.hypot(340 - p.x, 360 - p.y);
    expect(toGround(next)).toBeCloseTo(toGround(d) - WALK_SPEED * STEP);
    expect(tick(after, 5).defenders[0]).toMatchObject({ x: 340, y: 360, walking: false });
  });

  it('a move or recruit never lands on a post whose segment broke', () => {
    const s = fightOn(postsBase([]), ['tower', 4]);
    breakNext(s, 0);
    const after = tick(s, STEP);
    expect(moveDefender(after, 'a', postId(s, 'wall-walk', 0))).toEqual({
      ok: false,
      reason: 'No wall to stand on',
    });
    after.offer = [
      { kind: 'recruit', defender: { id: 'b', name: 'B', loadout: loadoutFrom('pistol') } },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    const back = chooseCard(after, 0);
    expect(back.posts.findIndex((p) => p.defenderId === 'b')).toBe(postId(s, 'wall-walk', 1));
  });
});
