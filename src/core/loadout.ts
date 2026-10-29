// What a defender carries (design §6 Loadout): a primary gun, an optional secondary
// and one item slot. The loadout decides the profession. Pure.
import {
  WEAPONS,
  type Blade,
  type Gun,
  type ItemId,
  type Profession,
  type Tool,
  type Weapon,
  type WeaponId,
} from './data.ts';

export interface Loadout {
  /** Always a gun: a sidearm or a specialised gun. */
  primary: WeaponId;
  /** A sidearm, blade or tool, or none. */
  secondary: WeaponId | null;
  item: ItemId | null;
}

/** Weapon `id` as any weapon, so a kind no shipped weapon has yet (a specialised gun) still type-checks. */
export const weaponOf = (id: WeaponId): Weapon => WEAPONS[id];
export const isGun = (id: WeaponId): boolean => {
  const kind = weaponOf(id).kind;
  return kind === 'sidearm' || kind === 'gun';
};
export const isSidearm = (id: WeaponId | null): boolean =>
  id !== null && weaponOf(id).kind === 'sidearm';
export const gunOf = (id: WeaponId): Gun => weaponOf(id) as Gun;
export const meleeOf = (id: WeaponId): Blade | Tool => weaponOf(id) as Blade | Tool;
export const toolOf = (id: WeaponId): Tool => weaponOf(id) as Tool;

/** Blade → Ripper, tool → Engineer, anything else → Gunner. */
export function professionOf(l: Loadout): Profession {
  const kind = l.secondary === null ? null : weaponOf(l.secondary).kind;
  return kind === 'blade' ? 'ripper' : kind === 'tool' ? 'engineer' : 'gunner';
}

/** Why `l` can't be carried, or null when it can. */
export function loadoutError(l: Loadout): string | null {
  if (!isGun(l.primary)) return 'The primary must be a gun';
  if (l.secondary !== null && weaponOf(l.secondary).kind === 'gun') {
    return 'Only a sidearm goes in the secondary slot';
  }
  if (l.item === 'shield' && professionOf(l) !== 'ripper') return 'A shield needs a blade';
  return null;
}

/** The loadout a single pre-loadout weapon (before 0.4.4) becomes: a gun, plus the old weapon if it isn't one. */
export function loadoutFrom(weapon: WeaponId): Loadout {
  return isGun(weapon)
    ? { primary: weapon, secondary: null, item: null }
    : { primary: 'pistol', secondary: weapon, item: null };
}
