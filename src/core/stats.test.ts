// Design §6: defender levels, stat points and titles, and what they do in a fight.
import { describe, expect, it } from 'vitest';
import { buildPost, newBase, type Base, type BasePost } from './base.ts';
import { STEP, WEAPONS, type Stats, type Stock, type WeaponId } from './data.ts';
import { hordeXp } from './game.ts';
import { newHorde, specOf, standing, tick, type DefenderSpec, type HordeState } from './horde.ts';
import {
  cleaveShare,
  critChance,
  damageFactor,
  earnedPoints,
  fireRateFactor,
  levelOf,
  maxHpOf,
  nameTag,
  NO_STATS,
  reloadTime,
  repairFactor,
  spend,
  titleIn,
  topTitle,
  unspentPoints,
  xpForLevel,
} from './stats.ts';
import { enemy, setup } from './testing.ts';
import { loadoutFrom } from './loadout.ts';

const stats = (s: Partial<Stats>): Stats => ({ ...NO_STATS, ...s });
/** Bob carrying what `weapon` alone gave before loadouts: a pistol, plus a knife or toolkit. */
const spec = (weapon: WeaponId, s: Partial<Stats> = {}): DefenderSpec => ({
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
  it('3 per level gained; unspent is earned less spent', () => {
    expect(earnedPoints(0)).toBe(0);
    expect(earnedPoints(25)).toBe(3);
    expect(earnedPoints(75)).toBe(6);
    expect(unspentPoints({ xp: 75, stats: stats({ aim: 2, grit: 1 }) })).toBe(3);
  });

  it('spends one point at a time, refuses with none left, and never touches its input', () => {
    const d = { xp: 25, stats: stats({}) };
    let cur = d;
    for (const stat of ['aim', 'aim', 'grit'] as const) {
      const r = spend(cur, stat);
      if (!r.ok) throw new Error(r.reason);
      cur = r.defender;
    }
    expect(cur.stats).toEqual(stats({ aim: 2, grit: 1 }));
    expect(spend(cur, 'tech')).toEqual({ ok: false, reason: 'No stat points left' });
    expect(d.stats).toEqual(NO_STATS);
    expect(() => spend(d, 'luck' as never)).toThrow(RangeError);
  });
});

describe('titles', () => {
  it('Junior 10, Adept 25, Master 50, Legendary 100 points in the stat', () => {
    const at = (aim: number) => titleIn(stats({ aim }), 'gunner')?.rank ?? null;
    expect([9, 10, 24, 25, 49, 50, 99, 100, 500].map(at)).toEqual([
      null,
      'Junior',
      'Junior',
      'Adept',
      'Adept',
      'Master',
      'Master',
      'Legendary',
      'Legendary',
    ]);
    expect(titleIn(stats({ grit: 100 }), 'gunner')).toBeNull();
  });

  it('the name tag is the highest title; ties → more points, then Gunner, Ripper, Engineer', () => {
    const tag = (s: Partial<Stats>) => nameTag({ name: 'Bob', stats: stats(s) });
    expect(tag({})).toBe('Bob');
    expect(nameTag({ name: 'Bob' })).toBe('Bob');
    expect(tag({ aim: 10 })).toBe('Bob the Gunner');
    expect(tag({ aim: 10, might: 25 })).toBe('Bob the Ripper');
    expect(tag({ aim: 12, might: 10 })).toBe('Bob the Gunner');
    expect(tag({ aim: 10, might: 12 })).toBe('Bob the Ripper');
    expect(tag({ aim: 10, might: 10, tech: 10 })).toBe('Bob the Gunner');
    expect(tag({ might: 10, tech: 10 })).toBe('Bob the Ripper');
    expect(tag({ tech: 50, aim: 49 })).toBe('Bob the Engineer');
    expect(topTitle(stats({ grit: 300 }))).toBeNull();
  });
});

describe('stat effects per weapon (Grit any)', () => {
  it('damage: Aim and the Gunner title on gun shots, Might and the Ripper title on blade strikes', () => {
    expect(damageFactor(spec('pistol', { aim: 5 }), 'pistol')).toBeCloseTo(1.1);
    expect(damageFactor(spec('pistol', { aim: 10 }), 'pistol')).toBeCloseTo(1.2 * 1.05);
    expect(damageFactor(spec('knife', { might: 25 }), 'knife')).toBeCloseTo(1.5 * 1.15);
    // Aim counts on a Ripper's pistol too; Might never does.
    expect(damageFactor(spec('knife', { aim: 10 }), 'pistol')).toBeCloseTo(1.2 * 1.05);
    expect(damageFactor(spec('pistol', { might: 50, tech: 50, grit: 50 }), 'pistol')).toBe(1);
    expect(damageFactor(spec('knife', { aim: 50 }), 'knife')).toBe(1);
    // A tool strike gets nothing.
    expect(damageFactor(spec('toolkit', { tech: 50, aim: 50, might: 50 }), 'toolkit')).toBe(1);
    expect(damageFactor({ loadout: loadoutFrom('pistol') }, 'pistol')).toBe(1);
  });

  it('repair: +2% per point of Tech, Engineers only, times the title bonus', () => {
    expect(repairFactor(spec('toolkit', { tech: 10 }))).toBeCloseTo(1.2 * 1.05);
    expect(repairFactor(spec('toolkit', { aim: 30 }))).toBe(1);
    expect(repairFactor(spec('pistol', { tech: 30 }))).toBe(1);
  });

  it('crit: 0.5% per point of Aim for anyone, +5% for a Gunner, capped at 50%', () => {
    expect(critChance(spec('pistol', {}))).toBeCloseTo(0.05);
    expect(critChance(spec('pistol', { aim: 10 }))).toBeCloseTo(0.1);
    expect(critChance(spec('pistol', { aim: 100 }))).toBe(0.5);
    expect(critChance(spec('pistol', { aim: 1000 }))).toBe(0.5);
    expect(critChance(spec('knife', { aim: 10 }))).toBeCloseTo(0.05);
    expect(critChance(spec('knife', {}))).toBe(0);
    expect(critChance(spec('toolkit', { might: 100 }))).toBe(0);
  });

  it('cleave: 1% per point of Might, capped at 50% (blade strikes only, in the fight)', () => {
    expect(cleaveShare(spec('knife', { might: 20 }))).toBeCloseTo(0.2);
    expect(cleaveShare(spec('knife', { might: 60 }))).toBe(0.5);
    expect(cleaveShare(spec('pistol', { aim: 60 }))).toBe(0);
  });

  it('fire rate and reload: a Gunner 15% faster and 25% quicker; a sidearm is plain for anyone else', () => {
    expect(fireRateFactor(spec('pistol'), 'pistol')).toBeCloseTo(1.15);
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

  it('Grit: +5 max HP per point with any loadout', () => {
    for (const w of ['pistol', 'knife', 'toolkit'] as const) {
      expect(maxHpOf(spec(w, { grit: 4 }))).toBe(120);
    }
    expect(maxHpOf({ loadout: loadoutFrom('pistol') })).toBe(100);
  });
});

describe('stats in a fight', () => {
  const RICH: Stock = { scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 };
  const wallWalk = (() => {
    const r = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: 2 });
    if (!r.ok) throw new Error(r.reason);
    return r.base;
  })();

  it('a defender joins at full HP with Grit, and the roster brings stats into the horde', () => {
    const s = newHorde(1, {
      ...setup(),
      roster: [
        { id: 'a', name: 'A', loadout: loadoutFrom('pistol'), stats: stats({ grit: 4 }) },
        { id: 'b', name: 'B', loadout: loadoutFrom('knife'), stats: stats({ might: 3 }) },
      ],
    });
    expect(s.defenders[0]).toMatchObject({ hp: 120, maxHp: 120, stats: stats({ grit: 4 }) });
    expect(s.bench).toEqual([
      { id: 'b', name: 'B', loadout: loadoutFrom('knife'), stats: stats({ might: 3 }) },
    ]);
  });

  it('the injured and benched keep their stats (recruits and replacements bring them back)', () => {
    const d = spec('pistol', { aim: 3 });
    const copy = specOf(standing(d, newHorde(1, setup()).posts[0]!, 0));
    expect(copy).toEqual(d);
    expect(copy.stats).not.toBe(d.stats);
    expect(specOf({ id: 'x', name: 'X', loadout: loadoutFrom('knife') })).toEqual({
      id: 'x',
      name: 'X',
      loadout: loadoutFrom('knife'),
    });
  });

  it('Aim adds damage to a Gunner shot', () => {
    const s = fight(newBase(), spec('pistol', { aim: 10 }), 'tower', 1);
    enemy(s, { ...tough, x: 900, y: 120 });
    // Aim 10 plus the Gunner's handling can crit (10%): either hit counts.
    const hit = 1000 - tick(s, STEP).enemies[0]!.hp;
    const one = WEAPONS.pistol.damage * 1.2 * 1.05;
    expect([one, one * 2]).toContainEqual(expect.closeTo(hit, 9));
  });

  it('crits deal double, about as often as the chance says', () => {
    const s = fight(newBase(), spec('pistol', { aim: 100 }), 'tower', 1);
    enemy(s, { hp: 1e9, maxHp: 1e9, x: 900, y: 120 });
    const base = WEAPONS.pistol.damage * 3 * 1.5;
    const hits: number[] = [];
    let cur = s;
    for (let i = 0; i < 20_000 && hits.length < 400; i++) {
      const before = cur.enemies[0]!.hp;
      cur = tick(cur, STEP);
      cur.enemies[0]!.x = 900; // held in range, off the wall
      if (cur.enemies[0]!.hp < before) hits.push(before - cur.enemies[0]!.hp);
    }
    const crits = hits.filter((h) => Math.abs(h - 2 * base) < 1e-6).length;
    expect(hits.filter((h) => Math.abs(h - base) < 1e-6).length + crits).toBe(400);
    expect(crits / 400).toBeGreaterThan(0.4);
    expect(crits / 400).toBeLessThan(0.6);
  });

  it("with no crit chance nothing rolls: a Ripper's pistol without Aim leaves the RNG alone", () => {
    const s = fight(newBase(), spec('knife', { might: 50, grit: 5 }), 'tower', 1);
    enemy(s, { ...tough, x: 900, y: 120 });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(1000 - WEAPONS.pistol.damage);
    expect(after.rng).toEqual(s.rng);
  });

  it('Might adds damage and cleaves enemies within 30 px of the target', () => {
    const s = fight(wallWalk, spec('knife', { might: 20 }), 'wall-walk', 2);
    enemy(s, { ...tough, x: 520, y: 200 });
    const near = enemy(s, { ...tough, x: 520, y: 230 });
    const far = enemy(s, { ...tough, x: 551, y: 200 });
    const after = tick(s, STEP);
    const hit = 10 * 1.4 * 1.05;
    expect(after.enemies.find((e) => e.id === s.enemies[0]!.id)!.hp).toBeCloseTo(1000 - hit);
    expect(after.enemies.find((e) => e.id === near.id)!.hp).toBeCloseTo(1000 - hit * 0.2);
    expect(after.enemies.find((e) => e.id === far.id)!.hp).toBe(1000);
  });

  it('a gun shot never cleaves and a blade strike never crits', () => {
    const g = fight(newBase(), spec('pistol', { might: 50 }), 'tower', 1);
    enemy(g, { ...tough, x: 900, y: 120 });
    const near = enemy(g, { ...tough, x: 900, y: 140 });
    expect(tick(g, STEP).enemies.find((e) => e.id === near.id)!.hp).toBe(1000);
    const r = fight(wallWalk, spec('knife', { aim: 100 }), 'wall-walk', 2);
    enemy(r, { ...tough, x: 520, y: 200 });
    const after = tick(r, STEP);
    expect(after.enemies[0]!.hp).toBe(990);
    expect(after.rng).toEqual(r.rng);
  });

  it('Tech speeds up an Engineer’s repair', () => {
    const s = fight(newBase(), spec('toolkit', { tech: 10 }), 'tower', 3);
    s.layers[0]!.segments[3]!.hp = 100;
    expect(tick(s, 1).layers[0]!.segments[3]!.hp).toBeCloseTo(100 + 3 * 1.2 * 1.05);
  });
});
