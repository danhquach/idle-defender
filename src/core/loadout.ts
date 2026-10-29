// What a defender carries (design §6 Loadout): a primary gun, an optional secondary
// and one item slot. The loadout decides the profession. Pure.
import { baseOf, statsOf, type Held } from './armoury.ts';
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
  primary: Held;
  /** A sidearm, blade or tool, or none. */
  secondary: Held | null;
  item: ItemId | null;
}

/**
 * The numbers weapon `h` fights with (rarity and affixes applied), as any weapon, so a
 * kind no shipped weapon has yet (a specialised gun) still type-checks.
 */
export const weaponOf = (h: Held): Weapon => statsOf(h);
/** The kind of weapon `h` is, without working out its numbers. */
const kindOf = (h: Held): Weapon['kind'] => (WEAPONS[baseOf(h)] as Weapon).kind;
export const isGun = (h: Held): boolean => {
  const kind = kindOf(h);
  return kind === 'sidearm' || kind === 'gun';
};
export const isSidearm = (h: Held | null): boolean => h !== null && kindOf(h) === 'sidearm';
export const gunOf = (h: Held): Gun => weaponOf(h) as Gun;
export const meleeOf = (h: Held): Blade | Tool => weaponOf(h) as Blade | Tool;
export const toolOf = (h: Held): Tool => weaponOf(h) as Tool;

/** Blade → Ripper, tool → Engineer, anything else → Gunner. */
export function professionOf(l: Loadout): Profession {
  const kind = l.secondary === null ? null : kindOf(l.secondary);
  return kind === 'blade' ? 'ripper' : kind === 'tool' ? 'engineer' : 'gunner';
}

/** Why `l` can't be carried, or null when it can. */
export function loadoutError(l: Loadout): string | null {
  if (!isGun(l.primary)) return 'The primary must be a gun';
  if (l.secondary !== null && kindOf(l.secondary) === 'gun') {
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
