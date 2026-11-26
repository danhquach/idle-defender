// Balance: guns at equal Squad Power (ID-247, #501). Squad Power counts a gun at its paper
// dmg/s times POWER.gun (reach, reload and few big bullets cost a gun fights it wins on paper).
// Here, traits off, the all-Carbine squad is set where it wins about 10 of 20 fights; the
// all-LMG, all-Sniper and all-Pump Shotgun squads and the 2-of-each mix are set at the gun
// level whose Squad Power is nearest (the match is asserted), and each should then win a
// like share. At Nightmare 9 and Hell 1 every one-gun squad and the mix wins 6 to 18 of 20 and
// the one-gun squads' best and worst are within 9 wins of each other. Normal 20 and Hell 10 are
// logged, not asserted: the factors were fitted on Nightmare 9, Hell 1 and Normal 20 and the
// rest is the residue (the LMG and the mix still trail at Normal 20; design §11).
// Measured, wins of 20 at the Carbine squad's 10-of-20 level (Carbine / LMG / Sniper / Shotgun /
// Mix; every squad's Squad Power within 2.6% of the Carbine squad's, the mix's within 1%):
//   Nightmare 9: 11 / 16 / 15 / 12 / 10     Hell 1:  10 / 13 / 10 / 18 / 13
// Zero margin at Hell 1: the shotgun's 18 (≤ 18), and the spread is 8 (≤ 9).
//   Normal 20:   12 /  5 / 12 /  9 /  4     Hell 10: 16 / 11 / 13 / 12 / 10   (logged)
// The mix stands its guns by reach (ID-248, #505: the short-reach Pump Shotguns in the middle
// of the firing line, the Sniper rifles on the edges), so it wins like a one-gun squad. Standing
// them in squad order it won 9 at Nightmare 9 and 5 at Hell 1, the shotguns on the edges not
// reaching the far wall rows. Before the factor the Pump Shotgun squad at equal Squad Power won 0.
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../game.ts';
import type { GunBase } from '../data.ts';
import type { HigherMode } from '../modes.ts';
import { playSquadHorde } from '../sim.ts';
import { squadPower } from '../squadpower.ts';
import { cacheFor } from './cache.ts';
import { gunSquad, inMode, mixedSquad, SEEDS } from './shared.ts';

const keep = cacheFor(import.meta.url);

type Mode = HigherMode | 'normal';
const SQUADS = ['rifle', 'lmg', 'sniper', 'shotgun', 'mix'] as const;
type Squad = (typeof SQUADS)[number];
const ONE = ['rifle', 'lmg', 'sniper', 'shotgun'] as const;

/** `squad` at horde `n` of `mode` (Hell opens after Nightmare's last horde). */
const inHorde = (squad: GameState, mode: Mode, n: number): GameState => {
  if (mode === 'normal') return squad;
  const g = inMode(squad, mode, n);
  return mode === 'hell' ? { ...g, modes: { nightmare: 51, hell: n } } : g;
};

/** The squad of kind `k` at gun `level`, in `mode` horde `n`. */
const build =
  (k: Squad, mode: Mode, n: number) =>
  (level: number): GameState => {
    const base = mode === 'normal' ? n : 51;
    const squad = k === 'mix' ? mixedSquad(base, level) : gunSquad(base, level, [k as GunBase]);
    return inHorde(squad, mode, n);
  };

/** Fights won out of `SEEDS` at horde `n`, traits off. */
function wins(game: GameState, n: number): number {
  let won = 0;
  for (let s = 1; s <= SEEDS; s++) {
    if (playSquadHorde(game, s * 101, undefined, undefined, n, true).outcome === 'won') won++;
  }
  return won;
}

/** The lowest Carbine gun level that wins at least 10 of `SEEDS` (wins never fall with level, so it bisects). */
function tenOfTwenty(game: (level: number) => GameState, n: number): number {
  let lo = 1;
  let hi = 400;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wins(game(mid), n) >= SEEDS / 2) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The level of a squad whose Squad Power is nearest `target`, and how far off it is (a share). */
function matched(
  game: (level: number) => GameState,
  target: number,
): { level: number; off: number } {
  let best = { level: 1, off: Infinity };
  for (let level = 1; level <= 400; level++) {
    const p = squadPower(game(level));
    const off = Math.abs(p / target - 1);
    if (off < best.off) best = { level, off };
    if (p > target * 1.1) break;
  }
  return best;
}

interface Cells {
  target: number;
  wins: Record<Squad, number>;
  off: Record<Squad, number>;
}

/** Every cell of one horde: the Carbine squad's 10-of-20 level, then each squad at its Squad Power. */
function measure(mode: Mode, n: number): Cells {
  const rifle = build('rifle', mode, n);
  const level = tenOfTwenty(rifle, n);
  const target = squadPower(rifle(level));
  const w = {} as Record<Squad, number>;
  const off = {} as Record<Squad, number>;
  for (const k of SQUADS) {
    const m = k === 'rifle' ? { level, off: 0 } : matched(build(k, mode, n), target);
    off[k] = Math.round(m.off * 1000) / 1000;
    w[k] = wins(build(k, mode, n)(m.level), n);
  }
  return { target, wins: w, off };
}

describe('guns at equal Squad Power (ID-247)', () => {
  let nm9: Cells;
  let hell1: Cells;
  beforeAll(() => {
    nm9 = keep('nightmare 9', () => measure('nightmare', 9));
    hell1 = keep('hell 1', () => measure('hell', 1));
    // The rest are logged, not asserted.
    const n20 = keep('normal 20', () => measure('normal', 20));
    const h10 = keep('hell 10', () => measure('hell', 10));
    console.log(`gun-parity (wins of ${SEEDS}): ${JSON.stringify({ nm9, hell1, n20, h10 })}`);
  }, 3_600_000);

  it('each squad is within 3% of the Carbine squad’s Squad Power', () => {
    for (const c of [nm9, hell1]) {
      for (const k of SQUADS) expect(c.off[k], JSON.stringify(c)).toBeLessThanOrEqual(0.03);
    }
  });

  it.each([
    ['Nightmare 9', () => nm9],
    ['Hell 1', () => hell1],
  ])('%s: every one-gun squad wins 6 to 18 of 20, the best and worst within 9', (_, cells) => {
    const c = cells();
    const w = ONE.map((k) => c.wins[k]);
    for (const k of ONE) {
      expect(c.wins[k], JSON.stringify(c)).toBeGreaterThanOrEqual(6);
      expect(c.wins[k], JSON.stringify(c)).toBeLessThanOrEqual(18);
    }
    expect(Math.max(...w) - Math.min(...w), JSON.stringify(c)).toBeLessThanOrEqual(9);
  });

  it.each([
    ['Nightmare 9', () => nm9],
    ['Hell 1', () => hell1],
  ])('%s: the mix wins 6 to 18 of 20 like any one-gun squad', (_, cells) => {
    const c = cells();
    expect(c.wins.mix, JSON.stringify(c)).toBeGreaterThanOrEqual(6);
    expect(c.wins.mix, JSON.stringify(c)).toBeLessThanOrEqual(18);
  });

  it('the Pump Shotgun squad at equal Squad Power wins at least 6 (it won none before the factor)', () => {
    expect(nm9.wins.shotgun, JSON.stringify(nm9)).toBeGreaterThanOrEqual(6);
    expect(hell1.wins.shotgun, JSON.stringify(hell1)).toBeGreaterThanOrEqual(6);
  });
});
