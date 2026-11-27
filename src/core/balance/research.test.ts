// Balance: a fully researched tree (ID-263) never turns a comfortable win into a loss. The cases
// are the golden test's winning Normal hordes (golden-normal.test.ts), each played unresearched
// and with every Research Center node, on three seeds; researching must not lose one the bare squad
// wins, and over all the fights it must win at least as many. Hordes 4 and 9 (the knife-edges)
// are probed separately, not asserted here.
import { beforeAll, describe, expect, it } from 'vitest';
import { TECH_IDS } from '../data.ts';
import { playSquadHorde } from '../sim.ts';
import { cacheFor } from './cache.ts';
import { squadAt } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** Horde and the gun level of its squad: the cases the golden test wins. */
const CASES: [number, number][] = [
  [1, 1],
  [4, 4],
  [5, 5],
  [10, 9],
  [20, 40],
  [30, 70],
  [50, 150],
];
const SEEDS = [11, 101, 202];

interface Played {
  n: number;
  level: number;
  seed: number;
  bare: boolean;
  researched: boolean;
}

describe('a fully researched tree (ID-263)', () => {
  const played: Played[] = [];
  beforeAll(() => {
    for (const [n, level] of CASES) {
      for (const seed of SEEDS) {
        played.push(
          keep(`${n} ${level} ${seed}`, (): Played => {
            const won = (tech: boolean): boolean =>
              playSquadHorde(
                { ...squadAt(n, level), ...(tech ? { tech: [...TECH_IDS] } : {}) },
                seed,
              ).outcome === 'won';
            return { n, level, seed, bare: won(false), researched: won(true) };
          }),
        );
      }
    }
  }, 600_000);

  it('loses no horde the bare squad wins', () => {
    for (const p of played) {
      if (p.bare)
        expect(p.researched, `Horde ${p.n} (level ${p.level}), seed ${p.seed}`).toBe(true);
    }
  });

  it('wins at least as many fights in all', () => {
    const bare = played.filter((p) => p.bare).length;
    const researched = played.filter((p) => p.researched).length;
    console.info(`Researched ${researched} of ${played.length} fights won, bare ${bare}`);
    expect(researched).toBeGreaterThanOrEqual(bare);
    expect(played.length).toBe(CASES.length * SEEDS.length);
  });
});
