// Balance: Kevlar Vests and First Aid Kits (ID-131) keep survivors on the line alive (see
// shared.ts). Survivors take no hits until an enemy is in the camp, so a fight the squad
// wins cleanly never tests them: Horde 15 with its expected squad (level 20 Military Rifles)
// is a close fight, the wall breaks late on most seeds and the squad loses some. Played with
// the horde-only scripted player's cards and skills, and the card at `level` held from the
// start, against the same fights without it: at max each card leaves fewer survivors injured
// and wins at least as many.
import { beforeAll, describe, expect, it } from 'vitest';
import { chooseCard } from '../cards.ts';
import type { GameState } from '../game.ts';
import { tick, type HordeState, type UpgradeId } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { squadPick, useSkills } from '../sim.ts';
import { SEEDS, squadAt } from './shared.ts';

const HORDE = 15;
const GUN_LEVEL = 20;
/** How many sets of `SEEDS` fights each case is played over (ID-132). */
const RUNS = 3;
const CARDS = ['kevlar-vests', 'first-aid-kits'] as const satisfies readonly UpgradeId[];

/** Wins and survivors injured over every seed, with `card` at `level` held from the start. */
function play(
  game: GameState,
  card: UpgradeId | null,
  level = 3,
): { wins: number; injured: number } {
  let wins = 0;
  let injured = 0;
  // Three times the usual seeds (ID-132): over 20, adding any card to the pool re-rolls the
  // fights enough to swing the result past the bar either way, on main as well.
  for (let seed = 1; seed <= SEEDS * RUNS; seed++) {
    let s: HordeState = startSquadHorde(game, seed * 101, 0, HORDE);
    if (card) {
      s.taken = [card];
      s.cardLevels = { [card]: level };
    }
    while (s.outcome === 'fighting') {
      if (s.time > 3600) throw new RangeError(`seed ${seed} never ended`);
      s = s.offer ? chooseCard(s, squadPick(s)) : tick(useSkills(s), 0.5);
    }
    if (s.outcome === 'won') wins++;
    injured += s.injured.length;
  }
  return { wins, injured };
}

describe('survivor cards keep the line alive in a close fight (ID-131, Horde 15)', () => {
  let none: { wins: number; injured: number };
  const withCard = new Map<UpgradeId, { wins: number; injured: number }>();
  beforeAll(() => {
    const game = squadAt(HORDE, GUN_LEVEL);
    none = play(game, null);
    for (const id of CARDS) withCard.set(id, play(game, id));
  }, 600_000);

  it('the fight is close: the squad loses survivors, and some seeds, without the cards', () => {
    expect(none.injured).toBeGreaterThan(SEEDS * RUNS);
    expect(none.wins).toBeGreaterThan(0);
    expect(none.wins).toBeLessThan(SEEDS * RUNS);
  });

  it.each(CARDS)('%s at max: fewer survivors injured, and at least as many wins', (id) => {
    const r = withCard.get(id)!;
    // Measured (ID-131, 20 seeds): 51 injured, 14 won without; Kevlar 27 and 19; First Aid
    // 29 and 17. ID-132 (60 seeds; main 98, 48 without, Kevlar 65 and 54, First Aid 70 and
    // 55): 85 and 49 without, Kevlar 70 and 52, First Aid 75 and 52. Its three cards keep
    // more enemies off the line, so these two save less, and the bar moved from 25% fewer
    // injured to 10% fewer.
    expect(r.injured).toBeLessThan(none.injured * 0.9);
    expect(r.wins).toBeGreaterThanOrEqual(none.wins);
  });
});
