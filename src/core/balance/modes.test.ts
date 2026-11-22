// Balance: difficulty modes (ID-218). A squad that just holds Normal Horde 50 wins Nightmare
// Hordes 1–10 on most seeds at the first try and is stopped before Nightmare Horde 30 on
// most; and no mode has a wall where a squad well above the expected power loses repeatedly.
// The scripted player gears up between fights (`gearUp`) and stops at its first lost fight.
import { beforeAll, describe, expect, it } from 'vitest';
import { finishSquadHorde } from '../hordeonly.ts';
import { localHorde, MODES } from '../modes.ts';
import { gearUp, playSquadHorde } from '../sim.ts';
import { cacheFor } from './cache.ts';
import { holdLevel, inMode, SEEDS, squad, squadAbove, wins } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** Where a seed's run through Nightmare ends: the horde it lost at first try, or null through 30. */
function runNightmare(level: number, seed: number): number | null {
  let game = inMode(squad(51, level), 'nightmare');
  for (let n = 1; n <= 30; n++) {
    const horde = playSquadHorde(game, seed * 1000 + n, undefined, undefined, n);
    if (horde.outcome !== 'won') return n;
    game = gearUp(finishSquadHorde(game, horde));
    if (localHorde(game) !== n + 1) throw new Error(`Nightmare ${n} did not count`);
  }
  return null;
}

describe('difficulty modes (ID-218)', () => {
  let level = 0;
  const ends: (number | null)[] = [];
  beforeAll(() => {
    level = keep('hold level', holdLevel);
    for (let i = 1; i <= SEEDS; i++) {
      ends.push(keep(`nightmare ${level} ${i}`, () => runNightmare(level, i)));
    }
  }, 3_600_000);

  it('a squad that holds Normal Horde 50 wins Nightmare Hordes 1–10 at the first try on 60% of seeds', () => {
    const cleared = ends.filter((end) => end === null || end > 10).length;
    expect(
      cleared / ends.length,
      `gun level ${level}, ended at ${JSON.stringify(ends)}`,
    ).toBeGreaterThanOrEqual(0.6);
  }, 3_600_000);

  it('and is stopped by Nightmare Horde 30 on most seeds', () => {
    const stopped = ends.filter((end) => end !== null).length;
    expect(
      stopped / ends.length,
      `gun level ${level}, ended at ${JSON.stringify(ends)}`,
    ).toBeGreaterThan(0.5);
  }, 3_600_000);

  // No wall: a squad well over the horde's Recommended Power wins it on most seeds.
  it.each([
    ['nightmare', 20],
    ['nightmare', 30],
    ['hell', 30],
  ] as const)(
    'a squad well over Recommended Power does not lose repeatedly: %s %i',
    (mode, n) => {
      const won = keep(`over ${mode} ${n}`, () => wins(squadAbove(mode, n, 1.3), n, 5));
      expect(won, `${MODES[mode].name} Horde ${n} at 130%`).toBeGreaterThanOrEqual(4);
    },
    3_600_000,
  );
});
