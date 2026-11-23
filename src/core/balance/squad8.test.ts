// Balance: a bigger squad's late Normal (ID-224). Recommended Power counts the squad's size
// (`squadSize`), so it means the same for a squad of 6 and of 8: each at its own Recommended
// Power wins about as often at Normal Hordes 30, 40 and 50, and neither meets a wall well over it.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { SQUAD_CAP, SQUAD_CAP_MAX } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { squadSize } from '../hordeonly.ts';
import { createRng } from '../rng.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { xpForLevel } from '../stats.ts';
import { cacheFor } from './cache.ts';
import { SEEDS, wins } from './shared.ts';

const keep = cacheFor(import.meta.url);
const HORDES = [30, 40, 50] as const;
const SIZES = [SQUAD_CAP, SQUAD_CAP_MAX] as const;

/** A squad of `size` at Normal Horde `n` (level 25, Military Rifles), survivor i's gun at `levels[i]`. */
function squadOfSize(size: number, n: number, levels: number[]): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: n,
    roster: Array.from({ length: size }, (_, i) => ({
      ...recruit(i + 1),
      xp: xpForLevel(25),
      loadout: {
        primary: rollWeapon(createRng(i + 7), `h${i + 1}`, 'rifle', 'military', levels[i]!),
        secondary: null,
        item: null,
      },
    })),
    camp: { ...g.camp, recruits: size },
    slots: { squad: Math.max(0, size - SQUAD_CAP), stash: 0 },
  };
}

/**
 * The squad of `size` nearest `share` of its own Recommended Power at Horde `n`: every gun at
 * one level, then the first k a level up, so it lands within about 1% (a level is a 6% step).
 */
function squadAtShare(size: number, n: number, share: number): GameState {
  const at = (levels: number[]) => squadOfSize(size, n, levels);
  const target = recommendedPower(n, 'normal', size) * share;
  let base = 1;
  while (base < 400 && squadPower(at(Array(size).fill(base + 1))) <= target) base++;
  let best = at(Array(size).fill(base));
  for (let k = 1; k <= size; k++) {
    const g = at(Array.from({ length: size }, (_, i) => (i < k ? base + 1 : base)));
    if (Math.abs(squadPower(g) - target) < Math.abs(squadPower(best) - target)) best = g;
  }
  expect(squadSize(best)).toBe(size);
  return best;
}

const won = (size: number, n: number, share: number, seeds: number): number =>
  keep(`${size} ${n} ${share} ${seeds}`, () => wins(squadAtShare(size, n, share), n, seeds));

describe('a bigger squad’s late Normal (ID-224)', () => {
  it('a squad of 6 and of 8, each at its own Recommended Power, win alike at Hordes 30, 40, 50', () => {
    for (const n of HORDES) {
      const [six, eight] = SIZES.map((size) => won(size, n, 1, SEEDS));
      const msg = `Horde ${n}: 6 won ${six}/${SEEDS}, 8 won ${eight}/${SEEDS}`;
      for (const w of [six!, eight!]) {
        expect(w, msg).toBeGreaterThanOrEqual(0.3 * SEEDS);
        expect(w, msg).toBeLessThanOrEqual(0.9 * SEEDS);
      }
      expect(Math.abs(six! - eight!), msg).toBeLessThanOrEqual(0.3 * SEEDS);
    }
  }, 3_600_000);

  // No wall: either size at 130% of its Recommended Power wins on most of 10 seeds.
  it('a squad of 6 or 8 well over Recommended Power does not lose repeatedly', () => {
    for (const n of HORDES) {
      for (const size of SIZES) {
        expect(
          won(size, n, 1.3, 10),
          `squad of ${size}, Horde ${n} at 130%`,
        ).toBeGreaterThanOrEqual(8);
      }
    }
  }, 3_600_000);
});
