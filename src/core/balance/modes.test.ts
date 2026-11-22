// Balance: difficulty modes (ID-218). A squad that just holds Normal Horde 50 wins Nightmare
// Hordes 1–10 on most seeds at the first try and is stopped before Nightmare Horde 30 on
// most; and no mode has a wall where a squad well above the expected power loses repeatedly.
// The scripted player gears up between fights (`gearUp`) and stops at its first lost fight.
import { beforeAll, describe, expect, it } from 'vitest';
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { SQUAD_CAP, SQUAD_SLOT_COSTS } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { finishSquadHorde } from '../hordeonly.ts';
import { effHorde, localHorde, MODES, type HigherMode } from '../modes.ts';
import { createRng } from '../rng.ts';
import { gearUp, playSquadHorde } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { xpForLevel } from '../stats.ts';
import { cacheFor } from './cache.ts';
import { SEEDS } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** Survivors the expected squad has: every slot bought. */
const SIZE = SQUAD_CAP + SQUAD_SLOT_COSTS.length;

/** The expected squad at Normal Horde `n`: `SIZE` survivors, each a Military Rifle at `level`. */
function squad(n: number, level: number): GameState {
  const g = newGame('horde');
  const roster = Array.from({ length: SIZE }, (_, i) => ({
    ...recruit(i + 1),
    xp: xpForLevel(25),
    loadout: {
      primary: rollWeapon(createRng(i + 7), `h${i + 1}`, 'rifle', 'military', level),
      secondary: null,
      item: null,
    },
  }));
  return {
    ...g,
    hordeNumber: n,
    roster,
    slots: { squad: SQUAD_SLOT_COSTS.length, stash: 0 },
    camp: { ...g.camp, recruits: SIZE },
  };
}

/** `game` playing `mode` from its Horde `local`. */
const inMode = (game: GameState, mode: HigherMode, local = 1): GameState => ({
  ...game,
  mode,
  modes: { ...game.modes, [mode]: local },
});

/** Fights won out of `seeds` at horde `n` (the game's own mode's), by `game`'s squad. */
const wins = (game: GameState, n: number, seeds: number): number => {
  let won = 0;
  for (let s = 1; s <= seeds; s++) {
    if (playSquadHorde(game, s * 101, undefined, undefined, n).outcome === 'won') won++;
  }
  return won;
};

/** The lowest gun level whose squad holds Normal Horde 50: most of 5 seeds won. */
function holdLevel(): number {
  let lo = 1;
  let hi = 400;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wins(squad(50, mid), 50, 5) >= 3) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

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

/** The expected squad of `mode` whose Squad Power is at least `share` of horde `n`'s Recommended Power. */
function squadAbove(mode: HigherMode, n: number, share: number): GameState {
  const eff = effHorde(mode, n);
  const target = recommendedPower(eff, mode) * share;
  for (let level = 1; level <= 400; level++) {
    const g = inMode(squad(mode === 'nightmare' ? 51 : 200, level), mode, n);
    if (mode === 'hell') g.modes = { nightmare: 51, hell: n };
    if (squadPower(g) >= target) return g;
  }
  throw new Error(`no squad reaches ${share} of ${mode} ${n}`);
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
