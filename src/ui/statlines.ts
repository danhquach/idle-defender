// What a survivor's level gives in real numbers (ID-146): one line under the level a card
// or the Roster already shows, "+14 HP · +0.5 armour · +6.9% fire rate · …"; short labels
// on a squad card ("+14 HP · +0.5 arm · +6.9% fire · …") so it fits two lines. Pure: no DOM.
import type { Held } from '../core/armoury.ts';
import {
  ENEMIES,
  ENEMY_TRAITS,
  GUN_CLASS,
  GUN_CLASS_NAME,
  GUN_CLASSES,
  WEAPONS,
  type GunBase,
  LEVEL_BONUS,
  type EnemyKind,
  type GunClass,
  type LevelBonusId,
} from '../core/data.ts';
import { HIGHER_MODES, MODES, modeUnlocked, type ModeProgress } from '../core/modes.ts';
import { levelBonus } from '../core/stats.ts';
import { classOf, goodVs, poorVs, type Fit, type FitBand } from '../core/traits.ts';

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

/** Each enemy kind in the plural, as the gun lines name them (ID-237); Swollen stays Swollen. */
export const KIND_PLURAL: Readonly<Record<EnemyKind, string>> = {
  shambler: 'Shamblers',
  runner: 'Runners',
  crawler: 'Crawlers',
  swollen: 'Swollen',
  spewer: 'Spewers',
  brute: 'Brutes',
  screamer: 'Screamers',
  horror: 'Horrors',
};

/** Whether the gun matchups are told (ID-237): once Nightmare is unlocked; a game with no horde number says no. */
export const matchupsOpen = (game: Partial<ModeProgress>): boolean =>
  game.hordeNumber !== undefined && modeUnlocked(game as ModeProgress, 'nightmare');

/** The gun class's name: "Light". */
export const className = (cls: GunClass): string => GUN_CLASS_NAME[cls];

/**
 * A gun's class line (ID-237), the gun the subject: "Light" before Nightmare is unlocked, then
 * "Light · Good vs Runners, Crawlers · Poor vs Brutes, Horrors" (`matchups`). Null for a weapon
 * that is no gun.
 */
export function classLine(h: Held, matchups: boolean): string | null {
  const cls = classOf(h);
  if (cls === null) return null;
  const parts: string[] = [className(cls)];
  if (matchups) {
    const names = (kinds: EnemyKind[]): string => kinds.map((k) => KIND_PLURAL[k]).join(', ');
    if (goodVs(cls).length > 0) parts.push(`Good vs ${names(goodVs(cls))}`);
    if (poorVs(cls).length > 0) parts.push(`Poor vs ${names(poorVs(cls))}`);
  }
  return parts.join(' · ');
}

/** A kind's trait as the horde's chip says it (ID-237): "Hulking · Resists Light · Weak to Heavy"; null for no trait. */
export function traitText(kind: EnemyKind): string | null {
  const t = ENEMY_TRAITS[kind];
  return t ? `${t.name} · Resists ${className(t.resists)} · Weak to ${className(t.weak)}` : null;
}

/** The Fit pill's band words (ID-237), the one table the pill and its sentence read. */
export const FIT_WORD: Readonly<Record<FitBand, string>> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

/** The Fit pill's hint (ID-237): "Add Heavy or Medium" on Fair or Poor, "Good fit" when nothing to add. */
export function fitText(fit: Fit): string {
  const word = FIT_WORD[fit.band];
  return fit.suggest.length > 0 ? `Add ${fit.suggest.map(className).join(' or ')}` : `${word} fit`;
}

/** What the Fit pill measures, for its tooltip (ID-237). */
export const FIT_TIP =
  'How well your squad’s gun classes match this horde’s enemy traits. It does not say whether you will win: Squad Power does.';

/** The Help tab's enemy trait table (ID-237): a row per kind with a trait, in kind order. */
export const TRAIT_ROWS: readonly {
  kind: EnemyKind;
  trait: string;
  resists: string;
  weak: string;
  resistsClass: GunClass;
  weakClass: GunClass;
}[] = (Object.keys(ENEMIES) as EnemyKind[]).flatMap((kind) => {
  const t = ENEMY_TRAITS[kind];
  return t
    ? [
        {
          kind,
          trait: t.name,
          resists: className(t.resists),
          weak: className(t.weak),
          resistsClass: t.resists,
          weakClass: t.weak,
        },
      ]
    : [];
});

/** The Help tab's class lines (ID-237), one a class: "Light: Pistol, SMG, Machine Pistol, LMG". */
export const CLASS_LINES: readonly { cls: GunClass; text: string }[] = GUN_CLASSES.map((cls) => ({
  cls,
  text: `${className(cls)}: ${(Object.keys(GUN_CLASS) as GunBase[])
    .filter((b) => GUN_CLASS[b] === cls)
    .map((b) => WEAPONS[b].name)
    .join(', ')}`,
}));

/** What the trait table's note says (ID-237): each higher mode's numbers and what is left alone. */
export const TRAIT_NOTE = `${HIGHER_MODES.map(
  (m) =>
    `${MODES[m].name}: a gun class an enemy resists deals ${Math.round(MODES[m].resist * 100)}% of its damage, one it is weak to ${Math.round(MODES[m].weak * 100)}%.`,
).join(
  ' ',
)} Normal has no traits. Turrets, blades, fire, grenades, traps and skills are not affected.`;
