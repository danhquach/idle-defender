// Balance tests (design §16): the starting numbers in data.ts, played by the
// scripted player in sim.ts, still meet the design's targets. A retune that breaks
// one fails here; `npm run balance` shows the full table.
// One file per target group, so Vitest plays them on separate workers at once.
// Fixtures shared by those files; never imported by game code.
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { SQUAD_CAP, SQUAD_HP_GROWTH, SQUAD_SLOT_COSTS, type Rarity } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import type { HordeState } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { effHorde, type HigherMode } from '../modes.ts';
import { createRng } from '../rng.ts';
import { playSquadHorde, type HordeRun } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { xpForLevel } from '../stats.ts';

export const SEEDS = 20;

/** Horde `n` on the starting base with a fresh roster. */
export const bareGame = (n: number) => ({ ...newGame(), hordeNumber: n });

/**
 * The card tests' close fight (ID-163): `startSquadHorde`, but Horde 4 as it stood before
 * ID-163 (enemy HP at the bare growth, no preview elite). Those tests measure a card's worth
 * in a close fight a few fresh survivors can win, not Horde 4's own difficulty, which the
 * horde-only campaign test covers; the harder Horde 4 left them nothing to win.
 */
export function cardFight(game: GameState, seed: number): HordeState {
  const s = startSquadHorde(game, seed, 0);
  if (game.hordeNumber !== 4) return s;
  // Horde 4 before ID-163: ×1 on three steps of growth, and no elite.
  s.hpScale = SQUAD_HP_GROWTH.early ** 3;
  s.bosses = s.bosses.filter((b) => !b.elite);
  return s;
}

export const winRate = (runs: HordeRun[]): number =>
  runs.filter((r) => r.outcome === 'won').length / runs.length;

/**
 * Horde `n`'s expected squad (size and levels), each with a Rifle of `rarity` (Military by
 * default) at `gunLevel` (ID-098).
 */
export function squadAt(n: number, gunLevel: number, rarity: Rarity = 'military'): GameState {
  const size = Math.min(n, SQUAD_CAP);
  const g = newGame('horde');
  g.roster = Array.from({ length: size }, (_, i) => ({
    ...recruit(i + 1),
    xp: xpForLevel(Math.min(25, 1 + n)),
    loadout: {
      primary: rollWeapon(createRng(i + 7), `h${i + 1}`, 'rifle', rarity, gunLevel),
      secondary: null,
      item: null,
    },
  }));
  g.camp.recruits = size;
  g.hordeNumber = n;
  return g;
}

/** Survivors the expected squad has in the mode tests: every slot bought. */
const SIZE = SQUAD_CAP + SQUAD_SLOT_COSTS.length;

/** The expected squad at Normal Horde `n`: `SIZE` survivors, each a Military Rifle at `level`. */
export function squad(n: number, level: number): GameState {
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
export const inMode = (game: GameState, mode: HigherMode, local = 1): GameState => ({
  ...game,
  mode,
  modes: { ...game.modes, [mode]: local },
});

/** Fights won out of `seeds` at horde `n` (the game's own mode's), by `game`'s squad. */
export const wins = (game: GameState, n: number, seeds: number): number => {
  let won = 0;
  for (let s = 1; s <= seeds; s++) {
    if (playSquadHorde(game, s * 101, undefined, undefined, n).outcome === 'won') won++;
  }
  return won;
};

/**
 * The lowest gun level in `from`..400 whose squad, given by `game(level)`, wins horde `n` on
 * most of 5 seeds (`wins` is non-decreasing in the level, so it bisects).
 */
export function holdFrom(game: (level: number) => GameState, n: number, from = 1): number {
  let lo = from;
  let hi = 400;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wins(game(mid), n, 5) >= 3) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The lowest gun level whose squad holds Normal Horde 50: most of 5 seeds won. */
export const holdLevel = (): number => holdFrom((level) => squad(50, level), 50);

/** The expected squad of `mode` whose Squad Power is at least `share` of horde `n`'s Recommended Power. */
export function squadAbove(mode: HigherMode, n: number, share: number): GameState {
  const eff = effHorde(mode, n);
  const target = recommendedPower(eff, mode, SIZE) * share;
  for (let level = 1; level <= 400; level++) {
    const g = inMode(squad(mode === 'nightmare' ? 51 : 200, level), mode, n);
    if (mode === 'hell') g.modes = { nightmare: 51, hell: n };
    if (squadPower(g) >= target) return g;
  }
  throw new Error(`no squad reaches ${share} of ${mode} ${n}`);
}
