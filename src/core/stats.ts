// Defender levels, stat points and titles (design §6), and what they do in a fight.
// A stat counts only with a matching weapon; Grit counts with any. Pure.
import {
  DEFENDER_HP,
  LEVEL_XP,
  POINTS_PER_LEVEL,
  PROFESSION_STAT,
  PROFESSIONS,
  STAT_EFFECT,
  STATS,
  TITLES,
  WEAPONS,
  type Profession,
  type Stat,
  type Stats,
  type WeaponId,
} from './data.ts';

export const NO_STATS: Readonly<Stats> = { aim: 0, might: 0, tech: 0, grit: 0 };

/** A defender as far as stats go; no `stats` means all 0. */
export interface Statted {
  weapon: WeaponId;
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

/** "Bob the Gunner" with a title, else "Bob". */
export function nameTag(d: { name: string; stats?: Readonly<Stats> }): string {
  const t = d.stats ? topTitle(d.stats) : null;
  return t ? `${d.name} the ${PROFESSIONS[t.profession].name}` : d.name;
}

/** The profession `d` works as, and its points and title bonus there. */
function matching(d: Statted): { profession: Profession; points: number; bonus: number } {
  const profession = WEAPONS[d.weapon].profession;
  const stats = d.stats ?? NO_STATS;
  return {
    profession,
    points: stats[PROFESSION_STAT[profession]],
    bonus: titleIn(stats, profession)?.bonus ?? 0,
  };
}

/** Damage multiplier: Aim for a Gunner, Might for a Ripper, then the title bonus. An Engineer's shots get none. */
export function damageFactor(d: Statted): number {
  const m = matching(d);
  if (m.profession === 'engineer') return 1;
  return (1 + STAT_EFFECT.damage * m.points) * (1 + m.bonus);
}

/** Repair multiplier for an Engineer: Tech, then the title bonus; 1 otherwise. */
export function repairFactor(d: Statted): number {
  const m = matching(d);
  if (m.profession !== 'engineer') return 1;
  return (1 + STAT_EFFECT.repair * m.points) * (1 + m.bonus);
}

/** Crit chance from Aim, Gunners only, capped. */
export function critChance(d: Statted): number {
  const m = matching(d);
  return m.profession === 'gunner' ? Math.min(STAT_EFFECT.critCap, STAT_EFFECT.crit * m.points) : 0;
}

/** Share of a strike's damage that cleaves nearby enemies, from Might, Rippers only, capped. */
export function cleaveShare(d: Statted): number {
  const m = matching(d);
  return m.profession === 'ripper'
    ? Math.min(STAT_EFFECT.cleaveCap, STAT_EFFECT.cleave * m.points)
    : 0;
}

/** Max HP in a horde: the base plus Grit, whatever the weapon. */
export function maxHpOf(d: Statted): number {
  return DEFENDER_HP + STAT_EFFECT.gritHp * (d.stats ?? NO_STATS).grit;
}
