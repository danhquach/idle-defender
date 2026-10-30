// Design §6 (ID-046): the five specialised guns, each with its own bullet profile.
import { describe, expect, it } from 'vitest';
import { pierceOf, type OwnedWeapon } from './armoury.ts';
import {
  ENEMY_RADIUS,
  FREE_WEAPONS,
  GUNNER,
  STAT_EFFECT,
  STEP,
  WEAPONS,
  type WeaponId,
} from './data.ts';
import { equip, newGame } from './game.ts';
import { newHorde, tick, type HordeState } from './horde.ts';
import { enemy, setup } from './testing.ts';

const GUNS = ['smg', 'rifle', 'shotgun', 'lmg', 'sniper'] as const;
const owned = (base: WeaponId, affixes: OwnedWeapon['affixes'] = []): OwnedWeapon => ({
  uid: 'h1',
  base,
  rarity: 'common',
  affixes,
});

/** Horde 1 with nothing to spawn; Gunner a on the upper tower (420, 360) with `gun` alone. */
function armed(gun: WeaponId, seed = 1): HordeState {
  const base = setup();
  const s = newHorde(seed, {
    ...base,
    roster: [{ id: 'a', name: 'A', loadout: { primary: owned(gun), secondary: null, item: null } }],
  });
  s.toSpawn = 0;
  return s;
}
const deg = (dy: number, dx: number): number => (Math.atan2(dy, dx) * 180) / Math.PI;
const hpOf = (s: HordeState, id: number): number | undefined =>
  s.enemies.find((e) => e.id === id)?.hp;

describe('the specialised guns', () => {
  it('are owned items only, never free, with the starting bullet profiles', () => {
    for (const id of GUNS) {
      expect(WEAPONS[id].kind).toBe('gun');
      expect(FREE_WEAPONS as readonly string[]).not.toContain(id);
    }
    const profile = (id: (typeof GUNS)[number]) => {
      const g = WEAPONS[id];
      return [g.speed, g.spread, g.pellets, g.pierce];
    };
    expect(profile('smg')).toEqual([1600, 5, 1, 0]);
    expect(profile('rifle')).toEqual([2200, 1.5, 1, 0]);
    expect(profile('shotgun')).toEqual([1400, 12, 6, 0]);
    expect(profile('lmg')).toEqual([2000, 4, 1, 0]);
    expect(profile('sniper')).toEqual([3000, 0.5, 1, 1]);
  });

  it('cannot be equipped by id, only as an owned weapon', () => {
    const asPrimary = { primary: 'smg', secondary: null, item: null } as never;
    const asSecondary = { primary: 'pistol', secondary: 'lmg', item: null } as never;
    expect(() => equip(newGame(), 'bob', asPrimary)).toThrow(RangeError);
    expect(() => equip(newGame(), 'bob', asSecondary)).toThrow(RangeError);
  });

  it('a shotgun round is 6 pellets of its damage each, from one trigger and one flash', () => {
    const s = armed('shotgun');
    enemy(s, { hp: 1000, maxHp: 1000, x: 650, y: 360, stunnedUntil: 9 });
    const fired = tick(s, STEP);
    expect(fired.bullets).toHaveLength(6);
    expect(fired.shots).toHaveLength(1);
    expect(fired.defenders[0]!.ammo.primary).toBe(WEAPONS.shotgun.magazine - 1);
    // The crit is rolled once at the trigger: every pellet of a round deals the same.
    const dealt = fired.bullets[0]!.damage;
    expect([1, STAT_EFFECT.critDamage].map((k) => k * WEAPONS.shotgun.damage)).toContainEqual(
      dealt,
    );
    for (const b of fired.bullets) expect(b.damage).toBe(dealt);
    // Each pellet rolls its own angle.
    expect(new Set(fired.bullets.map((b) => b.dy)).size).toBe(6);
  });

  it('each pellet hits on its own: a round spreads its hits over several enemies, no falloff', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = armed('shotgun', seed);
      // A wall of enemies 250 px out, side by side across the cone (±6° ≈ ±26 px there).
      const ids = [310, 335, 360, 385, 410].map(
        (y) => enemy(s, { hp: 1000, maxHp: 1000, x: 670, y, stunnedUntil: 9 }).id,
      );
      let t = tick(s, STEP);
      const pellet = t.bullets[0]!.damage;
      for (let i = 0; i < 20 && t.bullets.length > 0; i++) t = tick(t, STEP);
      const taken = ids.map((id) => 1000 - hpOf(t, id)!);
      // Every enemy took a whole number of pellets, each at full damage; more than one was hit.
      for (const d of taken) expect(Math.round(d / pellet) * pellet).toBeCloseTo(d, 6);
      expect(taken.filter((d) => d > 0).length, `seed ${seed}`).toBeGreaterThan(1);
      expect(taken.reduce((a, b) => a + b, 0)).toBeCloseTo(
        t.impacts.filter((i) => i.hit).length * pellet,
      );
    }
  });

  it("every gun's bullets stay inside its cone (halved for a Gunner)", () => {
    for (const id of GUNS) {
      for (let seed = 1; seed <= 40; seed++) {
        const s = armed(id, seed);
        const e = enemy(s, { hp: 1000, maxHp: 1000, x: 700, y: 360, stunnedUntil: 9 });
        const fired = tick(s, STEP);
        const aim = deg(e.y - 360, e.x - 420);
        const cone = WEAPONS[id].spread * GUNNER.spread;
        for (const b of fired.bullets) {
          expect(Math.abs(deg(b.dy, b.dx) - aim), `${id} seed ${seed}`).toBeLessThanOrEqual(
            cone + 1e-9,
          );
        }
      }
    }
  });

  it('is seeded: the same seed fires the same pellets, another seed different ones', () => {
    const fire = (seed: number) => {
      const s = armed('shotgun', seed);
      enemy(s, { hp: 1000, maxHp: 1000, x: 650, y: 360, stunnedUntil: 9 });
      let t = s;
      for (let i = 0; i < 40; i++) t = tick(t, STEP);
      return { bullets: t.bullets, enemies: t.enemies, impacts: t.impacts };
    };
    expect(fire(7)).toEqual(fire(7));
    expect(fire(7)).not.toEqual(fire(8));
  });

  it('the sniper pierces one enemy by default; a pierce affix adds one more', () => {
    expect(pierceOf(owned('sniper'))).toBe(1);
    expect(pierceOf(owned('sniper', [{ id: 'pierce', value: 1 }]))).toBe(2);
    expect(pierceOf(owned('rifle'))).toBe(0);
    expect(pierceOf('pistol')).toBe(0);

    const s = armed('sniper');
    const ids = [700, 760, 820].map(
      (x) => enemy(s, { hp: 1000, maxHp: 1000, x, y: 360, stunnedUntil: 9 }).id,
    );
    let t = tick(s, STEP);
    for (let i = 0; i < 30 && t.bullets.length > 0; i++) t = tick(t, STEP);
    const dmg = WEAPONS.sniper.damage;
    // A crit doubles every hit of the one bullet alike; through the first, into the second, stop.
    const taken = ids.map((id) => 1000 - hpOf(t, id)!);
    expect(taken[0]).toBeGreaterThanOrEqual(dmg - 1e-9);
    expect(taken[1]).toBeCloseTo(taken[0]!);
    expect(taken[2]).toBe(0);
  });

  it('a piercing bullet of two goes through two enemies, each next within reach', () => {
    const s = armed('sniper');
    s.defenders[0]!.loadout = {
      primary: owned('sniper', [{ id: 'pierce', value: 1 }]),
      secondary: null,
      item: null,
    };
    const ids = [700, 760, 820, 880].map(
      (x) => enemy(s, { hp: 1000, maxHp: 1000, x, y: 360, stunnedUntil: 9 }).id,
    );
    let t = tick(s, STEP);
    for (let i = 0; i < 30 && t.bullets.length > 0; i++) t = tick(t, STEP);
    const hit = ids.map((id) => hpOf(t, id)! < 1000);
    expect(hit).toEqual([true, true, true, false]);
    expect(t.impacts.filter((i) => i.hit)).toHaveLength(3);
    expect(t.impacts[0]!.x).toBeCloseTo(700 - ENEMY_RADIUS, 0);
  });
});
