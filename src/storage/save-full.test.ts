// ID-066 with the horde-only flag off, as the full game will load saves when it comes
// back: a horde-only squad of 6 in a 5-slot camp still loads, and the reserve folds back
// onto the roster.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { SQUAD_CAP } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { decodeSave, encodeSave } from './save.ts';
import { NOW } from './testing.ts';

vi.mock('../core/data.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/data.ts')>()),
  HORDE_ONLY: false,
}));

describe('save with the horde-only flag off (ID-066)', () => {
  it('loads a horde-only squad of 6 in a camp of 5 slots', () => {
    const g = newGame('horde');
    const six = {
      ...g,
      roster: Array.from({ length: SQUAD_CAP }, (_, i) => recruit(i + 1)),
      camp: { ...g.camp, recruits: SQUAD_CAP },
    };
    expect(decodeSave(encodeSave(six, NOW))?.game).toEqual(six);
  });

  it('takes the reserve back onto the roster, after the squad', () => {
    const g = newGame();
    const reserve = [recruit(1), recruit(2)];
    const game = { ...g, reserve, camp: { ...g.camp, recruits: 2 } };
    const back = decodeSave(encodeSave(game, NOW))!.game;
    expect(back.roster.map((d) => d.id)).toEqual(['bob', 'jack', 'john', 'recruit-1', 'recruit-2']);
    expect(back.reserve).toEqual([]);
  });
});
