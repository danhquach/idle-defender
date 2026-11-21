// ID-209: a won horde can drop a blueprint (a gun type, no rarity) as well as its gun; a
// blueprint and Scrap craft that gun at once, its rarity rolled by how much Scrap went in.
import { describe, expect, it } from 'vitest';
import { affixCount, gunLevel, type OwnedWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import {
  BLUEPRINT,
  CRAFT,
  CRAFT_MADE_MAX,
  FARM,
  RARITY_ORDER,
  STASH_CAP,
  WEAPONS,
  type Rarity,
  type WeaponId,
} from './data.ts';
import {
  BLUEPRINT_GUNS,
  blueprintCount,
  blueprintsOf,
  craftAmounts,
  craftOdds,
  craftSteps,
  rollBlueprint,
  withBlueprint,
} from './craft.ts';
import { newGame, type GameState } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  craftGun,
  craftRefusal,
  finishSquadHorde,
  salvageBlueprint,
  squadDrop,
  startSquadHorde,
} from './hordeonly.ts';

const NOW = 1_700_000_000_000;

function camp(scrap: number, blueprints: GameState['craft'] = undefined, stash = 0): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 13,
    roster: [recruit(1), recruit(2)],
    camp: { ...g.camp, recruits: 2 },
    armoury: Array.from({ length: stash }, (_, i) => ({
      uid: `h${i + 1}`,
      base: 'smg' as const,
      rarity: 'rusty' as const,
      affixes: [],
      level: 1,
    })),
    stock: { ...g.stock, scrap },
    ...(blueprints ? { craft: blueprints } : {}),
  };
}

const have = (base: WeaponId, n = 1, made = 0): GameState['craft'] => ({
  blueprints: { [base]: n },
  made,
});

const sum = (r: Record<Rarity, number>): number => RARITY_ORDER.reduce((t, k) => t + r[k], 0);

describe('blueprint constants (ID-209)', () => {
  it('start from the ticket’s guesses', () => {
    expect(BLUEPRINT.chance).toBe(0.15);
    expect(BLUEPRINT.salvage).toBe(5);
    expect(CRAFT.min).toBe(20);
    expect(CRAFT.step).toBe(20);
    expect(CRAFT.steps).toBe(10);
    expect(CRAFT.from).toEqual({ rusty: 30, common: 45, military: 20, prototype: 5, relic: 0 });
    expect(CRAFT.to).toEqual({ rusty: 0, common: 20, military: 45, prototype: 30, relic: 5 });
  });

  it('name guns only, never the free pistol', () => {
    expect(BLUEPRINT_GUNS.length).toBeGreaterThan(0);
    for (const b of BLUEPRINT_GUNS) {
      expect(['gun', 'sidearm']).toContain(WEAPONS[b].kind);
      expect(b).not.toBe('pistol');
    }
  });
});

describe('craft odds (ID-209)', () => {
  it('the minimum gives the horde drop odds, the cap the best, Relic only up there', () => {
    expect(craftOdds(20)).toEqual(CRAFT.from);
    expect(craftOdds(20 + 10 * 20)).toEqual(CRAFT.to);
    expect(craftOdds(20).relic).toBe(0);
    expect(craftOdds(220).relic).toBe(5);
  });

  it('moves evenly step by step and always sums to 100', () => {
    expect(craftOdds(120)).toEqual({
      rusty: 15,
      common: 32.5,
      military: 32.5,
      prototype: 17.5,
      relic: 2.5,
    });
    for (const amount of craftAmounts()) expect(sum(craftOdds(amount))).toBeCloseTo(100, 9);
    let before = craftOdds(20);
    for (const amount of craftAmounts().slice(1)) {
      const now = craftOdds(amount);
      expect(now.rusty).toBeLessThanOrEqual(before.rusty);
      expect(now.relic).toBeGreaterThanOrEqual(before.relic);
      expect(now.prototype).toBeGreaterThanOrEqual(before.prototype);
      before = now;
    }
  });

  it('lists 11 amounts, 20 to 220 in steps of 20; an amount between counts as the step below', () => {
    expect(craftAmounts()).toEqual([20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220]);
    expect(craftSteps(20)).toBe(0);
    expect(craftSteps(59)).toBe(1);
    expect(craftSteps(60)).toBe(2);
    expect(craftSteps(5)).toBe(0);
    expect(craftSteps(1e9)).toBe(10);
    expect(craftOdds(1e9)).toEqual(CRAFT.to);
    expect(craftOdds(-5)).toEqual(CRAFT.from);
  });
});

describe('blueprint drops (ID-209)', () => {
  const won = (game: GameState, horde: number, seed: number): HordeState => ({
    ...startSquadHorde(game, seed, NOW, horde),
    outcome: 'won',
  });
  const SEEDS = Array.from({ length: 2000 }, (_, i) => i + 1);

  it('drops on about 15% of seeds, at most one, always a blueprint gun, replayable', () => {
    const rolls = SEEDS.map((s) => rollBlueprint(s));
    const hits = rolls.filter((r) => r !== null);
    expect(hits.length / SEEDS.length).toBeGreaterThan(0.12);
    expect(hits.length / SEEDS.length).toBeLessThan(0.18);
    for (const r of hits) expect(BLUEPRINT_GUNS).toContain(r);
    expect(new Set(hits).size).toBe(BLUEPRINT_GUNS.length);
    expect(SEEDS.map((s) => rollBlueprint(s))).toEqual(rolls);
  });

  it('a won horde’s drop carries it; a loss drops none', () => {
    const g = camp(0);
    for (const s of SEEDS.slice(0, 200)) {
      const h = won(g, 3, s);
      expect(squadDrop(g, h)?.blueprint ?? null).toBe(rollBlueprint(s));
      expect(squadDrop(g, { ...h, outcome: 'lost' })).toBeNull();
    }
  });

  it('finishing a win adds it to the game, a count per gun type; the stash drop is unchanged', () => {
    const g = camp(0);
    const seed = SEEDS.find((s) => rollBlueprint(s) !== null)!;
    const none = SEEDS.find((s) => rollBlueprint(s) === null)!;
    const base = rollBlueprint(seed)!;
    const after = finishSquadHorde(g, won(g, 3, seed));
    expect(blueprintCount(after, base)).toBe(1);
    expect(blueprintsOf(after)).toEqual([{ base, count: 1 }]);
    expect(after.armoury).toHaveLength(squadDrop(g, won(g, 3, seed))!.bonus.length + 1);
    const second = finishSquadHorde(after, won(after, 4, seed));
    expect(blueprintCount(second, base)).toBe(2);
    const quiet = finishSquadHorde(g, won(g, 3, none));
    expect(quiet.craft).toBeUndefined();
    expect(blueprintsOf(quiet)).toEqual([]);
  });

  it('never goes past the cap per gun type', () => {
    const base = BLUEPRINT_GUNS[0]!;
    const full = withBlueprint(have(base, BLUEPRINT.cap), base);
    expect(full.blueprints[base]).toBe(BLUEPRINT.cap);
    expect(withBlueprint(undefined, base)).toEqual({ blueprints: { [base]: 1 }, made: 0 });
  });

  it('a replay past the farm cap drops no blueprint either', () => {
    const g = camp(0);
    const seed = SEEDS.find((s) => rollBlueprint(s) !== null)!;
    const farmed = { ...g, farm: { replays: FARM.maxReplays, badLuck: 0 } };
    expect(squadDrop(farmed, won(farmed, 3, seed))).toBeNull();
    expect(finishSquadHorde(farmed, won(farmed, 3, seed)).craft).toBeUndefined();
  });
});

describe('craftGun (ID-209)', () => {
  const base = BLUEPRINT_GUNS[0]!;

  it('makes the gun at once: stash, level of the highest horde beaten, affixes for its rarity', () => {
    const g = camp(500, have(base, 2));
    const r = craftGun(g, base, 120);
    if (!r.ok) throw new Error(r.reason);
    expect(r.cost).toBe(120);
    expect(r.weapon.base).toBe(base);
    expect(gunLevel(r.weapon)).toBe(12);
    expect(r.weapon.affixes).toHaveLength(affixCount(base, r.weapon.rarity));
    expect(r.weapon.uid).toBe('f1');
    expect(r.game.armoury).toEqual([...g.armoury, r.weapon]);
    expect(r.game.craft).toEqual({ blueprints: { [base]: 1 }, made: 1 });
    expect(r.game.stock.scrap).toBe(380);
  });

  it('uses the last blueprint up and keeps the count of guns made', () => {
    const r = craftGun(camp(500, have(base, 1, 4)), base, 20);
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.craft).toEqual({ blueprints: {}, made: 5 });
    expect(r.weapon.uid).toBe('f5');
    expect(blueprintsOf(r.game)).toEqual([]);
  });

  it('is level 1 with no horde beaten yet, and rolls only rarities the amount allows', () => {
    const g = { ...camp(1000, have(base, 99)), hordeNumber: 1 };
    const seen = new Set<Rarity>();
    let game = g;
    for (let i = 0; i < 60; i++) {
      const r = craftGun(game, base, 20);
      if (!r.ok) throw new Error(r.reason);
      expect(gunLevel(r.weapon)).toBe(1);
      expect(r.weapon.rarity).not.toBe('relic');
      seen.add(r.weapon.rarity);
      game = { ...r.game, armoury: [], stock: { ...r.game.stock, scrap: 1000 } };
    }
    expect([...seen].sort()).toEqual(['common', 'military', 'prototype', 'rusty']);
  });

  it('a high amount never rolls Rusty and can roll Relic', () => {
    let game = camp(1e9, have(base, 99));
    const seen = new Set<Rarity>();
    for (let i = 0; i < 300; i++) {
      const r = craftGun(game, base, 220);
      if (!r.ok) throw new Error(r.reason);
      seen.add(r.weapon.rarity);
      game = {
        ...r.game,
        armoury: [],
        craft: have(base, 99, r.game.craft!.made),
        stock: { ...r.game.stock, scrap: 1e9 },
      };
    }
    expect(seen.has('rusty')).toBe(false);
    expect(seen.has('relic')).toBe(true);
  });

  it('is replayable: the same game and amount make the same gun', () => {
    const g = camp(500, have(base, 3, 7));
    const a = craftGun(g, base, 100);
    const b = craftGun(structuredClone(g), base, 100);
    expect(a).toEqual(b);
  });

  it('rolls near the shown odds over many crafts', () => {
    const counts: Record<Rarity, number> = {
      rusty: 0,
      common: 0,
      military: 0,
      prototype: 0,
      relic: 0,
    };
    const N = 3000;
    for (let made = 0; made < N; made++) {
      const r = craftGun(camp(500, have(base, 1, made)), base, 120);
      if (!r.ok) throw new Error(r.reason);
      counts[r.weapon.rarity] += 1;
    }
    const odds = craftOdds(120);
    for (const k of RARITY_ORDER) expect(counts[k] / N).toBeCloseTo(odds[k] / 100, 1);
  });

  it('refuses, changing nothing: no blueprint, a bad amount, a full stash, short Scrap', () => {
    const g = camp(100, have(base, 1));
    const other = BLUEPRINT_GUNS.find((b) => b !== base)!;
    expect(craftGun(g, other, 20)).toEqual({ ok: false, reason: 'No blueprint for that gun' });
    for (const bad of [0, 19, 30, 240, 1e9, -20, NaN, 20.5, Infinity]) {
      expect(craftGun(g, base, bad), `amount ${bad}`).toMatchObject({ ok: false });
    }
    expect(craftGun(g, base, 120)).toEqual({ ok: false, reason: 'Needs 20 more Scrap' });
    expect(craftGun(camp(500, have(base, 1), STASH_CAP), base, 20)).toEqual({
      ok: false,
      reason: 'Stash full',
    });
    expect(craftGun(camp(19, have(base, 1)), base, 20)).toEqual({
      ok: false,
      reason: 'Needs 1 more Scrap',
    });
    expect(g.craft).toEqual(have(base, 1));
    expect(g.stock.scrap).toBe(100);
  });

  it('stash slots bought make room', () => {
    const g = { ...camp(500, have(base, 1), STASH_CAP), slots: { squad: 0, stash: 1 } };
    expect(craftGun(g, base, 20).ok).toBe(true);
  });
});

describe('craftRefusal (ID-209)', () => {
  const base = BLUEPRINT_GUNS[0]!;
  it('agrees with craftGun: null when it goes ahead, else the same reason', () => {
    const cases: [GameState, number][] = [
      [camp(500, have(base, 1)), 120],
      [camp(500, have(base, 1)), 25],
      [camp(10, have(base, 1)), 20],
      [camp(500, have(base, 1), STASH_CAP), 20],
      [camp(500), 20],
    ];
    for (const [g, amount] of cases) {
      const why = craftRefusal(g, base, amount);
      const r = craftGun(g, base, amount);
      expect(r.ok).toBe(why === null);
      if (!r.ok) expect(r.reason).toBe(why);
    }
  });

  it('refuses a craft once the most guns were crafted (a uid could not name another)', () => {
    const g = camp(500, have(base, 1, CRAFT_MADE_MAX));
    expect(craftRefusal(g, base, 20)).toBe('No more guns can be crafted');
  });
});

describe('salvageBlueprint (ID-209)', () => {
  const base = BLUEPRINT_GUNS[0]!;
  it('turns one blueprint into a little Scrap', () => {
    const r = salvageBlueprint(camp(10, have(base, 2)), base);
    if (!r.ok) throw new Error(r.reason);
    expect(r.scrap).toBe(BLUEPRINT.salvage);
    expect(r.game.stock.scrap).toBe(10 + BLUEPRINT.salvage);
    expect(blueprintCount(r.game, base)).toBe(1);
  });

  it('refuses with none of that gun', () => {
    expect(salvageBlueprint(camp(10), base)).toEqual({
      ok: false,
      reason: 'No blueprint for that gun',
    });
  });

  it('leaves no craft at all when the last blueprint goes and nothing was ever crafted', () => {
    const r = salvageBlueprint(camp(0, have(base, 1)), base);
    if (!r.ok) throw new Error(r.reason);
    expect('craft' in r.game).toBe(false);
  });

  it('keeps the count of guns made when the last one goes', () => {
    const r = salvageBlueprint(camp(0, have(base, 1, 3)), base);
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.craft).toEqual({ blueprints: {}, made: 3 });
  });
});

describe('crafted guns are ordinary stash guns', () => {
  it('have a save-safe shape', () => {
    const g = camp(500, have(BLUEPRINT_GUNS[0]!, 1));
    const r = craftGun(g, BLUEPRINT_GUNS[0]!, 20);
    if (!r.ok) throw new Error(r.reason);
    const w: OwnedWeapon = r.weapon;
    expect(Object.keys(w).sort()).toEqual(['affixes', 'base', 'level', 'rarity', 'uid']);
  });
});
