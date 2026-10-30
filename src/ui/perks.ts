// The perk loadout between hordes (design §5, ID-021): the commander's perk slots and
// what each holds, then every perk with its effect and how to get it. Equip and Unequip
// are dry runs of the core action, so a refused one shows disabled with the core's reason.
// Text only via textContent.
import {
  PERK_IDS,
  PERK_SLOT_IDS,
  PERKS,
  RESEARCH,
  START_PERK,
  type PerkId,
  type ResearchId,
} from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { equipPerk, perkSlots, unequipPerk, unlockedPerks } from '../core/perks.ts';
import type { GameResult } from '../core/research.ts';
import { stockText } from './hud.ts';

/** Perk slots a commander can ever own: the starting one and one per slot node. */
export const MAX_PERK_SLOTS = 1 + PERK_SLOT_IDS.length;

/** One loadout line: a heading, a note, or an Equip/Unequip with its dry-run result. */
export type PerkLine =
  | { kind: 'heading' | 'note'; text: string }
  | { kind: 'action'; label: string; result: GameResult };

/** "Steady Fire: Guns fire 15% faster". */
export const perkText = (id: PerkId): string => `${PERKS[id].name}: ${PERKS[id].text}`;

/** Where a research node is found: "Lab 2, 60 scrap, 40 wood, after Auto-turret". */
export function researchText(id: ResearchId): string {
  const node = RESEARCH[id];
  const after = node.needs ? `, after ${RESEARCH[node.needs].name}` : '';
  return `Lab ${node.lab}, ${stockText(node.cost)}${after}`;
}

/**
 * The loadout for `game`: the slot count, each slot (the perk in it with Unequip, Empty,
 * or the research that adds it), then each perk in data order with Equip, Equipped, or
 * where to research it.
 */
export function perkLines(game: GameState): PerkLine[] {
  const owned = perkSlots(game);
  const unlocked = unlockedPerks(game);
  const lines: PerkLine[] = [
    { kind: 'heading', text: `Perk slots: ${owned} of ${MAX_PERK_SLOTS}` },
  ];
  for (let i = 0; i < MAX_PERK_SLOTS; i++) {
    const perk = game.perks[i];
    if (i >= owned) {
      // Slot index i (from 1; the first slot is free) is added by PERK_SLOT_IDS[i - 1].
      const node = PERK_SLOT_IDS[i - 1]!;
      lines.push({ kind: 'note', text: `Slot ${i + 1} · locked · ${researchText(node)}` });
    } else if (perk === undefined) {
      lines.push({ kind: 'note', text: `Slot ${i + 1} · Empty` });
    } else {
      lines.push(
        { kind: 'note', text: `Slot ${i + 1} · ${perkText(perk)}` },
        { kind: 'action', label: `Unequip ${PERKS[perk].name}`, result: unequipPerk(game, perk) },
      );
    }
  }
  lines.push({ kind: 'heading', text: 'Perks' });
  for (const id of PERK_IDS) {
    if (game.perks.includes(id)) {
      lines.push({ kind: 'note', text: `${perkText(id)} · Equipped` });
    } else if (unlocked.includes(id)) {
      lines.push(
        { kind: 'note', text: perkText(id) },
        { kind: 'action', label: `Equip ${PERKS[id].name}`, result: equipPerk(game, id) },
      );
    } else {
      // Every perk but the starting one is a research node of its own id.
      const node = id as Exclude<PerkId, typeof START_PERK>;
      lines.push({
        kind: 'note',
        text: `${perkText(id)} · Research at the Lab · ${researchText(node)}`,
      });
    }
  }
  return lines;
}
