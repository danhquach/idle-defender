// Commander perks (design §5, as built ID-020): perks unlocked at the Lab, equipped
// in perk slots between hordes (the game state is only ever between hordes) and
// fixed for the fight. Pure: each action returns a new game, or a refusal.
import {
  PERK_IDS,
  PERK_SLOT_IDS,
  PERKS,
  START_PERK,
  type PerkId,
  type ResearchId,
} from './data.ts';
import type { GameState } from './game.ts';
import type { GameResult } from './research.ts';

/** Only the research list matters for what is unlocked; a save reader passes just that. */
type Researched = { readonly research: readonly ResearchId[] };

/** The perks the commander can equip: the starting one and every one researched. */
export function unlockedPerks(game: Researched): PerkId[] {
  return PERK_IDS.filter(
    (id) => id === START_PERK || (game.research as readonly string[]).includes(id),
  );
}

/** Perk slots owned: 1, plus one per slot node researched. */
export function perkSlots(game: Researched): number {
  return 1 + PERK_SLOT_IDS.filter((id) => game.research.includes(id)).length;
}

/** Why `id` can't be equipped now, or null when it can. */
export function perkLock(game: Researched & Pick<GameState, 'perks'>, id: PerkId): string | null {
  if (!Object.hasOwn(PERKS, id)) throw new RangeError(`perks: unknown perk ${String(id)}`);
  if (game.perks.includes(id)) return 'Already equipped';
  if (!unlockedPerks(game).includes(id)) return 'Not researched';
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
