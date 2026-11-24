// ID-231: both scripted players use Field Repairs once the wall is low. Each fight starts
// with the card held and one built segment at 20%, so only the player's own use spends it.
import { describe, expect, it, vi } from 'vitest';
import type { HordeState } from './horde.ts';

const hurt = (s: HordeState): HordeState => {
  s.taken = [...s.taken, 'field-repairs'];
  const seg = s.layers.flatMap((l) => l.segments).find((g) => g.kind !== null)!;
  seg.hp = seg.maxHp * 0.2;
  return s;
};

vi.mock('./game.ts', async (load) => {
  const real = await load<typeof import('./game.ts')>();
  return {
    ...real,
    startHorde: (...a: Parameters<typeof real.startHorde>) => hurt(real.startHorde(...a)),
  };
});
vi.mock('./hordeonly.ts', async (load) => {
  const real = await load<typeof import('./hordeonly.ts')>();
  return {
    ...real,
    startSquadHorde: (...a: Parameters<typeof real.startSquadHorde>) =>
      hurt(real.startSquadHorde(...a)),
  };
});

const { newGame } = await import('./game.ts');
const { playHorde, playSquadHorde } = await import('./sim.ts');
const { repairsState } = await import('./skills.ts');

describe('the scripted players use Field Repairs (ID-231)', () => {
  it('the campaign player', () => {
    expect(repairsState(playHorde(newGame(), 1, 1_700_000_000_000))).toBe('spent');
  });

  it('the horde-only player', () => {
    expect(repairsState(playSquadHorde(newGame('horde'), 1))).toBe('spent');
  });
});
