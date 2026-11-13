// Design §6: defender levels, and the all-round bonus each level gives in a fight (ID-146).
import { describe, expect, it } from 'vitest';
import { buildPost, newBase, type Base, type BasePost } from './base.ts';
import {
  CARD,
  CRIT_DAMAGE,
  DEFENDER_HP,
  LEVEL_BONUS,
  LEVEL_HALF,
  SHIELD,
  STEP,
  WEAPONS,
  type FreeWeaponId,
  type LevelBonusId,
  type Stock,
  stockOf,
} from './data.ts';
import { hordeXp } from './game.ts';
import {
  newHorde,
  specOf,
  standing,
  tick,
  type DefenderSpec,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import {
  critChance,
  damageFactor,
  damageTaken,
  fireRateFactor,
  levelBonus,
  levelOf,
  maxHpOf,
  reloadTime,
  spreadOf,
  xpForLevel,
} from './stats.ts';
import { rngFrom } from './rng.ts';
import { enemy, setup } from './testing.ts';
import { loadoutFrom } from './loadout.ts';

/** The level whose bonus is half of each cap. */
const HALF = LEVEL_HALF + 1;
/** Bob carrying what `weapon` alone gave before loadouts, at `level`. */
const spec = (weapon: FreeWeaponId, level = 1): DefenderSpec => ({
  id: 'd',
  name: 'Bob',
  loadout: loadoutFrom(weapon),
  xp: xpForLevel(level),
});
/** A horde-only survivor (no profession) with `weapon` at `level`. */
const plain = (level: number, weapon: FreeWeaponId = 'pistol') => ({
  loadout: loadoutFrom(weapon),
  plain: true as const,
  xp: xpForLevel(level),
});
const tough = { hp: 1000, maxHp: 1000 };
const IDS = Object.keys(LEVEL_BONUS) as LevelBonusId[];

/** A horde on `base` with no spawns and `d` standing alone on the `kind` post in `row`. */
function fight(base: Base, d: DefenderSpec, kind: BasePost['kind'], row: number): HordeState {
  const s = newHorde(1, { ...setup(), base });
  s.toSpawn = 0;
  s.defenders = [];
  s.bench = [];
  for (const p of s.posts) p.defenderId = null;
  const post = s.posts.find((p) => p.kind === kind && p.row === row)!;
  post.defenderId = d.id;
  s.defenders.push(standing(d, post, 0));
  return s;
}

/** A base with a wall-walk post in column 0, row 2. */
function wallWalk(): Base {
  const RICH: Stock = stockOf({ scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 });
  const r = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: 2 });
  if (!r.ok) throw new Error(r.reason);
  return r.base;
}

describe('levels', () => {
  it('level L to L + 1 costs 25 × L XP', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, next: 25 });
    expect(levelOf(24)).toEqual({ level: 1, into: 24, next: 25 });
    expect(levelOf(25)).toEqual({ level: 2, into: 0, next: 50 });
    expect(levelOf(74)).toEqual({ level: 2, into: 49, next: 50 });
    expect(levelOf(75)).toEqual({ level: 3, into: 0, next: 75 });
    expect(xpForLevel(4)).toBe(150);
  });

  it('every win from Horde 1: level 2 after Horde 2, level 3 after Horde 4', () => {
    let xp = 0;
    const levels = [1, 2, 3, 4].map((n) => levelOf((xp += hordeXp(n))).level);
    expect(levels).toEqual([1, 2, 2, 3]);
  });

  it('stays exact at huge XP, and refuses a bad one', () => {
    for (const xp of [1e12, 1e12 - 1, xpForLevel(283_000), xpForLevel(283_000) - 1]) {
      const { level, into } = levelOf(xp);
      expect(xpForLevel(level)).toBeLessThanOrEqual(xp);
      expect(xpForLevel(level + 1)).toBeGreaterThan(xp);
      expect(into).toBe(xp - xpForLevel(level));
    }
    expect(levelOf(Number.MAX_SAFE_INTEGER).level).toBeGreaterThan(1);
    for (const xp of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2, 1e300]) {
      expect(() => levelOf(xp)).toThrow(RangeError);
    }
  });
});

describe('the level bonus: a little of everything, shrinking as levels go up (ID-146)', () => {
  it('six bonuses: max HP, armour, fire rate, reload, aim and crit', () => {
    expect(IDS).toEqual(['hp', 'armour', 'fireRate', 'reload', 'spread', 'crit']);
  });

  it('cap × P / (P + LEVEL_HALF), P = level − 1: none at level 1, half the cap at LEVEL_HALF + 1', () => {
    for (const id of IDS) {
      expect(levelBonus(1, id)).toBe(0);
      expect(levelBonus(HALF, id)).toBeCloseTo(LEVEL_BONUS[id] / 2);
      expect(levelBonus(7, id)).toBeCloseTo((LEVEL_BONUS[id] * 6) / (6 + LEVEL_HALF));
    }
  });

  it('every level adds something, each less than the one before', () => {
    for (const id of IDS) {
      const gains = [2, 3, 5, 10, 20, 50].map((l) => levelBonus(l, id) - levelBonus(l - 1, id));
      for (const g of gains) expect(g).toBeGreaterThan(0);
      expect([...gains].sort((a, b) => b - a)).toEqual(gains);
    }
  });

  it('no level breaks a fight: every bonus stays under its cap', () => {
    for (const id of IDS) expect(levelBonus(1e9, id)).toBeLessThan(LEVEL_BONUS[id]);
    const top = plain(1e5);
    expect(maxHpOf(top)).toBeLessThanOrEqual(DEFENDER_HP + LEVEL_BONUS.hp);
    expect(reloadTime(top, 'pistol')).toBeGreaterThan(
      WEAPONS.pistol.reload * (1 - LEVEL_BONUS.reload),
    );
    expect(spreadOf(top, 'pistol')).toBeGreaterThan(
      WEAPONS.pistol.spread * (1 - LEVEL_BONUS.spread),
    );
    expect(critChance(top)).toBeLessThan(LEVEL_BONUS.crit);
    expect(fireRateFactor(top, 'pistol')).toBeLessThan(1 + LEVEL_BONUS.fireRate);
  });

  it('refuses a level that is not a whole number from 1', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => levelBonus(bad, 'hp')).toThrow(RangeError);
    }
  });
});

describe('what a level does, with any weapon (ID-146)', () => {
  it('no XP is level 1: no bonus at all', () => {
    const none = { loadout: loadoutFrom('pistol'), plain: true as const };
    expect(maxHpOf(none)).toBe(DEFENDER_HP);
    expect(damageTaken(none, 5)).toBe(5);
    expect(reloadTime(none, 'pistol')).toBe(WEAPONS.pistol.reload);
    expect(spreadOf(none, 'pistol')).toBe(WEAPONS.pistol.spread);
    expect(critChance(none)).toBe(0);
    expect(fireRateFactor(none, 'pistol')).toBe(1);
  });

  it('max HP (whole HP) and armour off each hit (a hit keeps half), whatever the loadout', () => {
    const hp = DEFENDER_HP + Math.round(LEVEL_BONUS.hp / 2);
    expect(maxHpOf(plain(HALF))).toBe(hp);
    for (const w of ['pistol', 'knife', 'toolkit'] as const)
      expect(maxHpOf(spec(w, HALF))).toBe(hp);
    const armour = LEVEL_BONUS.armour / 2;
    expect(damageTaken(plain(HALF), 60)).toBeCloseTo(60 - armour);
    expect(damageTaken(plain(HALF), 1)).toBe(0.5);
    // A shield's share comes off first.
    const shielded = {
      loadout: { primary: 'pistol', secondary: 'knife', item: 'shield' },
      xp: xpForLevel(HALF),
    } as const;
    const kept = 20 * (1 - SHIELD.damageTaken);
    expect(damageTaken(shielded, 20)).toBeCloseTo(Math.max(kept / 2, kept - armour));
  });

  it('faster reloads on every gun, on top of a Gunner’s', () => {
    const k = 1 - LEVEL_BONUS.reload / 2;
    expect(reloadTime(plain(HALF), 'pistol')).toBeCloseTo(WEAPONS.pistol.reload * k);
    expect(reloadTime(spec('pistol', HALF), 'pistol')).toBeCloseTo(
      WEAPONS.pistol.reload * 0.75 * k,
    );
    expect(reloadTime(spec('knife', HALF), 'pistol')).toBeCloseTo(WEAPONS.pistol.reload * k);
  });

  it('guns fire faster, blades and tools do not; on top of a Gunner’s', () => {
    const k = 1 + LEVEL_BONUS.fireRate / 2;
    expect(fireRateFactor(plain(HALF), 'pistol')).toBeCloseTo(k);
    expect(fireRateFactor(spec('pistol', HALF), 'pistol')).toBeCloseTo(1.125 * k);
    expect(fireRateFactor(plain(HALF, 'knife'), 'knife')).toBe(1);
  });

  it('a narrower cone and more crits, whoever fires; crit damage stays ×2', () => {
    expect(spreadOf(plain(HALF), 'pistol')).toBeCloseTo(
      WEAPONS.pistol.spread * (1 - LEVEL_BONUS.spread / 2),
    );
    expect(critChance(plain(HALF))).toBeCloseTo(LEVEL_BONUS.crit / 2);
    expect(critChance(spec('pistol', HALF))).toBeCloseTo(LEVEL_BONUS.crit / 2 + 0.05);
    expect(critChance(spec('knife', HALF))).toBeCloseTo(LEVEL_BONUS.crit / 2);
    expect(CRIT_DAMAGE).toBe(2);
  });

  it('no level adds damage: only an off-profession specialised gun changes it', () => {
    expect(damageFactor(spec('pistol', 50), 'pistol')).toBe(1);
    expect(damageFactor(spec('knife', 50), 'knife')).toBe(1);
  });

  it('fire rate and reload: a Gunner 12.5% faster and 25% quicker; a sidearm is plain for anyone else', () => {
    expect(fireRateFactor(spec('pistol'), 'pistol')).toBeCloseTo(1.125);
    expect(fireRateFactor(spec('knife'), 'pistol')).toBe(1);
    expect(fireRateFactor(spec('toolkit'), 'pistol')).toBe(1);
    expect(fireRateFactor(spec('knife'), 'knife')).toBe(1);
    expect(reloadTime(spec('pistol'), 'pistol')).toBeCloseTo(WEAPONS.pistol.reload * 0.75);
    expect(reloadTime(spec('knife'), 'pistol')).toBe(WEAPONS.pistol.reload);
    expect(reloadTime(spec('toolkit'), 'pistol')).toBe(WEAPONS.pistol.reload);
  });

  it("a shield slows its holder's gun by 20%, not their blade", () => {
    const shielded: DefenderSpec = {
      ...spec('knife'),
      loadout: { primary: 'pistol', secondary: 'knife', item: 'shield' },
    };
    expect(fireRateFactor(shielded, 'pistol')).toBeCloseTo(0.8);
    expect(fireRateFactor(shielded, 'knife')).toBe(1);
  });
});

describe('the level in a fight (ID-146)', () => {
  /** `s` with a Spewer 100 px in front of its lone defender, who holds fire. */
  function spat(s: HordeState): HordeState {
    const d = s.defenders[0]!;
    d.nextShotAt = 1e9;
    enemy(s, { kind: 'spewer', hp: 1000, maxHp: 1000, x: d.x + 100, y: d.y });
    return s;
  }

  it('a defender joins at their level’s full HP, and the roster brings XP into the horde', () => {
    const s = newHorde(1, {
      ...setup(),
      roster: [
        { id: 'a', name: 'A', loadout: loadoutFrom('pistol'), xp: xpForLevel(HALF) },
        { id: 'b', name: 'B', loadout: loadoutFrom('knife'), xp: 30 },
      ],
    });
    const hp = DEFENDER_HP + Math.round(LEVEL_BONUS.hp / 2);
    expect(s.defenders[0]).toMatchObject({ hp, maxHp: hp, xp: xpForLevel(HALF) });
    expect(s.bench).toEqual([{ id: 'b', name: 'B', loadout: loadoutFrom('knife'), xp: 30 }]);
  });

  it('the injured and benched keep their XP (recruits and replacements bring it back)', () => {
    const d = spec('pistol', 4);
    expect(specOf(standing(d, newHorde(1, setup()).posts[0]!, 0))).toEqual(d);
    expect(specOf({ id: 'x', name: 'X', loadout: loadoutFrom('knife') })).toEqual({
      id: 'x',
      name: 'X',
      loadout: loadoutFrom('knife'),
    });
  });

  it('the level’s armour takes a flat share off each hit', () => {
    const bare = tick(spat(fight(newBase(), spec('pistol'), 'tower', 4)), STEP);
    expect(bare.defenders[0]!.hp).toBe(100 - 8);
    const hp = DEFENDER_HP + Math.round(LEVEL_BONUS.hp / 2);
    const vet = tick(spat(fight(newBase(), spec('pistol', HALF), 'tower', 4)), STEP);
    expect(vet.defenders[0]!.hp).toBeCloseTo(hp - (8 - LEVEL_BONUS.armour / 2));
  });

  it('a hit that would drop them to 0 HP injures them, with no dodge roll (ID-146)', () => {
    const s = spat(fight(newBase(), spec('pistol', 50), 'tower', 4));
    s.defenders[0]!.hp = 2;
    const after = tick(s, STEP);
    expect(after.defenders).toHaveLength(0);
    expect(after.injured).toHaveLength(1);
    expect(after.rng).toEqual(s.rng);
  });

  it('crits deal ×2, about as often as the level’s chance says', () => {
    const d = { ...spec('pistol', 1e4), plain: true as const };
    const s = fight(newBase(), d, 'tower', 4);
    enemy(s, { hp: 1e9, maxHp: 1e9, x: 900, y: 360 });
    const base = WEAPONS.pistol.damage;
    const hits: number[] = [];
    let cur = s;
    for (let i = 0; i < 20_000 && hits.length < 400; i++) {
      const before = cur.enemies[0]!.hp;
      cur = tick(cur, STEP);
      cur.enemies[0]!.x = 900; // held in range, off the wall
      if (cur.enemies[0]!.hp < before) hits.push(before - cur.enemies[0]!.hp);
    }
    const crits = hits.filter((h) => Math.abs(h - CRIT_DAMAGE * base) < 1e-6).length;
    expect(hits.filter((h) => Math.abs(h - base) < 1e-6).length + crits).toBe(400);
    const p = critChance(d);
    expect(crits / 400).toBeGreaterThan(p - 0.07);
    expect(crits / 400).toBeLessThan(p + 0.07);
  });

  it("with no crit chance no crit rolls: a level-1 Ripper's pistol rolls only its spread", () => {
    const s = fight(newBase(), spec('knife'), 'tower', 4);
    enemy(s, { ...tough, x: 900, y: 360 });
    const after = tick(s, STEP);
    expect(after.bullets[0]!.damage).toBe(WEAPONS.pistol.damage);
    const one = structuredClone(s.rng);
    rngFrom(one)();
    expect(after.rng).toEqual(one);
  });

  it('a blade strike crits with the level too (ID-146), at ×2', () => {
    const base = wallWalk();
    // Level 1: a plain 10 and no roll (a Ripper gets no Gunner crit on a blade).
    const bare = fight(base, spec('knife'), 'wall-walk', 2);
    enemy(bare, { ...tough, x: 520, y: 200 });
    const plainHit = tick(bare, STEP);
    expect(plainHit.enemies[0]!.hp).toBe(990);
    expect(plainHit.rng).toEqual(bare.rng);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const r = fight(base, spec('knife', 1e4), 'wall-walk', 2);
      r.rng = { s: seed };
      enemy(r, { ...tough, x: 520, y: 200 });
      seen.add(Math.round((1000 - tick(r, STEP).enemies[0]!.hp) * 1e6) / 1e6);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([10, 10 * CRIT_DAMAGE]);
  });

  it('Aim for the Head and Hollow Points act on a blade too, adding to the level’s crit (ID-130)', () => {
    const base = wallWalk();
    const holding = (d: DefenderSpec, cards: Partial<Record<UpgradeId, number>>, seed: number) => {
      const s = fight(base, d, 'wall-walk', 2);
      s.taken = Object.keys(cards) as UpgradeId[];
      s.cardLevels = { ...cards };
      s.rng = { s: seed };
      enemy(s, { ...tough, x: 520, y: 200 });
      return s;
    };
    const dealt = (d: DefenderSpec, cards: Partial<Record<UpgradeId, number>>) => {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 80; seed++)
        seen.add(
          Math.round((1000 - tick(holding(d, cards, seed), STEP).enemies[0]!.hp) * 1e6) / 1e6,
        );
      return [...seen].sort((a, b) => a - b);
    };
    // Hollow Points alone on a squad that can't crit: a plain 10 and no roll.
    const bare = holding(spec('knife'), { 'hollow-point-rounds': 3 }, 1);
    const after = tick(bare, STEP);
    expect(after.enemies[0]!.hp).toBe(990);
    expect(after.rng).toEqual(bare.rng);
    // Aim for the Head makes a level-1 blade crit, at ×2; Hollow Points adds to it.
    expect(dealt(spec('knife'), { 'aim-for-the-head': 3 })).toEqual([10, 20]);
    expect(dealt(spec('knife'), { 'aim-for-the-head': 3, 'hollow-point-rounds': 3 })).toEqual([
      10, 27.5,
    ]);
    // A levelled survivor crits by their level alone; Hollow Points adds to the ×2.
    expect(dealt(spec('knife', 30), { 'hollow-point-rounds': 2 })).toEqual([
      10,
      10 * (CRIT_DAMAGE + CARD.critDamage[1]!),
    ]);
  });

  it('no damage bonus near the wall any more: a gun shot carries only its own (ID-146)', () => {
    const s = fight(newBase(), spec('pistol', 50), 'tower', 4);
    enemy(s, { ...tough, x: 900, y: 360 });
    expect(tick(s, STEP).bullets[0]!.close).toBeUndefined();
  });

  it('a gun fires at its true rate, not rounded up to whole ticks (ID-125)', () => {
    // Pick a level whose interval falls past half a tick, as a rounding up would show.
    const level = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].find((l) => {
      const i = WEAPONS.pistol.fireInterval / fireRateFactor(spec('pistol', l), 'pistol');
      return (i / STEP) % 1 > 0.5;
    })!;
    const d = spec('pistol', level);
    const interval = WEAPONS.pistol.fireInterval / fireRateFactor(d, 'pistol');
    const s = fight(newBase(), d, 'tower', 4);
    enemy(s, { hp: 1e9, maxHp: 1e9, x: 900, y: 360 });
    const times: number[] = [];
    let cur = s;
    for (let i = 0; i < 300 && times.length < WEAPONS.pistol.magazine; i++) {
      if (cur.shots.some((k) => Math.abs(k.at - cur.time) < 1e-9)) times.push(cur.time);
      cur = tick(cur, STEP);
      cur.enemies[0]!.x = 900;
    }
    const gaps = times.length - 1;
    expect(gaps).toBe(WEAPONS.pistol.magazine - 1);
    expect(Math.abs((times.at(-1)! - times[0]!) / gaps - interval)).toBeLessThanOrEqual(
      STEP / gaps + 1e-9,
    );
  });

  it('repair runs at its base rate whatever the level', () => {
    const s = fight(newBase(), spec('toolkit', 30), 'tower', 6);
    s.layers[0]!.segments[6]!.hp = 100;
    expect(tick(s, 1).layers[0]!.segments[6]!.hp).toBeCloseTo(100 + 3);
  });
});
