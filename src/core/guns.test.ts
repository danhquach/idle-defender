// Design §6 (ID-046): the five specialised guns, each with its own bullet profile.
import { describe, expect, it } from 'vitest';
import { pierceOf, type OwnedWeapon } from './armoury.ts';
import {
  ENEMY_RADIUS,
  FREE_WEAPONS,
  GUNNER,
  CRIT_DAMAGE,
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

describe('magazines (ID-078)', () => {
  it('every gun, the free pistol too, has a finite magazine and a reload', () => {
    for (const id of ['pistol', ...GUNS] as const) {
      const g = WEAPONS[id];
      expect(Number.isInteger(g.magazine) && g.magazine > 0, id).toBe(true);
      expect(Number.isFinite(g.reload) && g.reload > 0, id).toBe(true);
    }
  });
});

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
    expect(profile('smg')).toEqual([1600, 3.5, 1, 0]);
    expect(profile('rifle')).toEqual([2200, 1, 1, 0]);
    expect(profile('shotgun')).toEqual([1400, 12, 6, 0]);
    expect(profile('lmg')).toEqual([2000, 6, 1, 0]);
    // ID-135: no base pierce; a shot's 10% chance of one more is the trait (TRAIT.sniper.pierce).
    expect(profile('sniper')).toEqual([3000, 0.5, 1, 0]);
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
    expect([1, CRIT_DAMAGE].map((k) => k * WEAPONS.shotgun.damage)).toContainEqual(dealt);
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

  it('the sniper rifle has no base pierce, but 10% of its shots go through one more enemy (ID-135); a pierce affix adds one', () => {
    expect(pierceOf(owned('sniper'))).toBe(0);
    expect(pierceOf(owned('sniper', [{ id: 'pierce', value: 1 }]))).toBe(1);
    expect(pierceOf(owned('rifle'))).toBe(0);
    expect(pierceOf('pistol')).toBe(0);

    // The first bullet of seed `seed`, once it is in the air.
    const shot = (base: WeaponId, seed: number, affixes: OwnedWeapon['affixes'] = []) => {
      const s = armed(base, seed);
      s.defenders[0]!.loadout = { primary: owned(base, affixes), secondary: null, item: null };
      enemy(s, { hp: 1000, maxHp: 1000, x: 700, y: 360, stunnedUntil: 9 });
      return tick(s, STEP).bullets[0]!;
    };
    const seeds = 600;
    let extra = 0;
    let extraAffix = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const own = shot('sniper', seed).pierce;
      expect([0, 1], `seed ${seed}`).toContain(own);
      extra += own;
      const withAffix = shot('sniper', seed, [{ id: 'pierce', value: 1 }]).pierce;
      expect([1, 2], `seed ${seed}`).toContain(withAffix);
      extraAffix += withAffix - 1;
      // No other gun rolls it: the Carbine always stays at 0.
      expect(shot('rifle', seed).pierce).toBe(0);
    }
    // 600 seeded shots at 10%: ±3.5 standard deviations is about ±0.043.
    expect(extra / seeds).toBeGreaterThan(0.1 - 0.045);
    expect(extra / seeds).toBeLessThan(0.1 + 0.045);
    expect(extraAffix / seeds).toBeGreaterThan(0.1 - 0.045);
    expect(extraAffix / seeds).toBeLessThan(0.1 + 0.045);
  });

  it('a sniper shot without the extra pierce stops at the first enemy; one with it goes through the second', () => {
    const run = (seed: number) => {
      const s = armed('sniper', seed);
      const ids = [700, 760, 820].map(
        (x) => enemy(s, { hp: 1000, maxHp: 1000, x, y: 360, stunnedUntil: 9 }).id,
      );
      let t = tick(s, STEP);
      const bonus = t.bullets[0]!.pierce;
      for (let i = 0; i < 30 && t.bullets.length > 0; i++) t = tick(t, STEP);
      return { bonus, hit: ids.map((id) => hpOf(t, id)! < 1000) };
    };
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200 && seen.size < 2; seed++) {
      const { bonus, hit } = run(seed);
      expect(hit, `seed ${seed}`).toEqual(bonus === 0 ? [true, false, false] : [true, true, false]);
      seen.add(bonus);
    }
    expect(seen.size).toBe(2);
  });

  it('a piercing bullet goes through the enemies it crosses, each next within reach (pierce affix 1, plus the sniper chance)', () => {
    // Pierce 1 from the affix, 2 on the seeds where the sniper's 10% chance lands.
    const run = (seed: number) => {
      const s = armed('sniper', seed);
      s.defenders[0]!.loadout = {
        primary: owned('sniper', [{ id: 'pierce', value: 1 }]),
        secondary: null,
        item: null,
      };
      const ids = [700, 760, 820, 880].map(
        (x) => enemy(s, { hp: 1000, maxHp: 1000, x, y: 360, stunnedUntil: 9 }).id,
      );
      let t = tick(s, STEP);
      const pierce = t.bullets[0]!.pierce;
      for (let i = 0; i < 30 && t.bullets.length > 0; i++) t = tick(t, STEP);
      return { pierce, t, hit: ids.map((id) => hpOf(t, id)! < 1000) };
    };
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200 && seen.size < 2; seed++) {
      const { pierce, t, hit } = run(seed);
      const through = pierce + 1;
      expect(hit, `seed ${seed}`).toEqual([0, 1, 2, 3].map((i) => i < through));
      expect(t.impacts.filter((i) => i.hit)).toHaveLength(through);
      expect(t.impacts[0]!.x).toBeCloseTo(700 - ENEMY_RADIUS, 0);
      seen.add(pierce);
    }
    expect(seen.size).toBe(2);
  });
});
