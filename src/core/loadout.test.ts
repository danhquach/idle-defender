// Design §6 Loadout: what a defender carries, the profession it gives, and the
// specialised-gun rules. No specialised gun ships yet, so these tests add a
// rifle to the weapon table.
import { describe, expect, it, vi } from 'vitest';
import { STEP, type WeaponId } from './data.ts';
import { newHorde, standing, tick, type DefenderSpec, type HordeState } from './horde.ts';
import { loadoutError, loadoutFrom, professionOf, type Loadout } from './loadout.ts';
import { damageFactor, fireRateFactor, reloadTime } from './stats.ts';
import { enemy, setup } from './testing.ts';

// Hoisted with vi.mock, which runs before the rest of the file.
const RIFLE = vi.hoisted(
  () =>
    ({
      name: 'Rifle',
      kind: 'gun',
      damage: 12,
      fireInterval: 0.8,
      range: 800,
      magazine: 20,
      reload: 2,
    }) as const,
);

vi.mock('./data.ts', async (importOriginal) => {
  const data = await importOriginal<typeof import('./data.ts')>();
  return { ...data, WEAPONS: { ...data.WEAPONS, rifle: RIFLE } };
});

const rifle = 'rifle' as WeaponId;
const L = (
  primary: WeaponId,
  secondary: WeaponId | null = null,
  item: 'shield' | null = null,
): Loadout => ({
  primary,
  secondary,
  item,
});
const who = (loadout: Loadout): DefenderSpec => ({ id: 'd', name: 'D', loadout });

describe('loadout and profession', () => {
  it('a blade makes a Ripper, a tool an Engineer, anything else a Gunner', () => {
    expect(professionOf(L('pistol'))).toBe('gunner');
    expect(professionOf(L('pistol', 'pistol'))).toBe('gunner');
    expect(professionOf(L(rifle, 'pistol'))).toBe('gunner');
    expect(professionOf(L('pistol', 'knife'))).toBe('ripper');
    expect(professionOf(L(rifle, 'knife'))).toBe('ripper');
    expect(professionOf(L('pistol', 'toolkit'))).toBe('engineer');
  });

  it('allows a gun as primary, a sidearm, blade or tool as secondary, a shield only with a blade', () => {
    for (const ok of [
      L('pistol'),
      L(rifle),
      L(rifle, 'pistol'),
      L('pistol', 'knife', 'shield'),
      L(rifle, 'knife', 'shield'),
      L('pistol', 'toolkit'),
    ]) {
      expect(loadoutError(ok), JSON.stringify(ok)).toBeNull();
    }
    expect(loadoutError(L('knife'))).toBe('The primary must be a gun');
    expect(loadoutError(L('toolkit', 'pistol'))).toBe('The primary must be a gun');
    expect(loadoutError(L('pistol', rifle))).toBe('Only a sidearm goes in the secondary slot');
    expect(loadoutError(L('pistol', null, 'shield'))).toBe('A shield needs a blade');
    expect(loadoutError(L('pistol', 'pistol', 'shield'))).toBe('A shield needs a blade');
    expect(loadoutError(L('pistol', 'toolkit', 'shield'))).toBe('A shield needs a blade');
  });

  it('an old single weapon becomes a gun, plus a pistol for a blade or tool', () => {
    expect(loadoutFrom('pistol')).toEqual(L('pistol'));
    expect(loadoutFrom('knife')).toEqual(L('pistol', 'knife'));
    expect(loadoutFrom('toolkit')).toEqual(L('pistol', 'toolkit'));
    expect(loadoutFrom(rifle)).toEqual(L(rifle));
  });
});

describe('specialised guns suit Gunners', () => {
  it('a Gunner: full damage, 15% faster fire, 25% quicker reload', () => {
    const g = who(L(rifle, 'pistol'));
    expect(damageFactor(g, rifle)).toBe(1);
    expect(fireRateFactor(g, rifle)).toBeCloseTo(1.15);
    expect(reloadTime(g, rifle)).toBeCloseTo(2 * 0.75);
  });

  it('anyone else: −30% damage and a 50% slower reload; their sidearm stays plain', () => {
    for (const d of [who(L(rifle, 'knife')), who(L(rifle, 'toolkit'))]) {
      expect(damageFactor(d, rifle)).toBeCloseTo(0.7);
      expect(fireRateFactor(d, rifle)).toBe(1);
      expect(reloadTime(d, rifle)).toBeCloseTo(2 * 1.5);
      expect(
        damageFactor({ loadout: L('pistol', d.loadout.secondary as WeaponId | null) }, 'pistol'),
      ).toBe(1);
    }
  });
});

describe('a Gunner with a rifle and a sidearm', () => {
  /** The Gunner alone on the upper tower (420, 120), the rifle empty and reloading. */
  function reloading(enemyX: number): HordeState {
    const s = newHorde(1, { ...setup(), roster: [who(L(rifle, 'pistol'))], startDefenderId: 'd' });
    s.toSpawn = 0;
    const d = s.defenders[0]!;
    d.ammo.primary = 0;
    d.reloadedAt.primary = 1;
    enemy(s, { hp: 1000, maxHp: 1000, x: enemyX, y: 120 });
    return s;
  }

  it('fires the sidearm while the rifle reloads, at an enemy within 200 px', () => {
    const after = tick(reloading(420 + 199), STEP);
    expect(after.defenders[0]!.ammo.secondary).toBe(9);
    expect(after.shots).toHaveLength(1);
  });

  it('holds fire at an enemy further than 200 px while the rifle reloads', () => {
    const after = tick(reloading(420 + 201), STEP);
    expect(after.shots).toEqual([]);
    expect(after.defenders[0]!.ammo.secondary).toBe(10);
  });

  it('switches back to the rifle when the reload ends', () => {
    let s = reloading(420 + 100);
    while (s.time < 1 - 1e-9) s = tick(s, STEP);
    const sidearm = s.defenders[0]!.ammo.secondary;
    expect(sidearm).toBeLessThan(10);
    // The next shot (once the sidearm's cooldown ends) is the rifle's; the sidearm rests.
    while (s.defenders[0]!.ammo.primary !== RIFLE.magazine - 1 && s.time < 2) s = tick(s, STEP);
    expect(s.defenders[0]!.ammo.primary).toBe(RIFLE.magazine - 1);
    expect(s.defenders[0]!.ammo.secondary).toBe(sidearm);
  });

  it('a rifle never fires on the move; the sidearm does', () => {
    const walk = (loadout: Loadout): HordeState => {
      const s = newHorde(1, { ...setup(), roster: [who(loadout)], startDefenderId: 'd' });
      s.toSpawn = 0;
      s.defenders[0]!.walking = true;
      s.defenders[0]!.x = 300;
      enemy(s, { hp: 1000, maxHp: 1000, x: 500, y: 120 });
      return tick(s, STEP);
    };
    expect(walk(L(rifle)).shots).toEqual([]);
    const moving = walk(L(rifle, 'pistol'));
    expect(moving.shots).toHaveLength(1);
    expect(moving.defenders[0]!.ammo).toEqual({ primary: RIFLE.magazine, secondary: 9 });
  });

  it('a standing Gunner with a loaded rifle fires the rifle, not the sidearm', () => {
    const s = newHorde(1, { ...setup(), roster: [who(L(rifle, 'pistol'))], startDefenderId: 'd' });
    s.toSpawn = 0;
    enemy(s, { hp: 1000, maxHp: 1000, x: 520, y: 120 });
    const after = tick(s, STEP);
    expect(after.defenders[0]!.ammo).toEqual({ primary: RIFLE.magazine - 1, secondary: 10 });
  });

  it('a fight defender starts with both magazines full', () => {
    const d = standing(who(L(rifle, 'pistol')), newHorde(1, setup()).posts[0]!, 0);
    expect(d.ammo).toEqual({ primary: RIFLE.magazine, secondary: 10 });
  });
});
