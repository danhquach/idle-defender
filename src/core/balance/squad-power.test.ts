// Balance: Recommended Power (ID-098, ID-102, ID-128). A squad at a horde's Recommended
// Power, with the scripted player's cards and skills (an average build; no player fights
// without cards), wins about half its fights there (see shared.ts for the seeds).
import { describe, expect, it } from 'vitest';
import type { GameState } from '../game.ts';
import { playSquadHorde } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { cacheFor } from './cache.ts';
import { squadAt } from './shared.ts';

const SEEDS = 10;

/** Horde `n`'s expected squad whose Squad Power is nearest `target`. */
function squadNear(n: number, target: number): GameState {
  let best = squadAt(n, 1);
  for (let lv = 2; lv <= 200; lv++) {
    const g = squadAt(n, lv);
    if (Math.abs(squadPower(g) - target) < Math.abs(squadPower(best) - target)) best = g;
  }
  return best;
}

const keep = cacheFor(import.meta.url);

/**
 * Fights won at horde `n` over `seeds` seeds, played with the scripted player's cards and
 * skills, by the squad nearest `share` of its Recommended Power.
 */
function wins(n: number, share: number, seeds: number): number {
  return keep(`${n} ${share} ${seeds}`, () => {
    const game = squadNear(n, recommendedPower(n) * share);
    let won = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      if (playSquadHorde(game, seed * 101, undefined, undefined, n).outcome === 'won') won++;
    }
    return won;
  });
}

describe('Recommended Power (ID-098, ID-128)', () => {
  const HORDES = [9, 12, 15, 20];
  it('a squad at Recommended Power, with the scripted player’s cards, wins about half the time', () => {
    const rates = HORDES.map((n) => wins(n, 1, SEEDS) / SEEDS);
    for (const [i, rate] of rates.entries()) {
      expect(rate, `Horde ${HORDES[i]}`).toBeGreaterThanOrEqual(0.2);
      expect(rate, `Horde ${HORDES[i]}`).toBeLessThanOrEqual(0.8);
    }
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean, rates.join(' ')).toBeGreaterThanOrEqual(0.35);
    expect(mean, rates.join(' ')).toBeLessThanOrEqual(0.65);
  }, 600_000);

  it('a squad well under Recommended Power loses, and one well over wins', () => {
    for (const n of [10, 15]) {
      expect(wins(n, 0.7, 5), `Horde ${n} at 70%`).toBeLessThanOrEqual(1);
      expect(wins(n, 1.3, 5), `Horde ${n} at 130%`).toBeGreaterThanOrEqual(4);
    }
  }, 600_000);
});
