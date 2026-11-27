// ID-263: researched nodes raise their cards' offer weight, capped, and change nothing without research.
import { describe, expect, it } from 'vitest';
import { offerWeights, rollOffer, TECH_AMMO_CARDS, TECH_CARDS, UPGRADE_IDS } from './cards.ts';
import { TECH_FX, TECH_IDS, type TechId } from './data.ts';
import { newHorde, type HordeState, type UpgradeId } from './horde.ts';
import { SQUAD_CARDS } from './hordeonly.ts';
import { createRng } from './rng.ts';
import { setup } from './testing.ts';

const POOL: UpgradeId[] = [...SQUAD_CARDS];
const state = (tech?: readonly TechId[], cards?: readonly UpgradeId[]): HordeState => {
  const s = newHorde(1, { ...setup(), ...(tech ? { tech } : {}), ...(cards ? { cards } : {}) });
  s.wave = 3;
  return s;
};
const BIG = POOL.length;

describe('offerWeights', () => {
  it('is all 1 with nothing researched or only wall nodes', () => {
    expect(offerWeights(POOL, []).every((w) => w === 1)).toBe(true);
    expect(
      offerWeights(POOL, ['reinforced-wall', 'steel-plating', 'spiked-wall']).every((w) => w === 1),
    ).toBe(true);
  });

  it('adds 15% a researched node to its branch’s cards: Barbed Wire x1.45, ammo cards x1.30', () => {
    const pool: UpgradeId[] = [...TECH_AMMO_CARDS, 'barbed-wire', 'oil-bomb', 'sharpshooter'];
    // A big pool of fillers keeps the cap out of it.
    const roomy = [...pool, ...UPGRADE_IDS.filter((id) => !pool.includes(id))];
    const w = offerWeights(roomy, [...TECH_IDS]);
    const at = (id: UpgradeId) => w[roomy.indexOf(id)]!;
    expect(at('barbed-wire')).toBeCloseTo(1.45, 9);
    expect(at('oil-bomb')).toBeCloseTo(1.45, 9);
    for (const id of TECH_AMMO_CARDS) expect(at(id)).toBeCloseTo(1.3, 9);
    expect(at('sharpshooter')).toBe(1);
    expect(offerWeights(roomy, ['razor-wire'])[roomy.indexOf('barbed-wire')]).toBeCloseTo(1.15, 9);
  });

  it('the wider five-card ammo list differs from the exclusive slot’s two', () => {
    expect([...TECH_AMMO_CARDS].sort()).toEqual(
      [
        'hollow-points',
        'incendiary-rounds',
        'piercing-rounds',
        'scavenged-ammo',
        'shock-rounds',
      ].sort(),
    );
    expect(TECH_CARDS.wall).toEqual([]);
  });

  it('caps all the extra weight at 25% of the pool, scaling every extra alike (pools of 7, 9, 10 and the real one)', () => {
    const full: readonly TechId[] = TECH_IDS;
    for (const n of [7, 9, 10, UPGRADE_IDS.length]) {
      const pool = [
        ...TECH_AMMO_CARDS,
        'barbed-wire' as UpgradeId,
        'oil-bomb' as UpgradeId,
        ...UPGRADE_IDS.filter(
          (id) => !TECH_AMMO_CARDS.includes(id) && id !== 'barbed-wire' && id !== 'oil-bomb',
        ),
      ].slice(0, n);
      const w = offerWeights(pool, full);
      const extra = w.reduce((a, b) => a + (b - 1), 0);
      const uncapped =
        0.15 * (pool.includes('barbed-wire') ? 3 : 0) +
        0.15 * (pool.includes('oil-bomb') ? 3 : 0) +
        0.15 * 2 * pool.filter((id) => TECH_AMMO_CARDS.includes(id)).length;
      expect(extra).toBeCloseTo(Math.min(uncapped, TECH_FX.weight.cap * pool.length), 9);
      expect(w.every((x) => x >= 1)).toBe(true);
    }
    // At 7 the cap binds: the ratio between two extras is kept.
    const small: UpgradeId[] = [...TECH_AMMO_CARDS, 'barbed-wire', 'oil-bomb'];
    const w = offerWeights(small, full);
    expect((w[5]! - 1) / (w[0]! - 1)).toBeCloseTo(0.45 / 0.3, 9);
    expect(w.reduce((a, b) => a + (b - 1), 0)).toBeCloseTo(0.25 * 7, 9);
  });
});

describe('offers', () => {
  const seq = (s: HordeState, seed: number, n: number) => {
    const rng = createRng(seed);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(JSON.stringify(rollOffer(rng, s)));
    return { out, after: rng() };
  };

  it('no tech, tech [] and only wall nodes roll the very same offers and leave the RNG where it was', () => {
    const base = seq(state(), 7, 200);
    expect(seq(state([]), 7, 200)).toEqual(base);
    expect(seq(state(['reinforced-wall', 'steel-plating']), 7, 200)).toEqual(base);
    expect('tech' in state([])).toBe(false);
  });

  it('is deterministic for a seed, and a researched card shows up more often', () => {
    const full = state([...TECH_IDS]);
    expect(seq(full, 3, 50)).toEqual(seq(full, 3, 50));
    const share = (s: HordeState): number => {
      const rng = createRng(11);
      let wire = 0;
      let rare = 0;
      for (let i = 0; i < 20000; i++) {
        for (const c of rollOffer(rng, s)) {
          if (c.kind === 'upgrade' && c.id === 'barbed-wire') wire++;
          if (c.kind === 'upgrade') rare++;
        }
      }
      return wire / rare;
    };
    const plain = share(state());
    const boosted = share(state(['razor-wire', 'thick-coils', 'electric-wire']));
    expect(boosted).toBeGreaterThan(plain * 1.2);
    expect(boosted).toBeLessThan(plain * 1.6);
  });

  it('keeps the common cards’ shares when the whole tree is researched', () => {
    const count = (s: HordeState): Map<string, number> => {
      const rng = createRng(5);
      const m = new Map<string, number>();
      for (let i = 0; i < 20000; i++)
        for (const c of rollOffer(rng, s))
          if (c.kind === 'upgrade') m.set(c.id, (m.get(c.id) ?? 0) + 1);
      return m;
    };
    const a = count(state());
    const b = count(state([...TECH_IDS]));
    for (const id of ['sharpshooter', 'rapid-fire', 'long-sight']) {
      expect(b.get(id)! / a.get(id)!, id).toBeGreaterThan(0.97);
      expect(b.get(id)! / a.get(id)!, id).toBeLessThan(1.03);
    }
    expect(BIG).toBeGreaterThan(0);
  });
});
