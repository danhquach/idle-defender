// ID-263: research reaches every horde-only fight, and outlives a win, a mode change and a save.
import { describe, expect, it } from 'vitest';
import { squadAt } from './balance/shared.ts';
import type { TechId } from './data.ts';
import { finishSquadHorde, startSquadHorde } from './hordeonly.ts';
import { setMode } from './modes.ts';
import { researchTech } from './techtree.ts';
import type { GameState } from './game.ts';

const TREE: TechId[] = ['reinforced-wall', 'razor-wire', 'quick-mortars'];
const researched = (n: number): GameState => ({ ...squadAt(n, n), tech: [...TREE] });

describe('research in the fight', () => {
  it('reaches the next horde, a replay and a higher mode (all through startSquadHorde)', () => {
    const g = researched(5);
    expect(startSquadHorde(g, 1, 0).tech).toEqual(TREE);
    expect(startSquadHorde(g, 1, 0, 3).tech).toEqual(TREE);
    const hell: GameState = {
      ...g,
      modes: { nightmare: g.hordeNumber, hell: 0 } as never,
    };
    expect(startSquadHorde(hell, 1, 0).tech).toEqual(TREE);
    // Nothing researched: no key at all, so the state is the one that was always built.
    expect('tech' in startSquadHorde(squadAt(5, 5), 1, 0)).toBe(false);
    expect('tech' in squadAt(5, 5)).toBe(false);
  });

  it('survives a win, a loss and a mode change (the save round trip is in save-tech.test.ts)', () => {
    const g = researched(2);
    const s = startSquadHorde(g, 1, 0);
    s.outcome = 'won';
    const after = finishSquadHorde(g, s);
    expect(after.tech).toEqual(TREE);
    const lost = startSquadHorde(g, 2, 0);
    lost.outcome = 'lost';
    expect(finishSquadHorde(g, lost).tech).toEqual(TREE);
    expect(setMode(after, 'normal').tech).toEqual(TREE);
  });

  it('a purchase between hordes shows in the next horde, and the finished one is unchanged', () => {
    const g0 = squadAt(2, 2);
    g0.stock = { ...g0.stock, scrap: 1000 };
    const done = startSquadHorde(g0, 1, 0);
    const bought = researchTech(g0, 'reinforced-wall');
    if (!bought.ok) throw new Error(bought.code);
    expect(done.tech).toBeUndefined();
    expect(startSquadHorde(bought.game, 1, 0).tech).toEqual(['reinforced-wall']);
  });
});
