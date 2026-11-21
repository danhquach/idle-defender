// ID-207: a spare stash gun can be salvaged by hand for its rarity's Scrap plus half the Scrap
// its upgrade steps (ID-208) cost, rounded down. The same refund applies where a gun is
// salvaged automatically; Combine inputs pay none.
import { describe, expect, it } from 'vitest';
import { gunSalvage, upgradeSpent, type OwnedWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import { ARMOURY_CAP, GUN_UPGRADE, RARITIES, RARITY_ORDER, UPGRADE_REFUND } from './data.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import {
  combineGuns,
  letGo,
  salvageGun,
  salvageOf,
  squadCap,
  stashCap,
  upgradeGun,
} from './hordeonly.ts';

const gun = (uid: string, extra: Partial<OwnedWeapon> = {}): OwnedWeapon => ({
  uid,
  base: 'smg',
  rarity: 'common',
  affixes: [],
  ...extra,
});

/** A camp one past its cap with `held` on the first of the bench, so a survivor may be let go. */
function crowded(stash: OwnedWeapon[], held: OwnedWeapon): GameState {
  const g = camp(stash, 0);
  const squad = Array.from({ length: squadCap(g) }, (_, i) => recruit(i + 1));
  const away = { ...recruit(90), loadout: { primary: held, secondary: null, item: null } };
  return { ...g, roster: squad, reserve: [away], camp: { ...g.camp, recruits: squad.length + 1 } };
}

function camp(stash: OwnedWeapon[], scrap = 100, held: OwnedWeapon | null = null): GameState {
  const g = newGame('horde');
  const who: RosterDefender[] = [recruit(1), recruit(2)];
  if (held) who[0] = { ...who[0]!, loadout: { ...who[0]!.loadout, primary: held } };
  return {
    ...g,
    hordeNumber: 9,
    roster: who,
    camp: { ...g.camp, recruits: 2 },
    armoury: stash,
    stock: { ...g.stock, scrap },
  };
}

describe('the numbers (ID-207)', () => {
  it('refund half the Scrap the steps cost', () => {
    expect(UPGRADE_REFUND).toBe(0.5);
  });
});

describe('gunSalvage', () => {
  it('is the rarity’s Scrap for a gun with no step', () => {
    const want = { rusty: 5, common: 10, military: 25, prototype: 50, relic: 100 };
    for (const r of RARITY_ORDER) {
      expect(gunSalvage(gun('a', { rarity: r }))).toBe(want[r]);
      expect(gunSalvage(gun('a', { rarity: r }))).toBe(RARITIES[r].salvage);
    }
  });

  it('adds half the Scrap the steps cost: 10 × s × level for each step s', () => {
    // Lv 1: steps cost 10, 20, 30, 40, 50 -> spent 10, 30, 60, 100, 150.
    expect(upgradeSpent(gun('a'))).toBe(0);
    expect([1, 2, 3, 4, 5].map((s) => upgradeSpent(gun('a', { step: s })))).toEqual([
      10, 30, 60, 100, 150,
    ]);
    expect(upgradeSpent(gun('a', { level: 3, step: 2 }))).toBe(90);
    expect(upgradeSpent(gun('a', { level: 12, step: 5 }))).toBe(150 * 12);
  });

  it('matches what upgradeGun charged, step by step', () => {
    let g = camp([gun('a', { level: 4 })], 10_000);
    let paid = 0;
    for (let s = 1; s <= GUN_UPGRADE.max; s++) {
      const r = upgradeGun(g, 'a');
      if (!r.ok) throw new Error(r.reason);
      paid += r.cost;
      g = r.game;
      expect(upgradeSpent(g.armoury[0]!)).toBe(paid);
    }
  });

  it('takes the refund share of the spend, rounded down', () => {
    for (const level of [1, 2, 3, 5, 7, 9, 13]) {
      for (let step = 0; step <= 5; step++) {
        const w = gun('a', { level, step, rarity: 'military' });
        expect(gunSalvage(w)).toBe(25 + Math.floor(UPGRADE_REFUND * upgradeSpent(w)));
      }
    }
  });

  it('is the example in the ticket: a Military gun that cost 60 Scrap pays 55', () => {
    // Lv 2 +2 spent 20 + 40 = 60.
    const w = gun('a', { rarity: 'military', level: 2, step: 2 });
    expect(upgradeSpent(w)).toBe(60);
    expect(gunSalvage(w)).toBe(25 + 30);
  });
});

describe('salvageGun', () => {
  it('turns a stash gun into its Scrap and takes it out of the stash', () => {
    const g = camp([gun('a', { rarity: 'military' }), gun('b')], 100);
    const r = salvageGun(g, 'a');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scrap).toBe(25);
    expect(r.weapon.uid).toBe('a');
    expect(r.game.stock.scrap).toBe(125);
    expect(r.game.armoury.map((w) => w.uid)).toEqual(['b']);
    // The old state is untouched.
    expect(g.armoury).toHaveLength(2);
    expect(g.stock.scrap).toBe(100);
  });

  it('pays the right amount for every rarity', () => {
    for (const r of RARITY_ORDER) {
      const out = salvageGun(camp([gun('a', { rarity: r })], 0), 'a');
      expect(out.ok && out.game.stock.scrap).toBe(RARITIES[r].salvage);
    }
  });

  it('pays back half the upgrade Scrap too', () => {
    const g = camp([gun('a', { rarity: 'military', level: 2, step: 2 })], 0);
    const r = salvageGun(g, 'a');
    expect(r.ok && r.scrap).toBe(55);
    expect(r.ok && r.game.stock.scrap).toBe(55);
  });

  it('refuses a gun a survivor holds, saying to put it back first', () => {
    const held = gun('h', { rarity: 'relic' });
    const g = camp([], 10, held);
    const r = salvageGun(g, 'h');
    expect(r).toEqual({
      ok: false,
      reason: `${g.roster[0]!.name} holds that gun: put it back in the stash first`,
    });
  });

  it('refuses a gun on the bench the same way', () => {
    const held = gun('h');
    const g = camp([], 10, held);
    const moved: GameState = { ...g, roster: [g.roster[1]!], reserve: [g.roster[0]!] };
    const r = salvageGun(moved, 'h');
    expect(!r.ok && r.reason).toContain('put it back in the stash first');
  });

  it('refuses the free pistol, a gun that is not there, and a blade or tool', () => {
    const g = camp([gun('a')], 10);
    expect(salvageGun(g, 'pistol')).toEqual({
      ok: false,
      reason: 'The free pistol can’t be salvaged',
    });
    expect(salvageGun(g, 'nope')).toEqual({ ok: false, reason: 'That gun is not in the stash' });
    const blade = gun('k', { base: 'knife' as OwnedWeapon['base'] });
    const r = salvageGun(camp([blade], 10), 'k');
    expect(r).toEqual({ ok: false, reason: 'Only guns can be salvaged' });
  });

  it('refuses nothing for being full of Scrap: the balance is capped where a save reads it', () => {
    const g = camp([gun('a', { rarity: 'relic' })], 999_999_999);
    const r = salvageGun(g, 'a');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.stock.scrap).toBeLessThanOrEqual(g.stock.scrap + 100);
    expect(r.scrap).toBe(r.game.stock.scrap - g.stock.scrap);
    expect(r.game.armoury).toHaveLength(0);
  });
});

describe('automatic salvage pays the refund too', () => {
  it('salvageOf counts each thrown gun’s refund', () => {
    const a = gun('a', { rarity: 'prototype', level: 3, step: 3 });
    const b = gun('b');
    // a: 50 + floor(10·3·(1+2+3)/2) = 50 + 90; b: 10.
    expect(salvageOf([a, b])).toBe(50 + 90 + 10);
    expect(salvageOf([])).toBe(0);
  });

  it('a survivor’s upgraded gun returning to a full stash: the weakest thrown away pays its refund', () => {
    const cap = stashCap(newGame('horde'));
    // A stash full of Rusty guns, then a survivor with a Rusty +5 Lv 10 (weakest by power) lets go.
    const held = gun('h', { rarity: 'rusty', level: 1, step: 5, base: 'smg' });
    const fill = Array.from({ length: cap }, (_, i) =>
      gun(`s${i}`, { rarity: 'relic', base: 'smg', level: 30 }),
    );
    const g = crowded(fill, held);
    const r = letGo(g, 'recruit-90');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.thrown.map((w) => w.uid)).toEqual(['h']);
    expect(r.game.stock.scrap).toBe(5 + 75);
    expect(r.game.armoury).toHaveLength(cap);
  });

  it('a gun let go into room in the stash pays nothing', () => {
    const g = crowded([], gun('h', { step: 5 }));
    const r = letGo(g, 'recruit-90');
    expect(r.ok && r.game.stock.scrap).toBe(0);
    expect(r.ok && r.game.armoury.map((w) => w.uid)).toEqual(['h']);
  });
});

describe('Combine inputs pay no refund', () => {
  it('the three guns are used up, the result keeps the step, and Scrap is unchanged', () => {
    const g = camp(
      [
        gun('a', { level: 2, step: 3 }),
        gun('b', { level: 2, step: 1 }),
        gun('c', { level: 1, step: 5 }),
      ],
      40,
    );
    const r = combineGuns(g, ['a', 'b', 'c']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.stock.scrap).toBe(40);
    expect(r.weapon.step).toBe(3);
  });
});

describe('the stash cap', () => {
  it('is not what salvage depends on: it works with a full stash', () => {
    const full = Array.from({ length: ARMOURY_CAP }, (_, i) => gun(`s${i}`));
    const r = salvageGun(camp(full, 0), 's3');
    expect(r.ok && r.game.armoury).toHaveLength(ARMOURY_CAP - 1);
  });
});
