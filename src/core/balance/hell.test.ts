// Balance: Hell with its new boss skills (ID-222). A squad that holds Nightmare Horde 50 wins
// Hell Hordes 1–10 on most seeds at the first try and is stopped before Hell Horde 30 on
// most; and no Hell boss horde has a wall where a squad well above the expected power loses
// repeatedly. The scripted player gears up between fights (`gearUp`), stops at its first lost
// fight, and takes the mode cards it has unlocked (the pool carries them in Hell).
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../game.ts';
import { finishSquadHorde } from '../hordeonly.ts';
import { localHorde, MODES } from '../modes.ts';
import { gearUp, playSquadHorde } from '../sim.ts';
import { cacheFor } from './cache.ts';
import { holdFrom, holdLevel, inMode, SEEDS, squad, squadAbove } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** The lowest gun level (from the Normal hold level up) whose squad holds Nightmare Horde 50. */
const holdNightmare50 = (from: number): number =>
  holdFrom((level) => inMode(squad(51, level), 'nightmare', 50), 50, from);

/** Where a seed's run through Hell ends: the horde it lost at first try, or null through 30. */
function runHell(level: number, seed: number): number | null {
  let game: GameState = { ...inMode(squad(51, level), 'hell'), modes: { nightmare: 51, hell: 1 } };
  for (let n = 1; n <= 30; n++) {
    const horde = playSquadHorde(game, seed * 1000 + n, undefined, undefined, n);
    if (horde.outcome !== 'won') return n;
    game = gearUp(finishSquadHorde(game, horde));
    if (localHorde(game) !== n + 1) throw new Error(`Hell ${n} did not count`);
  }
  return null;
}

describe('Hell (ID-222)', () => {
  let level = 0;
  const ends: (number | null)[] = [];
  beforeAll(() => {
    const normal = keep('hold level', holdLevel);
    level = keep(`hold nightmare 50 from ${normal}`, () => holdNightmare50(normal));
    for (let i = 1; i <= SEEDS; i++) {
      ends.push(keep(`hell ${level} ${i}`, () => runHell(level, i)));
    }
  }, 3_600_000);

  it('a squad that holds Nightmare Horde 50 wins Hell Hordes 1–10 at the first try on 60% of seeds', () => {
    const cleared = ends.filter((end) => end === null || end > 10).length;
    expect(
      cleared / ends.length,
      `gun level ${level}, ended at ${JSON.stringify(ends)}`,
    ).toBeGreaterThanOrEqual(0.6);
  }, 3_600_000);

  it('and is stopped by Hell Horde 30 on most seeds', () => {
    const stopped = ends.filter((end) => end !== null).length;
    expect(
      stopped / ends.length,
      `gun level ${level}, ended at ${JSON.stringify(ends)}`,
    ).toBeGreaterThan(0.5);
  }, 3_600_000);

  // No wall: a squad well over the horde's Recommended Power wins it on most seeds. Hell 30
  // (the 4-boss horde) is in modes.test.ts.
  it.each([10, 20] as const)(
    'a squad well over Recommended Power does not lose repeatedly: hell %i',
    (n) => {
      const won = keep(`over hell ${n}`, () => {
        const game = squadAbove('hell', n, 1.3);
        let count = 0;
        for (let s = 1; s <= 5; s++) {
          if (playSquadHorde(game, s * 101, undefined, undefined, n).outcome === 'won') count++;
        }
        return count;
      });
      expect(won, `${MODES.hell.name} Horde ${n} at 130%`).toBeGreaterThanOrEqual(4);
    },
    3_600_000,
  );
});
