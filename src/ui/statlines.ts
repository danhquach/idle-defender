// What a survivor's level gives in real numbers (ID-146): one line under the level a card
// or the Roster already shows, "+14 HP · +0.5 armour · +6.9% fire rate · …"; short labels
// on a squad card ("+14 HP · +0.5 arm · +6.9% fire · …") so it fits two lines. Pure: no DOM.
import { LEVEL_BONUS, type LevelBonusId } from '../core/data.ts';
import { levelBonus } from '../core/stats.ts';

/** Joins a bonus's words so a line only breaks between bonuses, at " · ". */
const keep = (...words: string[]): string => words.join(' ');
const pct = (x: number): string => `+${(x * 100).toFixed(1)}%`;

/** Each bonus's value as it prints, in `LEVEL_BONUS` order. */
const VALUE: Readonly<Record<LevelBonusId, (v: number) => string>> = {
  hp: (v) => `+${Math.round(v)}`,
  armour: (v) => `+${v.toFixed(1)}`,
  fireRate: pct,
  reload: pct,
  spread: pct,
  crit: pct,
};
/** Each bonus's name: one "+X stat" pattern; `short` for a squad card. */
const NAME: Readonly<Record<LevelBonusId, { long: string; short: string }>> = {
  hp: { long: 'HP', short: 'HP' },
  armour: { long: 'armour', short: 'arm' },
  fireRate: { long: 'fire rate', short: 'fire' },
  reload: { long: 'reload speed', short: 'reload' },
  spread: { long: 'accuracy', short: 'aim' },
  crit: { long: 'crit', short: 'crit' },
};

/** Each bonus `level` gives, as it prints: ["+14 HP", "+0.5 armour", …]; none at level 1. */
export function levelGains(level: number, short = false): string[] {
  if (level <= 1) return [];
  return (Object.keys(LEVEL_BONUS) as LevelBonusId[]).map((id) =>
    keep(VALUE[id](levelBonus(level, id)), ...NAME[id][short ? 'short' : 'long'].split(' ')),
  );
}

/** At level 1, what levels will bring: the system taught where a new recruit is shown. */
export const LEVEL_ONE_TEXT =
  'Each level: more HP, armour, fire rate, reload speed, accuracy and crit';
/** `LEVEL_ONE_TEXT` for a squad card. */
export const LEVEL_ONE_SHORT = 'Each level: more HP, armour, fire rate, reload, aim, crit';

/**
 * The level's bonus line: "+14 HP · +0.5 armour · …", or `LEVEL_ONE_TEXT` at level 1;
 * `short` labels for a squad card.
 */
export function levelText(level: number, short = false): string {
  const gains = levelGains(level, short);
  // A non-breaking space before each dot keeps it at the end of its line.
  if (gains.length) return gains.join('\u00a0· ');
  return short ? LEVEL_ONE_SHORT : LEVEL_ONE_TEXT;
}
