// The starting pick's words (ID-284): the two buttons on the squad screen, its list and the rule
// it carries. Pure: no DOM. A card's own name and numbers are `CARD_NAME` / `effectAt` (cards.ts).
import type { TechId } from '../../core/data.ts';
import type { UpgradeId } from '../../core/horde.ts';
import { CARD_NAME, cardLine } from './cards.ts';

/** The two slots, as the squad screen names them. */
export type KitWords = 'ammo' | 'throwable';

/** Each button's label: "Start with: Ammo". */
export const KIT_LABEL: Readonly<Record<KitWords, string>> = {
  ammo: 'Start with: Ammo',
  throwable: 'Start with: Throwable',
};

/** A button with no pick, and the list's first entry. */
export const KIT_NONE = 'None';

/** The line heading every list: what the slot rule does to the pick in a fight. */
export const KIT_RULE = 'Picking the other card in a fight replaces this one. Its levels are lost.';

/** The Mk a card has researched, as the list shows it: "Mk II", "Mk III", or empty with none. */
export function kitMk(tech: readonly TechId[], card: UpgradeId): string {
  if (tech.includes(`${card}-mk3` as TechId)) return 'Mk III';
  return tech.includes(`${card}-mk2` as TechId) ? 'Mk II' : '';
}

/** A card's name with its Mk: "Incendiary Rounds · Mk II". */
export const kitName = (tech: readonly TechId[], card: UpgradeId): string => {
  const mk = kitMk(tech, card);
  return mk ? `${CARD_NAME[card]} · ${mk}` : CARD_NAME[card];
};

/** A card's effect at Lv 1, with its Mk's numbers: what the squad starts the fight with. */
export const kitEffect = (tech: readonly TechId[], card: UpgradeId): string =>
  cardLine(card, 1, tech);
