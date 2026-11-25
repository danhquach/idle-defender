// ID-222 Hell's boss skills: Enrage, Shield and Poison pool (wind-up, effect, edges).
import { describe, expect, it } from 'vitest';
import { BOSS_SKILL, ENEMIES, SEGMENT_HEIGHT, STEP } from './data.ts';
import {
  clearFight,
  enraged,
  hitDamage,
  newHorde,
  poisonTarget,
  standing,
  tick,
  windingUp,
  type HordeState,
} from './horde.ts';
import { effHorde, modeBosses } from './modes.ts';
import { enemy, horror, setup } from './testing.ts';

/** Row 4's middle (see boss.test.ts). */
const ROW4 = 4.5 * SEGMENT_HEIGHT;

/** Horde 1 with nothing to spawn and nobody firing. */
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  for (const d of s.defenders) d.nextShotAt = 1e9;
  return s;
}
function run(s: HordeState, seconds: number): HordeState {
  let t = s;
  for (let i = 0; i < Math.round(seconds / STEP); i++) t = tick(t, STEP);
  return t;
}
const one = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)!;

describe('Enrage', () => {
  const half = 1000 * BOSS_SKILL.enrage.at;

  it('has no clock until the boss is hurt, and never one that is NaN', () => {
    const s = newHorde(1, {
      ...setup(),
      // Hell 20: three bosses, one with each Hell skill (ID-225 order).
      hordeNumber: effHorde('hell', 20),
      bosses: modeBosses('hell', 20),
    });
    s.wave = s.waveCount;
    s.toSpawn = 0;
    const t = tick(s, STEP);
    const bosses = t.enemies.filter((e) => e.horror);
    expect(bosses).toHaveLength(3);
    for (const b of bosses) {
      for (const at of Object.values(b.horror!.next)) expect(Number.isFinite(at)).toBe(true);
      expect(b.horror!.next.enrage).toBeUndefined();
    }
    const enrager = bosses.find((b) => b.horror!.skills.includes('enrage'))!;
    expect(Object.keys(enrager.horror!.next)).not.toContain('enrage');
    const shielder = bosses.find((b) => b.horror!.skills.includes('shield'))!;
    expect(shielder.horror!.next.shield).toBeCloseTo(BOSS_SKILL.shield.after, 5);
  });

  it('starts exactly at 50% HP: one HP above does nothing, exactly 50% winds up', () => {
    const s = quiet();
    const h = horror(s, 'enrage', { hp: half + 1 });
    let t = run(s, 1);
    expect(one(t, h.id).horror!.next.enrage).toBeUndefined();
    expect(windingUp(t, one(t, h.id))).toBeNull();
    one(t, h.id).hp = half;
    t = tick(t, STEP);
    const at = one(t, h.id).horror!.next.enrage!;
    expect(at - (t.time - STEP)).toBeCloseTo(BOSS_SKILL.windUp, 5);
    expect(windingUp(t, one(t, h.id))).toBe('enrage');
  });

  it('goes on one wind-up after the tell starts, and arms only once', () => {
    const s = quiet();
    const h = horror(s, 'enrage', { hp: half });
    let t = run(s, BOSS_SKILL.windUp - 0.3);
    expect(one(t, h.id).horror!.enraged).toBeUndefined();
    t = run(t, 0.5);
    expect(one(t, h.id).horror!.enraged).toBe(true);
    expect(one(t, h.id).horror!.next.enrage).toBeUndefined();
    expect(one(t, h.id).horror!.fired.enrage).toBeDefined();
    // It stays off the clock: another second of it does not arm it again.
    t = run(t, 2);
    expect(one(t, h.id).horror!.next.enrage).toBeUndefined();
    expect(windingUp(t, one(t, h.id))).toBeNull();
  });

  it('stays on when Regen heals it back over 50%', () => {
    const s = quiet();
    const h = horror(s, ['enrage', 'regen'], { hp: half });
    let t = run(s, 1.5);
    expect(one(t, h.id).horror!.enraged).toBe(true);
    one(t, h.id).hp = 1000;
    t = run(t, 1);
    expect(one(t, h.id).horror!.enraged).toBe(true);
    expect(one(t, h.id).horror!.next.enrage).toBeUndefined();
  });

  it('a stun pushes it back like any clock', () => {
    const s = quiet();
    const h = horror(s, 'enrage', { hp: half });
    let t = tick(s, STEP);
    one(t, h.id).stunnedUntil = t.time + 2;
    t = run(t, 1.9);
    expect(one(t, h.id).horror!.enraged).toBeUndefined();
    expect(windingUp(t, one(t, h.id))).toBeNull();
    t = run(t, 1.5);
    expect(one(t, h.id).horror!.enraged).toBe(true);
  });

  it(`moves ${BOSS_SKILL.enrage.speed * 100}% faster for good`, () => {
    const s = quiet();
    const plain = horror(s, 'enrage');
    const mad = horror(s, 'enrage', { y: 100 }, { enraged: true });
    const t = run(s, 1);
    const speed = ENEMIES.horror.speed;
    expect(1400 - one(t, plain.id).x).toBeCloseTo(speed, 0);
    expect(1400 - one(t, mad.id).x).toBeCloseTo(speed * (1 + BOSS_SKILL.enrage.speed), 0);
  });

  it('its speed multiplies with a charge’s', () => {
    const s = quiet();
    const h = horror(s, ['charge', 'enrage'], {}, { enraged: true, chargeUntil: 10, nextAt: 100 });
    const t = run(s, 0.5);
    expect(1400 - one(t, h.id).x).toBeCloseTo(
      ENEMIES.horror.speed * 0.5 * 3 * (1 + BOSS_SKILL.enrage.speed),
      0,
    );
  });

  it(`hits walls ${1 + BOSS_SKILL.enrage.damage}× as hard`, () => {
    const hit = ENEMIES.horror.damage;
    const wall = (enraged: boolean): number => {
      const s = quiet();
      const hp = s.layers[0]!.segments[4]!.hp;
      horror(s, 'enrage', { x: 520, y: ROW4 }, enraged ? { enraged: true } : {});
      return hp - tick(s, STEP).layers[0]!.segments[4]!.hp;
    };
    expect(wall(false)).toBe(hit);
    expect(wall(true)).toBeCloseTo(hit * (1 + BOSS_SKILL.enrage.damage), 9);
  });

  it('an enraged boss stays enraged for good', () => {
    const s = quiet();
    expect(enraged(horror(s, 'enrage', {}, { enraged: true }))).toBe(true);
    expect(enraged(horror(s, 'enrage', {}))).toBe(false);
  });
});

describe('Shield', () => {
  /** A shield boss that has gone off, with a near and a far Shambler. */
  function shielded() {
    const s = quiet();
    const boss = horror(
      s,
      ['shield', 'roar'],
      { x: 1400, y: 400 },
      { shieldOn: true, nextAt: 100 },
    );
    s.bosses.push({
      kind: 'horror',
      skills: ['shield', 'roar'],
      wave: 1,
      hp: 1,
      elite: false,
      id: boss.id,
    });
    const near = enemy(s, { x: 1300, y: 400 });
    const far = enemy(s, { x: 1100, y: 400 });
    return { s, boss, near, far };
  }

  it('winds up before it goes off, once, 4 s in', () => {
    const s = quiet();
    const h = horror(s, 'shield', {}, { nextAt: BOSS_SKILL.shield.after });
    let t = run(s, BOSS_SKILL.shield.after - BOSS_SKILL.windUp - 0.1);
    expect(windingUp(t, one(t, h.id))).toBeNull();
    t = run(t, 0.3);
    expect(windingUp(t, one(t, h.id))).toBe('shield');
    expect(one(t, h.id).horror!.shieldOn).toBeUndefined();
    t = run(t, BOSS_SKILL.windUp);
    expect(one(t, h.id).horror!.shieldOn).toBe(true);
    // One-shot: its clock is gone for good.
    expect(one(t, h.id).horror!.next.shield).toBeUndefined();
    expect(windingUp(t, one(t, h.id))).toBeNull();
  });

  it('cuts a bullet to 0.6 inside its radius only, never the boss itself; armour piercing goes through', () => {
    const { s, boss, near, far } = shielded();
    const t = tick(s, STEP);
    expect(one(t, near.id).shielded).toBe(true);
    expect(one(t, far.id).shielded).toBeUndefined();
    expect('shielded' in one(t, far.id)).toBe(false);
    expect(one(t, boss.id).shielded).toBeUndefined();
    expect(hitDamage(one(t, near.id), 10)).toBeCloseTo(10 * BOSS_SKILL.shield.factor, 9);
    expect(hitDamage(one(t, far.id), 10)).toBe(10);
    expect(hitDamage(one(t, near.id), 10, true)).toBe(10);
  });

  it('ends the step its boss dies', () => {
    const { s, boss, near } = shielded();
    let t = tick(s, STEP);
    expect(one(t, near.id).shielded).toBe(true);
    one(t, boss.id).hp = 0;
    t = tick(t, STEP);
    expect(t.enemies.some((e) => e.id === boss.id)).toBe(false);
    expect('shielded' in one(t, near.id)).toBe(false);
  });

  it('drops while the boss is stunned, so a Flashbang answers it', () => {
    const { s, boss, near } = shielded();
    let t = tick(s, STEP);
    one(t, boss.id).stunnedUntil = t.time + 2;
    t = tick(t, STEP);
    expect('shielded' in one(t, near.id)).toBe(false);
    t = run(t, 2.2);
    expect(one(t, near.id).shielded).toBe(true);
  });

  it('a fight with no shield boss never marks anyone', () => {
    const s = quiet();
    horror(s, 'roar', {}, { nextAt: 100 });
    const other = enemy(s, { x: 1300, y: 400 });
    const t = run(s, 1);
    expect('shielded' in one(t, other.id)).toBe(false);
  });
});

describe('Poison pool', () => {
  /** Boss at row y 440; survivors on the line at y 100, 467 and 700, x 420 (133+ px apart). */
  function lined() {
    const s = quiet();
    // The setup fields one survivor; b and c stand beside it (their places are set below).
    for (const spec of setup().roster.slice(1)) {
      s.defenders.push(standing(spec, s.posts[0]!, 0));
    }
    for (const d of s.defenders) d.nextShotAt = 1e9;
    const ys = [100, 467, 700];
    s.defenders.forEach((d, i) => {
      d.x = 420;
      d.y = ys[i]!;
    });
    const boss = horror(s, 'poison', { x: 1400, y: 440 }, { nextAt: 1 });
    return { s, boss };
  }
  const { rate, radius, seconds, flight } = BOSS_SKILL.poison;

  it('winds up, then a glob flies to the nearest living survivor’s slot and lands as a pool', () => {
    const { s, boss } = lined();
    expect(poisonTarget(s, boss)).toEqual({ x: 420, y: 467 });
    let t = run(s, 1.1);
    expect(windingUp(t, one(t, boss.id))).toBeNull();
    expect(t.globs).toHaveLength(1);
    expect(t.globs![0]).toMatchObject({ x: 420, y: 467 });
    expect(t.globs![0]!.lands - t.globs![0]!.at).toBeCloseTo(flight, 9);
    expect(t.pools).toBeUndefined();
    t = run(t, flight + 0.1);
    expect(t.globs).toHaveLength(0);
    expect(t.pools).toHaveLength(1);
    expect(t.pools![0]!.until - t.pools![0]!.at).toBeCloseTo(seconds, 9);
  });

  it('marks its target from the start of the wind-up', () => {
    const { s, boss } = lined();
    one(s, boss.id).horror!.next.poison = 5;
    const t = run(s, 3.9);
    expect(windingUp(t, one(t, boss.id))).toBe('poison');
    expect(poisonTarget(t, one(t, boss.id))).toEqual({ x: 420, y: 467 });
    expect(t.globs).toBeUndefined();
  });

  it('aims at a living survivor: a downed slot is skipped, nobody left means no throw', () => {
    const { s, boss } = lined();
    s.defenders[1]!.hp = 0;
    expect(poisonTarget(s, boss)).toEqual({ x: 420, y: 700 });
    for (const d of s.defenders) d.hp = 0;
    expect(poisonTarget(s, boss)).toBeNull();
  });

  it('harms only the survivor standing in it, at its share of max HP a second, straight off HP', () => {
    const { s } = lined();
    const [a, b, c] = s.defenders.map((d) => d.maxHp) as [number, number, number];
    let t = run(s, 1 + flight + 0.05);
    const before = t.defenders.map((d) => d.hp);
    t = run(t, 1);
    const [pa, pb, pc] = t.defenders;
    expect(pa!.hp).toBe(a);
    expect(pc!.hp).toBe(c);
    expect(before[1]! - pb!.hp).toBeCloseTo(rate * b, 1);
    expect(pb!.hitBy).toBe('horror');
    // The pool is `radius` wide: a survivor just outside it is safe, just inside is not.
    const edge = (dy: number): number => {
      const u = lined().s;
      u.defenders[0]!.y = 467 + dy;
      const v = run(u, 1 + flight + 1.05);
      return u.defenders[0]!.maxHp - v.defenders[0]!.hp;
    };
    expect(edge(radius - 1)).toBeGreaterThan(0);
    expect(edge(radius + 1)).toBe(0);
  });

  it('is gone after its seconds, and the survivor stops losing HP', () => {
    const { s } = lined();
    let t = run(s, 1 + flight + seconds + 0.2);
    expect(t.pools).toHaveLength(0);
    const hp = t.defenders[1]!.hp;
    t = run(t, 2);
    expect(t.defenders[1]!.hp).toBe(hp);
  });

  it('comes again each 15 s, not from the camp', () => {
    const { s, boss } = lined();
    let t = run(s, 1.1);
    expect(one(t, boss.id).horror!.next.poison).toBeCloseTo(1 + BOSS_SKILL.poison.every, 5);
    const camp = quiet();
    horror(camp, 'poison', { x: 100, y: 440, inCamp: true }, { nextAt: 0.5 });
    t = run(camp, 2);
    expect(t.globs).toBeUndefined();
    expect(t.pools).toBeUndefined();
  });

  it('Gas Masks cut it by 60%', () => {
    const loss = (cards: boolean): number => {
      const { s } = lined();
      if (cards) s.taken = ['gas-masks'];
      const t = run(s, 1 + flight + 1.05);
      return t.defenders[1]!.maxHp - t.defenders[1]!.hp;
    };
    expect(loss(true)).toBeCloseTo(loss(false) * 0.4, 6);
  });

  it('is cleared when the fight ends', () => {
    const { s } = lined();
    const t = run(s, 1 + flight + 0.2);
    expect(t.pools).toHaveLength(1);
    clearFight(t);
    expect(t.pools).toBeUndefined();
    expect(t.globs).toBeUndefined();
  });
});
