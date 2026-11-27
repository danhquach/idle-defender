// ID-263: the Research Center's table and buying rules.
import { describe, expect, it } from 'vitest';
import { TECH, TECH_BRANCHES, TECH_IDS, type TechId } from './data.ts';
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
  it('has 11 nodes in 4 branches, costing 9,300 in all', () => {
    expect(TECH_IDS.length).toBe(11);
    expect(Object.keys(TECH).sort()).toEqual([...TECH_IDS].sort());
    expect(TECH_BRANCHES.map((b) => b.id)).toEqual(['wall', 'wire', 'ammo', 'mortars']);
    expect(TECH_IDS.reduce((sum, id) => sum + TECH[id].cost, 0)).toBe(9300);
  });

  it('puts each prerequisite before its node, one tier below, in the same branch', () => {
    TECH_IDS.forEach((id, i) => {
      const { needs, tier, branch } = TECH[id];
      if (needs === null) return expect(tier).toBe(1);
      expect(TECH_IDS.indexOf(needs)).toBeLessThan(i);
      expect(TECH[needs].tier).toBe(tier - 1);
      expect(TECH[needs].branch).toBe(branch);
    });
    expect(unlocksOf('reinforced-wall')).toEqual(['steel-plating']);
    expect(unlocksOf('spiked-wall')).toEqual([]);
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
    expect(techRefusal(withScrap(0, ['razor-wire']), 'razor-wire')).toBe('Already researched');
    expect(techRefusal(withScrap(0), 'thick-coils')).toBe('Needs Razor Wire');
    expect(techRefusal(withScrap(599, ['razor-wire']), 'thick-coils')).toBe('Needs 600 Scrap');
    expect(techRefusal(withScrap(600, ['razor-wire']), 'thick-coils')).toBeNull();
    expect(techRefusal(withScrap(9e9), '__proto__' as TechId)).toBe('Unknown upgrade');
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
      if (!r.ok) throw new Error(r.reason);
      g = r.game;
    }
    expect(g.tech).toEqual(['reinforced-wall', 'razor-wire', 'hand-loads', 'quick-mortars']);
  });

  it('refuses without spending, and a refused buy returns the reason', () => {
    const r = researchTech(withScrap(100), 'reinforced-wall');
    expect(r).toEqual({ ok: false, reason: 'Needs 200 Scrap' });
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
    // With every Tier 1 node bought, only Tier 2 is open: 300 (Quick Mortars) is gone, 600 is the least.
    const tier1: TechId[] = ['reinforced-wall', 'razor-wire', 'hand-loads', 'quick-mortars'];
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
