import { describe, expect, it } from 'vitest';
import { newBase } from './base.ts';
import { START_STOCK, START_TIERS } from './data.ts';
import { finishHorde, newGame, standInPayout, startHorde, type GameState } from './game.ts';
import type { HordeState } from './horde.ts';

/** Horde `game.hordeNumber` fought to `outcome`, with row 0 of column 0 left at 120 HP. */
function fought(game: GameState, outcome: 'won' | 'lost'): HordeState {
  const h = startHorde(game, 1, game.roster[0]!.id, 0);
  h.layers[0]!.segments[0]!.hp = 120;
  h.outcome = outcome;
  return h;
}

describe('game', () => {
  it('starts at horde 1 on the starting base and stock', () => {
    const g = newGame();
    expect(g.hordeNumber).toBe(1);
    expect(g.base).toEqual(newBase());
    expect(g.stock).toEqual(START_STOCK);
    expect(g.tiers).toEqual(START_TIERS);
    expect(g.roster.length).toBeGreaterThan(0);
  });

  it('starts a horde with the chosen defender on the chosen post', () => {
    const g = newGame();
    const h = startHorde(g, 7, g.roster[1]!.id, 1);
    expect(h.hordeNumber).toBe(1);
    expect(h.posts[1]!.defenderId).toBe(g.roster[1]!.id);
    expect(h.posts[0]!.defenderId).toBeNull();
    expect(h.defenders.map((d) => d.id)).toEqual([g.roster[1]!.id]);
  });

  it('pays the stand-in payout', () => {
    expect(standInPayout(1, 'won')).toEqual({ scrap: 20, wood: 30, metal: 0, concrete: 0 });
    expect(standInPayout(1, 'lost')).toEqual({ scrap: 5, wood: 7, metal: 0, concrete: 0 });
    expect(standInPayout(4, 'won')).toEqual({ scrap: 35, wood: 60, metal: 0, concrete: 0 });
  });

  it('a win moves to the next horde, pays and carries damage', () => {
    const g = newGame();
    const next = finishHorde(g, fought(g, 'won'));
    expect(next.hordeNumber).toBe(2);
    expect(next.stock).toEqual({ scrap: 80, wood: 90, metal: 0, concrete: 0 });
    expect(next.base.layers[0]!.slots[0]!.hp).toBe(120);
    expect(next.base.layers[0]!.slots[1]!.hp).toBe(200);
  });

  it('a loss keeps the horde number and pays a quarter', () => {
    const g = newGame();
    const next = finishHorde(g, fought(g, 'lost'));
    expect(next.hordeNumber).toBe(1);
    expect(next.stock).toEqual({ scrap: 65, wood: 67, metal: 0, concrete: 0 });
    expect(next.base.layers[0]!.slots[0]!.hp).toBe(120);
  });

  it('refuses to finish a horde that is still fighting or from another horde', () => {
    const g = newGame();
    expect(() => finishHorde(g, startHorde(g, 1, g.roster[0]!.id, 0))).toThrow(RangeError);
    const other = fought({ ...g, hordeNumber: 3 }, 'won');
    expect(() => finishHorde(g, other)).toThrow(RangeError);
  });

  it('leaves its inputs untouched', () => {
    const g = newGame();
    const h = fought(g, 'won');
    const gBefore = structuredClone(g);
    const hBefore = structuredClone(h);
    startHorde(g, 1, g.roster[0]!.id, 0);
    const next = finishHorde(g, h);
    expect(g).toEqual(gBefore);
    expect(h).toEqual(hBefore);
    next.roster[0]!.name = 'changed';
    next.tiers.push('metal');
    expect(g).toEqual(gBefore);
  });
});
