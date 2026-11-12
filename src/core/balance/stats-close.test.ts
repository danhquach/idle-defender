// Balance (ID-125): Sharp Mind, Agility and Instinct are each as strong a choice, in the
// close fights that show the stats apart. The ticket's first-try measure is in
// stats.test.ts; the two are files of their own so they run side by side.
import { describe, expect, it } from 'vitest';
import type { Stat } from '../data.ts';
import type { GameState } from '../game.ts';
import { playSquadHorde } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { spread, squadAt, STAT_PICKS as PICKS, STAT_WITHIN as WITHIN } from './shared.ts';

describe('the stats are each as strong a choice (ID-125)', () => {
  // Hordes 4–10 at the first try are mostly won whatever the points (a squad with none
  // wins about 86%), so the close fights show the difference: the same squad, its gun
  // at the level where a Sharp Mind squad meets Recommended Power, with the scripted
  // player's cards and skills (ID-128: Recommended Power is fitted to that build; no cards
  // before). A later balance change that moves a few fights can flip it, so re-measure the
  // stats when it does. About 3 min alone.
  it('the same squad at Recommended Power: wins within 10 points, all above none', () => {
    const HORDES = [9, 10, 11, 12, 13, 14, 15];
    const CLOSE_SEEDS = 10;
    const won = (game: GameState, n: number, seed: number): boolean =>
      playSquadHorde(game, seed, undefined, undefined, n).outcome === 'won';
    const wins = new Map<Stat, number>();
    for (const n of HORDES) {
      const rec = recommendedPower(n);
      let level = 1;
      for (let lv = 2; lv <= 200; lv++) {
        const off = (l: number) => Math.abs(squadPower(squadAt(n, l, 'mind')) - rec);
        if (off(lv) < off(level)) level = lv;
      }
      for (const stat of [...PICKS, 'tinker'] as const) {
        const g = squadAt(n, level, stat);
        for (let seed = 1; seed <= CLOSE_SEEDS; seed++) {
          if (won(g, n, seed * 101)) wins.set(stat, (wins.get(stat) ?? 0) + 1);
        }
      }
    }
    const fights = HORDES.length * CLOSE_SEEDS;
    const rate = (s: Stat) => (wins.get(s) ?? 0) / fights;
    const all = PICKS.map(rate);
    const said = [...PICKS, 'tinker' as const].map((s) => `${s} ${rate(s).toFixed(2)}`).join(' ');
    expect(spread(all), said).toBeLessThanOrEqual(WITHIN);
    // Tinker is locked: its points stay unspent, so it stands for a squad with none.
    for (const s of PICKS) expect(rate(s), said).toBeGreaterThan(rate('tinker') + WITHIN);
  }, 600_000);
});
