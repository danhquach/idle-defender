// Balance: Hell starts where Nightmare ends (ID-222, ID-225). A squad that just holds
// Nightmare Horde 50 wins Hell Horde 1 at the first try on some seeds but not all, and is
// stopped before Hell Horde 30 on most; and no Hell boss horde has a wall where a squad well
// above the expected power loses repeatedly. The scripted player gears up between fights
// (`gearUp`), stops at its first lost fight, and takes the mode cards it has unlocked (the
// pool carries them in Hell). The squad is all Carbines (Medium), so since ID-237 it is the
// one-class replay: Hell's traits cost it first-try wins, and its floor is 15%. A mixed
// squad's Hell 1 start is asserted in `traits.test.ts`. ID-265: every squad plays with the
// Research Center nodes the reference player owns at that horde (`withRef`, 65% of the Scrap
// earned), against the research HP ramp; Hell 1's 15–70% window is the known knife-edge.
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../game.ts';
import { finishSquadHorde } from '../hordeonly.ts';
import { localHorde } from '../modes.ts';
import { gearUp, playSquadHorde } from '../sim.ts';
import { cacheFor } from './cache.ts';
import { holdFrom, holdLevel, inMode, SEEDS, squad, squadAbove, wins, withRef } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** The lowest gun level (from the Normal hold level up) whose squad holds Nightmare Horde 50. */
const holdNightmare50 = (from: number): number =>
  holdFrom((level) => withRef(inMode(squad(51, level), 'nightmare', 50)), 50, from);

/** The last Hell horde a run plays: one before 30, so a run that reaches Hell 30 ends null. */
const LAST = 29;

/** Where a seed's run through Hell ends: the horde it lost at first try, or null through `LAST`. */
function runHell(level: number, seed: number): number | null {
  let game: GameState = { ...inMode(squad(51, level), 'hell'), modes: { nightmare: 51, hell: 1 } };
  for (let n = 1; n <= LAST; n++) {
    const horde = playSquadHorde(withRef(game, n), seed * 1000 + n, undefined, undefined, n);
    if (horde.outcome !== 'won') return n;
    game = gearUp(finishSquadHorde(game, horde));
    if (localHorde(game) !== n + 1) throw new Error(`Hell ${n} did not count`);
  }
  return null;
}

describe('Hell (ID-222, ID-225)', () => {
  let level = 0;
  const ends: (number | null)[] = [];
  beforeAll(() => {
    const normal = keep('hold level', holdLevel);
    level = keep(`hold nightmare 50 from ${normal}`, () => holdNightmare50(normal));
    for (let i = 1; i <= SEEDS; i++) {
      ends.push(keep(`hell to ${LAST} ${level} ${i}`, () => runHell(level, i)));
    }
  }, 3_600_000);

  it('a squad that just holds Nightmare Horde 50 wins Hell Horde 1 at the first try on 15–70% of seeds (one-class Carbine replay, ID-237)', () => {
    const share = ends.filter((end) => end !== 1).length / ends.length;
    const msg = `gun level ${level}, ended at ${JSON.stringify(ends)}`;
    expect(share, msg).toBeGreaterThanOrEqual(0.15);
    expect(share, msg).toBeLessThanOrEqual(0.7);
  }, 3_600_000);

  it('and is stopped before Hell Horde 30 on most seeds', () => {
    const stopped = ends.filter((end) => end !== null).length;
    expect(
      stopped / ends.length,
      `gun level ${level}, ended at ${JSON.stringify(ends)}`,
    ).toBeGreaterThan(0.5);
  }, 3_600_000);

  // No wall: a squad well over the horde's Recommended Power wins it on most seeds.
  it.each([10, 20, 30] as const)(
    'a squad well over Recommended Power does not lose repeatedly: hell %i',
    (n) => {
      const won = keep(`over hell ${n}`, () => wins(withRef(squadAbove('hell', n, 1.3)), n, 5));
      expect(won, `hell Horde ${n} at 130%`).toBeGreaterThanOrEqual(4);
    },
    3_600_000,
  );
});
