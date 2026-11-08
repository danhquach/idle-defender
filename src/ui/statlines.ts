// What a stat's points give in real numbers (ID-084, ID-096): one line per active effect
// (`STAT_ACTIVE`, so an effect built later shows up once it is listed there), as "now →
// with one more point" on a survivor card, and as the next point's gain on the result
// screen and in each + button's hint. Pure: no DOM.
import { STAT_ACTIVE, type Stat, type StatEffectId } from '../core/data.ts';
import type { RosterDefender } from '../core/game.ts';
import { isGun } from '../core/loadout.ts';
import {
  critChance,
  critDamage,
  dodgeChance,
  isLocked,
  maxHpOf,
  reloadTime,
  spreadOf,
  statBonus,
} from '../core/stats.ts';

/** How one effect reads: its name, its value for a defender, and how a value and a gain print. */
interface EffectLine {
  label: string;
  /** The gain's short name: "+3 max HP". */
  short: string;
  /** Shorter still, for a stat button's second line (ID-111): "+3 HP". */
  tiny: string;
  value: (d: RosterDefender) => number;
  show: (v: number) => string;
  /** A gain (next − now), signed. */
  gain: (dv: number) => string;
  /** The gain for `tiny`, where `gain` is too long: "−0.05 s reload", not "0.05 s faster". */
  tinyGain?: (dv: number) => string;
}

/** The gun `d` fights with: a primary that is no gun fights as the pistol (as squadGear). */
const heldGun = (d: RosterDefender) => (isGun(d.loadout.primary) ? d.loadout.primary : 'pistol');

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const signed = (x: number, digits: number): string =>
  `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(digits)}`;

const LINES: Readonly<Record<StatEffectId, EffectLine>> = {
  hp: {
    label: 'Max HP',
    short: 'max HP',
    tiny: 'HP',
    value: maxHpOf,
    show: String,
    gain: (dv) => signed(dv, 0),
  },
  armour: {
    label: 'Armour per hit',
    short: 'armour',
    tiny: 'arm',
    value: (d) => statBonus(d.stats.instinct, 'instinct', 'armour'),
    show: (v) => v.toFixed(2),
    gain: (dv) => signed(dv, 2),
  },
  dodge: {
    label: 'Survive a downing hit',
    short: 'survive',
    tiny: 'surv',
    value: dodgeChance,
    show: pct,
    gain: (dv) => `${signed(dv * 100, 1)}%`,
  },
  reload: {
    label: 'Reload',
    short: 'reload',
    tiny: 'reload',
    value: (d) => reloadTime(d, heldGun(d)),
    show: (v) => `${v.toFixed(2)} s`,
    // Faster reads as a gain: "0.04 s faster reload".
    gain: (dv) => `${Math.abs(dv).toFixed(2)} s ${dv <= 0 ? 'faster' : 'slower'}`,
    tinyGain: (dv) => `${signed(dv, 2)} s`,
  },
  crit: {
    label: 'Crit chance',
    short: 'crit chance',
    tiny: 'crit',
    value: (d) => critChance(d),
    show: pct,
    gain: (dv) => `${signed(dv * 100, 1)}%`,
  },
  critBonus: {
    label: 'Crit damage',
    short: 'crit damage',
    tiny: 'crit dmg',
    value: critDamage,
    show: (v) => `×${v.toFixed(2)}`,
    // "+×0.06 crit damage": the multiplier grows, as the card's "×2.00 → ×2.06".
    gain: (dv) => `${dv < 0 ? '−' : '+'}×${Math.abs(dv).toFixed(2)}`,
    // One sign on a small button: "+0.06× crit dmg".
    tinyGain: (dv) => `${signed(dv, 2)}×`,
  },
  spread: {
    label: 'Spread',
    short: 'spread',
    tiny: 'spread',
    value: (d) => spreadOf(d, heldGun(d)),
    show: (v) => `${v.toFixed(2)}°`,
    gain: (dv) => `${Math.abs(dv).toFixed(2)}° ${dv <= 0 ? 'tighter' : 'wider'}`,
    tinyGain: (dv) => `${signed(dv, 2)}°`,
  },
};

/** `d` with `by` more points in `stat`. */
const plusN = (d: RosterDefender, stat: Stat, by: number): RosterDefender => ({
  ...d,
  stats: { ...d.stats, [stat]: d.stats[stat] + by },
});
const plusOne = (d: RosterDefender, stat: Stat): RosterDefender => plusN(d, stat, 1);

/** One effect now and with more points: the name, and the two values as they print. */
export interface EffectChange {
  label: string;
  from: string;
  to: string;
}

/**
 * Each active effect of `stat` for `d` now and with `by` more points (ID-108): the Roster's
 * stat row reads "Reload 1.53 s → 1.47 s" for the points drafted, or one more point.
 */
export function effectChange(d: RosterDefender, stat: Stat, by = 1): EffectChange[] {
  if (isLocked(stat)) return [];
  const next = plusN(d, stat, by);
  return STAT_ACTIVE[stat].map((id) => {
    const l = LINES[id];
    return { label: l.label, from: l.show(l.value(d)), to: l.show(l.value(next)) };
  });
}

/**
 * What the next point in `stat` adds to each active effect for `d`: ["+3 max HP",
 * "+0.13 armour", …]; `tiny` for a stat button's short line (ID-111): ["+3 HP", "+0.13 arm", …].
 */
export function nextGains(d: RosterDefender, stat: Stat, tiny = false): string[] {
  if (isLocked(stat)) return [];
  const next = plusOne(d, stat);
  return STAT_ACTIVE[stat].map((id) => {
    const l = LINES[id];
    const dv = l.value(next) - l.value(d);
    return tiny ? `${(l.tinyGain ?? l.gain)(dv)} ${l.tiny}` : `${l.gain(dv)} ${l.short}`;
  });
}

/** The next point's gains as one line: "Next point: +3 max HP · +0.13 armour · +1.0% survive". */
export const nextPointText = (d: RosterDefender, stat: Stat): string =>
  isLocked(stat) ? '' : `Next point: ${nextGains(d, stat).join(' · ')}`;
