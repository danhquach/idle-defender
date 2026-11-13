// Defender levels (design §6) and what they do in a fight: each level makes a survivor a
// little better at everything, a bonus that shrinks as levels go up (ID-146), plus what
// their profession adds (ID-149). Pure.
import {
  ARMOUR_FLOOR,
  DEFENDER_HP,
  GUNNER,
  JOBS,
  LEVEL_BONUS,
  LEVEL_HALF,
  LEVEL_XP,
  OFF_PROFESSION,
  SHIELD,
  type Job,
  type JobEffect,
  type JobId,
  type LevelBonusId,
  type Profession,
} from './data.ts';
import { baseOf, type Held } from './armoury.ts';
import { gunOf, isGun, professionOf, weaponOf, type Loadout } from './loadout.ts';

/** A defender as far as their level and profession go. */
export interface Statted {
  loadout: Loadout;
  /** Lifetime XP, the level comes from it (ID-146); none means level 1. */
  xp?: number;
  /** A horde-only survivor (ID-066): no loadout profession, so no Gunner bonus. */
  plain?: true;
  /** Their profession from before the outbreak (ID-149); none means none. */
  job?: JobId;
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
  return LEVEL_BONUS[effect] * levelCurve(level);
}

/** The share of its cap a level's or a profession's bonus gives at `level`: P / (P + `LEVEL_HALF`). */
export function levelCurve(level: number): number {
  if (!(Number.isInteger(level) && level >= 1))
    throw new RangeError(`levelCurve: bad level ${level}`);
  const p = level - 1;
  return p / (p + LEVEL_HALF);
}

/**
 * Whether `job`'s bonus works with `weapon` (ID-149): a fighting job's only with its guns
 * (not with a blade, a tool or no weapon); any other job's with anything.
 */
export function jobFits(job: JobId, weapon: Held | null): boolean {
  const j: Job = JOBS[job];
  if (j.kind !== 'fight') return true;
  return (
    weapon !== null &&
    isGun(weapon) &&
    ((j.guns ?? []) as readonly string[]).includes(baseOf(weapon))
  );
}

/** `effect`'s bonus from profession `job` at `level` (ID-149): its cap × `levelCurve`, 0 when it has none. */
export function jobBonus(level: number, job: JobId, effect: JobEffect): number {
  const cap: number | undefined = (JOBS[job] as Job).bonus[effect];
  return cap === undefined ? 0 : cap * levelCurve(level);
}

/**
 * `effect`'s bonus from `d`'s own profession with `weapon` (their primary by default): 0
 * with no profession, or for a fighting job whose guns don't include it (ID-149).
 */
export function jobPart(
  d: Statted,
  effect: JobEffect,
  weapon: Held | null = d.loadout.primary,
): number {
  if (d.job === undefined || !jobFits(d.job, weapon)) return 0;
  return jobBonus(levelOf(d.xp ?? 0).level, d.job, effect);
}

/** `effect`'s bonus at `d`'s level, plus their profession's with `weapon`. */
const bonusOf = (d: Statted, effect: LevelBonusId, weapon?: Held | null): number =>
  levelBonus(levelOf(d.xp ?? 0).level, effect) + jobPart(d, effect, weapon);

/** A specialised gun in a non-Gunner's hands (a sidearm suits everyone). */
const offProfession = (d: Statted, weapon: Held): boolean =>
  !d.plain && weaponOf(weapon).kind === 'gun' && professionOf(d.loadout) !== 'gunner';

/** Damage multiplier for a hit with `weapon`: −30% for an off-profession specialised gun, else 1. */
export function damageFactor(d: Statted, weapon: Held): number {
  return offProfession(d, weapon) ? 1 - OFF_PROFESSION.damage : 1;
}

/**
 * Crit chance of a hit with `weapon` (the primary by default): the level's and the
 * profession's (a Hunter's only with their guns, ID-149), plus the Gunner's handling on a gun
 * shot (`gun`).
 */
export function critChance(
  d: Statted,
  gun = true,
  weapon: Held | null = d.loadout.primary,
): number {
  const gunner = gun && professionFor(d) === 'gunner' ? GUNNER.crit : 0;
  return bonusOf(d, 'crit', weapon) + gunner;
}

/** What a crit with `weapon` adds to its multiplier from `d`'s profession (a Hunter's, ID-149). */
export const critDamageOf = (d: Statted, weapon: Held | null = d.loadout.primary): number =>
  jobPart(d, 'critDamage', weapon);

/** Degrees either way gun `weapon`'s bullets stray off the aim: a Gunner's cone is narrower, and a higher level's. */
export function spreadOf(d: Statted, weapon: Held): number {
  const gunner = professionFor(d) === 'gunner' ? GUNNER.spread : 1;
  return gunOf(weapon).spread * gunner * (1 - bonusOf(d, 'spread', weapon));
}

/**
 * Fire-rate factor for `weapon`: a Gunner's guns faster, a shield's holder's guns slower,
 * and a higher level's (and a profession's, ID-149) guns faster.
 */
export function fireRateFactor(d: Statted, weapon: Held): number {
  if (!isGun(weapon)) return 1;
  const gunner = professionFor(d) === 'gunner' ? 1 + GUNNER.fireRate : 1;
  const shield = d.loadout.item === 'shield' ? 1 - SHIELD.fireRate : 1;
  return gunner * shield * (1 + bonusOf(d, 'fireRate', weapon));
}

/**
 * Seconds to reload gun `weapon`: a Gunner's 25% faster, an off-profession specialised
 * gun's 50% slower, and a higher level's (and a profession's, ID-149) faster.
 */
export function reloadTime(d: Statted, weapon: Held): number {
  const gunner = professionFor(d) === 'gunner' ? 1 - GUNNER.reload : 1;
  const off = offProfession(d, weapon) ? 1 + OFF_PROFESSION.reload : 1;
  const level = 1 - bonusOf(d, 'reload', weapon);
  return gunOf(weapon).reload * gunner * off * level;
}

/** Share more rounds a magazine of `weapon` holds for `d`: a Soldier's with their guns (ID-149). */
export const magazineBonus = (d: Statted, weapon: Held): number => jobPart(d, 'magazine', weapon);

/**
 * Max HP in a horde: the base plus the level's and the profession's (whole HP), whatever
 * the loadout. A Chef's squad HP (ID-149) comes on top in the fight.
 */
export function maxHpOf(d: Statted): number {
  return DEFENDER_HP + Math.round(bonusOf(d, 'hp'));
}

/**
 * HP a hit of `damage` takes off `d`: a shield's share off, then the level's and the
 * profession's armour plus `extra` (Kevlar Vests, ID-131), never under `ARMOUR_FLOOR` of it.
 */
export function damageTaken(d: Statted, damage: number, extra = 0): number {
  const shielded = damage * (d.loadout.item === 'shield' ? 1 - SHIELD.damageTaken : 1);
  const armour = bonusOf(d, 'armour') + extra;
  return Math.max(shielded * ARMOUR_FLOOR, shielded - armour);
}

/** Chance a hit that would drop `d` to 0 HP leaves them at 1 HP instead: a Paramedic's (ID-149). */
export const dodgeChance = (d: Statted): number => jobPart(d, 'dodge');

/**
 * The best squad or camp `effect` (`FIELD_EFFECTS`) any of `field` gives through their
 * profession (ID-149): only the highest counts, so the same effect never stacks; 0 with none.
 */
export function fieldBonus(
  field: readonly Pick<Statted, 'job' | 'xp'>[],
  effect: JobEffect,
): number {
  let best = 0;
  for (const d of field) {
    if (d.job === undefined) continue;
    best = Math.max(best, jobBonus(levelOf(d.xp ?? 0).level, d.job, effect));
  }
  return best;
}
