// Design §6: defender levels, stat points, and what each stat does in a fight (ID-084).
import { describe, expect, it } from 'vitest';
import { buildPost, newBase, type Base, type BasePost } from './base.ts';
import {
  CARD,
  DEFENDER_HP,
  OPEN_STATS,
  POINTS_PER_LEVEL,
  STAT_ACTIVE,
  STAT_EFFECT,
  STAT_SPLIT,
  STAT_NAMES,
  STATS,
  STEP,
  TRAIT,
  WEAPONS,
  type Stats,
  type Stock,
  type FreeWeaponId,
  stockOf,
} from './data.ts';
import { hordeXp } from './game.ts';
import {
  newHorde,
  specOf,
  standing,
  tick,
  wallFront,
  type DefenderSpec,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import {
  activeEffects,
  bankedPoints,
  critChance,
  critDamage,
  damageFactor,
  damageTaken,
  dodgeChance,
  earnedPoints,
  fireRateFactor,
  isLocked,
  levelOf,
  maxHpOf,
  NO_STATS,
  reloadTime,
  spend,
  unspend,
  spreadOf,
  statBonus,
  unspentPoints,
  wallDamage,
  xpForLevel,
} from './stats.ts';
import { rngFrom } from './rng.ts';
import { enemy, setup } from './testing.ts';
import { loadoutFrom } from './loadout.ts';

const stats = (s: Partial<Stats>): Stats => ({ ...NO_STATS, ...s });
/** Bob carrying what `weapon` alone gave before loadouts: a pistol, plus a knife or toolkit. */
const spec = (weapon: FreeWeaponId, s: Partial<Stats> = {}): DefenderSpec => ({
  id: 'd',
  name: 'Bob',
  loadout: loadoutFrom(weapon),
  stats: stats(s),
});
const tough = { hp: 1000, maxHp: 1000 };

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

describe('stat points', () => {
  it('1 per level gained; unspent is earned less spent (ID-096)', () => {
    expect(POINTS_PER_LEVEL).toBe(1);
    expect(earnedPoints(0)).toBe(0);
    expect(earnedPoints(25)).toBe(1);
    expect(earnedPoints(75)).toBe(2);
    expect(unspentPoints({ xp: 150, stats: stats({ instinct: 1, mind: 1 }) })).toBe(1);
  });

  it('points banked from an older save count as earned, on top of new levels (ID-096)', () => {
    // An old save's level-3 defender earned 3 × 2 = 6: 2 at today's rate, 4 banked.
    expect(bankedPoints(0)).toBe(0);
    expect(bankedPoints(xpForLevel(3))).toBe(4);
    expect(earnedPoints(xpForLevel(3), 4)).toBe(6);
    // Banked stays put; the next level adds 1.
    expect(earnedPoints(xpForLevel(4), 4)).toBe(7);
    expect(unspentPoints({ xp: xpForLevel(3), stats: stats({ mind: 5 }), banked: 4 })).toBe(1);
    expect(unspentPoints({ xp: xpForLevel(3), stats: stats({ mind: 5 }) })).toBe(-3);
  });

  it('spends one point at a time, refuses with none left, and never touches its input', () => {
    const d = { xp: xpForLevel(4), stats: stats({}) };
    let cur = d;
    for (const stat of ['instinct', 'agility', 'mind'] as const) {
      const r = spend(cur, stat);
      if (!r.ok) throw new Error(r.reason);
      cur = r.defender;
    }
    expect(cur.stats).toEqual(stats({ instinct: 1, agility: 1, mind: 1 }));
    expect(spend(cur, 'mind')).toEqual({ ok: false, reason: 'No stat points left' });
    expect(d.stats).toEqual(NO_STATS);
    expect(() => spend(d, 'aim' as never)).toThrow(RangeError);
  });

  it('unspend takes one point back out, refuses an empty stat, and never touches its input (ID-126)', () => {
    const d = { xp: xpForLevel(4), stats: stats({ agility: 2 }) };
    const r = unspend(d, 'agility');
    if (!r.ok) throw new Error(r.reason);
    expect(r.defender.stats).toEqual(stats({ agility: 1 }));
    expect(d.stats).toEqual(stats({ agility: 2 }));
    // Never below zero, so no Undo can make points out of nothing.
    expect(unspend(d, 'mind')).toEqual({ ok: false, reason: 'No point in that stat' });
    expect(unspend(d, 'tinker')).toEqual({ ok: false, reason: 'No point in that stat' });
    for (const bad of ['aim', '__proto__', 'constructor']) {
      expect(() => unspend(d, bad as never)).toThrow(RangeError);
    }
  });

  it('Tinker is locked: no point goes in, with points to spend or not (ID-084)', () => {
    expect(STATS).toEqual(['instinct', 'agility', 'mind', 'tinker']);
    expect(STAT_NAMES.mind).toBe('Sharp Mind');
    expect(OPEN_STATS).toEqual(['instinct', 'agility', 'mind']);
    expect(isLocked('tinker')).toBe(true);
    expect(OPEN_STATS.some(isLocked)).toBe(false);
    expect(spend({ xp: 1000, stats: stats({}) }, 'tinker')).toEqual({
      ok: false,
      reason: 'Unlocks later',
    });
  });
});

describe('every bonus shrinks as points pile up (ID-084)', () => {
  it('cap × P / (P + 10 × n), n the active effects: half the cap at 10n points, never the cap (ID-096)', () => {
    expect(STAT_SPLIT).toBe(10);
    // Instinct drives 4 effects, Agility 2, Sharp Mind 3, Tinker none yet (ID-125).
    expect(STATS.map(activeEffects)).toEqual([4, 2, 3, 0]);
    expect(statBonus(0, 'agility', 'reload')).toBe(0);
    expect(statBonus(20, 'agility', 'reload')).toBe(STAT_EFFECT.reload / 2);
    expect(statBonus(40, 'instinct', 'hp')).toBe(STAT_EFFECT.hp / 2);
    expect(statBonus(30, 'mind', 'crit')).toBeCloseTo(STAT_EFFECT.crit / 2);
    expect(statBonus(1e9, 'agility', 'reload')).toBeLessThan(STAT_EFFECT.reload);
    // Each point adds less than the one before.
    const gains = [1, 2, 10, 50].map(
      (p) => statBonus(p, 'mind', 'spread') - statBonus(p - 1, 'mind', 'spread'),
    );
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
  });

  it('1 new point is worth 2 old ones (P + 20) before the split, then shared n ways (ID-096)', () => {
    const old = (p: number, cap: number) => (cap * p) / (p + 20);
    // With two effects, 2 points give each what 2 old points gave alone.
    expect(statBonus(2, 'agility', 'reload')).toBeCloseTo(old(2, STAT_EFFECT.reload));
    expect(statBonus(10, 'agility', 'reload')).toBeCloseTo(old(10, STAT_EFFECT.reload));
    // With three effects, 3 points; with four, 4.
    expect(statBonus(3, 'mind', 'crit')).toBeCloseTo(old(2, STAT_EFFECT.crit));
    expect(statBonus(4, 'instinct', 'hp')).toBeCloseTo(old(2, STAT_EFFECT.hp));
  });

  it('only active effects get a share: one a stat does not drive gives nothing (ID-096)', () => {
    expect(STAT_ACTIVE).toEqual({
      instinct: ['hp', 'armour', 'dodge', 'wallDamage'],
      agility: ['reload', 'fireRate'],
      mind: ['crit', 'critBonus', 'spread'],
      tinker: [],
    });
    expect(statBonus(50, 'agility', 'hp')).toBe(0);
    expect(statBonus(50, 'tinker', 'reload')).toBe(0);
  });

  it('no number of points breaks a fight: every bonus stays under its cap', () => {
    const huge = (s: Partial<Stats>) => ({
      loadout: loadoutFrom('pistol'),
      plain: true as const,
      stats: stats(s),
    });
    const top = 1e9;
    expect(maxHpOf(huge({ instinct: top }))).toBe(DEFENDER_HP + STAT_EFFECT.hp);
    expect(damageTaken(huge({ instinct: top }), 2)).toBe(1);
    expect(dodgeChance(huge({ instinct: top }))).toBeLessThan(STAT_EFFECT.dodge);
    const pistol = WEAPONS.pistol;
    expect(reloadTime(huge({ agility: top }), 'pistol')).toBeGreaterThan(pistol.reload / 2);
    expect(spreadOf(huge({ mind: top }), 'pistol')).toBeGreaterThan(pistol.spread / 2);
    expect(critChance(huge({ mind: top }))).toBeLessThan(STAT_EFFECT.crit);
    expect(critDamage(huge({ mind: top }))).toBeLessThan(4);
  });
});

describe('what each stat does, with any weapon (ID-084)', () => {
  const plain = (s: Partial<Stats>, weapon: FreeWeaponId = 'pistol') => ({
    loadout: loadoutFrom(weapon),
    plain: true as const,
    stats: stats(s),
  });

  // Instinct's points are shared 4 ways (ID-125), Agility's 2: half each cap at 40 and 20.
  it('Instinct: + max HP (whole), + armour off each hit (a hit keeps half), + injury dodge', () => {
    expect(maxHpOf(plain({}))).toBe(100);
    expect(maxHpOf(plain({ instinct: 1 }))).toBe(102);
    expect(maxHpOf(plain({ instinct: 10 }))).toBe(120);
    expect(maxHpOf(plain({ instinct: 40 }))).toBe(150);
    expect(damageTaken(plain({}), 5)).toBe(5);
    expect(damageTaken(plain({ instinct: 40 }), 5)).toBe(3);
    expect(damageTaken(plain({ instinct: 40 }), 3)).toBe(1.5);
    expect(damageTaken(plain({ instinct: 40 }), 60)).toBe(58);
    expect(dodgeChance(plain({}))).toBe(0);
    expect(dodgeChance(plain({ instinct: 40 }))).toBeCloseTo(0.15);
    // Every loadout alike, a shield's share off first.
    for (const w of ['pistol', 'knife', 'toolkit'] as const) {
      expect(maxHpOf(spec(w, { instinct: 40 }))).toBe(150);
    }
    const shielded = {
      loadout: { primary: 'pistol', secondary: 'knife', item: 'shield' },
    } as const;
    expect(damageTaken({ ...shielded, stats: stats({ instinct: 40 }) }, 10)).toBeCloseTo(5);
  });

  it('Agility: faster reloads on every gun, on top of a Gunner’s', () => {
    expect(reloadTime(plain({}), 'pistol')).toBe(WEAPONS.pistol.reload);
    expect(reloadTime(plain({ agility: 20 }), 'pistol')).toBeCloseTo(WEAPONS.pistol.reload * 0.75);
    expect(reloadTime(spec('pistol', { agility: 20 }), 'pistol')).toBeCloseTo(
      WEAPONS.pistol.reload * 0.75 * 0.75,
    );
    expect(reloadTime(spec('knife', { agility: 20 }), 'pistol')).toBeCloseTo(
      WEAPONS.pistol.reload * 0.75,
    );
  });

  it('Sharp Mind: narrower cone, more crits, harder crits, whoever fires', () => {
    expect(spreadOf(plain({}), 'pistol')).toBe(WEAPONS.pistol.spread);
    expect(spreadOf(plain({ mind: 30 }), 'pistol')).toBeCloseTo(WEAPONS.pistol.spread * 0.75);
    expect(critChance(plain({}))).toBe(0);
    expect(critChance(plain({ mind: 30 }))).toBeCloseTo(0.25);
    expect(critChance(spec('pistol', { mind: 30 }))).toBeCloseTo(0.3);
    expect(critChance(spec('knife', { mind: 30 }))).toBeCloseTo(0.25);
    expect(critDamage(plain({}))).toBe(2);
    expect(critDamage(plain({ mind: 30 }))).toBeCloseTo(3);
  });

  it('no stat adds damage: only an off-profession specialised gun changes it', () => {
    const lots = { instinct: 50, agility: 50, mind: 50 };
    expect(damageFactor(spec('pistol', lots), 'pistol')).toBe(1);
    expect(damageFactor(spec('knife', lots), 'knife')).toBe(1);
    expect(damageFactor({ loadout: loadoutFrom('pistol') }, 'pistol')).toBe(1);
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

describe('stats in a fight', () => {
  /** `s` with a Spewer 100 px in front of its lone defender, who holds fire. */
  function spat(s: HordeState): HordeState {
    const d = s.defenders[0]!;
    d.nextShotAt = 1e9;
    enemy(s, { kind: 'spewer', hp: 1000, maxHp: 1000, x: d.x + 100, y: d.y });
    return s;
  }

  it('a defender joins at full HP with Instinct, and the roster brings stats into the horde', () => {
    const s = newHorde(1, {
      ...setup(),
      roster: [
        { id: 'a', name: 'A', loadout: loadoutFrom('pistol'), stats: stats({ instinct: 40 }) },
        { id: 'b', name: 'B', loadout: loadoutFrom('knife'), stats: stats({ mind: 3 }) },
      ],
    });
    expect(s.defenders[0]).toMatchObject({ hp: 150, maxHp: 150, stats: stats({ instinct: 40 }) });
    expect(s.bench).toEqual([
      { id: 'b', name: 'B', loadout: loadoutFrom('knife'), stats: stats({ mind: 3 }) },
    ]);
  });

  it('the injured and benched keep their stats (recruits and replacements bring them back)', () => {
    const d = spec('pistol', { agility: 3 });
    const copy = specOf(standing(d, newHorde(1, setup()).posts[0]!, 0));
    expect(copy).toEqual(d);
    expect(copy.stats).not.toBe(d.stats);
    expect(specOf({ id: 'x', name: 'X', loadout: loadoutFrom('knife') })).toEqual({
      id: 'x',
      name: 'X',
      loadout: loadoutFrom('knife'),
    });
  });

  it("Instinct's armour takes a flat share off each hit", () => {
    const bare = tick(spat(fight(newBase(), spec('pistol'), 'tower', 4)), STEP);
    expect(bare.defenders[0]!.hp).toBe(100 - 8);
    const tough40 = tick(
      spat(fight(newBase(), spec('pistol', { instinct: 40 }), 'tower', 4)),
      STEP,
    );
    expect(tough40.defenders[0]!.hp).toBe(150 - 6);
  });

  it('Instinct sometimes leaves a defender at 1 HP from a hit that would injure them', () => {
    let saved = 0;
    const tries = 400;
    for (let seed = 1; seed <= tries; seed++) {
      const s = spat(fight(newBase(), spec('pistol', { instinct: 30 }), 'tower', 4));
      s.rng = { s: seed };
      s.defenders[0]!.hp = 5;
      const after = tick(s, STEP);
      if (after.defenders[0]?.hp === 1) saved += 1;
      else expect(after.injured).toHaveLength(1);
    }
    // 15% at 30 points.
    expect(saved / tries).toBeGreaterThan(0.1);
    expect(saved / tries).toBeLessThan(0.2);
  });

  it('with no Instinct, or at 1 HP already, an injuring hit rolls nothing and injures', () => {
    for (const [s, hp] of [
      [spat(fight(newBase(), spec('pistol'), 'tower', 4)), 5],
      [spat(fight(newBase(), spec('pistol', { instinct: 1e6 }), 'tower', 4)), 1],
    ] as const) {
      s.defenders[0]!.hp = hp;
      const after = tick(s, STEP);
      expect(after.defenders).toHaveLength(0);
      expect(after.injured).toHaveLength(1);
      expect(after.rng).toEqual(s.rng);
    }
  });

  it('Sharp Mind crits deal its bigger multiplier, about as often as the chance says', () => {
    const d = { ...spec('pistol', { mind: 1e6 }), plain: true as const };
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
    const crits = hits.filter((h) => Math.abs(h - critDamage(d) * base) < 1e-6).length;
    expect(hits.filter((h) => Math.abs(h - base) < 1e-6).length + crits).toBe(400);
    // Just under 50% at a huge Sharp Mind.
    expect(crits / 400).toBeGreaterThan(0.4);
    expect(crits / 400).toBeLessThan(0.6);
  });

  it("with no crit chance no crit rolls: a Ripper's pistol without Sharp Mind rolls only its spread", () => {
    const s = fight(newBase(), spec('knife', { instinct: 50, agility: 5 }), 'tower', 4);
    enemy(s, { ...tough, x: 900, y: 360 });
    const after = tick(s, STEP);
    expect(after.bullets[0]!.damage).toBe(WEAPONS.pistol.damage);
    // Only the spread rolled, once.
    const one = structuredClone(s.rng);
    rngFrom(one)();
    expect(after.rng).toEqual(one);
  });

  it('a blade strike crits with Sharp Mind too, at its own odds and multiplier (ID-084)', () => {
    const wallWalk = (() => {
      const RICH: Stock = stockOf({ scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 });
      const r = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: 2 });
      if (!r.ok) throw new Error(r.reason);
      return r.base;
    })();
    // No Sharp Mind: a plain 10 and no roll (a Ripper gets no Gunner crit on a blade).
    const bare = fight(wallWalk, spec('knife'), 'wall-walk', 2);
    enemy(bare, { ...tough, x: 520, y: 200 });
    const plain = tick(bare, STEP);
    expect(plain.enemies[0]!.hp).toBe(990);
    expect(plain.rng).toEqual(bare.rng);
    // Sharp Mind: some seeds crit for 10 × critDamage, the rest hit for 10.
    const d = spec('knife', { mind: 1e6 });
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = fight(wallWalk, d, 'wall-walk', 2);
      r.rng = { s: seed };
      enemy(r, { ...tough, x: 520, y: 200 });
      seen.add(Math.round((1000 - tick(r, STEP).enemies[0]!.hp) * 1e6) / 1e6);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([
      10,
      Math.round(10 * critDamage(d) * 1e6) / 1e6,
    ]);
  });

  it('Aim for the Head and Hollow Points act on a blade too, adding to Sharp Mind (ID-130)', () => {
    const wallWalk = (() => {
      const RICH: Stock = stockOf({ scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 });
      const r = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: 2 });
      if (!r.ok) throw new Error(r.reason);
      return r.base;
    })();
    const holding = (d: DefenderSpec, cards: Partial<Record<UpgradeId, number>>, seed: number) => {
      const s = fight(wallWalk, d, 'wall-walk', 2);
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
    const r = (x: number) => Math.round(x * 1e6) / 1e6;
    // Hollow Points alone on a squad that can't crit: a plain 10 and no roll.
    const bare = holding(spec('knife'), { 'hollow-point-rounds': 3 }, 1);
    const plain = tick(bare, STEP);
    expect(plain.enemies[0]!.hp).toBe(990);
    expect(plain.rng).toEqual(bare.rng);
    // Aim for the Head makes a blade crit with no Sharp Mind, at ×2; Hollow Points adds to it.
    expect(dealt(spec('knife'), { 'aim-for-the-head': 3 })).toEqual([10, 20]);
    expect(dealt(spec('knife'), { 'aim-for-the-head': 3, 'hollow-point-rounds': 3 })).toEqual([
      10, 27.5,
    ]);
    // With Sharp Mind, Hollow Points adds to its bigger multiplier (not the larger of the two).
    const mind = spec('knife', { mind: 30 });
    expect(dealt(mind, { 'hollow-point-rounds': 2 })).toEqual([
      10,
      r(10 * (critDamage(mind) + CARD.critDamage[1]!)),
    ]);
  });

  it("Instinct: a gun shot carries its damage near the wall, added to an SMG's (ID-125)", () => {
    const shot = (d: DefenderSpec) => {
      const s = fight(newBase(), d, 'tower', 4);
      enemy(s, { ...tough, x: 900, y: 360 });
      return tick(s, STEP).bullets[0]!;
    };
    expect(shot(spec('pistol')).close).toBeUndefined();
    expect(shot(spec('pistol', { instinct: 40 })).close).toBeCloseTo(STAT_EFFECT.wallDamage / 2);
    expect(wallDamage(spec('pistol', { instinct: 40 }))).toBeCloseTo(STAT_EFFECT.wallDamage / 2);
    const smg: DefenderSpec = {
      ...spec('pistol', { instinct: 40 }),
      loadout: {
        primary: { uid: 'h1', base: 'smg', rarity: 'common', affixes: [] },
        secondary: null,
        item: null,
      },
    };
    expect(shot(smg).close).toBeCloseTo(TRAIT.close.bonus + STAT_EFFECT.wallDamage / 2);
  });

  it("Instinct: a blade strike hits harder near the wall's front (ID-125)", () => {
    const wallWalk = (() => {
      const RICH: Stock = stockOf({ scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 });
      const r = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: 2 });
      if (!r.ok) throw new Error(r.reason);
      return r.base;
    })();
    const strike = (instinct: number, x: number): number => {
      const s = fight(wallWalk, spec('knife', { instinct }), 'wall-walk', 2);
      enemy(s, { ...tough, x, y: 200 });
      return 1000 - tick(s, STEP).enemies[0]!.hp;
    };
    // 520 px stands within the near-wall band in front of the wall's face.
    expect(520).toBeLessThanOrEqual(
      wallFront(fight(wallWalk, spec('knife'), 'wall-walk', 2)) + TRAIT.close.range,
    );
    expect(strike(0, 520)).toBe(10);
    expect(strike(40, 520)).toBeCloseTo(10 * (1 + STAT_EFFECT.wallDamage / 2));
  });

  it('Agility: guns fire faster, blades and tools do not (ID-125)', () => {
    const plain = (s: Partial<Stats>, weapon: FreeWeaponId = 'pistol') => ({
      loadout: loadoutFrom(weapon),
      plain: true as const,
      stats: stats(s),
    });
    expect(fireRateFactor(plain({}), 'pistol')).toBe(1);
    expect(fireRateFactor(plain({ agility: 20 }), 'pistol')).toBeCloseTo(
      1 + STAT_EFFECT.fireRate / 2,
    );
    expect(fireRateFactor(spec('pistol', { agility: 20 }), 'pistol')).toBeCloseTo(
      1.125 * (1 + STAT_EFFECT.fireRate / 2),
    );
    expect(fireRateFactor(plain({ agility: 20 }, 'knife'), 'knife')).toBe(1);
    expect(fireRateFactor(plain({ agility: 1e9 }), 'pistol')).toBeLessThan(
      1 + STAT_EFFECT.fireRate,
    );
  });

  it('a gun fires at its true rate, not rounded up to whole ticks (ID-125)', () => {
    // A Gunner's pistol with 20 Agility: 0.6 s / (1.125 × 1.35) ≈ 0.395 s, 11.85 ticks;
    // rounded up to 12 (0.4 s) before.
    const d = spec('pistol', { agility: 20 });
    const interval = WEAPONS.pistol.fireInterval / fireRateFactor(d, 'pistol');
    expect((interval / STEP) % 1).toBeGreaterThan(0.5);
    const s = fight(newBase(), d, 'tower', 4);
    enemy(s, { hp: 1e9, maxHp: 1e9, x: 900, y: 360 });
    const times: number[] = [];
    let cur = s;
    for (let i = 0; i < 300 && times.length < WEAPONS.pistol.magazine; i++) {
      if (cur.shots.some((k) => Math.abs(k.at - cur.time) < 1e-9)) times.push(cur.time);
      cur = tick(cur, STEP);
      cur.enemies[0]!.x = 900;
    }
    // A magazine with no reload between: the mean gap is the true interval, give or take
    // a tick over the whole run (STEP / 9 ≈ 0.0037 s), not a whole tick longer each shot
    // (0.400 s a gap before, 0.0049 s off). The fraction check above keeps that gap.
    const gaps = times.length - 1;
    expect(gaps).toBe(WEAPONS.pistol.magazine - 1);
    expect(Math.abs((times.at(-1)! - times[0]!) / gaps - interval)).toBeLessThanOrEqual(
      STEP / gaps + 1e-9,
    );
  });

  it('repair runs at its base rate until Tinker unlocks', () => {
    const s = fight(
      newBase(),
      spec('toolkit', { instinct: 10, agility: 10, mind: 10 }),
      'tower',
      6,
    );
    s.layers[0]!.segments[6]!.hp = 100;
    expect(tick(s, 1).layers[0]!.segments[6]!.hp).toBeCloseTo(100 + 3);
  });
});
