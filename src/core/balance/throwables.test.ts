// Balance: the throwable slot (ID-139; see shared.ts). Frag Grenades, Flashbang and Molotov
// share one slot, so each must be the best pick somewhere and not everywhere: a real
// horde-only fight is played on every seed with one throwable picked at the start, no other
// card taken and no skill picked. Each wins one scene and loses another. The margins are a
// few seeds, so each scene plays twice the usual seeds. A canary: the fights are seeded, so
// it is not flaky, but any retune of a throwable, the guns or the hordes can flip a 2-seed
// lead; re-measure the scenes then (the table is in each failure) and move them with a note.
import { beforeAll, describe, expect, it } from 'vitest';
import { recruit } from '../camp.ts';
import { chooseCard } from '../cards.ts';
import { newGame, type GameState } from '../game.ts';
import { tick, type HordeState, type UpgradeId } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { SEEDS, squadAt } from './shared.ts';

const THROWABLES = ['frag-grenades', 'flashbang', 'molotov'] as const satisfies UpgradeId[];

/** Horde `n` with `size` fresh survivors, each with the Pistol they start with. */
function fresh(n: number, size: number): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: n,
    roster: Array.from({ length: size }, (_, i) => ({ ...recruit(i + 1), xp: 0 })),
    camp: { ...g.camp, recruits: size },
  };
}

/** Wins over `2 × SEEDS` seeds with `card` picked at the start; every offer turned down. */
function wins(game: GameState, card: UpgradeId): number {
  let won = 0;
  for (let seed = 1; seed <= 2 * SEEDS; seed++) {
    let s: HordeState = startSquadHorde({ ...game, skillPick: [] }, seed, 0);
    s = chooseCard({ ...s, offer: [{ kind: 'upgrade', id: card }] }, 0);
    s.offer = null;
    while (s.outcome === 'fighting') {
      if (s.time > 1500) throw new RangeError(`seed ${seed} never ended`);
      if (s.offer) s = { ...s, offer: null };
      s = tick(s, 0.5);
    }
    if (s.outcome === 'won') won += 1;
  }
  return won;
}

/** The scenes: each throwable's wins. */
const SCENES = {
  /** A lone survivor at Horde 2: a grenade's pause stops all its fire. */
  lone: () => fresh(2, 1),
  /** Two fresh survivors at Horde 4. */
  pair: () => fresh(4, 2),
  /** Horde 6's full squad on level 1 Carbines: big groups to hold off. */
  line: () => squadAt(6, 1),
};

describe('each throwable is the best pick on one scene and not on another (ID-139)', () => {
  const won = new Map<string, Map<UpgradeId, number>>();
  beforeAll(() => {
    for (const [name, scene] of Object.entries(SCENES)) {
      const game = scene();
      won.set(name, new Map(THROWABLES.map((id) => [id, wins(game, id)])));
    }
  }, 600_000);
  const table = (name: string): string => JSON.stringify(Object.fromEntries(won.get(name)!));
  /** Whether `id` wins more than both other throwables in scene `name`. */
  const best = (name: string, id: UpgradeId): boolean => {
    const m = won.get(name)!;
    return THROWABLES.every((o) => o === id || m.get(id)! > m.get(o)!);
  };

  // Measured: Molotov 11, Frag 7, Flashbang 2 (of 40).
  it('Molotov is the best pick for a lone survivor, and not for a pair', () => {
    expect(best('lone', 'molotov'), table('lone')).toBe(true);
    expect(best('pair', 'molotov'), table('pair')).toBe(false);
  });

  // Measured: Frag 9, Molotov 2, Flashbang 0 (of 40).
  it('Frag Grenades is the best pick for a pair, and not for the full line', () => {
    expect(best('pair', 'frag-grenades'), table('pair')).toBe(true);
    expect(best('line', 'frag-grenades'), table('line')).toBe(false);
  });

  // Measured: Flashbang 11, Frag 9, Molotov 9 (of 40).
  it('Flashbang is the best pick for the full line, and not for a lone survivor', () => {
    expect(best('line', 'flashbang'), table('line')).toBe(true);
    expect(best('lone', 'flashbang'), table('lone')).toBe(false);
  });
});
