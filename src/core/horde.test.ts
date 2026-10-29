import { describe, expect, it } from 'vitest';
import { STEP } from './data.ts';
import { defenderRange, newHorde, tick, type HordeState } from './horde.ts';
import { enemy, setup } from './testing.ts';

/** A horde with nobody on the posts, so nothing dies. */
function unmanned(): HordeState {
  const s = newHorde(1, setup());
  s.defenders = [];
  for (const p of s.posts) p.defenderId = null;
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

  it('different seeds, different lanes', () => {
    const lanes = (seed: number) => tick(newHorde(seed, setup()), 8).enemies.map((e) => e.lane);
    expect(lanes(1)).not.toEqual(lanes(2));
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
      expect(e.lane).toBeGreaterThanOrEqual(0);
      expect(e.lane).toBeLessThanOrEqual(4);
    }
  });

  it('enemies stop at the wall and hit their segment', () => {
    const s = unmanned();
    s.toSpawn = 0;
    enemy(s, { lane: 2, x: 530 });
    const after = tick(s, 1.5);
    expect(after.enemies[0]?.x).toBe(520);
    expect(after.layers[0]?.segments[2]?.hp).toBe(190);
  });

  it('a broken segment opens only its lane', () => {
    const s = unmanned();
    s.toSpawn = 0;
    s.layers[0]!.segments[2]!.hp = 0;
    enemy(s, { lane: 2, x: 530 });
    enemy(s, { lane: 3, x: 530 });
    const after = tick(s, 15);
    expect(after.enemies[0]?.x).toBe(120);
    expect(after.camp.hp).toBeLessThan(500);
    expect(after.enemies[1]?.x).toBe(520);
  });

  it('a segment repaired behind an enemy never pulls it back', () => {
    const s = unmanned();
    s.toSpawn = 0;
    enemy(s, { lane: 2, x: 510 });
    const after = tick(s, STEP);
    expect(after.enemies[0]?.x).toBe(509);
  });

  it('the camp floors at 0 and the horde is lost', () => {
    const s = unmanned();
    s.camp.hp = 3;
    s.layers[0]!.segments[2]!.hp = 0;
    enemy(s, { lane: 2, x: 120 });
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

  it('shoots the closest-to-camp enemy in range', () => {
    const s = quiet();
    enemy(s, { lane: 1, x: 1000 });
    enemy(s, { lane: 4, x: 900 });
    const after = tick(s, STEP);
    expect(after.enemies.map((e) => e.hp)).toEqual([20, 14]);
    expect(after.shots).toHaveLength(1);
  });

  it('breaks a tie on x by the lowest id', () => {
    const s = quiet();
    enemy(s, { lane: 2, x: 900 });
    enemy(s, { lane: 0, x: 900 });
    const after = tick(s, STEP);
    expect(after.enemies.map((e) => e.hp)).toEqual([14, 20]);
  });

  it("doesn't shoot out of range", () => {
    const s = quiet();
    enemy(s, { lane: 1, x: 1300 });
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
    enemy(s, { hp: 1, lane: 1, x: 520, nextAttackAt: 0 });
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
