import { describe, expect, it } from 'vitest';
import { STEP } from './data.ts';
import { defenderRange, enemyAt, newHorde, setFocus, tick, type HordeState } from './horde.ts';
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
    expect(after.layers[0]?.segments.map((g) => g.hp)).toEqual([200, 200, 190, 200, 200]);
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
