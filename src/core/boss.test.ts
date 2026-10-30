// Design §9 (ID-024): boss hordes, the Mutated Horror and its three abilities.
import { describe, expect, it } from 'vitest';
import { buildPost, newBase } from './base.ts';
import {
  ENEMIES,
  HORROR,
  SEGMENT_HEIGHT,
  START_BASE,
  STEP,
  WEAPONS,
  type HorrorAbility,
  type Stock,
  stockOf,
} from './data.ts';
import {
  hitDamage,
  newHorde,
  standing,
  tick,
  type Enemy,
  type HorrorClock,
  type HordeState,
} from './horde.ts';
import { loadoutFrom } from './loadout.ts';
import { enemy, setup } from './testing.ts';
import { enemyHp, horrorAbility, kindFor, waveCount, waveSize } from './waves.ts';

const RICH: Stock = stockOf({ scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 });
/** Row 4's middle: level with defender a on the upper tower (420, 360). */
const ROW4 = 4.5 * SEGMENT_HEIGHT;

/** Horde 1 with nothing left to spawn; defender a on the upper tower never fires. */
function quiet(): HordeState {
  const s = newHorde(1, setup());
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
/** Adds a 1000 HP Mutated Horror far out in the field, its clock as given. */
function horror(
  s: HordeState,
  ability: HorrorAbility,
  e: Partial<Enemy> = {},
  clock: Partial<HorrorClock> = {},
): Enemy {
  const made = enemy(s, { kind: 'horror', x: 1400, y: 400, hp: 1000, maxHp: 1000, ...e });
  made.horror = {
    ability,
    nextAt: 1,
    chargeUntil: 0,
    charged: false,
    hitAt: 0,
    seenHp: made.hp,
    ...clock,
  };
  return made;
}
const one = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id);
/** Horde `n` at the start of its last wave. */
function lastWave(n: number, seed = 1): HordeState {
  const s = newHorde(seed, { ...setup(), hordeNumber: n });
  s.wave = s.waveCount;
  s.toSpawn = waveSize(n, s.wave);
  return s;
}

describe('boss hordes', () => {
  it("every 10th horde is a boss horde, its Horror's ability taken in turn", () => {
    for (let n = 1; n <= 9; n++) expect(horrorAbility(n), `horde ${n}`).toBeNull();
    expect(horrorAbility(11)).toBeNull();
    expect([10, 20, 30, 40, 50, 60].map(horrorAbility)).toEqual([
      'brood',
      'charge',
      'regen',
      'brood',
      'charge',
      'regen',
    ]);
    expect(() => horrorAbility(0)).toThrow(RangeError);
    expect(newHorde(1, { ...setup(), hordeNumber: 20 }).boss).toBe('charge');
    expect(newHorde(1, { ...setup(), hordeNumber: 9 }).boss).toBeNull();
  });

  it('the Horror comes with the first spawn of the last wave, once, at that wave’s HP', () => {
    const early = newHorde(1, { ...setup(), hordeNumber: 10 });
    early.wave = early.waveCount - 1;
    expect(run(early, 5).enemies.some((e) => e.kind === 'horror')).toBe(false);

    const s = lastWave(10);
    const first = tick(s, STEP);
    const horrors = first.enemies.filter((e) => e.kind === 'horror');
    expect(horrors).toHaveLength(1);
    expect(horrors[0]!.maxHp).toBe(enemyHp('horror', 10, waveCount(10)));
    expect(horrors[0]!.horror?.ability).toBe('brood');
    expect(first.bossSpawned).toBe(true);
    expect(run(first, 10).enemies.filter((e) => e.kind === 'horror')).toHaveLength(1);

    expect(run(lastWave(9), 10).enemies.some((e) => e.kind === 'horror')).toBe(false);
  });

  it('the random mix never rolls a Horror', () => {
    for (let n = 1; n <= 40; n++) {
      for (let r = 0; r < 1; r += 0.001) expect(kindFor(n, r)).not.toBe('horror');
    }
  });

  it('a boss horde is won only once its Horror has come and is dead; the kill pays', () => {
    const s = lastWave(10);
    s.toSpawn = 0;
    const t = tick(s, STEP);
    expect(t.outcome).toBe('fighting');
    const boss = t.enemies.find((e) => e.kind === 'horror')!;
    boss.hp = 0;
    const { xp, cash } = t;
    const won = tick(t, STEP);
    expect(won.outcome).toBe('won');
    expect(won.xp).toBe(xp + ENEMIES.horror.xp);
    expect(won.cash).toBe(cash + ENEMIES.horror.cash);
  });

  it('armour takes some damage off each bullet, never below the minimum', () => {
    const e = { kind: 'horror' } as Parameters<typeof hitDamage>[0];
    expect(hitDamage(e, 6.2)).toBeCloseTo(6.2 - HORROR.armour, 12);
    expect(hitDamage(e, 2)).toBe(HORROR.min);
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
    const e = horror(s, 'brood', { x: 520, y: post.y }, { nextAt: 100 });
    expect(one(tick(s, STEP), e.id)!.hp).toBe(1000 - WEAPONS.knife.damage);
  });
});

describe('Broodmother', () => {
  it("brings Shamblers at this wave's HP beside it on its clock; they pay like any Shambler", () => {
    const s = quiet();
    const h = horror(s, 'brood');
    let t = run(s, 0.9);
    expect(t.enemies).toHaveLength(1);
    t = run(t, 0.2);
    const brood = t.enemies.filter((e) => e.id !== h.id);
    expect(brood).toHaveLength(HORROR.brood.count);
    const at = one(t, h.id)!;
    for (const e of brood) {
      expect(e.kind).toBe('shambler');
      expect(e.maxHp).toBe(enemyHp('shambler', 1, 1));
      expect(Math.abs(e.x - at.x)).toBeLessThan(5);
      expect(e.inCamp).toBe(false);
    }
    t = run(t, HORROR.brood.every);
    expect(t.enemies).toHaveLength(1 + 2 * HORROR.brood.count);
    const { xp, cash } = t;
    t.enemies.find((e) => e.kind === 'shambler')!.hp = 0;
    t = tick(t, STEP);
    expect(t.xp).toBe(xp + ENEMIES.shambler.xp);
    expect(t.cash).toBe(cash + ENEMIES.shambler.cash);
  });

  it('a brood born in the camp is in the camp', () => {
    const s = quiet();
    horror(s, 'brood', { x: 300, inCamp: true });
    const t = run(s, 1.1);
    const brood = t.enemies.filter((e) => e.kind === 'shambler');
    expect(brood).toHaveLength(HORROR.brood.count);
    for (const e of brood) expect(e.inCamp).toBe(true);
  });
});

describe('Rammer', () => {
  it(`charges at ${HORROR.charge.speed}× speed for ${HORROR.charge.time} s on its clock`, () => {
    const s = quiet();
    const h = horror(s, 'charge');
    const x = (t: HordeState) => one(t, h.id)!.x;
    const speed = ENEMIES.horror.speed;
    let t = run(s, 0.9);
    expect(1400 - x(t)).toBeCloseTo(speed * 0.9, 0);
    t = run(t, 0.2);
    const into = x(t);
    t = run(t, 1.6);
    expect(into - x(t)).toBeCloseTo(speed * HORROR.charge.speed * 1.6, 0);
    t = run(t, 0.6);
    const after = x(t);
    t = run(t, 1);
    expect(after - x(t)).toBeCloseTo(speed, 0);
    expect(one(t, h.id)!.horror!.nextAt).toBeCloseTo(1 + HORROR.charge.every, 5);
  });

  it('a stun holds a charge: it stands still, then charges out the rest', () => {
    const s = quiet();
    const h = horror(s, 'charge', {}, { chargeUntil: 1, nextAt: 100 });
    const x = (t: HordeState) => one(t, h.id)!.x;
    let t = run(s, 0.5);
    one(t, h.id)!.stunnedUntil = t.time + 2;
    const held = x(t);
    t = run(t, 1.9);
    expect(x(t)).toBe(held);
    t = run(t, 0.2);
    // The 0.5 s left of the charge, pushed back by the 2 s stun.
    expect(one(t, h.id)!.horror!.chargeUntil).toBeCloseTo(3, 5);
    t = run(t, 0.1);
    const going = x(t);
    t = run(t, 0.3);
    expect(going - x(t)).toBeCloseTo(ENEMIES.horror.speed * HORROR.charge.speed * 0.3, 0);
    t = run(t, 1);
    expect(one(t, h.id)!.horror!.chargeUntil).toBe(0);
  });

  it(`its first wall hit in a charge does ${HORROR.charge.hit}×, the rest do one`, () => {
    const s = quiet();
    const hp = s.layers[0]!.segments[4]!.hp;
    horror(s, 'charge', { x: 520, y: ROW4 }, { chargeUntil: 10, nextAt: 100 });
    let t = tick(s, STEP);
    const hit = ENEMIES.horror.damage;
    expect(t.layers[0]!.segments[4]!.hp).toBe(hp - hit * HORROR.charge.hit);
    t = run(t, ENEMIES.horror.attackInterval);
    expect(t.layers[0]!.segments[4]!.hp).toBe(Math.max(0, hp - hit * (HORROR.charge.hit + 1)));
  });
});

describe('Regenerator', () => {
  const rate = HORROR.regen.rate * 1000;

  it(`heals ${HORROR.regen.rate * 100}% of its max HP a second, once ${HORROR.regen.after} s pass without a hit`, () => {
    const s = quiet();
    const h = horror(s, 'regen', { hp: 500 }, { hitAt: 0 });
    let t = run(s, 1);
    expect(one(t, h.id)!.hp).toBeCloseTo(500 + rate * (1 - HORROR.regen.after), -1);
    one(t, h.id)!.hp -= 100;
    const hit = one(t, h.id)!.hp;
    t = run(t, HORROR.regen.after - 2 * STEP);
    expect(one(t, h.id)!.hp).toBe(hit);
    t = run(t, 1);
    expect(one(t, h.id)!.hp).toBeGreaterThan(hit + rate * 0.5);
  });

  it('never heals past its max HP', () => {
    const s = quiet();
    const h = horror(s, 'regen', { hp: 999 });
    expect(one(run(s, 2), h.id)!.hp).toBe(1000);
  });
});

describe('ability clocks', () => {
  it('wait out a stun', () => {
    const s = quiet();
    horror(s, 'brood', { stunnedUntil: 5 });
    let t = run(s, 5.5);
    expect(t.enemies).toHaveLength(1);
    t = run(t, 1);
    expect(t.enemies).toHaveLength(1 + HORROR.brood.count);

    const r = quiet();
    const h = horror(r, 'regen', { hp: 500, stunnedUntil: 2 });
    expect(one(run(r, 1.9), h.id)!.hp).toBe(500);
  });

  it('stop during a pick: fight time stands still', () => {
    const s = quiet();
    horror(s, 'brood');
    s.offer = [{ kind: 'upgrade', id: 'sharpshooter' }];
    const t = tick(s, 30);
    expect(t.time).toBe(s.time);
    expect(t.enemies).toHaveLength(1);
  });
});

describe('a boss horde', () => {
  it('is seeded: the same seed plays the same, another differs', () => {
    const a = run(lastWave(10, 7), 30);
    expect(run(lastWave(10, 7), 30)).toEqual(a);
    expect(run(lastWave(10, 8), 30)).not.toEqual(a);
  });

  it("a Broodmother's brood and a full last wave cost well under the 33 ms step", () => {
    // An unhurt defender who never fires: the whole wave and its brood stay on the field.
    const s = lastWave(10);
    Object.assign(s.defenders[0]!, { hp: 1e9, maxHp: 1e9, nextShotAt: 1e9 });
    let t = run(s, 80);
    for (const e of t.enemies.filter((x) => x.horror)) e.horror!.nextAt = t.time;
    t = tick(t, STEP);
    expect(t.outcome).toBe('fighting');
    expect(t.enemies.length).toBeGreaterThan(waveSize(10, waveCount(10)));
    // The best of 3 batches, so a busy machine doesn't fail it.
    let best = Infinity;
    for (let b = 0; b < 3; b++) {
      const start = performance.now();
      for (let i = 0; i < 30; i++) t = tick(t, STEP);
      best = Math.min(best, (performance.now() - start) / 30);
    }
    expect(best).toBeLessThan(16);
  });
});
