// Balance tests (design §16): the starting numbers in data.ts, played by the
// scripted player in sim.ts, still meet the design's targets. A retune that breaks
// one fails here; `npm run balance` shows the full table.
// One file per target group, so Vitest plays them on separate workers at once.
// Fixtures shared by those files; never imported by game code.
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { SQUAD_CAP } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { createRng } from '../rng.ts';
import { spendAll, type HordeRun } from '../sim.ts';
import { xpForLevel } from '../stats.ts';

export const SEEDS = 20;

/** Horde `n` on the starting base with a fresh roster. */
export const bareGame = (n: number) => ({ ...newGame(), hordeNumber: n });

export const winRate = (runs: HordeRun[]): number =>
  runs.filter((r) => r.outcome === 'won').length / runs.length;

/** Horde `n`'s expected squad (size and levels), each with a Military Rifle at `gunLevel` (ID-098). */
export function squadAt(n: number, gunLevel: number): GameState {
  const size = Math.min(n, SQUAD_CAP);
  const g = newGame('horde');
  g.roster = Array.from({ length: size }, (_, i) => ({
    ...recruit(i + 1),
    xp: xpForLevel(Math.min(25, 1 + n)),
    loadout: {
      primary: rollWeapon(createRng(i + 7), `h${i + 1}`, 'rifle', 'military', gunLevel),
      secondary: null,
      item: null,
    },
  }));
  g.camp.recruits = size;
  g.hordeNumber = n;
  return spendAll(g);
}
