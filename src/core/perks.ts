// Commander perks (design §5, as built ID-020, ID-035): perks owned through research or a
// boss horde, levelled in the research queue, equipped in perk slots between hordes (the
// game state is only ever between hordes) and fixed for the fight. Pure: each action
// returns a new game, or a refusal.
import {
  PERK_IDS,
  PERK_LEVEL,
  PERK_SLOT_IDS,
  PERKS,
  START_PERK,
  type PerkId,
  type ResearchId,
} from './data.ts';
import type { GameState } from './game.ts';
import type { GameResult } from './research.ts';

/** Each perk's level: 0 = not owned, 1 … `PERK_LEVEL.top`. */
export type PerkLevels = Record<PerkId, number>;

/** A new game's levels: the starting perk at level 1, the rest not owned. */
export function newPerkLevels(): PerkLevels {
  const levels = {} as PerkLevels;
  for (const id of PERK_IDS) levels[id] = id === START_PERK ? 1 : 0;
  return levels;
}

/** The perks the commander owns and can equip, in data order. */
export function unlockedPerks(game: { readonly perkLevels: Readonly<PerkLevels> }): PerkId[] {
  return PERK_IDS.filter((id) => game.perkLevels[id] >= 1);
}

/** Perk slots owned: 1, plus one per slot node researched. */
export function perkSlots(game: { readonly research: readonly ResearchId[] }): number {
  return 1 + PERK_SLOT_IDS.filter((id) => game.research.includes(id)).length;
}

/** How much of its level-1 bonus a perk at `level` gives: 1, 1.5, 2 (design §5, ID-035). */
export const levelScale = (level: number): number => 1 + PERK_LEVEL.step * (level - 1);

/** Why `id` can't be equipped now, or null when it can. */
export function perkLock(
  game: Pick<GameState, 'perks' | 'perkLevels' | 'research'>,
  id: PerkId,
): string | null {
  if (!Object.hasOwn(PERKS, id)) throw new RangeError(`perks: unknown perk ${String(id)}`);
  if (game.perks.includes(id)) return 'Already equipped';
  if (game.perkLevels[id] < 1) return 'Not researched';
  if (game.perks.length >= perkSlots(game)) return 'All perk slots are full';
  return null;
}

/** Equips `id` in the next free slot. */
export function equipPerk(game: GameState, id: PerkId): GameResult {
  const lock = perkLock(game, id);
  if (lock) return { ok: false, reason: lock };
  const g = structuredClone(game);
  g.perks.push(id);
  return { ok: true, game: g };
}

/** Takes `id` out of its slot. */
export function unequipPerk(game: GameState, id: PerkId): GameResult {
  if (!Object.hasOwn(PERKS, id)) throw new RangeError(`perks: unknown perk ${String(id)}`);
  if (!game.perks.includes(id)) return { ok: false, reason: 'Not equipped' };
  const g = structuredClone(game);
  g.perks = g.perks.filter((p) => p !== id);
  return { ok: true, game: g };
}
