import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment, newBase, type Base, type Result } from './base.ts';
import { STEP, type Stock } from './data.ts';
import {
  baseAfter,
  defenderRange,
  enemyAt,
  newHorde,
  setFocus,
  tick,
  type HordeState,
} from './horde.ts';
import { enemy, setup } from './testing.ts';

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
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
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
    expect(s.layers[0]?.segments).toHaveLength(5);
    expect(s.camp.hp).toBe(500);
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
      expect(e.y).toBeLessThanOrEqual(388);
    }
  });

  it('enemies stop at the wall and hit their segment', () => {
    const s = still();
    enemy(s, { x: 530, y: 200 });
    const after = tick(s, 1.5);
    expect(after.enemies[0]?.x).toBe(520);
    expect(after.enemies[0]?.y).toBe(200);
    // Row 2 is the starting base's gate (150 HP); two hits of 5.
    expect(after.layers[0]?.segments.map((g) => g.hp)).toEqual([200, 200, 140, 200, 200]);
  });

  it('a breach pulls nearby enemies through', () => {
    const s = still();
    s.layers[0]!.segments[2]!.hp = 0;
    enemy(s, { x: 530, y: 200 });
    enemy(s, { x: 530, y: 300 });
    const after = tick(s, 15);
    const [a, b] = after.enemies;
    expect(a?.x).toBe(120);
    expect(after.camp.hp).toBeLessThan(500);
    expect(b?.y).toBeLessThan(240);
    expect(b?.x).toBeLessThan(500);
    expect(after.layers[0]?.segments[3]?.hp).toBe(200);
  });

  it('slides toward the nearest gap, ties to the lower index', () => {
    const s = still();
    s.layers[0]!.segments[1]!.hp = 0;
    s.layers[0]!.segments[3]!.hp = 0;
    // y 200 is 80 from both gap centres (120 and 280).
    enemy(s, { x: 530, y: 200 });
    expect(tick(s, STEP).enemies[0]?.y).toBeCloseTo(199);
  });

  it('an enemy the crowd pushes back from a gap still hits the wall', () => {
    const s = still();
    s.layers[0]!.segments[2]!.hp = 0;
    // Both slide up toward the gap; separation pushes the lower one down faster than it slides.
    enemy(s, { x: 520, y: 290 });
    enemy(s, { x: 520, y: 300 });
    expect(tick(s, STEP).layers[0]?.segments[3]?.hp).toBe(195);
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
      segments: s.layers[0]!.segments.map((g) => ({ ...g, hp: g.index === 2 ? 0 : g.hp })),
    });
    enemy(s, { x: 900, y: 200 });
    const after = tick(s, 15);
    expect(after.enemies[0]?.x).toBe(520);
    expect(after.layers[1]?.segments.map((g) => g.hp)).toEqual([200, 200, 0, 200, 200]);
  });

  it("far enemies don't steer yet", () => {
    const s = still();
    s.layers[0]!.segments[2]!.hp = 0;
    enemy(s, { x: 900, y: 300 });
    const after = tick(s, STEP);
    expect(after.enemies[0]?.y).toBe(300);
    expect(after.enemies[0]?.x).toBeCloseTo(899);
  });

  it('nobody crosses a standing segment', () => {
    const s = still();
    // Sturdy enough that 20 shamblers can't break a segment in 10 s.
    for (const g of s.layers[0]!.segments) g.hp = g.maxHp = 10_000;
    for (let i = 0; i < 20; i++) enemy(s, { x: 530, y: 20 + (360 * i) / 19 });
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
      expect(e.y).toBeLessThanOrEqual(388);
    }
    const edge = still();
    enemy(edge, { x: 520, y: 12 });
    enemy(edge, { x: 520, y: 12 });
    for (const e of tick(edge, 1).enemies) expect(e.y).toBeGreaterThanOrEqual(12);
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

  it('the camp floors at 0 and the horde is lost', () => {
    const s = unmanned();
    s.camp.hp = 3;
    s.layers[0]!.segments[2]!.hp = 0;
    enemy(s, { x: 120, y: 200 });
    const after = tick(s, 1);
    expect(after.camp.hp).toBe(0);
    expect(after.outcome).toBe('lost');
    expect(tick(after, 1)).toEqual(after);
  });
});

describe('combat', () => {
  it('tower range is 750 for a pistol', () => {
    const s = newHorde(1, setup());
    expect(defenderRange(s, s.posts[0]!, s.defenders[0]!)).toBe(750);
  });

  it('shoots the enemy closest to the defender', () => {
    const s = quiet();
    enemy(s, { x: 800, y: 390 });
    enemy(s, { x: 850, y: 120 });
    const after = tick(s, STEP);
    expect(after.enemies.map((e) => e.hp)).toEqual([20, 14]);
    expect(after.shots).toHaveLength(1);
    expect(after.shots[0]).toMatchObject({ fromX: 420, fromY: 120, toX: 850, toY: 120 });
  });

  it('breaks a tie on distance by the lowest id', () => {
    const s = quiet();
    enemy(s, { x: 800, y: 220 });
    enemy(s, { x: 800, y: 20 });
    const after = tick(s, STEP);
    expect(after.enemies.map((e) => e.hp)).toEqual([14, 20]);
  });

  it("doesn't shoot out of range", () => {
    const s = quiet();
    enemy(s, { x: 1300, y: 120 });
    const after = tick(s, STEP);
    expect(after.enemies[0]?.hp).toBe(20);
    expect(after.shots).toEqual([]);
  });

  it('fires every 0.6 s', () => {
    const s = quiet();
    enemy(s, { hp: 1000, maxHp: 1000 });
    expect(tick(s, 1.25).enemies[0]?.hp).toBe(1000 - 6 * 3);
  });

  it('keeps the 0.6 s cadence over a long fight despite float drift', () => {
    const s = quiet();
    enemy(s, { hp: 10_000, maxHp: 10_000 });
    expect(tick(s, 60).enemies[0]?.hp).toBe(10_000 - 6 * 100);
  });

  it('drops shot trails after 0.15 s', () => {
    const s = quiet();
    enemy(s, { hp: 1000, maxHp: 1000 });
    expect(tick(s, STEP).shots).toHaveLength(1);
    expect(tick(s, 0.3).shots).toEqual([]);
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
    enemy(s, { hp: 1, x: 520, y: 120, nextAttackAt: 0 });
    const after = tick(s, STEP);
    expect(after.layers[0]?.segments[1]?.hp).toBe(200);
  });

  it('camp at 0 HP loses even with no enemies left', () => {
    const s = quiet();
    s.wave = s.waveCount;
    s.camp.hp = 0;
    expect(tick(s, STEP).outcome).toBe('lost');
  });

  it('a finished fight leaves no card offer open', () => {
    const s = quiet();
    s.wave = s.waveCount;
    s.xp = 9;
    enemy(s, { hp: 1 });
    const after = tick(s, STEP);
    expect(after.outcome).toBe('won');
    expect(after.offer).toBeNull();
    expect(after.level).toBe(1);
    expect(after.xp).toBe(10);
  });
});

describe('focus', () => {
  /** P is nearer the camp, Q nearer post 0 at (420, 120). */
  function pq(): { s: HordeState; p: number; q: number } {
    const s = quiet();
    const p = enemy(s, { x: 800, y: 390 }).id;
    const q = enemy(s, { x: 850, y: 120 }).id;
    return { s, p, q };
  }
  const hp = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)?.hp;

  it('focus beats closest', () => {
    const { s, p, q } = pq();
    const after = tick(setFocus(s, p), STEP);
    expect(hp(after, p)).toBe(14);
    expect(hp(after, q)).toBe(20);
  });

  it('focus out of range falls back to closest', () => {
    const { s, q } = pq();
    const r = enemy(s, { x: 1300, y: 120 }).id;
    const after = tick(setFocus(s, r), STEP);
    expect(hp(after, q)).toBe(14);
    expect(hp(after, r)).toBe(20);
    expect(after.focusId).toBe(r);
  });

  it('focus clears when the target dies', () => {
    const { s, p } = pq();
    s.enemies.find((e) => e.id === p)!.hp = 1;
    const after = tick(setFocus(s, p), STEP);
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
    expect(enemyAt(s, 852, 118)).toBe(q);
    expect(enemyAt(s, 600, 250)).toBeNull();
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
  let stock: Stock = { scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 };
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
    const after = tick(s, 15);
    expect(after.enemies[0]?.x).toBe(120);
    expect(after.camp.hp).toBeLessThan(500);
  });

  it('a layer with no segments is no wall', () => {
    const base = newBase();
    base.layers[0]!.slots = base.layers[0]!.slots.map(() => null);
    base.posts = [{ kind: 'ground', column: 0, row: 0 }];
    const s = stillOn(base);
    enemy(s, { x: 600, y: 40 });
    expect(tick(s, 20).enemies[0]?.x).toBe(120);
  });

  it('two layers: enemies stop at the outer one first', () => {
    const base = baseWith(
      ...[0, 1, 2, 3, 4].map(
        (row) => (b: Base, s: Stock) => buildSegment(b, s, ['wood'], 1, row, 'wall', 'wood'),
      ),
    );
    const s = stillOn(base);
    expect(s.layers.map((l) => l.x)).toEqual([500, 760]);
    enemy(s, { x: 900, y: 200 });
    const after = tick(s, 10);
    expect(after.enemies[0]?.x).toBe(780);
    expect(after.layers[1]!.segments[2]!.hp).toBeLessThan(200);
    expect(after.layers[0]!.segments[2]!.hp).toBe(150);
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
    const d = s.defenders[0]!;
    expect(s.posts.map((p) => [p.kind, defenderRange(s, p, d)])).toEqual([
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
    expect(base.layers[0]!.slots.map((g) => g?.hp)).toEqual([190, 200, 150, 200, 200]);
    expect(base.posts).toEqual(newBase().posts);
  });

  it('rounds up and caps at the base max HP', () => {
    const s = stillOn(newBase());
    s.layers[0]!.segments[0]!.hp = 0.4;
    s.layers[0]!.segments[1]!.maxHp = 250; // Reinforce, then patched to full
    s.layers[0]!.segments[1]!.hp = 250;
    s.layers[0]!.segments[3]!.hp = 0;
    const base = baseAfter(newBase(), s);
    expect(base.layers[0]!.slots.map((g) => [g?.hp, g?.maxHp])).toEqual([
      [1, 200],
      [200, 200],
      [150, 150],
      [0, 200],
      [200, 200],
    ]);
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
