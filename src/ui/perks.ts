// The perk loadout between hordes (design §5, ID-021, ID-035): the commander's perk slots
// and what each holds, then every perk with its effect, level and how to get or level it.
// Equip, Unequip and Upgrade are dry runs of the core action, so a refused one shows
// disabled with the core's reason. Text only via textContent.
import {
  PERK_IDS,
  PERK_LEVEL,
  PERK_SLOT_IDS,
  PERKS,
  RESEARCH,
  START_PERK,
  type PerkId,
  type ResearchId,
  type Stock,
} from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { equipPerk, perkSlots, unequipPerk, unlockedPerks } from '../core/perks.ts';
import { entryOf, queueResearch, type GameResult, type QueueId } from '../core/research.ts';

/** Perk slots a commander can ever own: the starting one and one per slot node. */
export const MAX_PERK_SLOTS = 1 + PERK_SLOT_IDS.length;

/**
 * One loadout line: a heading, a note, or an Equip/Unequip/Upgrade with its dry-run
 * result; an Upgrade has a cost and redoes itself with `act` at the click.
 */
export type PerkLine =
  | { kind: 'heading' | 'note'; text: string }
  | {
      kind: 'action';
      label: string;
      result: GameResult;
      cost?: Partial<Stock>;
      act?: (now: number) => GameResult;
    };

/** "Steady Fire: Guns fire 15% faster". */
export const perkText = (id: PerkId): string => `${PERKS[id].name}: ${PERKS[id].text}`;

/** A research time as "15 min", "1 h" or "1 h 30 min". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Where a research node is found: "Lab 2, 60 Genes, 1 h, after Auto-turret". */
export function researchText(id: ResearchId): string {
  const node = RESEARCH[id];
  const after = node.needs ? `, after ${RESEARCH[node.needs].name}` : '';
  return `Lab ${node.lab}, ${node.genes} Genes, ${durationText(node.minutes)}${after}`;
}

/** An owned perk's level line and, below the top, its Upgrade (queued at the Lab). */
function levelLines(game: GameState, id: PerkId, now: number): PerkLine[] {
  const level = game.perkLevels[id];
  const lines: PerkLine[] = [];
  if (level >= PERK_LEVEL.top) return lines;
  const entry: QueueId = `level-${id}`;
  if (game.queue.ids.includes(entry)) {
    lines.push({ kind: 'note', text: `Level ${level + 1} queued at the Lab` });
    return lines;
  }
  const { genes, minutes } = entryOf(game, entry);
  lines.push({
    kind: 'action',
    label: `Upgrade ${PERKS[id].name} to level ${level + 1} (${durationText(minutes)})`,
    cost: { genes },
    result: queueResearch(game, entry, now),
    act: (at) => queueResearch(game, entry, at),
  });
  return lines;
}

/**
 * The loadout for `game` at `now`: the slot count, each slot (the perk in it with
 * Unequip, Empty, or the research that adds it), then each perk in data order with its
 * level, Equip or Equipped, and Upgrade; or where to research it.
 */
export function perkLines(game: GameState, now: number): PerkLine[] {
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
    const level = `level ${game.perkLevels[id]} of ${PERK_LEVEL.top}`;
    if (game.perks.includes(id)) {
      lines.push({ kind: 'note', text: `${perkText(id)} · ${level} · Equipped` });
      lines.push(...levelLines(game, id, now));
    } else if (unlocked.includes(id)) {
      lines.push(
        { kind: 'note', text: `${perkText(id)} · ${level}` },
        { kind: 'action', label: `Equip ${PERKS[id].name}`, result: equipPerk(game, id) },
        ...levelLines(game, id, now),
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
