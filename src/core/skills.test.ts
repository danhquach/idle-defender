// Design §4, as built ID-019: active skills researched at the Lab, aimed at a point,
// paid with horde cash and then cooling down; they hit enemies only.
import { describe, expect, it } from 'vitest';
import { ENEMIES, FIELD, SKILL_FLASH, SKILL_IDS, SKILLS, STEP, type SkillId } from './data.ts';
import { newGame, startHorde } from './game.ts';
import { newHorde, stunned, tick, type HordeState } from './horde.ts';
import { research, researchLock, upgradeLab } from './research.ts';
import { skillLeft, skillLock, useSkill } from './skills.ts';
import { enemy, setup } from './testing.ts';

/** A horde with every skill researched, no spawns left and `cash` in hand. */
function fight(cash = 100): HordeState {
  const s = newHorde(1, { ...setup(), skills: [...SKILL_IDS] });
  s.toSpawn = 0;
  s.cash = cash;
  return s;
}

function used(s: HordeState, id: SkillId, x = 1400, y = 200): HordeState {
  const r = useSkill(s, id, x, y);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const wallHp = (s: HordeState): number =>
  s.layers.reduce((sum, l) => sum + l.segments.reduce((t, seg) => t + seg.hp, 0), 0);

describe('airstrike', () => {
  it('hits every enemy within its radius at once, edge included, and nothing past it', () => {
    const s = fight();
    const r = SKILLS.airstrike.radius;
    const inside = enemy(s, { x: 1400, y: 200, hp: 100, maxHp: 100 });
    const edge = enemy(s, { x: 1400 + r, y: 200, hp: 100, maxHp: 100 });
    const past = enemy(s, { x: 1400, y: 200 - r - 1, hp: 100, maxHp: 100 });
    const after = used(s, 'airstrike');
    const hp = (id: number) => after.enemies.find((e) => e.id === id)!.hp;
    expect(hp(inside.id)).toBe(100 - SKILLS.airstrike.damage);
    expect(hp(edge.id)).toBe(100 - SKILLS.airstrike.damage);
    expect(hp(past.id)).toBe(100);
    expect(after.cash).toBe(100 - SKILLS.airstrike.cost);
  });

  it('kills pay XP and cash at once, and clear a focus on them', () => {
    const s = fight();
    const a = enemy(s, { x: 1400, y: 200 });
    enemy(s, { x: 1420, y: 210 });
    s.focusId = a.id;
    const after = used(s, 'airstrike');
    expect(after.enemies).toEqual([]);
    expect(after.cash).toBe(100 - SKILLS.airstrike.cost + 2 * ENEMIES.shambler.cash);
    expect(after.xp).toBe(2 * ENEMIES.shambler.xp);
    expect(after.focusId).toBeNull();
  });

  it('hits enemies only: walls, turrets, defenders and the bank are untouched', () => {
    const s = fight();
    const d = s.defenders[0]!;
    const after = used(s, 'airstrike', d.x, d.y);
    expect(after.defenders).toEqual(s.defenders);
    expect(after.layers).toEqual(s.layers);
    expect(after.turrets).toEqual(s.turrets);
    expect(after.energy).toBe(s.energy);
  });
});

describe('molotov', () => {
  it('burns enemies inside for its seconds of fight time, then goes out', () => {
    let s = fight();
    // Held in place so it stays in the fire, out of the defender's reach.
    const held = enemy(s, { x: 1500, y: 200, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
    const out = enemy(s, { x: 1500, y: 300 + 1, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
    s = used(s, 'molotov', 1500, 300 - SKILLS.molotov.radius - 20);
    expect(s.fires).toHaveLength(1);
    s = tick(s, 1);
    const hp = (id: number) => s.enemies.find((e) => e.id === id)!.hp;
    expect(hp(held.id)).toBeCloseTo(1000 - SKILLS.molotov.dps, 6);
    expect(hp(out.id)).toBe(1000);
    s = tick(s, SKILLS.molotov.seconds + 1);
    expect(s.fires).toEqual([]);
    expect(hp(held.id)).toBeCloseTo(1000 - SKILLS.molotov.dps * SKILLS.molotov.seconds, 6);
  });

  it('stops burning during a pick, and a burn kill pays cash', () => {
    let s = used(fight(), 'molotov');
    const e = enemy(s, { x: 1400, y: 200, hp: 1, stunnedUntil: 1e9 });
    s.offer = [];
    s = tick(s, 5);
    expect(s.enemies.find((x) => x.id === e.id)!.hp).toBe(1);
    s.offer = null;
    const cash = s.cash;
    s = tick(s, 1);
    expect(s.enemies.some((x) => x.id === e.id)).toBe(false);
    expect(s.cash).toBe(cash + ENEMIES.shambler.cash);
  });
});

describe('flashbang', () => {
  it('stuns enemies in its radius from moving until it wears off', () => {
    let s = fight();
    const near = enemy(s, { x: 1500, y: 200, hp: 1e6, maxHp: 1e6 });
    const far = enemy(s, { x: 1500, y: 200 - SKILLS.flashbang.radius - 1, hp: 1e6, maxHp: 1e6 });
    s = used(s, 'flashbang', 1500, 200);
    const at = (id: number) => s.enemies.find((e) => e.id === id)!;
    expect(stunned(s, at(near.id))).toBe(true);
    expect(stunned(s, at(far.id))).toBe(false);
    s = tick(s, SKILLS.flashbang.seconds - 0.5);
    expect(at(near.id).x).toBe(1500);
    expect(at(far.id).x).toBeLessThan(1500);
    s = tick(s, 1);
    expect(stunned(s, at(near.id))).toBe(false);
    expect(at(near.id).x).toBeLessThan(1500);
  });

  it('stops a stunned enemy hitting the wall; an unstunned one does', () => {
    const atWall = (): HordeState => {
      const s = fight();
      const outer = s.layers.reduce((a, b) => (b.x > a.x ? b : a));
      enemy(s, { x: outer.x + 20, y: 220, hp: 1e6, maxHp: 1e6 });
      return s;
    };
    const control = atWall();
    expect(wallHp(tick(control, 2))).toBeLessThan(wallHp(control));
    const e = control.enemies[0]!;
    const aimed = used(atWall(), 'flashbang', e.x, e.y);
    expect(wallHp(tick(aimed, 2))).toBe(wallHp(aimed));
  });

  it('stuns in fight time: a pick holds it, and a second bang never shortens it', () => {
    const long = fight();
    enemy(long, { x: 1400, y: 200, stunnedUntil: 99 });
    expect(used(long, 'flashbang').enemies[0]!.stunnedUntil).toBe(99);

    let s = fight();
    enemy(s, { x: 1400, y: 200 });
    s = used(s, 'flashbang');
    s.offer = [];
    s = tick(s, 10);
    expect(stunned(s, s.enemies[0]!)).toBe(true);
  });
});

describe('cooldowns', () => {
  it('start at use, count fight time only, and every skill is ready at the start', () => {
    let s = fight();
    for (const id of SKILL_IDS) expect(skillLock(s, id)).toBeNull();
    s = used(s, 'molotov');
    expect(skillLeft(s, 'molotov')).toBe(SKILLS.molotov.cooldown);
    expect(useSkill(s, 'molotov', 1400, 200)).toEqual({ ok: false, reason: 'Not ready yet' });
    expect(skillLock(s, 'flashbang')).toBeNull(); // each skill cools down on its own
    s.offer = [];
    s = tick(s, 10);
    expect(skillLeft(s, 'molotov')).toBe(SKILLS.molotov.cooldown);
    s.offer = null;
    s = tick(s, SKILLS.molotov.cooldown - 1);
    expect(skillLeft(s, 'molotov')).toBeGreaterThan(0);
    s = tick(s, 1 + STEP);
    expect(skillLeft(s, 'molotov')).toBe(0);
    expect(skillLock(s, 'molotov')).toBeNull();
  });

  it('a flash shows for about SKILL_FLASH seconds', () => {
    let s = used(fight(), 'flashbang', 900, 100);
    expect(s.blasts).toEqual([{ skill: 'flashbang', x: 900, y: 100, at: 0 }]);
    s = tick(s, SKILL_FLASH - STEP);
    expect(s.blasts).toHaveLength(1);
    s = tick(s, 3 * STEP);
    expect(s.blasts).toEqual([]);
  });
});

describe('refusals', () => {
  it('refuses an unresearched skill, short cash, a pick, a replacement or a finished fight', () => {
    const none = newHorde(1, setup());
    none.cash = 999;
    expect(useSkill(none, 'airstrike', 900, 200)).toEqual({
      ok: false,
      reason: 'Research Airstrike first',
    });
    const poor = fight(SKILLS.flashbang.cost - 1);
    const before = structuredClone(poor);
    expect(useSkill(poor, 'flashbang', 900, 200)).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(poor).toEqual(before);
    const s = fight();
    expect(useSkill({ ...s, offer: [] }, 'flashbang', 900, 200)).toEqual({
      ok: false,
      reason: 'Pick first',
    });
    expect(useSkill({ ...s, replace: { injuredId: 'a' } as never }, 'flashbang', 900, 200)).toEqual(
      { ok: false, reason: 'Pick first' },
    );
    expect(useSkill({ ...s, outcome: 'lost' }, 'flashbang', 900, 200)).toEqual({
      ok: false,
      reason: 'The horde is over',
    });
  });

  it('refuses an aim off the field and throws on a bad number or an unknown skill', () => {
    const s = fight();
    const before = structuredClone(s);
    for (const [x, y] of [
      [-1, 200],
      [FIELD.right + 1, 200],
      [900, -1],
      [900, FIELD.height + 1],
    ] as const) {
      expect(useSkill(s, 'flashbang', x, y)).toEqual({ ok: false, reason: 'Aim at the field' });
    }
    expect(useSkill(s, 'flashbang', 0, FIELD.height).ok).toBe(true); // corners count
    expect(s).toEqual(before);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => useSkill(s, 'flashbang', bad, 200)).toThrow(RangeError);
      expect(() => useSkill(s, 'flashbang', 900, bad)).toThrow(RangeError);
    }
    expect(() => useSkill(s, 'nuke' as never, 900, 200)).toThrow(RangeError);
    expect(() => skillLock(s, '__proto__' as never)).toThrow(RangeError);
    expect(SKILL_IDS).toEqual(['flashbang', 'molotov', 'airstrike']);
  });
});

describe('research (PM decision D1)', () => {
  it('Flashbang needs a Lab, Molotov needs Flashbang, Airstrike needs Lab 2 and Molotov', () => {
    let g = newGame();
    g.stock = { scrap: 999, wood: 999, metal: 0, concrete: 0 };
    expect(researchLock(g, 'flashbang')).toBe('Needs a Research Lab');
    g = ok(upgradeLab(g));
    expect(researchLock(g, 'molotov')).toBe('Needs Flashbang');
    g = ok(research(g, 'flashbang'));
    g = ok(research(g, 'molotov'));
    expect(researchLock(g, 'airstrike')).toBe('Needs Lab level 2');
    g = ok(upgradeLab(g));
    g = ok(research(g, 'airstrike'));
    expect(g.research).toEqual(['flashbang', 'molotov', 'airstrike']);
  });

  it('a horde gets only the skills researched, and nothing carries to the next one', () => {
    const g = newGame();
    g.lab = 1;
    g.research = ['flashbang'];
    const id = g.roster[0]!.id;
    const s = startHorde(g, 1, id, 0, 0);
    expect(s.skills).toEqual(['flashbang']);
    expect(skillLock({ ...s, cash: 99 }, 'molotov')).toBe('Research Molotov first');
    const next = startHorde(g, 2, id, 0, 0);
    expect(next.cooldowns).toEqual({ flashbang: 0, molotov: 0, airstrike: 0 });
    expect(next.fires).toEqual([]);
  });
});

function ok<T>(r: { ok: true; game: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}
