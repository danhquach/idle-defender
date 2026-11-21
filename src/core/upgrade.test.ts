// ID-208: a gun upgrades to +1 … +5 with Scrap. Each step adds damage on top of level and
// rarity, costs Scrap by the step and the gun's level, and shows after the name. Combine keeps
// the highest step; Best gun, DPS and Squad Power count it.
import { describe, expect, it } from 'vitest';
import {
  gunPower,
  gunStep,
  heldLabel,
  heldName,
  levelFactor,
  levelName,
  statsOf,
  type OwnedWeapon,
} from './armoury.ts';
import { recruit } from './camp.ts';
import { GUN_UPGRADE, RARITIES, WEAPONS } from './data.ts';
import { tick } from './horde.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import {
  bestGuns,
  combineGuns,
  combineKept,
  startSquadHorde,
  survivorPower,
  upgradeCost,
  upgradeGun,
  withUpgradedGun,
} from './hordeonly.ts';

const NOW = 1_700_000_000_000;

const gun = (uid: string, extra: Partial<OwnedWeapon> = {}): OwnedWeapon => ({
  uid,
  base: 'smg',
  rarity: 'common',
  affixes: [],
  ...extra,
});

function camp(stash: OwnedWeapon[], scrap = 1000, held: OwnedWeapon | null = null): GameState {
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

describe('the numbers (ID-208)', () => {
  it('start at +4% base damage a step, up to +5, 10 Scrap × step × gun level', () => {
    expect(GUN_UPGRADE).toEqual({ max: 5, damage: 0.04, cost: 10 });
  });
});

describe('damage', () => {
  it('each step adds 4% of base damage, on top of level and rarity', () => {
    const base = statsOf(gun('a', { level: 3, rarity: 'military' })).damage;
    for (let s = 1; s <= 5; s++) {
      const w = gun(`s${s}`, { level: 3, rarity: 'military', step: s });
      expect(statsOf(w).damage).toBeCloseTo(base * (1 + 0.04 * s), 9);
    }
    expect(base).toBeCloseTo(WEAPONS.smg.damage * levelFactor(3) * RARITIES.military.power, 9);
  });

  it('raises DPS (gunPower)', () => {
    expect(gunPower(gun('a', { step: 5 }))).toBeCloseTo(gunPower(gun('a')) * 1.2, 9);
  });

  it('a gun with no step is +0', () => {
    expect(gunStep(gun('a'))).toBe(0);
    expect(gunStep('pistol')).toBe(0);
    expect(gunStep(gun('a', { step: 2 }))).toBe(2);
  });
});

describe('name', () => {
  it('shows +N after the name, nothing at +0', () => {
    expect(heldName(gun('a'))).toBe('Common SMG');
    expect(heldName(gun('a', { step: 2 }))).toBe('Common SMG +2');
    expect(levelName(gun('a', { level: 3, step: 2 }))).toBe('Lv 3 Common SMG +2');
    expect(
      heldLabel(gun('a', { step: 1, rarity: 'military', affixes: [{ id: 'damage', value: 5 }] })),
    ).toBe('Military SMG +1 (+5% damage)');
    expect(statsOf(gun('a', { step: 4 })).name).toBe('Common SMG +4');
  });
});

describe('upgradeCost', () => {
  it('is 10 × the step it buys × the gun level; null at the top', () => {
    expect(upgradeCost(gun('a', { level: 3 }))).toBe(30);
    expect(upgradeCost(gun('a', { level: 3, step: 1 }))).toBe(60);
    expect(upgradeCost(gun('a', { step: 4 }))).toBe(50);
    expect(upgradeCost(gun('a', { level: 12, step: 4 }))).toBe(600);
    expect(upgradeCost(gun('a', { step: 5 }))).toBeNull();
  });
});

describe('upgradeGun', () => {
  it('raises a stash gun one step and takes the Scrap', () => {
    const g = camp([gun('h1', { level: 3 }), gun('h2')], 100);
    const r = upgradeGun(g, 'h1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cost).toBe(30);
    expect(r.weapon).toMatchObject({ uid: 'h1', step: 1, level: 3 });
    expect(r.game.stock.scrap).toBe(70);
    expect(r.game.armoury.map((w) => w.uid)).toEqual(['h1', 'h2']);
    expect(r.game.armoury[0]).toBe(r.weapon);
    // The game it came from is untouched.
    expect(g.armoury[0]!.step).toBeUndefined();
    expect(g.stock.scrap).toBe(100);
  });

  it('raises a held gun, in the squad or on the bench', () => {
    const held = gun('h1', { level: 2 });
    const g = camp([], 100, held);
    const r = upgradeGun(g, 'h1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.roster[0]!.loadout.primary).toBe(r.weapon);
    expect(r.game.roster[0]!.loadout.primary).toMatchObject({ step: 1 });
    const benched: GameState = { ...g, roster: [g.roster[1]!], reserve: [g.roster[0]!] };
    const b = upgradeGun(benched, 'h1');
    expect(b.ok && b.game.reserve[0]!.loadout.primary).toMatchObject({ step: 1 });
  });

  it('climbs one step at a time, to +5, then refuses', () => {
    let g = camp([gun('h1')], 10_000);
    const spent: number[] = [];
    for (let s = 1; s <= 5; s++) {
      const r = upgradeGun(g, 'h1');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      spent.push(r.cost);
      expect(r.weapon.step).toBe(s);
      g = r.game;
    }
    expect(spent).toEqual([10, 20, 30, 40, 50]);
    const over = upgradeGun(g, 'h1');
    expect(over).toEqual({ ok: false, reason: 'Already at +5' });
    expect(g.stock.scrap).toBe(10_000 - 150);
  });

  it('refuses short of Scrap, naming the cost, and changes nothing', () => {
    const g = camp([gun('h1', { level: 3 })], 29);
    const r = upgradeGun(g, 'h1');
    expect(r).toEqual({ ok: false, reason: 'Needs 30 Scrap' });
    expect(upgradeGun({ ...g, stock: { ...g.stock, scrap: 30 } }, 'h1').ok).toBe(true);
  });

  it('refuses a gun that is not there, and the free pistol', () => {
    const g = camp([gun('h1')]);
    expect(upgradeGun(g, 'nope')).toEqual({ ok: false, reason: 'No such gun' });
    expect(upgradeGun(g, 'pistol')).toEqual({ ok: false, reason: 'No such gun' });
  });

  it('refuses a blade or tool an older save left in the stash', () => {
    const g = camp([{ uid: 'h1', base: 'knife', rarity: 'common', affixes: [] }]);
    expect(upgradeGun(g, 'h1')).toEqual({ ok: false, reason: 'Only guns can be upgraded' });
  });
});

describe('a fight under way', () => {
  it('a held gun upgraded mid-fight fights stronger at once', () => {
    const held = gun('h1');
    const g = camp([], 100, held);
    const horde = startSquadHorde(g, 1, NOW, 1);
    const r = upgradeGun(g, 'h1');
    if (!r.ok) throw new Error('refused');
    const live = withUpgradedGun(horde, r.weapon);
    const who = live.defenders.find((d) => d.id === g.roster[0]!.id)!;
    expect(who.loadout.primary).toBe(r.weapon);
    // What the fight reads: damage up by the step, the DPS with it.
    const was = horde.defenders.find((d) => d.id === g.roster[0]!.id)!.loadout.primary;
    expect(statsOf(who.loadout.primary).damage).toBeCloseTo(statsOf(was).damage * 1.04, 9);
    expect(gunPower(who.loadout.primary)).toBeGreaterThan(gunPower(was));
    // The others, and the state it came from, are untouched.
    expect(was).toBe(held);
    expect(live.defenders.filter((d) => d.loadout.primary === r.weapon)).toHaveLength(1);
    // And a tick on from there still runs on the new gun.
    const after = tick(live, 0.5);
    expect(
      statsOf(after.defenders.find((d) => d.id === who.id)!.loadout.primary).damage,
    ).toBeCloseTo(statsOf(was).damage * 1.04, 9);
  });

  it('a gun in a defender’s secondary slot is swapped too', () => {
    const g = camp([], 100, gun('h1'));
    const horde = startSquadHorde(g, 1, NOW, 1);
    const old = gun('h9', { level: 2 });
    const second = {
      ...horde,
      defenders: horde.defenders.map((d, i) =>
        i === 0 ? { ...d, loadout: { ...d.loadout, secondary: old } } : d,
      ),
    };
    const up = { ...old, step: 3 };
    const live = withUpgradedGun(second, up);
    expect(live.defenders[0]!.loadout.secondary).toBe(up);
    expect(statsOf(live.defenders[0]!.loadout.secondary!).damage).toBeCloseTo(
      statsOf(old).damage * 1.12,
      9,
    );
    expect(second.defenders[0]!.loadout.secondary).toBe(old);
  });

  it('returns the same state when nobody fights with it', () => {
    const g = camp([gun('h1')], 100);
    const horde = startSquadHorde(g, 1, NOW, 1);
    const r = upgradeGun(g, 'h1');
    if (!r.ok) throw new Error('refused');
    expect(withUpgradedGun(horde, r.weapon)).toBe(horde);
  });
});

describe('Combine keeps the step of the gun that brings the level', () => {
  const rusty = (uid: string, level?: number, step?: number): OwnedWeapon =>
    gun(uid, {
      rarity: 'rusty',
      ...(level ? { level } : {}),
      ...(step ? { step } : {}),
    });

  it('takes the step from the highest-level gun, not the highest step', () => {
    // A Lv 2 +5 is not worth a Lv 9 +1: the result is Lv 9 with its +1.
    const g = camp([rusty('h1', 2, 5), rusty('h2', 9, 1), rusty('h3', 4, 2)]);
    const r = combineGuns(g, ['h1', 'h2', 'h3']);
    expect(r.ok && r.weapon).toMatchObject({ rarity: 'common', level: 9, step: 1 });
  });

  it('a cheap low-level +5 gun gives nothing to a high-level result', () => {
    const g = camp([rusty('h1', 1, 5), rusty('h2', 9), rusty('h3', 9)]);
    const r = combineGuns(g, ['h1', 'h2', 'h3']);
    expect(r.ok && r.weapon.level).toBe(9);
    expect(r.ok && Object.hasOwn(r.weapon, 'step')).toBe(false);
  });

  it('on a level tie, the highest step among those tied', () => {
    const g = camp([rusty('h1', 5, 2), rusty('h2', 5, 4), rusty('h3', 3, 5)]);
    const r = combineGuns(g, ['h1', 'h2', 'h3']);
    expect(r.ok && r.weapon).toMatchObject({ level: 5, step: 4 });
  });

  it('at level 1 (no level field) the highest step wins the tie', () => {
    const g = camp([rusty('h1', undefined, 2), rusty('h2', undefined, 5), rusty('h3')]);
    const r = combineGuns(g, ['h1', 'h2', 'h3']);
    expect(r.ok && r.weapon).toMatchObject({ step: 5 });
  });

  it('with no step among them, the new gun has none (no step field)', () => {
    const g = camp([rusty('h1'), rusty('h2'), rusty('h3')]);
    const r = combineGuns(g, ['h1', 'h2', 'h3']);
    expect(r.ok && Object.hasOwn(r.weapon, 'step')).toBe(false);
  });

  it('combineKept says the same', () => {
    expect(combineKept([rusty('a', 2, 5), rusty('b', 9, 1), rusty('c')])).toEqual({
      level: 9,
      step: 1,
    });
  });
});

describe('Best gun and Squad Power count the step', () => {
  it('hands the stepped gun over an equal one without', () => {
    const g = camp([gun('h1'), gun('h2', { step: 5 })]);
    const r = bestGuns({ ...g, roster: [g.roster[0]!], reserve: [] });
    const held = r.game.roster[0]!.loadout.primary as OwnedWeapon;
    expect(held.uid).toBe('h2');
  });

  it('a Rusty +5 (×0.96) still ranks below a Common +0 (×1.0): the step counts, but only as it is', () => {
    const rusty5 = gun('h1', { rarity: 'rusty', step: 5 }); // 0.8 × 1.2 = 0.96
    const common = gun('h2'); // 1.0
    const g = camp([rusty5, common]);
    const r = bestGuns({ ...g, roster: [g.roster[0]!], reserve: [] });
    expect((r.game.roster[0]!.loadout.primary as OwnedWeapon).uid).toBe('h2');
  });

  it("a survivor's power rises with their gun's step", () => {
    const plain = camp([], 0, gun('h1')).roster[0]!;
    const stepped = camp([], 0, gun('h1', { step: 5 })).roster[0]!;
    expect(survivorPower(stepped)).toBeGreaterThan(survivorPower(plain));
  });
});
