// Balance: no single card carries a squad well under Recommended Power (ID-124; see
// shared.ts). A squad at 70% of Hordes 10 and 15's Recommended Power holds one card at max
// from the start and takes no other, using its skills as the scripted player does: it must
// still lose on most seeds. Frag Grenades and Incendiary Rounds deal a share of the wave's
// Shambler HP, so they neither crush early hordes nor fade late.
import { describe, expect, it } from 'vitest';
import { CARD } from '../data.ts';
import type { GameState } from '../game.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { squadCanCrit, tick, type HordeState, type UpgradeId } from '../horde.ts';
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
  ['aim-for-the-head', 3],
  ['hollow-point-rounds', 3],
];

/** Cards tuned together (ID-130): the crit pair at max, crit chance × crit damage. */
const PAIRS: readonly [string, [UpgradeId, number][]][] = [
  [
    'Aim for the Head and Hollow Points',
    [
      ['aim-for-the-head', 3],
      ['hollow-point-rounds', 3],
    ],
  ],
];

/**
 * The strongest squad for Horde `n` at or under 70% of its Recommended Power: Military
 * Rifles, or Common ones where even level 1 Military is over it (ID-128: Recommended Power
 * fitted to the card build).
 */
function squadUnder(n: number): GameState {
  const cap = 0.7 * recommendedPower(n);
  let low: GameState | null = null;
  for (const rarity of ['military', 'common'] as const) {
    // Power rises with the gun's level, so the first squad over the cap ends the search.
    for (let lv = 1; lv <= 200; lv++) {
      const g = squadAt(n, lv, undefined, rarity);
      if (squadPower(g) > cap) break;
      if (!low || squadPower(g) > squadPower(low)) low = g;
    }
  }
  if (!low) throw new RangeError(`no squad under 70% of Horde ${n}'s Recommended Power`);
  return low;
}

/** Horde `n` with `cards` (id, level) held from the start, every offer turned down. */
function won(game: GameState, n: number, seed: number, cards: [UpgradeId, number][]): boolean {
  let s: HordeState = startSquadHorde(game, seed, 0, n);
  s.taken = cards.map(([id]) => id);
  s.cardLevels = Object.fromEntries(cards);
  // As the picks would: the first grenade is thrown at once; Sharpshooter's steps add up.
  if (s.taken.includes('frag-grenades')) s.nextFragAt = 0;
  const sharp = s.cardLevels.sharpshooter ?? 0;
  s.mods.damage = 1 + CARD.step.damage * sharp;
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
      // Rifles crit, so Hollow Points alone acts and its row below is a real check (ID-130).
      expect(squadCanCrit(startSquadHorde(squads.get(n)!, 1, 0, n)), `Horde ${n}`).toBe(true);
    }
  });

  it.each(CARDS)(
    '%s at level %i alone still loses Hordes 10 and 15 on most seeds',
    (id, lv) => {
      for (const n of HORDES) {
        let wins = 0;
        for (let seed = 1; seed <= SEEDS; seed++)
          if (won(squads.get(n)!, n, seed * 101, [[id, lv]])) wins++;
        expect(wins, `Horde ${n}: ${wins} of ${SEEDS} won`).toBeLessThanOrEqual(MOST_LOST);
      }
    },
    600_000,
  );

  it.each(PAIRS)(
    '%s, both at max, still lose Hordes 10 and 15 on most seeds',
    (_, cards) => {
      for (const n of HORDES) {
        let wins = 0;
        for (let seed = 1; seed <= SEEDS; seed++)
          if (won(squads.get(n)!, n, seed * 101, cards)) wins++;
        expect(wins, `Horde ${n}: ${wins} of ${SEEDS} won`).toBeLessThanOrEqual(MOST_LOST);
      }
    },
    600_000,
  );
});
