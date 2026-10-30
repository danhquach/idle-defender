// Design §6 Gear: weapon rarity and affixes, what they do in a fight, a horde win's
// weapon drop, and the armoury's one-item-one-pair-of-hands rule.
import { describe, expect, it } from 'vitest';
import {
  affixCount,
  heldLabel,
  heldName,
  dropChance,
  rollDrop,
  rollWeapon,
  statsOf,
  type OwnedWeapon,
} from './armoury.ts';
import {
  ARMOURY_CAP,
  RARITIES,
  RARITY_ORDER,
  STEP,
  WEAPONS,
  type AffixId,
  type Rarity,
} from './data.ts';
import { equip, finishHorde, hordeDrop, newGame, startHorde, type GameState } from './game.ts';
import { newHorde, tick, type HordeState } from './horde.ts';
import type { Loadout } from './loadout.ts';
import { createRng } from './rng.ts';
import { reloadTime } from './stats.ts';
import { enemy, landed, setup } from './testing.ts';

const NOW = 1_700_000_000_000;

const owned = (
  base: OwnedWeapon['base'],
  rarity: Rarity = 'common',
  affixes: OwnedWeapon['affixes'] = [],
  uid = 'h1',
): OwnedWeapon => ({ uid, base, rarity, affixes });
const one = (id: AffixId, value: number): OwnedWeapon['affixes'] => [{ id, value }];

/** One defender carrying `loadout` alone on post 0, no spawns. */
function alone(loadout: Loadout): HordeState {
  const s = newHorde(1, {
    ...setup(),
    roster: [{ id: 'd', name: 'D', loadout }],
    startDefenderId: 'd',
  });
  s.toSpawn = 0;
  return s;
}
const gun = (primary: Loadout['primary']): Loadout => ({ primary, secondary: null, item: null });

/** Damage the first shot of `primary` deals to a tough enemy level with post 0. */
function firstHit(primary: Loadout['primary']): number {
  const s = alone(gun(primary));
  enemy(s, { hp: 1000, maxHp: 1000 });
  const after = landed(tick(s, STEP));
  return 1000 - after.enemies[0]!.hp;
}

describe('rarity', () => {
  it('multiplies damage: Rusty ×0.8 … Relic ×1.5; Common is the free weapon', () => {
    const power = { rusty: 0.8, common: 1, military: 1.15, prototype: 1.3, relic: 1.5 };
    for (const r of RARITY_ORDER) {
      expect(statsOf(owned('pistol', r)).damage).toBeCloseTo(WEAPONS.pistol.damage * power[r]);
      expect(statsOf(owned('knife', r)).damage).toBeCloseTo(WEAPONS.knife.damage * power[r]);
    }
    expect(statsOf(owned('pistol'))).toEqual({ ...WEAPONS.pistol, name: 'Common Pistol' });
    expect(statsOf('pistol')).toBe(WEAPONS.pistol);
  });

  it("multiplies a tool's repair as well as its damage", () => {
    const t = statsOf(owned('toolkit', 'prototype'));
    expect(t.kind === 'tool' && t.repair).toBeCloseTo(WEAPONS.toolkit.repair * 1.3);
  });

  it('carries 0, 0, 1, 2, 3 affixes, or as many as fit the weapon', () => {
    expect(RARITY_ORDER.map((r) => affixCount('pistol', r))).toEqual([0, 0, 1, 2, 3]);
    // A blade fits only damage and fire rate.
    expect(affixCount('knife', 'relic')).toBe(2);
    expect(affixCount('toolkit', 'relic')).toBe(3);
  });

  it('a rarer weapon hits harder in a fight', () => {
    const plain = firstHit('pistol');
    expect(firstHit(owned('pistol', 'rusty')) / plain).toBeCloseTo(0.8);
    expect(firstHit(owned('pistol', 'prototype')) / plain).toBeCloseTo(1.3);
  });
});

describe('affixes in a fight', () => {
  it('+damage: the hit grows by the rolled percent, on top of rarity', () => {
    const plain = firstHit('pistol');
    expect(firstHit(owned('pistol', 'military', one('damage', 10))) / plain).toBeCloseTo(
      1.15 * 1.1,
    );
  });

  it('+fire rate: the next shot comes sooner', () => {
    const wait = (primary: Loadout['primary']): number => {
      const s = alone(gun(primary));
      enemy(s, { hp: 1000, maxHp: 1000 });
      const after = tick(s, STEP);
      return after.defenders[0]!.nextShotAt - after.time;
    };
    expect(wait(owned('pistol', 'military', one('fireRate', 15)))).toBeCloseTo(
      wait('pistol') / 1.15,
    );
  });

  it('+magazine: more rounds, rounded to whole ones', () => {
    const s = alone(gun(owned('pistol', 'military', one('magazine', 34))));
    expect(s.defenders[0]!.ammo.primary).toBe(13);
  });

  it('−reload: a shorter reload', () => {
    const d = { loadout: gun(owned('pistol', 'military', one('reload', 20))) };
    const plain = reloadTime({ loadout: gun('pistol') }, 'pistol');
    expect(reloadTime(d, d.loadout.primary)).toBeCloseTo(plain * 0.8);
  });

  it('pierce: the shot also hits the next enemy in line, not one off the line or too far', () => {
    const s = alone(gun(owned('pistol', 'military', one('pierce', 1))));
    const target = enemy(s, { hp: 1000, maxHp: 1000, x: 600 });
    const next = enemy(s, { hp: 1000, maxHp: 1000, x: 650 });
    const further = enemy(s, { hp: 1000, maxHp: 1000, x: 700 });
    const off = enemy(s, { hp: 1000, maxHp: 1000, x: 650, y: 440 });
    const after = landed(tick(s, STEP));
    const hp = (id: number): number => after.enemies.find((e) => e.id === id)!.hp;
    expect(hp(target.id)).toBeLessThan(1000);
    expect(hp(next.id)).toBe(hp(target.id));
    expect(hp(further.id)).toBe(1000);
    expect(hp(off.id)).toBe(1000);
    // Past PIERCE.reach behind the target (its body's edge to the next one's), nothing is hit.
    const far = alone(gun(owned('pistol', 'military', one('pierce', 1))));
    // Stunned, so neither walks into reach while the bullet flies: 201 px edge to edge.
    enemy(far, { hp: 1000, maxHp: 1000, x: 600, stunnedUntil: 9 });
    const beyond = enemy(far, { hp: 1000, maxHp: 1000, x: 801, stunnedUntil: 9 });
    expect(landed(tick(far, STEP)).enemies.find((e) => e.id === beyond.id)!.hp).toBe(1000);
  });

  it('without pierce, only the target is hit', () => {
    const s = alone(gun('pistol'));
    enemy(s, { hp: 1000, maxHp: 1000, x: 600 });
    const next = enemy(s, { hp: 1000, maxHp: 1000, x: 650 });
    expect(landed(tick(s, STEP)).enemies.find((e) => e.id === next.id)!.hp).toBe(1000);
  });

  it('+repair: an Engineer mends faster', () => {
    const mended = (secondary: Loadout['secondary']): number => {
      const s = alone({ primary: 'pistol', secondary, item: null });
      const post = s.posts[s.defenders[0]!.postId]!;
      const seg = s.layers.find((l) => l.column === post.column)!.segments[post.row]!;
      seg.hp = seg.maxHp / 2;
      return (
        tick(s, STEP).layers.find((l) => l.column === post.column)!.segments[post.row]!.hp -
        seg.maxHp / 2
      );
    };
    const plain = mended('toolkit');
    expect(plain).toBeGreaterThan(0);
    expect(mended(owned('toolkit', 'military', one('repair', 20))) / plain).toBeCloseTo(1.15 * 1.2);
  });

  it('works out an owned weapon once, the same numbers every time', () => {
    const w = owned('pistol', 'military', one('damage', 12));
    expect(statsOf(w)).toBe(statsOf(w));
    expect(statsOf({ ...w })).toEqual(statsOf(w));
  });

  it('names: "Military Pistol (+12% damage)"; a free weapon is plain', () => {
    const w = owned('pistol', 'prototype', [
      { id: 'damage', value: 12 },
      { id: 'reload', value: 10 },
    ]);
    expect(heldName(w)).toBe('Prototype Pistol');
    expect(heldLabel(w)).toBe('Prototype Pistol (+12% damage, −10% reload time)');
    expect(heldLabel('knife')).toBe('Knife');
  });
});

describe('rolling a weapon', () => {
  it('rolls each affix at most once, in range, only ones that fit', () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i++) {
      for (const base of ['pistol', 'knife', 'toolkit'] as const) {
        const w = rollWeapon(rng, 'h1', base, 'relic');
        expect(w.affixes).toHaveLength(affixCount(base, 'relic'));
        expect(new Set(w.affixes.map((a) => a.id)).size).toBe(w.affixes.length);
        for (const a of w.affixes) {
          if (base === 'knife') expect(['damage', 'fireRate']).toContain(a.id);
          if (base !== 'toolkit') expect(a.id).not.toBe('repair');
          if (base === 'toolkit') expect(['magazine', 'reload', 'pierce']).not.toContain(a.id);
        }
      }
    }
  });

  it('drop chance: 10% + 1% per horde number, capped at 30%', () => {
    expect(dropChance(1)).toBeCloseTo(0.11);
    expect(dropChance(10)).toBeCloseTo(0.2);
    expect(dropChance(20)).toBeCloseTo(0.3);
    expect(dropChance(500)).toBe(0.3);
  });

  it('the same seed gives the same drop', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(rollDrop(createRng(seed), 7)).toEqual(rollDrop(createRng(seed), 7));
    }
  });

  it('drops at the capped 30% from horde 20 on', () => {
    const n = 20_000;
    let drops = 0;
    for (let seed = 0; seed < n; seed++) if (rollDrop(createRng(seed), 25)) drops++;
    expect(Math.abs(drops / n - 0.3)).toBeLessThan(0.01);
  });

  it('drops at the stated rate and rarity odds, never a Relic, with uid h<n>', () => {
    const n = 20_000;
    const counts: Record<Rarity, number> = {
      rusty: 0,
      common: 0,
      military: 0,
      prototype: 0,
      relic: 0,
    };
    const bases: Record<string, number> = {};
    let drops = 0;
    for (let seed = 0; seed < n; seed++) {
      const w = rollDrop(createRng(seed), 5);
      if (!w) continue;
      drops++;
      counts[w.rarity]++;
      bases[w.base] = (bases[w.base] ?? 0) + 1;
      expect(w.uid).toBe('h5');
      expect(w.affixes).toHaveLength(affixCount(w.base, w.rarity));
    }
    // σ ≈ 0.0025 over 20 000 rolls: a 1-point error in the chance fails.
    expect(Math.abs(drops / n - dropChance(5))).toBeLessThan(0.008);
    expect(counts.relic).toBe(0);
    for (const [r, want] of [
      ['rusty', 0.3],
      ['common', 0.45],
      ['military', 0.2],
      ['prototype', 0.05],
    ] as const) {
      expect(Math.abs(counts[r] / drops - want)).toBeLessThan(0.025);
    }
    // Even across every base weapon, the five specialised guns included (σ ≈ 0.006).
    const ids = Object.keys(WEAPONS);
    expect(ids).toHaveLength(8);
    for (const id of ids) {
      expect(Math.abs(bases[id]! / drops - 1 / ids.length), id).toBeLessThan(0.02);
    }
  });
});

/** A won horde 1 for `game` whose ending RNG drops a weapon (or, with `drop` false, doesn't). */
function won(game: GameState, drop = true): HordeState {
  const h = startHorde(game, 1, 'bob', 0, NOW);
  h.outcome = 'won';
  for (let s = 0; ; s++) {
    h.rng = { s };
    if ((hordeDrop(game, h) !== null) === drop) return h;
  }
}

describe('a horde win’s weapon drop', () => {
  it('goes into the armoury', () => {
    const game = newGame();
    const h = won(game);
    const drop = hordeDrop(game, h)!;
    expect(drop.kept).toBe(true);
    expect(drop.scrap).toBe(0);
    const after = finishHorde(game, h, NOW);
    expect(after.armoury).toEqual([drop.weapon]);
    expect(after.stock.scrap).toBe(finishHorde(game, won(game, false), NOW).stock.scrap);
  });

  it('a loss never drops one', () => {
    const game = newGame();
    const h = won(game);
    h.outcome = 'lost';
    expect(hordeDrop(game, h)).toBeNull();
    expect(finishHorde(game, h, NOW).armoury).toEqual([]);
  });

  it(`a full armoury (${ARMOURY_CAP} owned, in hands too) salvages the drop for Scrap`, () => {
    const armoury = Array.from({ length: ARMOURY_CAP - 1 }, (_, i) =>
      owned('knife', 'rusty', [], `h${i + 100}`),
    );
    let game: GameState = { ...newGame(), armoury };
    game.roster[0]!.loadout.primary = owned('pistol', 'rusty', [], 'h99');
    const h = won(game);
    const drop = hordeDrop(game, h)!;
    expect(drop.kept).toBe(false);
    expect(drop.scrap).toBe(RARITIES[drop.weapon.rarity].salvage);
    const plain = finishHorde(game, won(game, false), NOW).stock.scrap;
    const after = finishHorde(game, h, NOW);
    expect(after.armoury).toHaveLength(ARMOURY_CAP - 1);
    expect(after.stock.scrap).toBe(plain + drop.scrap);
    // One under the cap, it fits.
    game = { ...game, armoury: armoury.slice(1) };
    expect(hordeDrop(game, h)!.kept).toBe(true);
  });
});

describe('equipping owned weapons', () => {
  const mil = owned('pistol', 'military', one('damage', 12), 'h3');
  const withArmoury = (): GameState => ({ ...newGame(), hordeNumber: 5, armoury: [mil] });

  it('takes it out of the armoury, and puts back the one it replaces', () => {
    const game = withArmoury();
    const r = equip(game, 'bob', gun(mil));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.armoury).toEqual([]);
    expect(r.game.roster[0]!.loadout.primary).toEqual(mil);
    const back = equip(r.game, 'bob', gun('pistol'));
    expect(back.ok && back.game.armoury).toEqual([mil]);
    expect(game.armoury).toEqual([mil]); // the input is untouched
  });

  it('refuses one another defender carries, and says who has it', () => {
    const r = equip(withArmoury(), 'bob', gun(mil));
    if (!r.ok) throw new Error(r.reason);
    const jack = r.game.roster[1]!.loadout;
    expect(equip(r.game, 'jack', { ...jack, primary: mil })).toEqual({
      ok: false,
      reason: 'Bob carries the Military Pistol',
    });
  });

  it('refuses one weapon in both slots', () => {
    expect(equip(withArmoury(), 'bob', { primary: mil, secondary: mil, item: null })).toEqual({
      ok: false,
      reason: "One weapon can't fill two slots",
    });
  });

  it("takes the game's numbers, not the caller's, and throws on an unknown uid", () => {
    const forged = { ...mil, rarity: 'relic' as const, affixes: one('damage', 99) };
    const r = equip(withArmoury(), 'bob', gun(forged));
    expect(r.ok && r.game.roster[0]!.loadout.primary).toEqual(mil);
    expect(() => equip(withArmoury(), 'bob', gun({ ...mil, uid: 'h9' }))).toThrow(RangeError);
  });

  it('keeps the loadout rules: an owned knife is no primary', () => {
    const knife = owned('knife', 'military', one('damage', 5), 'h2');
    const game = { ...withArmoury(), armoury: [knife] };
    expect(equip(game, 'bob', gun(knife))).toEqual({
      ok: false,
      reason: 'The primary must be a gun',
    });
    const r = equip(game, 'jack', { primary: 'pistol', secondary: knife, item: 'shield' });
    expect(r.ok && r.game.armoury).toEqual([]);
  });

  it('a horde fights with the owned weapon it was started with', () => {
    const r = equip(withArmoury(), 'bob', gun(mil));
    if (!r.ok) throw new Error(r.reason);
    const h = startHorde(r.game, 1, 'bob', 0, NOW);
    expect(h.defenders[0]!.loadout.primary).toEqual(mil);
  });
});
