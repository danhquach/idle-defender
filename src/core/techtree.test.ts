// ID-263: the Research Center's table and buying rules.
import { describe, expect, it } from 'vitest';
import { TECH, TECH_BRANCHES, TECH_CARD, TECH_IDS, TECH_TABS, type TechId } from './data.ts';
import { newGame, type GameState } from './game.ts';
import {
  cleanTech,
  researchTech,
  techOf,
  techReady,
  techRefusal,
  techState,
  unlocksOf,
} from './techtree.ts';

const withScrap = (scrap: number, tech?: TechId[]): GameState => {
  const g = newGame('horde');
  return { ...g, stock: { ...g.stock, scrap }, ...(tech ? { tech } : {}) };
};

describe('the table', () => {
  it('has 29 nodes in 9 branches, costing 47,600 in all (ID-284: 14, 25,800 before)', () => {
    expect(TECH_IDS.length).toBe(29);
    expect(Object.keys(TECH).sort()).toEqual([...TECH_IDS].sort());
    expect(TECH_BRANCHES).toEqual([
      'wall',
      'wire',
      'ammo',
      'mortars',
      'incendiary',
      'shock',
      'frag',
      'flashbang',
      'molotov',
    ]);
    expect(TECH_IDS.reduce((sum, id) => sum + TECH[id].cost, 0)).toBe(47600);
    const kit = TECH_IDS.filter((id) => TECH_TABS.kit.includes(TECH[id].branch as never));
    expect(kit.length).toBe(15);
    expect(kit.reduce((sum, id) => sum + TECH[id].cost, 0)).toBe(21800);
    // The first 14 ids keep their place: the order is save format.
    expect(TECH_IDS.slice(0, 14)[13]).toBe('tar-moat');
    expect(
      TECH_IDS.filter((id) => TECH[id].tier < 4 && !kit.includes(id)).reduce(
        (sum, id) => sum + TECH[id].cost,
        0,
      ),
    ).toBe(9300);
  });

  it('gives each of the two tabs its branches, and every branch to one tab', () => {
    expect(TECH_TABS.upgrades).toEqual(['wall', 'wire', 'ammo', 'mortars']);
    expect(TECH_TABS.kit).toEqual(['incendiary', 'shock', 'frag', 'flashbang', 'molotov']);
    expect([...TECH_TABS.upgrades, ...TECH_TABS.kit]).toEqual([...TECH_BRANCHES]);
  });

  it('an unlock is its card (the node id is the card id) and no card of the pool is gated by it', () => {
    for (const id of [
      'incendiary-rounds',
      'shock-rounds',
      'frag-grenades',
      'flashbang',
      'molotov',
    ] as const) {
      expect(TECH[id].tier).toBe(1);
      expect(TECH[`${id}-mk2`].needs).toEqual([id]);
      expect(TECH[`${id}-mk3`].needs).toEqual([`${id}-mk2`]);
      expect(Object.keys(TECH_CARD)).not.toContain(id);
    }
    expect(TECH_IDS.slice(14)).toEqual([
      'incendiary-rounds',
      'incendiary-rounds-mk2',
      'incendiary-rounds-mk3',
      'shock-rounds',
      'shock-rounds-mk2',
      'shock-rounds-mk3',
      'frag-grenades',
      'frag-grenades-mk2',
      'frag-grenades-mk3',
      'flashbang',
      'flashbang-mk2',
      'flashbang-mk3',
      'molotov',
      'molotov-mk2',
      'molotov-mk3',
    ]);
  });

  it('puts each prerequisite before its node, one tier below, in the same branch', () => {
    TECH_IDS.forEach((id, i) => {
      const { needs, tier, branch } = TECH[id];
      if (tier === 1) return expect(needs).toEqual([]);
      expect(needs.length).toBe(tier === 4 ? 2 : 1);
      for (const n of needs) expect(TECH_IDS.indexOf(n)).toBeLessThan(i);
      // The first parent is the same-row one, a tier below; a combo's second is another row's.
      expect(TECH[needs[0]!].branch).toBe(branch);
      if (tier < 4) expect(TECH[needs[0]!].tier).toBe(tier - 1);
    });
    expect(unlocksOf('reinforced-wall')).toEqual(['steel-plating']);
    expect(unlocksOf('spiked-wall')).toEqual(['wall-machine-gun', 'tar-moat']);
    expect(unlocksOf('steel-plating')).toEqual(['spiked-wall', 'shock-net']);
    expect(unlocksOf('wall-machine-gun')).toEqual([]);
  });
});

describe('states and refusals', () => {
  it('a Tier 1 node is open, the next locked until it is bought, a bought one done', () => {
    const g = withScrap(0);
    expect(techOf(g)).toEqual([]);
    expect(techState(g, 'razor-wire')).toBe('open');
    expect(techState(g, 'thick-coils')).toBe('locked');
    expect(techState(withScrap(0, ['razor-wire']), 'thick-coils')).toBe('open');
    expect(techState(withScrap(0, ['razor-wire']), 'razor-wire')).toBe('done');
  });

  it('refuses in order: already researched, prerequisite, then Scrap', () => {
    expect(techRefusal(withScrap(0, ['razor-wire']), 'razor-wire')).toEqual({
      ok: false,
      code: 'researched',
    });
    expect(techRefusal(withScrap(0), 'thick-coils')).toEqual({
      ok: false,
      code: 'needs-tech',
      node: 'razor-wire',
    });
    expect(techRefusal(withScrap(599, ['razor-wire']), 'thick-coils')).toEqual({
      ok: false,
      code: 'tech-scrap',
      need: 600,
    });
    expect(techRefusal(withScrap(600, ['razor-wire']), 'thick-coils')).toBeNull();
    expect(techRefusal(withScrap(9e9), '__proto__' as TechId)).toEqual({
      ok: false,
      code: 'unknown-tech',
    });
  });
});

const COMBOS: [TechId, [TechId, TechId]][] = [
  ['wall-machine-gun', ['armour-piercing', 'spiked-wall']],
  ['shock-net', ['electric-wire', 'steel-plating']],
  ['tar-moat', ['napalm-mortar', 'spiked-wall']],
];
/** Every node but the combos, so only a combo's own rule decides. */
const TIERS_1_3 = TECH_IDS.filter((id) => TECH[id].tier < 4);

describe('Tier 4 combos (ID-264)', () => {
  for (const [id, [a, b]] of COMBOS) {
    it(`${id}: refused with neither parent or one, naming the first missing; open with both`, () => {
      // None of the two parents: the first is named.
      const none = withScrap(1e9, ['razor-wire']);
      expect(techRefusal(none, id)).toEqual({ ok: false, code: 'needs-tech', node: a });
      expect(techState(none, id)).toBe('locked');
      // A has its own chain; give A's chain without B's, and B's without A's.
      const chain = (x: TechId): TechId[] => {
        const out: TechId[] = [];
        const walk = (n: TechId): void => {
          for (const p of TECH[n].needs) walk(p);
          if (!out.includes(n)) out.push(n);
        };
        walk(x);
        return out;
      };
      const withA = cleanTech(chain(a));
      const withB = cleanTech(chain(b));
      expect(withA).toContain(a);
      expect(withB).toContain(b);
      expect(techRefusal(withScrap(1e9, withA), id)).toEqual({
        ok: false,
        code: 'needs-tech',
        node: b,
      });
      expect(techRefusal(withScrap(1e9, withB), id)).toEqual({
        ok: false,
        code: 'needs-tech',
        node: a,
      });
      expect(techState(withScrap(1e9, withA), id)).toBe('locked');
      const both = cleanTech([...chain(a), ...chain(b)]);
      expect(techRefusal(withScrap(TECH[id].cost - 1, both), id)).toEqual({
        ok: false,
        code: 'tech-scrap',
        need: TECH[id].cost,
      });
      expect(techRefusal(withScrap(TECH[id].cost, both), id)).toBeNull();
      expect(techState(withScrap(0, both), id)).toBe('open');
      const bought = researchTech(withScrap(TECH[id].cost, both), id);
      expect(bought.ok && bought.game.tech).toEqual(cleanTech([...both, id]));
    });
  }

  it('cleanTech drops all three combos when Reinforced Wall goes (the wall chain feeds them), and a combo before its parents', () => {
    const all = [...TECH_IDS];
    expect(cleanTech(all)).toEqual(all);
    const noWall = all.filter((id) => id !== 'reinforced-wall');
    expect(cleanTech(noWall)).toEqual(
      TIERS_1_3.filter((id) => !['reinforced-wall', 'steel-plating', 'spiked-wall'].includes(id)),
    );
    expect(cleanTech(['wall-machine-gun', 'shock-net', 'tar-moat'])).toEqual([]);
    // One parent short: the combo goes, its other parents stay.
    expect(cleanTech(all.filter((id) => id !== 'armour-piercing'))).not.toContain(
      'wall-machine-gun',
    );
    expect(cleanTech(all.filter((id) => id !== 'armour-piercing'))).toContain('tar-moat');
  });

  it('a combo is not a prerequisite of anything and ends the chart (unlocks none)', () => {
    for (const [id] of COMBOS) expect(unlocksOf(id)).toEqual([]);
  });
});

describe('researchTech', () => {
  it('takes exactly the cost, returns a new game, and leaves the old one alone', () => {
    const g = withScrap(1000);
    const frozen = JSON.stringify(g);
    const r = researchTech(g, 'reinforced-wall');
    expect(r.ok && r.cost).toBe(200);
    expect(r.ok && r.game.stock.scrap).toBe(800);
    expect(r.ok && r.game.tech).toEqual(['reinforced-wall']);
    expect(JSON.stringify(g)).toBe(frozen);
    const exact = researchTech(withScrap(200), 'reinforced-wall');
    expect(exact.ok && exact.game.stock.scrap).toBe(0);
  });

  it('keeps the list in table order whatever order it is bought in', () => {
    let g = withScrap(1e6);
    for (const id of ['hand-loads', 'razor-wire', 'quick-mortars', 'reinforced-wall'] as const) {
      const r = researchTech(g, id);
      if (!r.ok) throw new Error(r.code);
      g = r.game;
    }
    expect(g.tech).toEqual(['reinforced-wall', 'razor-wire', 'hand-loads', 'quick-mortars']);
  });

  it('refuses without spending, and a refused buy returns the reason', () => {
    const r = researchTech(withScrap(100), 'reinforced-wall');
    expect(r).toEqual({ ok: false, code: 'tech-scrap', need: 200 });
  });

  it('a game with nothing researched has no tech key', () => {
    expect('tech' in newGame('horde')).toBe(false);
  });
});

describe('techReady (the top bar’s dot)', () => {
  it('is on only while an open node is affordable', () => {
    expect(techReady(withScrap(199))).toBe(false);
    expect(techReady(withScrap(200))).toBe(true);
    expect(techReady(withScrap(1e9, [...TECH_IDS]))).toBe(false);
    // With every Tier 1 node of the four Upgrades branches and the five unlocks bought, only Tier 2 is
    // open: 300 (Quick Mortars) is gone, 600 is the least.
    const tier1: TechId[] = [
      'reinforced-wall',
      'razor-wire',
      'hand-loads',
      'quick-mortars',
      'incendiary-rounds',
      'shock-rounds',
      'frag-grenades',
      'flashbang',
      'molotov',
    ];
    // The new unlocks open a node at 500: the dot is lit by them too.
    expect(
      techReady(withScrap(500, ['reinforced-wall', 'razor-wire', 'hand-loads', 'quick-mortars'])),
    ).toBe(true);
    expect(techReady(withScrap(599, tier1))).toBe(false);
    expect(techReady(withScrap(600, tier1))).toBe(true);
  });
});

describe('cleanTech', () => {
  it('keeps known ids once each in table order and drops what lost its prerequisite', () => {
    expect(cleanTech([...TECH_IDS].reverse())).toEqual([...TECH_IDS]);
    expect(cleanTech(['spiked-wall', 'steel-plating'])).toEqual([]);
    expect(
      cleanTech(['steel-plating', 'reinforced-wall', 'reinforced-wall', 'x', 7, null]),
    ).toEqual(['reinforced-wall', 'steel-plating']);
  });
});
