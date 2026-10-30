// Defender levels, stat points and titles (design §6), and what they do in a fight.
// A stat counts per weapon (Aim on guns, Might on blades); Grit counts with any. Pure.
import {
  DEFENDER_HP,
  GUNNER,
  LEVEL_XP,
  OFF_PROFESSION,
  POINTS_PER_LEVEL,
  PROFESSION_STAT,
  PROFESSIONS,
  SHIELD,
  STAT_EFFECT,
  STATS,
  TITLES,
  type Profession,
  type Stat,
  type Stats,
} from './data.ts';
import type { Held } from './armoury.ts';
import { gunOf, isGun, professionOf, weaponOf, type Loadout } from './loadout.ts';

export const NO_STATS: Readonly<Stats> = { aim: 0, might: 0, tech: 0, grit: 0 };

/** A defender as far as stats go; no `stats` means all 0. */
export interface Statted {
  loadout: Loadout;
  stats?: Readonly<Stats>;
}

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

/** Stat points earned by lifetime `xp`. */
export const earnedPoints = (xp: number): number => POINTS_PER_LEVEL * (levelOf(xp).level - 1);

/** Points left to spend. */
export const unspentPoints = (d: { xp: number; stats: Readonly<Stats> }): number =>
  earnedPoints(d.xp) - spentPoints(d.stats);

/** `d` with one more point in `stat`; refused with no point left. Points are permanent. */
export function spend<T extends { xp: number; stats: Readonly<Stats> }>(
  d: T,
  stat: Stat,
): { ok: true; defender: T } | { ok: false; reason: string } {
  if (!STATS.includes(stat)) throw new RangeError(`spend: unknown stat ${String(stat)}`);
  if (unspentPoints(d) <= 0) return { ok: false, reason: 'No stat points left' };
  return { ok: true, defender: { ...d, stats: { ...d.stats, [stat]: d.stats[stat] + 1 } } };
}

export interface Title {
  profession: Profession;
  rank: string;
  bonus: number;
  at: number;
}

/** The highest title earned in `profession`, or null. */
export function titleIn(stats: Readonly<Stats>, profession: Profession): Title | null {
  const points = stats[PROFESSION_STAT[profession]];
  const t = TITLES.filter((t) => points >= t.at).at(-1);
  return t ? { profession, ...t } : null;
}

/** "Junior Gunner". */
export const titleName = (t: Title): string => `${t.rank} ${PROFESSIONS[t.profession].name}`;

const PROFESSION_ORDER = Object.keys(PROFESSIONS) as Profession[];

/**
 * The title that names the defender: the highest; a tie goes to more points, then
 * Gunner, Ripper, Engineer. Null with none.
 */
export function topTitle(stats: Readonly<Stats>): Title | null {
  const points = (t: Title): number => stats[PROFESSION_STAT[t.profession]];
  let best: Title | null = null;
  for (const p of PROFESSION_ORDER) {
    const t = titleIn(stats, p);
    if (!t) continue;
    if (!best || t.at > best.at || (t.at === best.at && points(t) > points(best))) best = t;
  }
  return best;
}

/** The title badge (design §15): the top title's profession and 1–4 pips by rank; null with none. */
export function badgeOf(stats: Readonly<Stats>): { profession: Profession; pips: number } | null {
  const t = topTitle(stats);
  return t ? { profession: t.profession, pips: TITLES.findIndex((x) => x.at === t.at) + 1 } : null;
}

/** "Bob the Gunner" with a title, else "Bob". */
export function nameTag(d: { name: string; stats?: Readonly<Stats> }): string {
  const t = d.stats ? topTitle(d.stats) : null;
  return t ? `${d.name} the ${PROFESSIONS[t.profession].name}` : d.name;
}

/** Stat points in `profession`'s stat, and its title bonus. */
function feed(d: Statted, profession: Profession): { points: number; bonus: number } {
  const stats = d.stats ?? NO_STATS;
  return {
    points: stats[PROFESSION_STAT[profession]],
    bonus: titleIn(stats, profession)?.bonus ?? 0,
  };
}

/** A specialised gun in a non-Gunner's hands (a sidearm suits everyone). */
const offProfession = (d: Statted, weapon: Held): boolean =>
  weaponOf(weapon).kind === 'gun' && professionOf(d.loadout) !== 'gunner';

/**
 * Damage multiplier for a hit with `weapon`, per weapon (design §6): Aim and the
 * Gunner title on every gun shot (less with an off-profession specialised gun), Might
 * and the Ripper title on every blade strike; a tool strike gets none.
 */
export function damageFactor(d: Statted, weapon: Held): number {
  const kind = weaponOf(weapon).kind;
  if (kind === 'tool') return 1;
  const f = feed(d, kind === 'blade' ? 'ripper' : 'gunner');
  const off = offProfession(d, weapon) ? 1 - OFF_PROFESSION.damage : 1;
  return (1 + STAT_EFFECT.damage * f.points) * (1 + f.bonus) * off;
}

/** Repair multiplier for an Engineer: Tech, then the title bonus; 1 otherwise. */
export function repairFactor(d: Statted): number {
  if (professionOf(d.loadout) !== 'engineer') return 1;
  const f = feed(d, 'engineer');
  return (1 + STAT_EFFECT.repair * f.points) * (1 + f.bonus);
}

/** Crit chance of a gun shot: Aim, plus the Gunner's handling, capped. */
export function critChance(d: Statted): number {
  const gunner = professionOf(d.loadout) === 'gunner' ? GUNNER.crit : 0;
  return Math.min(STAT_EFFECT.critCap, STAT_EFFECT.crit * feed(d, 'gunner').points + gunner);
}

/** Degrees either way gun `weapon`'s bullets stray off the aim: a Gunner's cone is narrower. Aim only crits. */
export function spreadOf(d: Statted, weapon: Held): number {
  const gunner = professionOf(d.loadout) === 'gunner' ? GUNNER.spread : 1;
  return gunOf(weapon).spread * gunner;
}

/** Share of a blade strike's damage that cleaves nearby enemies, from Might, capped. */
export function cleaveShare(d: Statted): number {
  return Math.min(STAT_EFFECT.cleaveCap, STAT_EFFECT.cleave * feed(d, 'ripper').points);
}

/** Fire-rate factor for `weapon` from the loadout: a Gunner's guns faster, a shield's holder's guns slower. */
export function fireRateFactor(d: Statted, weapon: Held): number {
  if (!isGun(weapon)) return 1;
  const gunner = professionOf(d.loadout) === 'gunner' ? 1 + GUNNER.fireRate : 1;
  const shield = d.loadout.item === 'shield' ? 1 - SHIELD.fireRate : 1;
  return gunner * shield;
}

/** Seconds to reload gun `weapon`: a Gunner's 25% faster, an off-profession specialised gun's 50% slower. */
export function reloadTime(d: Statted, weapon: Held): number {
  const gunner = professionOf(d.loadout) === 'gunner' ? 1 - GUNNER.reload : 1;
  const off = offProfession(d, weapon) ? 1 + OFF_PROFESSION.reload : 1;
  return gunOf(weapon).reload * gunner * off;
}

/** Max HP in a horde: the base plus Grit, whatever the loadout. */
export function maxHpOf(d: Statted): number {
  return DEFENDER_HP + STAT_EFFECT.gritHp * (d.stats ?? NO_STATS).grit;
}
