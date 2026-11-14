// Professions in words (ID-149): a survivor's profession name, what it gives at their level
// ("Hunter: +12% crit chance, +18% crit damage with Sniper rifle, Carbine"), whether the gun
// held fits a fighting job, the no-stack note, and their stats split into the level's part
// and the profession's. Pure: no DOM.
import type { Held } from '../core/armoury.ts';
import {
  CRIT_DAMAGE,
  DEFENDER_HP,
  FIELD_EFFECTS,
  JOBS,
  WEAPONS,
  type Job,
  type JobEffect,
  type JobId,
  type LevelBonusId,
} from '../core/data.ts';
import type { RosterDefender } from '../core/game.ts';
import { jobBonus, jobFits, levelBonus, levelOf } from '../core/stats.ts';

/** A profession's name where room is short (a Roster tab on a phone): 8 letters at most, measured to fit a 375 px phone. */
export const JOB_SHORT: Readonly<Record<JobId, string>> = {
  police: 'Police',
  soldier: 'Soldier',
  hunter: 'Hunter',
  guard: 'Guard',
  builder: 'Builder',
  paramedic: 'Medic',
  mechanic: 'Mechanic',
  chef: 'Chef',
  teacher: 'Teacher',
  scavenger: 'Scav',
  student: 'Student',
};

/** The note a squad or camp job shows when a second survivor in the squad has it too. */
export const NO_STACK = 'Only counts on the field. Doesn’t stack';
/** The note a fighting job shows when the gun held isn't one of theirs. */
export const NO_BONUS = 'No bonus with this gun';
/** A self job's shared part, before `NO_STACK`: its own HP, armour and dodge do add up. */
const SHARED_PART: Partial<Record<JobId, string>> = {
  builder: 'The wall part: ',
  paramedic: 'The heal part: ',
};

const pct = (x: number, digits = 1): string => `+${(x * 100).toFixed(digits)}%`;

/** Each effect as it prints at value `v`, and its words while it is still 0 (level 1). */
const EFFECT: Readonly<Record<JobEffect, { value: (v: number) => string; name: string }>> = {
  hp: { value: (v) => `+${Math.round(v)} max HP`, name: 'max HP' },
  armour: { value: (v) => `+${v.toFixed(1)} armour`, name: 'armour' },
  fireRate: { value: (v) => `${pct(v)} fire rate`, name: 'fire rate' },
  reload: { value: (v) => `${pct(v)} reload speed`, name: 'reload speed' },
  spread: { value: (v) => `${pct(v)} accuracy`, name: 'accuracy' },
  crit: { value: (v) => `${pct(v)} crit chance`, name: 'crit chance' },
  critDamage: { value: (v) => `${pct(v)} crit damage`, name: 'crit damage' },
  magazine: { value: (v) => `${pct(v)} magazine size`, name: 'magazine size' },
  dodge: { value: (v) => `${pct(v)} injury dodge`, name: 'injury dodge' },
  xp: { value: (v) => `${pct(v)} own XP`, name: 'own XP' },
  squadHp: {
    value: (v) => `+${Math.round(v)} max HP for everyone on the field`,
    name: 'max HP for everyone on the field',
  },
  squadXp: {
    value: (v) => `${pct(v)} horde XP for everyone who fought`,
    name: 'horde XP for everyone who fought',
  },
  wallRepair: {
    value: (v) => `the wall repairs ${(v * 100).toFixed(2)}% of its HP a second`,
    name: 'wall repair during the fight',
  },
  dropChance: {
    value: (v) => `${pct(v)} bonus-gun chance after a won horde`,
    name: 'bonus-gun chance after a won horde',
  },
  wallHp: {
    value: (v) => `${pct(v)} wall max HP while on the field`,
    name: 'wall max HP',
  },
  squadHeal: {
    value: (v) => `everyone on the field heals ${(v * 100).toFixed(2)}% of max HP a second`,
    name: 'healing for the squad',
  },
  rest: {
    value: (v) => `${pct(v)} chance an injury rests 1 horde less`,
    name: 'chance an injury rests 1 horde less',
  },
};

/** A fighting job's guns by name: "Sniper rifle, Carbine". */
export const jobGuns = (job: JobId): string =>
  ((JOBS[job] as Job).guns ?? []).map((g) => WEAPONS[g].name).join(', ');

/**
 * What `job` gives at `level`, in words: "Hunter: +12.0% crit chance, +18.0% crit damage
 * with Sniper rifle, Carbine". At level 1 it gives nothing yet, so it says what levels bring:
 * "Hunter: from level 2, more crit chance and crit damage with Sniper rifle, Carbine".
 */
export function jobLine(job: JobId, level: number): string {
  const j: Job = JOBS[job];
  const effects = Object.keys(j.bonus) as JobEffect[];
  const guns = j.kind === 'fight' ? ` with ${jobGuns(job)}` : '';
  if (level <= 1) {
    const names = effects.map((e) => EFFECT[e].name);
    const list =
      names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    return `${j.name}: from level 2, more ${list}${guns}`;
  }
  const parts = effects.map((e) => EFFECT[e].value(jobBonus(level, job, e)));
  return `${j.name}: ${parts.join(', ')}${guns}`;
}

/** A survivor's profession as their Roster panel shows it. */
export interface JobInfo {
  /** "Hunter" */
  name: string;
  /** `jobLine` at their level. */
  line: string;
  /** A fighting job holding a gun that isn't theirs: the line is greyed, with `NO_BONUS`. */
  off: boolean;
  /** `NO_STACK` for a job with a squad or camp effect another squad survivor has too, else null. */
  note: string | null;
}

/**
 * `d`'s profession with `held` in hand, among `squad` (the survivors who fight the next
 * horde, `d` maybe among them).
 */
export function jobInfo(d: RosterDefender, held: Held, squad: readonly RosterDefender[]): JobInfo {
  const j: Job = JOBS[d.job];
  // Any job with a squad or camp effect: a second one adds nothing there.
  const shared = (Object.keys(j.bonus) as JobEffect[]).some((e) => FIELD_EFFECTS.includes(e));
  const others = squad.filter((o) => o.id !== d.id && o.job === d.job);
  const twins = others.map((o) => o.name);
  return {
    name: j.name,
    line: jobLine(d.job, levelOf(d.xp).level),
    off: !jobFits(d.job, held),
    // Who else has it and whose counts, so the player knows whom to swap out.
    note:
      shared && twins.length > 0
        ? `${SHARED_PART[d.job] ?? ''}${NO_STACK}: ${twins.join(', ')} ${twins.length > 1 ? `are also ${j.name}s` : `is also a ${j.name}`}.${whoseCounts(d, others)}`
        : null,
  };
}

/**
 * Whose shared bonus counts when `d` and `others` have the same job (ID-149): the highest
 * level's (`fieldBonus`). " This one counts (higher level)." or " Nora's counts (higher
 * level)."; nothing when the highest levels tie, as either gives the same.
 */
function whoseCounts(d: RosterDefender, others: readonly RosterDefender[]): string {
  const level = (x: RosterDefender): number => levelOf(x.xp).level;
  const top = others.reduce((a, b) => (level(b) > level(a) ? b : a));
  if (level(d) > level(top)) return ' This one counts (higher level).';
  if (level(top) > level(d) && others.filter((o) => level(o) === level(top)).length === 1) {
    return ` ${top.name}’s counts (higher level).`;
  }
  return '';
}

/** One stat in the Roster's table: the total, the level's part and the profession's. */
export interface StatRow {
  label: string;
  total: string;
  level: string;
  job: string;
  /** The profession's part doesn't count with the gun held (a fighting job off its guns). */
  off: boolean;
}

/** `v` as a part of a stat: "—" for none. */
const part = (v: number, show: (x: number) => string): string => (v === 0 ? '—' : show(v));

/**
 * `d`'s stats with `held` (ID-149): max HP, armour, fire rate, reload speed, accuracy, crit
 * chance, crit damage and injury dodge, each split into the level's part and the
 * profession's. A fighting job's part with a gun that isn't theirs shows what it would give,
 * marked `off`, and stays out of the total.
 */
export function statRows(d: RosterDefender, held: Held): StatRow[] {
  const { level } = levelOf(d.xp);
  const fits = jobFits(d.job, held);
  const lv = (e: LevelBonusId): number => levelBonus(level, e);
  const jb = (e: JobEffect): number => jobBonus(level, d.job, e);
  const row = (
    label: string,
    e: JobEffect,
    base: number,
    lvPart: number,
    show: (x: number) => string,
    total: (x: number) => string,
  ): StatRow => {
    const j = jb(e);
    return {
      label,
      total: total(base + lvPart + (fits ? j : 0)),
      level: part(lvPart, show),
      job: part(j, show),
      off: !fits && j > 0,
    };
  };
  const plus = (x: number): string => pct(x);
  const plain = (x: number): string => `${(x * 100).toFixed(1)}%`;
  return [
    row(
      'Max HP',
      'hp',
      DEFENDER_HP,
      lv('hp'),
      (x) => `+${Math.round(x)}`,
      (x) => `${Math.round(x)}`,
    ),
    row(
      'Armour',
      'armour',
      0,
      lv('armour'),
      (x) => `+${x.toFixed(1)}`,
      (x) => x.toFixed(1),
    ),
    row('Fire rate', 'fireRate', 0, lv('fireRate'), plus, plus),
    row('Reload speed', 'reload', 0, lv('reload'), plus, plus),
    row('Accuracy', 'spread', 0, lv('spread'), plus, plus),
    row('Crit chance', 'crit', 0, lv('crit'), plus, plain),
    row(
      'Crit damage',
      'critDamage',
      CRIT_DAMAGE,
      0,
      (x) => `+${(x * 100).toFixed(0)}%`,
      (x) => `×${x.toFixed(2)}`,
    ),
    row('Injury dodge', 'dodge', 0, 0, plus, plain),
  ];
}
