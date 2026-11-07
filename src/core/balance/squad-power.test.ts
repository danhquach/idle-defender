// Balance: Recommended Power (ID-098). A squad at a horde's Recommended Power, with no
// cards or skills, wins about half its fights there (see shared.ts for the seeds).
import { describe, expect, it } from 'vitest';
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { SQUAD_CAP } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { tick } from '../horde.ts';
import { createRng } from '../rng.ts';
import { spendAll } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { xpForLevel } from '../stats.ts';

const SEEDS = 10;

/** Horde `n`'s expected squad (size and levels), each with a Military Rifle at `gunLevel`. */
function squadAt(n: number, gunLevel: number): GameState {
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

/** The squad whose Squad Power is nearest horde `n`'s Recommended Power. */
function squadAtRecommended(n: number): GameState {
  const rec = recommendedPower(n);
  let best = squadAt(n, 1);
  for (let lv = 2; lv <= 200; lv++) {
    const g = squadAt(n, lv);
    if (Math.abs(squadPower(g) - rec) < Math.abs(squadPower(best) - rec)) best = g;
  }
  return best;
}

/** A fight at horde `n` with every card offer turned down. */
function wonWithNoCards(game: GameState, n: number, seed: number): boolean {
  let s = startSquadHorde(game, seed, 0, n);
  while (s.outcome === 'fighting') {
    if (s.time > 3600) throw new RangeError(`horde ${n} never ended`);
    s = s.offer ? { ...s, offer: null } : tick(s, 60);
  }
  return s.outcome === 'won';
}

describe('Recommended Power (ID-098)', () => {
  const HORDES = [9, 12, 15, 20];
  it('a squad at Recommended Power, with no cards, wins about half the time', () => {
    const rates = HORDES.map((n) => {
      const g = squadAtRecommended(n);
      let won = 0;
      for (let seed = 1; seed <= SEEDS; seed++) if (wonWithNoCards(g, n, seed * 101)) won++;
      return won / SEEDS;
    });
    for (const [i, rate] of rates.entries()) {
      expect(rate, `Horde ${HORDES[i]}`).toBeGreaterThanOrEqual(0.1);
      expect(rate, `Horde ${HORDES[i]}`).toBeLessThanOrEqual(0.9);
    }
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean, rates.join(' ')).toBeGreaterThanOrEqual(0.3);
    expect(mean, rates.join(' ')).toBeLessThanOrEqual(0.7);
  }, 600_000);

  it('a squad well under Recommended Power loses, and one well over wins', () => {
    for (const n of [10, 15]) {
      const rec = recommendedPower(n);
      let low = squadAt(n, 1);
      let high = squadAt(n, 1);
      for (let lv = 2; lv <= 200; lv++) {
        const g = squadAt(n, lv);
        if (squadPower(g) <= rec * 0.7) low = g;
        if (squadPower(high) < rec * 1.3) high = g;
      }
      let lowWins = 0;
      let highWins = 0;
      for (let seed = 1; seed <= 5; seed++) {
        if (wonWithNoCards(low, n, seed * 101)) lowWins++;
        if (wonWithNoCards(high, n, seed * 101)) highWins++;
      }
      expect(lowWins, `Horde ${n} at 70%`).toBeLessThanOrEqual(1);
      expect(highWins, `Horde ${n} at 130%`).toBeGreaterThanOrEqual(4);
    }
  }, 600_000);
});
