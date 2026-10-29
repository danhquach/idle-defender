// The loop between hordes (design §14 step 3): build on the base, fight a horde,
// carry the damage and the payout back. Pure: every function returns new state.
import { newBase, type Base, type Tier } from './base.ts';
import { MATERIALS, START_STOCK, START_TIERS, STAND_IN_PAYOUT, type Stock } from './data.ts';
import { baseAfter, newHorde, type DefenderSpec, type HordeState } from './horde.ts';

export interface GameState {
  /** The next horde to fight. */
  hordeNumber: number;
  base: Base;
  stock: Stock;
  tiers: Tier[];
  roster: DefenderSpec[];
}

// Placeholder starter roster (names are placeholders until the roster ticket).
const STARTER_ROSTER: readonly DefenderSpec[] = [
  { id: 'bob', name: 'Bob', weapon: 'pistol' },
  { id: 'jack', name: 'Jack', weapon: 'pistol' },
  { id: 'john', name: 'John', weapon: 'pistol' },
];

export function newGame(): GameState {
  return {
    hordeNumber: 1,
    base: newBase(),
    stock: { ...START_STOCK },
    tiers: [...START_TIERS],
    roster: STARTER_ROSTER.map((d) => ({ ...d })),
  };
}

/** M2 stand-in payout for horde `hordeNumber` (replaced by ID-006's rewards). */
export function standInPayout(hordeNumber: number, outcome: 'won' | 'lost'): Stock {
  const { win, lossShare } = STAND_IN_PAYOUT;
  const share = outcome === 'won' ? 1 : lossShare;
  const pay = (m: { base: number; perHorde: number }): number =>
    Math.floor((m.base + m.perHorde * hordeNumber) * share);
  return { scrap: pay(win.scrap), wood: pay(win.wood), metal: 0, concrete: 0 };
}

/** Horde `game.hordeNumber` on the current base; `postId` indexes `game.base.posts`. */
export function startHorde(
  game: GameState,
  seed: number,
  defenderId: string,
  postId: number,
): HordeState {
  return newHorde(seed, {
    hordeNumber: game.hordeNumber,
    roster: game.roster,
    startDefenderId: defenderId,
    base: game.base,
    startPostId: postId,
  });
}

/** Back to building: the fight's damage stays, the payout is added, a win moves on. */
export function finishHorde(game: GameState, horde: HordeState): GameState {
  if (horde.outcome === 'fighting') throw new RangeError('finishHorde: the horde is still on');
  if (horde.hordeNumber !== game.hordeNumber) {
    throw new RangeError(`finishHorde: horde ${horde.hordeNumber} is not this game's`);
  }
  const payout = standInPayout(game.hordeNumber, horde.outcome);
  const g = structuredClone(game);
  g.base = baseAfter(game.base, horde);
  for (const m of MATERIALS) g.stock[m] += payout[m];
  if (horde.outcome === 'won') g.hordeNumber += 1;
  return g;
}
