// Balance: no single card carries a squad well under Recommended Power (ID-124; see
// shared.ts). A squad at 70% of Hordes 10 and 15's Recommended Power holds one card at max
// from the start and takes no other, using its skills as the scripted player does: it must
// still lose on most seeds. Frag Grenades and Incendiary Rounds deal a share of the wave's
// Shambler HP, so they neither crush early hordes nor fade late.
import { describe, expect, it } from 'vitest';
import type { GameState } from '../game.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { tick, type HordeState, type UpgradeId } from '../horde.ts';
import { useSkills } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { squadAt } from './shared.ts';

const SEEDS = 10;
const HORDES = [10, 15] as const;
/** Most seeds lost: at most this many won of `SEEDS`. */
const MOST_LOST = 4;

/** Each card at its max (Sharpshooter, uncapped, at five picks: +50% damage). */
const CARDS: readonly [UpgradeId, number][] = [
  ['frag-grenades', 1],
  ['incendiary-rounds', 3],
  ['piercing-rounds', 3],
  ['concussion-rounds', 1],
  ['ricochet', 3],
  ['sharpshooter', 5],
];

/** The strongest squad for Horde `n` at or under 70% of its Recommended Power. */
function squadUnder(n: number): GameState {
  const cap = 0.7 * recommendedPower(n);
  let low = squadAt(n, 1);
  // Power rises with the gun's level, so the first squad over the cap ends the search.
  for (let lv = 2; lv <= 200; lv++) {
    const g = squadAt(n, lv);
    if (squadPower(g) > cap) break;
    low = g;
  }
  return low;
}

/** Horde `n` with card `id` held at `level` from the start, every offer turned down. */
function won(game: GameState, n: number, seed: number, id: UpgradeId, level: number): boolean {
  let s: HordeState = startSquadHorde(game, seed, 0, n);
  s.taken = [id];
  s.cardLevels = { [id]: level };
  // As the pick would: the first grenade is thrown at once.
  if (id === 'frag-grenades') s.nextFragAt = 0;
  while (s.outcome === 'fighting') {
    if (s.time > 3600) throw new RangeError(`seed ${seed}, Horde ${n} never ended`);
    s = s.offer ? { ...s, offer: null } : tick(useSkills(s), 0.5);
  }
  return s.outcome === 'won';
}

describe('no one card carries a squad at 70% of Recommended Power (ID-124)', () => {
  const squads = new Map(HORDES.map((n) => [n, squadUnder(n)]));

  it('each squad is at most 70% of its horde’s Recommended Power, and not far under', () => {
    for (const n of HORDES) {
      const share = squadPower(squads.get(n)!) / recommendedPower(n);
      expect(share, `Horde ${n}`).toBeLessThanOrEqual(0.7);
      expect(share, `Horde ${n}`).toBeGreaterThan(0.65);
    }
  });

  it.each(CARDS)(
    '%s at level %i alone still loses Hordes 10 and 15 on most seeds',
    (id, lv) => {
      for (const n of HORDES) {
        let wins = 0;
        for (let seed = 1; seed <= SEEDS; seed++)
          if (won(squads.get(n)!, n, seed * 101, id, lv)) wins++;
        expect(wins, `Horde ${n}: ${wins} of ${SEEDS} won`).toBeLessThanOrEqual(MOST_LOST);
      }
    },
    600_000,
  );
});
