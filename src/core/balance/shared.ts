// Balance tests (design §16): the starting numbers in data.ts, played by the
// scripted player in sim.ts, still meet the design's targets. A retune that breaks
// one fails here; `npm run balance` shows the full table.
// One file per target group, so Vitest plays them on separate workers at once.
// Fixtures shared by those files; never imported by game code.
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { SQUAD_CAP, SQUAD_HP_GROWTH, type Rarity } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import type { HordeState } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { createRng } from '../rng.ts';
import type { HordeRun } from '../sim.ts';
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
