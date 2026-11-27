// Balance: the Research Center (ID-263, retuned in ID-265).
// A fully researched tree never turns a comfortable win into a loss. The cases
// are the golden test's winning Normal hordes (golden-normal.test.ts), each played unresearched
// and with every Research Center node, on three seeds; researching must not lose one the bare squad
// wins, and over all the fights it must win at least as many. Hordes 4 and 9 (the knife-edges)
// are probed separately, not asserted here.
// The retune (ID-265): research HP ramp (`SQUAD_RESEARCH_HP`) keeps the reference player (65% of
// the Scrap earned spent on research, `refplayer.ts`) where today's unresearched player stands, so
// (a) a player with 40% researched at Recommended Power is never stuck (the floor), and (b) research
// helps: both players face the ramp, and at a little under Recommended Power the reference player
// wins more than one with none. That skipping research is harder than before holds by construction
// (the ramp is above 1 from Horde 31, pinned by researchHp(40) === factor in research-hp.test.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { TECH_IDS } from '../data.ts';
import type { Mode } from '../modes.ts';
import { playSquadHorde } from '../sim.ts';
import { cacheFor } from './cache.ts';
import { REF_SHARE_LOW } from './refplayer.ts';
import {
  levelAbove,
  SEEDS as FIGHTS,
  squadAbove,
  squadAt,
  squadIn,
  wins,
  withRef,
} from './shared.ts';

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

/** Where the stuck guard plays: Normal 30, 40, 50 and Nightmare 10, 30, the hordes the research HP ramp reaches. */
const GUARD: [Mode, number][] = [
  ['normal', 30],
  ['normal', 40],
  ['normal', 50],
  ['nightmare', 10],
  ['nightmare', 30],
];

/** The fights of the skip-research metric: the guard's hordes but Nightmare 30. */
const SKIP: [Mode, number][] = GUARD.slice(0, 4);

/**
 * The gap's floor (a share of the fights): the reference player's wins less the unresearched
 * player's, pooled over 240 fights. The run saw 130 against 107, a gap of 0.096 (Normal
 * 30 0, as the reference player owns no node there, Normal 40 +9, Normal 50 +13, Nightmare 10 +1); the floor leaves about 3% for noise.
 */
const SKIP_FLOOR = 0.065;

describe('the research retune (ID-265)', () => {
  // The 40% player (4 nodes at Normal 40, 11 at Nightmare 30) at Recommended Power may lose
  // fights but is never stuck: at least 8 of 20 seeds won at every horde the ramp reaches.
  it.each(GUARD)(
    'a player with 40% researched at Recommended Power is never stuck: %s %i',
    (mode, n) => {
      const won = keep(`stuck ${mode} ${n}`, () =>
        wins(withRef(squadAbove(mode, n, 1), n, REF_SHARE_LOW), n, FIGHTS),
      );
      expect(won, `${mode} Horde ${n}: ${won} of ${FIGHTS}`).toBeGreaterThanOrEqual(8);
    },
    3_600_000,
  );

  it('skipping research is harder: the reference player wins more than one with none', () => {
    let bare = 0;
    let ref = 0;
    let fights = 0;
    for (const [mode, n] of SKIP) {
      const rec = levelAbove(mode, n, 1);
      for (const level of [rec - 3, rec - 2, rec - 1]) {
        const game = squadIn(mode, n, level);
        const r = keep(`skip ${mode} ${n} ${level}`, () => ({
          bare: wins(game, n, FIGHTS),
          ref: wins(withRef(game, n), n, FIGHTS),
        }));
        bare += r.bare;
        ref += r.ref;
        fights += FIGHTS;
      }
    }
    const gap = (ref - bare) / fights;
    console.info(
      `Skip research: reference ${ref}, none ${bare} of ${fights} fights won, gap ${gap.toFixed(3)}`,
    );
    expect(gap, `reference ${ref}, none ${bare} of ${fights}`).toBeGreaterThanOrEqual(SKIP_FLOOR);
  }, 3_600_000);
});
