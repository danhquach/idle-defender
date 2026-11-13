// Defender levels (design §6) and what they do in a fight: each level makes a survivor a
// little better at everything, a bonus that shrinks as levels go up (ID-146). Pure.
import {
  ARMOUR_FLOOR,
  DEFENDER_HP,
  GUNNER,
  LEVEL_BONUS,
  LEVEL_HALF,
  LEVEL_XP,
  OFF_PROFESSION,
  SHIELD,
  type LevelBonusId,
  type Profession,
} from './data.ts';
import type { Held } from './armoury.ts';
import { gunOf, isGun, professionOf, weaponOf, type Loadout } from './loadout.ts';

/** A defender as far as their level and profession go. */
export interface Statted {
  loadout: Loadout;
  /** Lifetime XP, the level comes from it (ID-146); none means level 1. */
  xp?: number;
  /** A horde-only survivor (ID-066): no profession, so no profession bonus. */
  plain?: true;
}

/** The profession `d` works by their loadout, or null for a plain survivor (ID-066). */
export const professionFor = (d: Statted): Profession | null =>
  d.plain ? null : professionOf(d.loadout);

/** Lifetime XP needed to reach `level` (level 1 needs none). */
export function xpForLevel(level: number): number {
  return (LEVEL_XP * level * (level - 1)) / 2;
}

/** The level lifetime `xp` gives, the XP into it and the XP that level costs. */
export function levelOf(xp: number): { level: number; into: number; next: number } {
  // Past safe integers `level + 1` can equal `level` and the nudges below would never end.
  if (!(xp >= 0 && xp <= Number.MAX_SAFE_INTEGER)) throw new RangeError(`levelOf: bad xp ${xp}`);
  // Closed form, then nudged: float rounding can land one level off either way.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / LEVEL_XP)) / 2));
  while (xpForLevel(level) > xp) level -= 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return { level, into: xp - xpForLevel(level), next: LEVEL_XP * level };
}

/**
 * `effect`'s bonus at `level` (design §6, ID-146): its cap C × P / (P + `LEVEL_HALF`),
 * P = level − 1. Nothing at level 1; each level adds less than the one before; never the cap.
 */
export function levelBonus(level: number, effect: LevelBonusId): number {
  if (!(Number.isInteger(level) && level >= 1))
    throw new RangeError(`levelBonus: bad level ${level}`);
  const p = level - 1;
  return (LEVEL_BONUS[effect] * p) / (p + LEVEL_HALF);
}

/** `effect`'s bonus at `d`'s level. */
const bonusOf = (d: Statted, effect: LevelBonusId): number =>
  levelBonus(levelOf(d.xp ?? 0).level, effect);

/** A specialised gun in a non-Gunner's hands (a sidearm suits everyone). */
const offProfession = (d: Statted, weapon: Held): boolean =>
  !d.plain && weaponOf(weapon).kind === 'gun' && professionOf(d.loadout) !== 'gunner';

/** Damage multiplier for a hit with `weapon`: −30% for an off-profession specialised gun, else 1. */
export function damageFactor(d: Statted, weapon: Held): number {
  return offProfession(d, weapon) ? 1 - OFF_PROFESSION.damage : 1;
}

/**
 * Crit chance of a hit with any weapon: the level's, plus the Gunner's handling on a gun
 * shot (`gun`).
 */
export function critChance(d: Statted, gun = true): number {
  const gunner = gun && professionFor(d) === 'gunner' ? GUNNER.crit : 0;
  return bonusOf(d, 'crit') + gunner;
}

/** Degrees either way gun `weapon`'s bullets stray off the aim: a Gunner's cone is narrower, and a higher level's. */
export function spreadOf(d: Statted, weapon: Held): number {
  const gunner = professionFor(d) === 'gunner' ? GUNNER.spread : 1;
  return gunOf(weapon).spread * gunner * (1 - bonusOf(d, 'spread'));
}

/**
 * Fire-rate factor for `weapon`: a Gunner's guns faster, a shield's holder's guns slower,
 * and a higher level's guns faster.
 */
export function fireRateFactor(d: Statted, weapon: Held): number {
  if (!isGun(weapon)) return 1;
  const gunner = professionFor(d) === 'gunner' ? 1 + GUNNER.fireRate : 1;
  const shield = d.loadout.item === 'shield' ? 1 - SHIELD.fireRate : 1;
  return gunner * shield * (1 + bonusOf(d, 'fireRate'));
}

/**
 * Seconds to reload gun `weapon`: a Gunner's 25% faster, an off-profession specialised
 * gun's 50% slower, and a higher level's faster.
 */
export function reloadTime(d: Statted, weapon: Held): number {
  const gunner = professionFor(d) === 'gunner' ? 1 - GUNNER.reload : 1;
  const off = offProfession(d, weapon) ? 1 + OFF_PROFESSION.reload : 1;
  const level = 1 - bonusOf(d, 'reload');
  return gunOf(weapon).reload * gunner * off * level;
}

/** Max HP in a horde: the base plus the level's (whole HP), whatever the loadout. */
export function maxHpOf(d: Statted): number {
  return DEFENDER_HP + Math.round(bonusOf(d, 'hp'));
}

/**
 * HP a hit of `damage` takes off `d`: a shield's share off, then the level's armour plus
 * `extra` (Kevlar Vests, ID-131), never under `ARMOUR_FLOOR` of it.
 */
export function damageTaken(d: Statted, damage: number, extra = 0): number {
  const shielded = damage * (d.loadout.item === 'shield' ? 1 - SHIELD.damageTaken : 1);
  const armour = bonusOf(d, 'armour') + extra;
  return Math.max(shielded * ARMOUR_FLOOR, shielded - armour);
}
