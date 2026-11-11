// Defender levels and stat points (design §6), and what they do in a fight. Each stat
// works with any weapon (ID-084); every bonus shrinks as points pile up. Pure.
import {
  DEFENDER_HP,
  GUNNER,
  LEVEL_XP,
  LOCKED_STATS,
  OFF_PROFESSION,
  OLD_POINTS_PER_LEVEL,
  POINTS_PER_LEVEL,
  SHIELD,
  STAT_ACTIVE,
  STAT_EFFECT,
  STAT_SPLIT,
  STATS,
  type Profession,
  type Stat,
  type StatEffectId,
  type Stats,
} from './data.ts';
import type { Held } from './armoury.ts';
import { gunOf, isGun, professionOf, weaponOf, type Loadout } from './loadout.ts';

export const NO_STATS: Readonly<Stats> = { instinct: 0, agility: 0, mind: 0, tinker: 0 };

/** A defender as far as stats go; no `stats` means all 0. */
export interface Statted {
  loadout: Loadout;
  stats?: Readonly<Stats>;
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

export const spentPoints = (stats: Readonly<Stats>): number =>
  STATS.reduce((n, s) => n + stats[s], 0);

/** Stat points earned by lifetime `xp`, plus any `banked` at the old rate (ID-096). */
export const earnedPoints = (xp: number, banked = 0): number =>
  POINTS_PER_LEVEL * (levelOf(xp).level - 1) + banked;

/**
 * The points an older save banks (ID-096): what the old 3 per level gave for the levels
 * `xp` reached, over today's 1 per level, so no point earned before is lost.
 */
export const bankedPoints = (xp: number): number =>
  (OLD_POINTS_PER_LEVEL - POINTS_PER_LEVEL) * (levelOf(xp).level - 1);

/** Someone who earns and spends stat points. */
export interface Pointed {
  xp: number;
  stats: Readonly<Stats>;
  /** Points banked from an older save's levels (ID-096); none when absent. */
  banked?: number;
}

/** Points left to spend. */
export const unspentPoints = (d: Pointed): number =>
  earnedPoints(d.xp, d.banked) - spentPoints(d.stats);

/** Whether `stat` takes no points yet (ID-084: Tinker). */
export const isLocked = (stat: Stat): boolean => LOCKED_STATS.includes(stat);

/** `d` with one more point in `stat`; refused with no point left or a locked stat. Points are permanent. */
export function spend<T extends Pointed>(
  d: T,
  stat: Stat,
): { ok: true; defender: T } | { ok: false; reason: string } {
  if (!STATS.includes(stat)) throw new RangeError(`spend: unknown stat ${String(stat)}`);
  if (isLocked(stat)) return { ok: false, reason: 'Unlocks later' };
  if (unspentPoints(d) <= 0) return { ok: false, reason: 'No stat points left' };
  return { ok: true, defender: { ...d, stats: { ...d.stats, [stat]: d.stats[stat] + 1 } } };
}

/** `d` with one point taken back out of `stat` (an Undo, ID-126); refused with none in it. */
export function unspend<T extends Pointed>(
  d: T,
  stat: Stat,
): { ok: true; defender: T } | { ok: false; reason: string } {
  if (!STATS.includes(stat)) throw new RangeError(`unspend: unknown stat ${String(stat)}`);
  if (d.stats[stat] <= 0) return { ok: false, reason: 'No point in that stat' };
  return { ok: true, defender: { ...d, stats: { ...d.stats, [stat]: d.stats[stat] - 1 } } };
}

/** How many effects `stat`'s points are shared across (ID-096): its active ones. */
export const activeEffects = (stat: Stat): number => STAT_ACTIVE[stat].length;

/**
 * `effect`'s bonus from `points` in `stat` (design §6, ID-096): its cap C times
 * `P / (P + STAT_SPLIT × n)`, n the stat's active effects; never the cap. An effect
 * that isn't active in `stat` gives nothing.
 */
export function statBonus(points: number, stat: Stat, effect: StatEffectId): number {
  if (!STAT_ACTIVE[stat].includes(effect)) return 0;
  return (STAT_EFFECT[effect] * points) / (points + STAT_SPLIT * activeEffects(stat));
}

/** Points `d` has in `stat`. */
const pointsIn = (d: Statted, stat: Stat): number => (d.stats ?? NO_STATS)[stat];

/** `effect`'s bonus from `d`'s points in `stat`. */
const bonusOf = (d: Statted, stat: Stat, effect: StatEffectId): number =>
  statBonus(pointsIn(d, stat), stat, effect);

/** A specialised gun in a non-Gunner's hands (a sidearm suits everyone). */
const offProfession = (d: Statted, weapon: Held): boolean =>
  !d.plain && weaponOf(weapon).kind === 'gun' && professionOf(d.loadout) !== 'gunner';

/** Damage multiplier for a hit with `weapon`: −30% for an off-profession specialised gun, else 1. */
export function damageFactor(d: Statted, weapon: Held): number {
  return offProfession(d, weapon) ? 1 - OFF_PROFESSION.damage : 1;
}

/**
 * Crit chance of a hit with any weapon: Sharp Mind, plus the Gunner's handling on a gun
 * shot (`gun`).
 */
export function critChance(d: Statted, gun = true): number {
  const gunner = gun && professionFor(d) === 'gunner' ? GUNNER.crit : 0;
  return bonusOf(d, 'mind', 'crit') + gunner;
}

/** A crit's damage multiplier: ×2, plus Sharp Mind. */
export function critDamage(d: Statted): number {
  return STAT_EFFECT.critDamage + bonusOf(d, 'mind', 'critBonus');
}

/** Degrees either way gun `weapon`'s bullets stray off the aim: a Gunner's cone is narrower, and Sharp Mind's. */
export function spreadOf(d: Statted, weapon: Held): number {
  const gunner = professionFor(d) === 'gunner' ? GUNNER.spread : 1;
  return gunOf(weapon).spread * gunner * (1 - bonusOf(d, 'mind', 'spread'));
}

/**
 * Fire-rate factor for `weapon`: a Gunner's guns faster, a shield's holder's guns slower,
 * and Agility's guns faster (ID-125).
 */
export function fireRateFactor(d: Statted, weapon: Held): number {
  if (!isGun(weapon)) return 1;
  const gunner = professionFor(d) === 'gunner' ? 1 + GUNNER.fireRate : 1;
  const shield = d.loadout.item === 'shield' ? 1 - SHIELD.fireRate : 1;
  return gunner * shield * (1 + bonusOf(d, 'agility', 'fireRate'));
}

/** Instinct's extra damage (a share) to an enemy near the wall, from any weapon (ID-125). */
export function wallDamage(d: Statted): number {
  return bonusOf(d, 'instinct', 'wallDamage');
}

/**
 * Seconds to reload gun `weapon`: a Gunner's 25% faster, an off-profession specialised
 * gun's 50% slower, and Agility's faster.
 */
export function reloadTime(d: Statted, weapon: Held): number {
  const gunner = professionFor(d) === 'gunner' ? 1 - GUNNER.reload : 1;
  const off = offProfession(d, weapon) ? 1 + OFF_PROFESSION.reload : 1;
  const agility = 1 - bonusOf(d, 'agility', 'reload');
  return gunOf(weapon).reload * gunner * off * agility;
}

/** Max HP in a horde: the base plus Instinct (whole HP), whatever the loadout. */
export function maxHpOf(d: Statted): number {
  return DEFENDER_HP + Math.round(bonusOf(d, 'instinct', 'hp'));
}

/** HP a hit of `damage` takes off `d`: a shield's share off, then Instinct's armour, never under half. */
export function damageTaken(d: Statted, damage: number): number {
  const shielded = damage * (d.loadout.item === 'shield' ? 1 - SHIELD.damageTaken : 1);
  const armour = bonusOf(d, 'instinct', 'armour');
  return Math.max(shielded * STAT_EFFECT.armourFloor, shielded - armour);
}

/** Chance a hit that would drop `d` to 0 HP leaves them at 1 HP instead: Instinct. */
export function dodgeChance(d: Statted): number {
  return bonusOf(d, 'instinct', 'dodge');
}
