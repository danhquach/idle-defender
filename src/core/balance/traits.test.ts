// Balance: enemy traits against gun classes (ID-237, design §11). The older balance checks keep
// the one-class (Carbine) squad and replay it with traits on. These are the mixed squad's
// own: in Hell Horde 1, at the level where the 2 LMG / 2 Carbine / 2 Sniper / 2 Pump Shotgun
// squad just holds the horde with traits off, (a) turning traits on leaves the mix about
// where it was; at equal Squad Power (b) an all-Light squad and (c) an all-Heavy squad lose
// wins to the traits, (d) the mix loses fewer than the Light squad, and (e) with traits on the
// mix beats the Light squad. Nightmare Horde 9 is measured the same way and logged, not
// asserted. Medium alone is not asserted: it saturates, and the guns do not match at equal
// Squad Power (follow-up ID-247, #501).
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../game.ts';
import type { GunBase } from '../data.ts';
import type { HigherMode } from '../modes.ts';
import { playSquadHorde } from '../sim.ts';
import { squadPower } from '../squadpower.ts';
import { cacheFor } from './cache.ts';
import { gunSquad, inMode, mixedSquad, SEEDS, withRef } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** `squad` in `mode` at its horde `n` (Hell opens after Nightmare's last horde). */
const inHorde = (squad: GameState, mode: HigherMode, n: number): GameState => {
  const g = inMode(squad, mode, n);
  return mode === 'hell' ? { ...g, modes: { nightmare: 51, hell: n } } : g;
};

/** Fights won out of `seeds` at horde `n`, with the traits `on` or off, with the reference player's research (ID-265). */
function winsWith(game: GameState, n: number, seeds: number, on: boolean): number {
  let won = 0;
  const ref = withRef(game, n);
  for (let s = 1; s <= seeds; s++) {
    if (playSquadHorde(ref, s * 101, undefined, undefined, n, !on).outcome === 'won') won++;
  }
  return won;
}

/** The lowest gun level whose squad wins most of 5 seeds with the traits off (wins never fall with level, so it bisects). */
function holdOff(game: (level: number) => GameState, n: number): number {
  let lo = 1;
  let hi = 400;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (winsWith(game(mid), n, 5, false) >= 3) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The level of a one-gun squad whose Squad Power is nearest `target`, and how far off it is (a share). */
function matched(
  game: (level: number) => GameState,
  target: number,
): { level: number; off: number } {
  let best = { level: 1, off: Infinity };
  for (let level = 1; level <= 400; level++) {
    const off = Math.abs(squadPower(game(level)) / target - 1);
    if (off < best.off) best = { level, off };
    if (squadPower(game(level)) > target * 1.1) break;
  }
  return best;
}

interface Cells {
  level: number;
  off: number;
  mixOff: number;
  mixOn: number;
  lightOff: number;
  lightOn: number;
  heavyOff: number;
  heavyOn: number;
}

/** Every cell of one mode's check: the mix's own hold level, then the squads at its Squad Power. */
function measure(mode: HigherMode, n: number): Cells {
  const mix = (level: number): GameState => inHorde(mixedSquad(51, level), mode, n);
  const one =
    (base: GunBase) =>
    (level: number): GameState =>
      inHorde(gunSquad(51, level, [base]), mode, n);
  const level = holdOff(mix, n);
  const target = squadPower(mix(level));
  const light = matched(one('lmg'), target);
  const heavy = matched(one('sniper'), target);
  const worst = Math.max(light.off, heavy.off);
  return {
    level,
    off: worst,
    mixOff: winsWith(mix(level), n, SEEDS, false),
    mixOn: winsWith(mix(level), n, SEEDS, true),
    lightOff: winsWith(one('lmg')(light.level), n, SEEDS, false),
    lightOn: winsWith(one('lmg')(light.level), n, SEEDS, true),
    heavyOff: winsWith(one('sniper')(heavy.level), n, SEEDS, false),
    heavyOn: winsWith(one('sniper')(heavy.level), n, SEEDS, true),
  };
}

describe('enemy traits against gun classes (ID-237)', () => {
  let hell: Cells;
  let nightmare: Cells;
  beforeAll(() => {
    hell = keep('hell 1 mix', () => measure('hell', 1));
    nightmare = keep('nightmare 9 mix', () => measure('nightmare', 9));
    // Nightmare is reported, not asserted.
    console.log(`traits Nightmare 9 (of ${SEEDS}): ${JSON.stringify(nightmare)}`);
    console.log(`traits Hell 1 (of ${SEEDS}): ${JSON.stringify(hell)}`);
  }, 3_600_000);

  // ID-247: 3%, not 2%: with the LMG counted at 0.74 a gun level is 2.7% of its Squad Power.
  it('the squads compared are within 3% of the mix’s Squad Power', () => {
    expect(hell.off).toBeLessThanOrEqual(0.03);
  });

  // ID-248: 5, not 4: the firing line by gun reach lifts the traits-off mix (13 → 15 of 20)
  // more than the traits-on one (10). Measured 5: zero margin.
  it('(a) Hell 1: the mix with traits on is within 5 wins of the mix with them off', () => {
    expect(Math.abs(hell.mixOn - hell.mixOff), JSON.stringify(hell)).toBeLessThanOrEqual(5);
  });

  it('(b) an all-Light squad at equal Squad Power loses at least 5 wins to the traits', () => {
    expect(hell.lightOff - hell.lightOn, JSON.stringify(hell)).toBeGreaterThanOrEqual(5);
  });

  it('(c) an all-Heavy squad loses at least 3 wins', () => {
    expect(hell.heavyOff - hell.heavyOn, JSON.stringify(hell)).toBeGreaterThanOrEqual(3);
  });

  it('(d) the mix loses fewer wins than the all-Light squad', () => {
    expect(hell.mixOff - hell.mixOn, JSON.stringify(hell)).toBeLessThan(
      hell.lightOff - hell.lightOn,
    );
  });

  it('(e) with traits on, the mix wins at least 3 more than the all-Light squad', () => {
    expect(hell.mixOn, JSON.stringify(hell)).toBeGreaterThanOrEqual(hell.lightOn + 3);
  });
});
