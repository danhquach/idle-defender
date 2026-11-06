// Damage numbers (ID-082): what each hit on an enemy or the wall did, merged per target.
import { describe, expect, it } from 'vitest';
import { BRUTE, CARD, DAMAGE_POP, SEGMENT_HEIGHT, START_BASE, STEP, WEAPONS } from './data.ts';
import { newHorde, tick, type Bullet, type HordeState } from './horde.ts';
import { loadoutFrom } from './loadout.ts';
import { enemy, setup } from './testing.ts';

/** Horde 1 with nothing to spawn, and a holding its fire: only hand-placed bullets fly. */
function holding(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
/** A pistol bullet at (590, 360) heading along +x into an enemy at (600, 360). */
function shoot(s: HordeState, b: Partial<Bullet> = {}): void {
  s.bullets.push({
    x: 590,
    y: 360,
    dx: 1,
    dy: 0,
    speed: 1800,
    damage: 6,
    owner: 'a',
    fromX: 590,
    fromY: 360,
    aim: 10,
    left: 600,
    pierce: 0,
    hit: [],
    tracer: WEAPONS.pistol.tracer,
    ...b,
  });
}
const steps = (s: HordeState, n: number): HordeState => {
  let t = s;
  for (let i = 0; i < n; i++) t = tick(t, STEP);
  return t;
};
const tough = { hp: 1000, maxHp: 1000, stunnedUntil: 99 };

describe('damage numbers on enemies (ID-082)', () => {
  it('a bullet hit leaves one at the enemy with what it dealt', () => {
    const s = holding();
    const e = enemy(s, tough);
    shoot(s);
    const t = tick(s, STEP);
    expect(t.pops).toEqual([
      { x: 600, y: 360, amount: 6, crit: false, on: 'shambler', key: `e${e.id}`, at: 0 },
    ]);
  });

  it("counts a Brute's armour: the number is what it took", () => {
    const s = holding();
    enemy(s, { ...tough, kind: 'brute' });
    shoot(s, { damage: 20 });
    expect(tick(s, STEP).pops[0]).toMatchObject({ amount: 20 - BRUTE.armour, on: 'brute' });
  });

  it('a crit is its own number, never merged with plain hits on the same enemy', () => {
    const s = holding();
    enemy(s, tough);
    shoot(s);
    shoot(s, { damage: 12, crit: true });
    shoot(s);
    const t = tick(s, STEP);
    expect(t.pops.map((p) => [p.amount, p.crit])).toEqual([
      [12, false],
      [12, true],
    ]);
  });

  it('hits on one enemy within the merge window add up; later ones start a new number', () => {
    const s = holding();
    enemy(s, tough);
    shoot(s);
    let t = tick(s, STEP);
    shoot(t);
    t = tick(t, STEP);
    expect(t.pops.map((p) => p.amount)).toEqual([12]);
    t = steps(t, Math.ceil(DAMAGE_POP.merge / STEP));
    shoot(t);
    t = tick(t, STEP);
    expect(t.pops.map((p) => p.amount)).toEqual([12, 6]);
  });

  it('hits on two enemies are two numbers', () => {
    const s = holding();
    const a = enemy(s, { ...tough, y: 300 });
    const b = enemy(s, tough);
    shoot(s, { y: 300, fromY: 300 });
    shoot(s);
    expect(
      tick(s, STEP)
        .pops.map((p) => p.key)
        .sort(),
    ).toEqual([`e${a.id}`, `e${b.id}`].sort());
  });

  it('a crit from the trigger rides its bullet into a crit number', () => {
    // A Sharp Mind of 100 puts a Gunner's crit chance at 30%: some first rounds crit, some don't.
    const seen = new Set<boolean>();
    for (let seed = 1; seed <= 30; seed++) {
      const stats = { instinct: 0, agility: 0, mind: 100, tinker: 0 };
      const s = newHorde(seed, {
        ...setup(),
        roster: [{ id: 'a', name: 'A', loadout: loadoutFrom('pistol'), stats }],
      });
      s.toSpawn = 0;
      enemy(s, { ...tough, x: 650 });
      const fired = tick(s, STEP);
      const b = fired.bullets[0]!;
      let t = fired;
      for (let i = 0; i < 20 && t.pops.length === 0; i++) t = tick(t, STEP);
      // A shambler has no armour and nothing else hits it: the number is the bullet's damage.
      expect(t.pops[0]).toMatchObject({ amount: b.damage, crit: b.crit === true });
      seen.add(b.crit === true);
    }
    expect([...seen].sort()).toEqual([false, true]);
  });

  it('a blade strike leaves one too', () => {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.defenders[0]!.loadout = loadoutFrom('knife');
    const e = enemy(s, { ...tough, x: 440 });
    const t = steps(s, 3);
    expect(t.pops).toHaveLength(1);
    expect(t.pops[0]!.key).toBe(`e${e.id}`);
    expect(t.pops[0]!.amount).toBeCloseTo(1000 - t.enemies[0]!.hp, 9);
  });

  it('a burn ticks into a few merged numbers that add up to what it burned', () => {
    const s = holding();
    s.taken = ['burning-rounds'];
    const e = enemy(s, tough);
    shoot(s, { damage: 10 });
    const t = steps(s, Math.round(1 / STEP));
    // The bullet's hit and the burn's ticks: together all the enemy lost.
    const onIt = t.pops.filter((p) => p.key === `e${e.id}`);
    const total = onIt.reduce((n, p) => n + p.amount, 0);
    expect(total).toBeCloseTo(1000 - t.enemies[0]!.hp, 9);
    expect(total).toBeGreaterThan(10 + CARD.burn.dps * 0.5);
    // About one number per merge window, not one per step.
    expect(onIt.length).toBeLessThanOrEqual(Math.ceil(1 / DAMAGE_POP.merge) + 1);
    expect(onIt.length).toBeGreaterThan(1);
  });

  it('a dead enemy takes no number', () => {
    const s = holding();
    s.fires.push({ x: 600, y: 360, at: 0, until: 5 });
    enemy(s, { ...tough, hp: 0 });
    expect(tick(s, STEP).pops).toEqual([]);
  });

  it('keeps at most the cap, dropping the oldest', () => {
    const s = holding();
    // One fire covers them all, stacked on its centre: one number each, the first five dropped.
    for (let i = 0; i < DAMAGE_POP.cap + 5; i++) enemy(s, { ...tough, x: 600, y: 360 });
    s.fires.push({ x: 600, y: 360, at: 0, until: 5 });
    const ids = s.enemies.map((e) => e.id);
    const t = tick(s, STEP);
    expect(t.enemies.every((e) => e.hp < 1000)).toBe(true);
    expect(t.pops.map((p) => p.key)).toEqual(ids.slice(5).map((id) => `e${id}`));
  });

  it('goes after DAMAGE_POP.keep s, and all go when the horde ends', () => {
    const s = holding();
    enemy(s, tough);
    shoot(s);
    let t = tick(s, STEP);
    expect(t.pops).toHaveLength(1);
    t = steps(t, Math.ceil(DAMAGE_POP.keep / STEP) + 1);
    expect(t.pops).toEqual([]);
    const ended = holding();
    ended.wave = ended.waveCount;
    ended.pops.push({ x: 1, y: 1, amount: 1, crit: false, on: 'wall', key: 'w0:0', at: 0 });
    const after = tick(ended, STEP);
    expect(after.outcome).toBe('won');
    expect(after.pops).toEqual([]);
  });
});

describe('damage numbers on the wall (ID-082)', () => {
  it('a blow on a segment leaves one over it, keyed by layer and row', () => {
    const s = newHorde(1, setup());
    s.defenders = [];
    s.toSpawn = 0;
    const row = START_BASE.gate;
    enemy(s, { x: 530, y: (row + 0.5) * SEGMENT_HEIGHT });
    const t = steps(s, Math.round(0.5 / STEP));
    const layer = t.layers[0]!;
    expect(t.pops).toEqual([
      {
        x: layer.x,
        y: (row + 0.5) * SEGMENT_HEIGHT,
        amount: 5,
        crit: false,
        on: 'wall',
        key: `w${layer.column}:${row}`,
        at: expect.any(Number),
      },
    ]);
  });
});

describe('damage numbers on the wall, at its last HP (ID-082)', () => {
  it('a blow that breaks a segment shows only the HP it had left', () => {
    const s = newHorde(1, setup());
    s.defenders = [];
    s.toSpawn = 0;
    const row = START_BASE.gate;
    s.layers[0]!.segments[row]!.hp = 3;
    enemy(s, { x: 530, y: (row + 0.5) * SEGMENT_HEIGHT });
    const t = steps(s, Math.round(0.5 / STEP));
    expect(t.layers[0]!.segments[row]!.hp).toBe(0);
    expect(t.pops.map((p) => [p.on, p.amount])).toEqual([['wall', 3]]);
  });
});
