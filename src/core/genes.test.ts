import { describe, expect, it } from 'vitest';
import {
  FIND,
  GENES,
  MATERIALS,
  MAX_COUNT,
  MUTANTS,
  START_STOCK,
  stockOf,
  type EnemyKind,
} from './data.ts';
import {
  finishHorde,
  hordeDrop,
  hordeFind,
  hordeGenes,
  hordePayout,
  newGame,
  startHorde,
} from './game.ts';
import { newHorde, removeDead, type HordeState } from './horde.ts';
import { rollDrop } from './armoury.ts';
import { chance, pick, rngFrom } from './rng.ts';
import { enemy, setup } from './testing.ts';

const NOW = 1_800_000_000_000;
type Ended = Pick<HordeState, 'hordeNumber' | 'outcome' | 'mutantKills' | 'boss'>;
const won = (hordeNumber: number, more: Partial<Ended> = {}): Ended => ({
  hordeNumber,
  outcome: 'won',
  mutantKills: 0,
  boss: null,
  ...more,
});

describe('resource inventory (ID-025)', () => {
  it('a new game starts with 3 Food and none of the other new resources', () => {
    expect(newGame().stock).toEqual(stockOf({ scrap: 60, wood: 60, food: 3 }));
    expect(START_STOCK).toEqual(newGame().stock);
    expect(Object.keys(stockOf())).toEqual(MATERIALS);
  });
});

describe('Mutated Genes (ID-025)', () => {
  it('a win pays base + 1 per 5 hordes', () => {
    expect(hordeGenes(won(1))).toBe(GENES.base);
    expect(hordeGenes(won(4))).toBe(2);
    expect(hordeGenes(won(5))).toBe(3);
    expect(hordeGenes(won(14))).toBe(4);
    expect(hordeGenes(won(15))).toBe(5);
  });

  it('adds 1 per 5 mutants killed, rounded down, and 10 for a boss horde', () => {
    expect(hordeGenes(won(1, { mutantKills: 4 }))).toBe(2);
    expect(hordeGenes(won(1, { mutantKills: 5 }))).toBe(3);
    expect(hordeGenes(won(1, { mutantKills: 23 }))).toBe(6);
    expect(hordeGenes(won(10, { boss: 'brood' }))).toBe(2 + 2 + GENES.boss);
    expect(hordeGenes(won(10, { boss: 'brood', mutantKills: 10 }))).toBe(16);
  });

  it('a loss pays none, whatever was killed', () => {
    expect(hordeGenes({ ...won(10, { boss: 'brood', mutantKills: 50 }), outcome: 'lost' })).toBe(0);
    const lost = hordePayout({
      ...won(9, { mutantKills: 50 }),
      outcome: 'lost',
      wave: 3,
      waveCount: 5,
    });
    expect(lost.genes).toBe(0);
  });

  it('the payout carries the Genes', () => {
    const pay = hordePayout({ ...won(5, { mutantKills: 5 }), wave: 5, waveCount: 5 });
    expect(pay.genes).toBe(4);
  });

  it('counts mutant kills only: not Shamblers, Runners or the Horror', () => {
    const s = newHorde(1, setup());
    const kinds: EnemyKind[] = [...MUTANTS, 'shambler', 'runner', 'horror'];
    for (const kind of kinds) enemy(s, { kind, hp: 0 });
    enemy(s, { kind: 'brute', hp: 5 }); // alive: not counted
    removeDead(s);
    expect(s.mutantKills).toBe(MUTANTS.length);
    removeDead(s); // the dead are gone, so nothing counts twice
    expect(s.mutantKills).toBe(MUTANTS.length);
  });
});

describe('material finds (ID-025)', () => {
  const horde = (seed: number, hordeNumber = 1, outcome: 'won' | 'lost' = 'won') => ({
    hordeNumber,
    outcome,
    rng: { s: seed },
  });

  it('about 20% of wins find one of the listed materials, base + 1 per 5 hordes', () => {
    let finds = 0;
    const seen = new Set<string>();
    for (let seed = 0; seed < 2000; seed++) {
      const f = hordeFind(horde(seed, 12));
      if (!f) continue;
      finds++;
      seen.add(f.material);
      expect(FIND.materials).toContain(f.material);
      expect(f.amount).toBe(FIND.base + 2);
    }
    expect(finds / 2000).toBeGreaterThan(0.16);
    expect(finds / 2000).toBeLessThan(0.24);
    expect([...seen].sort()).toEqual([...FIND.materials].sort());
  });

  it('a loss finds nothing; the same fight always finds the same', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(hordeFind(horde(seed, 3, 'lost'))).toBeNull();
      expect(hordeFind(horde(seed, 3))).toEqual(hordeFind(horde(seed, 3)));
    }
  });

  it("doesn't move the weapon drop's odds: the weapon takes the stream first, the find follows", () => {
    const game = newGame();
    const s = startHorde(game, 7, 'bob', 0, NOW);
    s.outcome = 'won';
    for (let seed = 0; seed < 300; seed++) {
      s.rng = { s: seed };
      // The stream by hand: the weapon roll, then the find's chance and pick.
      const rng = rngFrom({ s: seed });
      const weapon = rollDrop(rng, s.hordeNumber);
      const material = chance(rng, FIND.chance) ? pick(rng, FIND.materials) : null;
      expect(hordeDrop(game, s)?.weapon ?? null).toEqual(weapon);
      expect(hordeFind(s)?.material ?? null).toBe(material);
      expect(s.rng).toEqual({ s: seed }); // both read a copy of the fight's RNG
    }
  });

  it('finishHorde adds the Genes and the find exactly once', () => {
    const game = newGame();
    const s = startHorde(game, 1, 'bob', 0, NOW);
    s.outcome = 'won';
    s.mutantKills = 7;
    let seed = 0;
    for (; !hordeFind({ ...s, rng: { s: seed } }); seed++);
    s.rng = { s: seed };
    const find = hordeFind(s)!;
    const drop = hordeDrop(game, s);
    const next = finishHorde(game, s, NOW);
    const pay = hordePayout(s);
    expect(next.stock.genes).toBe(3); // 2 for Horde 1, 1 for 7 mutants
    for (const m of MATERIALS) {
      const extra =
        (m === find.material ? find.amount : 0) + (m === 'scrap' ? (drop?.scrap ?? 0) : 0);
      expect(next.stock[m], m).toBe(game.stock[m] + pay[m] + extra);
    }
  });

  it('caps every count at MAX_COUNT, so the save still loads', () => {
    const game = { ...newGame(), stock: stockOf({ scrap: MAX_COUNT, genes: MAX_COUNT }) };
    const s = startHorde(game, 1, 'bob', 0, NOW);
    s.outcome = 'won';
    const next = finishHorde(game, s, NOW);
    expect(next.stock.scrap).toBe(MAX_COUNT);
    expect(next.stock.genes).toBe(MAX_COUNT);
  });
});
