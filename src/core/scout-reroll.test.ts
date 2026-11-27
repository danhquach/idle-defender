// ID-252: the World map's Reroll. It costs about one Safe-area Scrap find (half a win's Scrap at the
// best horde beaten, rounded up to 5, at least 10), replaces every area without a patrol with a
// new draw from the map's seed, and never touches anything else.
import { describe, expect, it } from 'vitest';
import { recruit } from './camp.ts';
import { AREA_IDS, MAP_DRAWS_MAX, MAP_PATROL, MAP_REROLL, type AreaId } from './data.ts';
import { newGame, type GameState } from './game.ts';
import { winScrap } from './hordeonly.ts';
import { topBeaten } from './modes.ts';
import {
  bestHorde,
  newMap,
  patrolAt,
  rerollCost,
  rerollMap,
  rerollRefusal,
  sendMapPatrol,
  takeReport,
  withMap,
} from './scout.ts';

const NOW = 1_700_000_000_000;

function camp(seed = 5, best = 9, scrap = 500): GameState {
  const g = newGame('horde');
  return withMap(
    {
      ...g,
      hordeNumber: best + 1,
      roster: [recruit(1)],
      reserve: [2, 3, 4, 5, 6, 7].map((n) => recruit(n)),
      camp: { ...g.camp, recruits: 7 },
      stock: { ...g.stock, scrap },
    },
    seed,
  );
}

/** `g` with patrols out at the areas in slots `slots`. */
function out(g: GameState, slots: number[]): GameState {
  return slots.reduce((acc, slot, i) => {
    const r = sendMapPatrol(acc, acc.map!.areas[slot]!.kind, [`recruit-${i + 2}`], 3, NOW);
    if (!r.ok) throw new Error(r.code);
    return r.game;
  }, g);
}

const kinds = (g: GameState): AreaId[] => g.map!.areas.map((a) => a.kind);
const reroll = (g: GameState) => {
  const r = rerollMap(g);
  if (!r.ok) throw new Error(r.code);
  return r;
};
const subsets = (): number[][] =>
  Array.from({ length: 15 }, (_, m) => [0, 1, 2, 3].filter((s) => (m + 1) & (1 << s))).filter(
    (s) => s.length <= 3,
  );

describe('rerollCost (ID-252)', () => {
  it('is half a win at the best horde, rounded up to 5, at least 10', () => {
    const cost = (best: number) => rerollCost(camp(5, best));
    expect([1, 2, 10, 20, 30, 50].map(cost)).toEqual([10, 10, 30, 55, 80, 130]);
    expect(MAP_REROLL).toEqual({ share: 0.5, min: 10, round: 5 });
  });

  it('is at least the minimum with nothing beaten yet', () => {
    expect(rerollCost(camp(5, 0))).toBe(MAP_REROLL.min);
  });

  it('reads the best horde on any mode, at Normal strength pay', () => {
    const g = { ...camp(5, 0), hordeNumber: 1, modes: { nightmare: 12 } };
    const top = topBeaten(g);
    expect(top).toBeGreaterThan(1);
    expect(bestHorde(g)).toBe(top);
    expect(rerollCost(g)).toBe(Math.max(10, Math.ceil(winScrap(top) / 10) * 5));
    const hell = { ...camp(5, 0), hordeNumber: 1, modes: { hell: 12 } };
    expect(topBeaten(hell)).toBeGreaterThan(top);
    expect(rerollCost(hell)).toBe(Math.max(10, Math.ceil(winScrap(topBeaten(hell)) / 10) * 5));
    expect(rerollCost(hell)).toBeGreaterThan(rerollCost(g));
  });

  it('stays a whole number at a very high best horde', () => {
    const c = rerollCost(camp(5, 1e6));
    expect(Number.isInteger(c)).toBe(true);
    expect(c).toBe(Math.ceil(winScrap(1e6) / 10) * 5);
    expect(rerollRefusal(camp(5, 1e6, 999))).toEqual({ ok: false, code: 'scrap', need: c });
  });
});

describe('rerollMap: refusals (ID-252)', () => {
  it('refuses with no map, the game unchanged', () => {
    const g = { ...camp(), map: undefined };
    expect(rerollRefusal(g)).toEqual({ ok: false, code: 'no-areas' });
    expect(rerollMap(g)).toEqual({ ok: false, code: 'no-areas' });
  });

  it('refuses when every area has a patrol out', () => {
    const g = out(camp(), [0, 1, 2, 3]);
    expect(rerollRefusal(g)).toEqual({ ok: false, code: 'areas-busy' });
    expect(rerollMap(g)).toEqual({ ok: false, code: 'areas-busy' });
  });

  it('refuses one Scrap short and takes exactly the cost otherwise, never below 0', () => {
    const g = camp();
    const cost = rerollCost(g);
    const short = { ...g, stock: { ...g.stock, scrap: cost - 1 } };
    expect(rerollMap(short)).toEqual({ ok: false, code: 'scrap', need: cost });
    const exact = reroll({ ...g, stock: { ...g.stock, scrap: cost } });
    expect(exact.game.stock.scrap).toBe(0);
    expect(exact.cost).toBe(cost);
    expect(reroll(g).game.stock.scrap).toBe(500 - cost);
  });
});

describe('rerollMap: what is replaced (ID-252)', () => {
  it('with no patrols out replaces all 4, none of its old kind, kinds unique', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = camp(seed);
      const r = reroll(g);
      expect(r.replaced).toBe(MAP_PATROL.areas);
      expect(new Set(kinds(r.game)).size).toBe(MAP_PATROL.areas);
      kinds(g).forEach((k, i) => expect(kinds(r.game)[i]).not.toBe(k));
      expect(r.game.map!.drawn).toBe(g.map!.drawn + MAP_PATROL.areas);
    }
  });

  it('keeps every area with a patrol, whole, and replaces the rest', () => {
    for (const slots of subsets()) {
      const g = out(camp(), slots);
      const r = reroll(g);
      expect(r.replaced).toBe(4 - slots.length);
      g.map!.areas.forEach((a, i) => {
        if (slots.includes(i)) expect(r.game.map!.areas[i]).toBe(a);
        else expect(r.game.map!.areas[i]!.kind).not.toBe(a.kind);
      });
      expect(r.game.map!.patrols).toEqual(g.map!.patrols);
      expect(new Set(kinds(r.game)).size).toBe(4);
    }
  });

  it('with 3 patrols out, the lone slot gets neither its old kind nor a kept one (20 seeds)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const free of [0, 1, 2, 3]) {
        const g = out(
          camp(seed),
          [0, 1, 2, 3].filter((s) => s !== free),
        );
        const r = reroll(g);
        const now = kinds(r.game);
        expect(now[free]).not.toBe(kinds(g)[free]);
        expect(new Set(now).size).toBe(4);
        expect(r.replaced).toBe(1);
      }
    }
  });

  it('keeps a patrol that is back but whose report is not taken', () => {
    const g = out(camp(), [1]);
    const p = g.map!.patrols[0]!;
    expect(p.backAt).toBeLessThan(NOW + 24 * 3_600_000);
    const r = reroll(g);
    expect(patrolAt(r.game, p.area)).toBe(p);
    expect(r.game.map!.areas[1]).toBe(g.map!.areas[1]);
  });

  it('prefers kinds not on the old map while one is free', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = camp(seed);
      const old = kinds(g);
      const now = kinds(reroll(g).game);
      // 6 kinds, 4 old: the first two new areas come from the 2 that were not on the map.
      expect(now.filter((k) => !old.includes(k)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('a reroll then a report keeps the kinds unique', () => {
    const g = out(camp(), [0]);
    const r = reroll(g);
    const t = takeReport(r.game, r.game.map!.areas[0]!.kind, g.map!.patrols[0]!.backAt);
    expect(t.ok).toBe(true);
    if (t.ok) expect(new Set(kinds(t.game)).size).toBe(4);
  });
});

describe('rerollMap: nothing else changes (ID-252)', () => {
  it('changes only Scrap, the draw count and the replaced areas; the input is untouched', () => {
    const g = out(camp(), [2]);
    const before = structuredClone(g);
    const r = reroll(g);
    expect(g).toEqual(before);
    const strip = (x: GameState) => {
      const c = structuredClone(x);
      c.stock.scrap = 0;
      c.map!.drawn = 0;
      c.map!.areas = [];
      return c;
    };
    expect(strip(r.game)).toEqual(strip(g));
    expect(r.game.map!.seed).toBe(g.map!.seed);
    expect(r.game.map!.sent).toBe(g.map!.sent);
  });
});

describe('rerollMap: seeded (ID-252)', () => {
  it('the same camp rerolls the same; another map seed rerolls differently', () => {
    expect(reroll(camp(7)).game).toEqual(reroll(camp(7)).game);
    expect(kinds(reroll(camp(7)).game)).not.toEqual(kinds(reroll(camp(8)).game));
  });

  it('a second reroll replaces again, from later draws', () => {
    const a = reroll(camp());
    const b = reroll(a.game);
    expect(b.game.map!.drawn).toBe(newMap(5).drawn + 8);
    kinds(a.game).forEach((k, i) => expect(kinds(b.game)[i]).not.toBe(k));
  });
});

describe('the draw count at its cap (ID-252)', () => {
  const atCap = (drawn: number): GameState => {
    const g = camp();
    return { ...g, map: { ...g.map!, drawn } };
  };

  it('a reroll clamps the count to MAP_DRAWS_MAX', () => {
    expect(reroll(atCap(MAP_DRAWS_MAX - 1)).game.map!.drawn).toBe(MAP_DRAWS_MAX);
    expect(reroll(atCap(MAP_DRAWS_MAX)).game.map!.drawn).toBe(MAP_DRAWS_MAX);
    expect(new Set(kinds(reroll(atCap(MAP_DRAWS_MAX)).game)).size).toBe(4);
  });

  it('a report clamps the count to MAP_DRAWS_MAX', () => {
    for (const drawn of [MAP_DRAWS_MAX - 1, MAP_DRAWS_MAX]) {
      const g = out(atCap(drawn), [0]);
      const t = takeReport(g, g.map!.areas[0]!.kind, g.map!.patrols[0]!.backAt);
      expect(t.ok).toBe(true);
      if (t.ok) expect(t.game.map!.drawn).toBe(MAP_DRAWS_MAX);
    }
  });

  it('there are more kinds than areas', () => {
    expect(AREA_IDS.length).toBeGreaterThan(MAP_PATROL.areas);
  });
});
