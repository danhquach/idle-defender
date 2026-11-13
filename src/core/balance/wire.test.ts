// Balance: Barbed Wire is worth levelling (ID-133; see shared.ts). Its rows keep their wear
// across wave breaks and are rebuilt only at a level-up, and their durability grows with the
// wave's size, so a level 1 row wears out over a late horde while a max one holds. Measured
// in the scripted horde-only campaign, at the first try of each horde, with the wire held from
// the start at one level for the whole fight (offers of it turned down, so no rebuild).
import { beforeAll, describe, expect, it } from 'vitest';
import { chooseCard } from '../cards.ts';
import { newGame, type GameState } from '../game.ts';
import { rebuildWire, tick, type HordeState } from '../horde.ts';
import { finishSquadHorde, highestBeaten, startSquadHorde } from '../hordeonly.ts';
import { gearUp, playSquadHorde, spendAll, SQUAD_FARM, squadPick, useSkills } from '../sim.ts';
import { cacheFor } from './cache.ts';

const keep = cacheFor(import.meta.url);

const SEEDS = 2;
const HORDES = [5, 10, 15] as const;
const LEVELS = [1, 2, 3] as const;
const LAST = 15;

interface Share {
  /** Time-weighted share of rows working during the last wave fought. */
  last: number;
  /** The same over the whole fight. */
  whole: number;
}

/**
 * Horde `n` of `game` with Barbed Wire held at `level` from the start (offers of it turned
 * down): the share of its rows working during the last wave fought (the horde's last, or the
 * one a lost fight fell in) and during the whole fight.
 */
function working(game: GameState, seed: number, n: number, level: number): Share {
  let s: HordeState = startSquadHorde(game, seed, 0, n);
  s.taken = [...s.taken, 'barbed-wire'];
  s.cardLevels = { ...s.cardLevels, 'barbed-wire': level };
  rebuildWire(s);
  let wave = 0;
  let [last, looks, whole, all] = [0, 0, 0, 0];
  while (s.outcome === 'fighting') {
    if (s.time > 3600) throw new RangeError(`seed ${seed}, Horde ${n} never ended`);
    if (s.offer) {
      const i = squadPick(s);
      const c = s.offer[i]!;
      const wire = c.kind === 'upgrade' && c.id === 'barbed-wire';
      // Turning the wire down needs another card to take; one alone would level it up.
      if (wire && s.offer.length < 2) throw new RangeError(`seed ${seed}: a lone wire offer`);
      s = chooseCard(s, wire ? (i + 1) % s.offer.length : i);
      continue;
    }
    s = tick(useSkills(s), 0.5);
    if (s.enemies.length === 0) continue;
    if (s.wave !== wave) [wave, last, looks] = [s.wave, 0, 0];
    const up = s.wire.filter((r) => r.durability > 0).length / s.wire.length;
    [last, looks, whole, all] = [last + up, looks + 1, whole + up, all + 1];
  }
  return { last: looks > 0 ? last / looks : 1, whole: all > 0 ? whole / all : 1 };
}

describe('Barbed Wire is worth levelling (ID-133)', () => {
  const key = (n: number, lv: number) => `${n} ${lv}`;
  const shares = new Map<string, Share[]>();
  beforeAll(() => {
    for (let k = 1; k <= SEEDS; k++) {
      const seed = k * 1000;
      const measured = keep(`campaign ${k}`, () => {
        const out: [string, Share][] = [];
        let game = newGame('horde');
        let farm = 0;
        const done = new Set<number>();
        for (let i = 0; i < LAST * 12 && game.hordeNumber <= LAST; i++) {
          const n = farm > 0 ? highestBeaten(game) : game.hordeNumber;
          if (farm === 0 && (HORDES as readonly number[]).includes(n) && !done.has(n)) {
            done.add(n);
            for (const lv of LEVELS) out.push([key(n, lv), working(game, seed + i, n, lv)]);
          }
          const horde = playSquadHorde(game, seed + i, 3600, undefined, n);
          game = gearUp(spendAll(finishSquadHorde(game, horde)));
          if (farm > 0) farm--;
          else if (horde.outcome !== 'won' && n > 1) farm = SQUAD_FARM.replays;
        }
        return out;
      });
      for (const [at, share] of measured) shares.set(at, [...(shares.get(at) ?? []), share]);
    }
  }, 900_000);

  const mean = (n: number, lv: number, of: keyof Share) => {
    const a = shares.get(key(n, lv)) ?? [];
    expect(a, `Horde ${n}, Lv ${lv} measured on every seed`).toHaveLength(SEEDS);
    return a.reduce((t, x) => t + x[of], 0) / a.length;
  };

  it('a max-level row holds through most of the last wave fought at every horde', () => {
    for (const n of HORDES) expect(mean(n, 3, 'last'), `Horde ${n}`).toBeGreaterThanOrEqual(0.85);
  });

  it('a level 1 row holds most of an early horde', () => {
    expect(mean(5, 1, 'whole')).toBeGreaterThanOrEqual(0.75);
  });

  it('late, each level holds more of the fight than the one below, by 5 points or more', () => {
    for (const n of [10, 15]) {
      for (const lv of [2, 3]) {
        expect(mean(n, lv, 'whole'), `Horde ${n}, Lv ${lv}`).toBeGreaterThanOrEqual(
          mean(n, lv - 1, 'whole') + 0.05,
        );
      }
    }
  });

  it('late, a level 1 row wears out: under half of the last wave fought', () => {
    for (const n of [10, 15]) expect(mean(n, 1, 'last'), `Horde ${n}`).toBeLessThan(0.5);
  });
});
