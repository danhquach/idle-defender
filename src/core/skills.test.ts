// Design §4, as built ID-019, ID-041, ID-139: the active skill (the Airstrike) researched at
// the Lab, paid with horde cash and then cooling down; it hits enemies only.
import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  FIELD,
  SKILL_FLASH,
  SKILL_IDS,
  SKILLS,
  SQUAD_SKILLS,
  START_SKILLS,
  STEP,
  THROW_FALL,
  type SkillId,
  stockOf,
  WALL,
} from './data.ts';
import { newGame, startHorde } from './game.ts';
import { bombDamage, newHorde, tick, type HordeState } from './horde.ts';
import { queueLock, upgradeLab } from './research.ts';
import { skillLeft, skillLock, throwArea, useSkill, wallFront } from './skills.ts';
import { enemy, researchNow, setup } from './testing.ts';

/** A horde with every skill researched, no spawns left and `cash` in hand. */
function fight(cash = 100): HordeState {
  const s = newHorde(1, { ...setup(), skills: [...SKILL_IDS] });
  s.toSpawn = 0;
  s.cash = cash;
  return s;
}

function used(s: HordeState, id: SkillId = 'airstrike', x = 1400, y = 200): HordeState {
  const r = useSkill(s, id, x, y);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const wallHp = (s: HordeState): number =>
  s.layers.reduce((sum, l) => sum + l.segments.reduce((t, seg) => t + seg.hp, 0), 0);

/** `s` ticked until every bomb in the air has landed. */
function landed(s: HordeState): HordeState {
  let t = s;
  for (let i = 0; i < 100 && t.incoming.length > 0; i++) t = tick(t, STEP);
  expect(t.incoming).toEqual([]);
  return t;
}

/** The distance from `(cx, cy)` of each of `s`'s bombs in the air. */
const spread = (s: HordeState, cx: number, cy: number): number[] =>
  s.incoming.map((m) => Math.hypot(m.x - cx, m.y - cy));

describe('the skill list (ID-139)', () => {
  it('the Airstrike is the only skill, picked from the start, researched at Lab 2 with nothing before it', () => {
    expect(SKILL_IDS).toEqual(['airstrike']);
    expect(START_SKILLS).toEqual(['airstrike']);
    expect(SKILLS.airstrike).toMatchObject({
      aim: 'area',
      area: 260,
      count: 12,
      share: 4,
      cooldown: 60,
      every: 0.1,
    });
  });
});

describe('airstrike (area bombing, ID-041, ID-139)', () => {
  it('drops its bombs over the aimed area, one every 0.1 s after a fall, and pays its cost', () => {
    const s = fight();
    const { count, every, area } = SKILLS.airstrike;
    const after = used(s, 'airstrike', 1000, 400);
    expect(after.incoming).toHaveLength(count);
    after.incoming.forEach((m, i) => {
      expect(m.skill).toBe('airstrike');
      expect(m.at).toBeCloseTo(THROW_FALL + i * every, 9);
      expect(Math.hypot(m.x - 1000, m.y - 400)).toBeLessThanOrEqual(area + 1e-9);
    });
    expect(new Set(after.incoming.map((m) => m.x)).size).toBe(count);
    expect(after.cash).toBe(100 - SKILLS.airstrike.cost);
    expect(after.enemies).toEqual(s.enemies); // nothing lands until the fight runs
    expect(s.incoming).toEqual([]); // pure
  });

  it('aimed elsewhere it lands elsewhere; the same fight drops the same way, the next drop differently', () => {
    const s = fight();
    const { count, area } = SKILLS.airstrike;
    const a = used(s, 'airstrike', 1000, 400);
    for (const d of spread(used(s, 'airstrike', 1400, 150), 1400, 150)) {
      expect(d).toBeLessThanOrEqual(area + 1e-9);
    }
    // Seeded: the same fight drops the same way; the next drop lands elsewhere.
    expect(a.rng).not.toEqual(s.rng);
    expect(used(s, 'airstrike', 1000, 400).incoming).toEqual(a.incoming);
    const next = used({ ...a, cooldowns: s.cooldowns }, 'airstrike', 1000, 400).incoming.slice(
      count,
    );
    expect(next.map((m) => [m.x, m.y])).not.toEqual(a.incoming.map((m) => [m.x, m.y]));
  });

  it('a different seed drops differently', () => {
    const a = used(fight(), 'airstrike', 1000, 400);
    const other = newHorde(2, { ...setup(), skills: [...SKILL_IDS] });
    other.toSpawn = 0;
    other.cash = 100;
    expect(used(other, 'airstrike', 1000, 400).incoming).not.toEqual(a.incoming);
  });

  it('spreads evenly over the whole area, not just its middle', () => {
    let s = fight();
    const { area } = SKILLS.airstrike;
    const spots: number[] = [];
    for (let i = 0; i < 40; i++) {
      s = used({ ...s, cash: 100, cooldowns: fight().cooldowns }, 'airstrike', 1000, 400);
      spots.push(...spread(s, 1000, 400));
      s.incoming = [];
    }
    expect(Math.max(...spots)).toBeGreaterThan(0.9 * area);
    expect(Math.min(...spots)).toBeLessThan(0.3 * area);
    // Even over the circle's area: about a quarter of the bombs inside half its radius.
    const inner = spots.filter((d) => d <= area / 2).length / spots.length;
    expect(inner).toBeGreaterThan(0.18);
    expect(inner).toBeLessThan(0.32);
  });

  it('near a field edge or behind the wall, bombs stay on the field past the wall, inside the area', () => {
    for (const [x, y] of [
      [0, 0],
      [FIELD.right, FIELD.height],
      [wallFront(fight()) - 50, 30],
    ] as const) {
      let s = fight();
      for (let k = 0; k < 10; k++) {
        s = used({ ...s, cash: 100, cooldowns: fight().cooldowns }, 'airstrike', x, y);
        const c = throwArea(s, 'airstrike', x, y);
        expect(c.x).toBeGreaterThanOrEqual(wallFront(s));
        expect(s.incoming).toHaveLength(SKILLS.airstrike.count); // none dropped for the edge
        for (const m of s.incoming.splice(0)) {
          expect(m.x).toBeGreaterThanOrEqual(wallFront(s));
          expect(m.x).toBeLessThanOrEqual(FIELD.right);
          expect(m.y).toBeGreaterThanOrEqual(0);
          expect(m.y).toBeLessThanOrEqual(FIELD.height);
          expect(Math.hypot(m.x - c.x, m.y - c.y)).toBeLessThanOrEqual(c.r + 1e-9);
        }
      }
    }
  });

  it('the area is the skill’s own, past the wall front, with the aim moved onto the field', () => {
    const s = fight();
    expect(wallFront(s)).toBe(Math.max(...s.layers.map((l) => l.x + WALL.depth)));
    expect(throwArea(s, 'airstrike', 0, 200)).toEqual({
      x: wallFront(s),
      y: 200,
      r: SKILLS.airstrike.area,
    });
    expect(throwArea(s, 'airstrike', 1000, -50).y).toBe(0);
    expect(throwArea(s, 'airstrike', 1000, FIELD.height + 50).y).toBe(FIELD.height);
    expect(throwArea(s, 'airstrike', FIELD.right + 50, 200).x).toBe(FIELD.right);
  });

  it('each bomb hits every enemy within its radius as it lands, edge included, nothing past it', () => {
    const s = fight();
    for (const d of s.defenders) d.nextShotAt = 1e9; // only the bombs hit
    const r = SKILLS.airstrike.radius;
    const t0 = used(s, 'airstrike', 1000, 400);
    // The first bomb alone: twelve in a circle this size would overlap.
    t0.incoming = t0.incoming.slice(0, 1);
    const b0 = t0.incoming[0]!;
    const hold = { hp: 1000, maxHp: 1000, stunnedUntil: 1e9 };
    const first = enemy(t0, { x: b0.x, y: b0.y, ...hold });
    const edge = enemy(t0, { x: b0.x, y: b0.y + r, ...hold });
    const past = enemy(t0, { x: b0.x, y: b0.y - r - 1, ...hold });
    // Nothing lands while the bombs fall (ID-107); then the first one hits.
    let t = tick(t0, THROW_FALL - STEP);
    expect(t.blasts).toEqual([]);
    t = tick(t, 2 * STEP);
    const hp = (id: number) => t.enemies.find((e) => e.id === id)!.hp;
    expect(hp(first.id)).toBe(1000 - bombDamage({ ...t0, freeSkills: undefined }));
    expect(hp(edge.id)).toBe(1000 - bombDamage({ ...t0, freeSkills: undefined }));
    expect(hp(past.id)).toBe(1000);
    expect(t.blasts).toHaveLength(1);
    t = landed(t);
    expect(hp(first.id)).toBe(1000 - bombDamage({ ...t0, freeSkills: undefined }));
    expect(hp(past.id)).toBe(1000);
  });

  it('deals its damage times the skill’s power (a lone pick throws ×2)', () => {
    for (const power of [1, SQUAD_SKILLS.solo]) {
      const s = { ...fight(), freeSkills: { power } } as HordeState;
      for (const d of s.defenders) d.nextShotAt = 1e9;
      const t0 = used(s);
      t0.incoming = [{ skill: 'airstrike', x: 1000, y: 400, at: 0 }];
      const e = enemy(t0, { x: 1000, y: 400, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
      const t = tick(t0, STEP);
      expect(t.enemies.find((o) => o.id === e.id)!.hp).toBe(
        1000 - bombDamage({ ...t0, freeSkills: { power } }),
      );
    }
  });

  it('kills pay XP and cash, and clear a focus on them', () => {
    const s = fight();
    const t0 = used(s, 'airstrike', 1000, 400);
    t0.incoming = [{ skill: 'airstrike', x: 1000, y: 400, at: 0 }];
    const a = enemy(t0, { x: 1000, y: 400, stunnedUntil: 1e9 });
    enemy(t0, { x: 1020, y: 410, stunnedUntil: 1e9 });
    t0.focusId = a.id;
    const after = landed(t0);
    expect(after.enemies).toEqual([]);
    expect(after.cash).toBe(100 - SKILLS.airstrike.cost + 2 * ENEMIES.shambler.cash);
    expect(after.xp).toBe(2 * ENEMIES.shambler.xp);
    expect(after.focusId).toBeNull();
  });

  it('hits enemies only: walls, turrets, defenders and the bank are untouched', () => {
    const s = fight();
    const d = s.defenders[0]!;
    const before = landed(tick(s, STEP));
    const after = landed(used(tick(s, STEP), 'airstrike', d.x, d.y));
    expect(after.defenders).toEqual(before.defenders);
    expect(after.layers).toEqual(before.layers);
    expect(after.turrets).toEqual(before.turrets);
    expect(after.energy).toBe(before.energy);
    expect(wallHp(after)).toBe(wallHp(before));
  });

  it('a pick holds the bombs in the air; the end of the fight drops them', () => {
    let s = used(fight(), 'airstrike', 1000, 200);
    s.offer = [];
    s = tick(s, 5);
    expect(s.incoming).toHaveLength(SKILLS.airstrike.count);
    s.offer = null;
    s.wave = s.waveCount; // the last wave, cleared: the next step wins
    s = tick(s, STEP);
    expect(s.outcome).not.toBe('fighting');
    expect(s.incoming).toEqual([]);
  });

  it('a flash shows for about SKILL_FLASH seconds', () => {
    let s = used(fight(), 'airstrike', 1000, 400);
    s.incoming = [{ skill: 'airstrike', x: 1000, y: 400, at: 0 }];
    s = tick(s, STEP);
    expect(s.blasts).toEqual([{ skill: 'airstrike', x: 1000, y: 400, at: 0 }]);
    s = tick(s, SKILL_FLASH - 2 * STEP);
    expect(s.blasts).toHaveLength(1);
    s = tick(s, 3 * STEP);
    expect(s.blasts).toEqual([]);
  });
});

describe('cooldowns', () => {
  it('the airstrike’s is 60 s: it starts at use, counts fight time only, and it is ready at the start', () => {
    let s = fight();
    expect(skillLock(s, 'airstrike')).toBeNull();
    s = used(s);
    expect(skillLeft(s, 'airstrike')).toBe(60);
    expect(SKILLS.airstrike.cooldown).toBe(60);
    expect(useSkill(s, 'airstrike', 1400, 200)).toEqual({ ok: false, reason: 'Not ready yet' });
    s.offer = [];
    s = tick(s, 10);
    expect(skillLeft(s, 'airstrike')).toBe(60);
    s.offer = null;
    // Fight time, with any card offer along the way turned down (time stops for it).
    const run = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds / STEP); i++) {
        if (s.offer) s.offer = null;
        s = tick(s, STEP);
      }
    };
    run(60 - 1);
    expect(skillLeft(s, 'airstrike')).toBeGreaterThan(0);
    run(1 + STEP);
    expect(skillLeft(s, 'airstrike')).toBe(0);
    expect(skillLock(s, 'airstrike')).toBeNull();
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
    const poor = fight(SKILLS.airstrike.cost - 1);
    const before = structuredClone(poor);
    expect(useSkill(poor, 'airstrike', 900, 200)).toEqual({
      ok: false,
      reason: 'Not enough cash',
    });
    expect(poor).toEqual(before);
    const s = fight();
    expect(useSkill({ ...s, offer: [] }, 'airstrike', 900, 200)).toEqual({
      ok: false,
      reason: 'Pick first',
    });
    expect(useSkill({ ...s, replace: { injuredId: 'a' } as never }, 'airstrike', 900, 200)).toEqual(
      { ok: false, reason: 'Pick first' },
    );
    expect(useSkill({ ...s, outcome: 'lost' }, 'airstrike', 900, 200)).toEqual({
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
      expect(useSkill(s, 'airstrike', x, y)).toEqual({ ok: false, reason: 'Aim at the field' });
    }
    expect(useSkill(s, 'airstrike', 0, FIELD.height).ok).toBe(true); // corners count
    expect(s).toEqual(before);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => useSkill(s, 'airstrike', bad, 200)).toThrow(RangeError);
      expect(() => useSkill(s, 'airstrike', 900, bad)).toThrow(RangeError);
    }
    // The retired skills are no skills (ID-139).
    for (const gone of ['flashbang', 'molotov', 'nuke', '__proto__']) {
      expect(() => useSkill(s, gone as never, 900, 200)).toThrow(RangeError);
      expect(() => skillLock(s, gone as never)).toThrow(RangeError);
    }
  });
});

describe('research (PM decision D1, ID-139)', () => {
  it('Airstrike needs Lab level 2 and nothing else', () => {
    let g = newGame();
    g.stock = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });
    expect(queueLock(g, 'airstrike')).toBe('Needs Lab level 2');
    g = ok(upgradeLab(g));
    expect(queueLock(g, 'airstrike')).toBe('Needs Lab level 2');
    g = ok(upgradeLab(g));
    expect(queueLock(g, 'airstrike')).toBeNull();
    g = ok(researchNow(g, 'airstrike'));
    expect(g.research).toEqual(['airstrike']);
  });

  it('a horde gets only the skills researched, and nothing carries to the next one', () => {
    const g = newGame();
    g.lab = 2;
    g.research = ['airstrike'];
    const id = g.roster[0]!.id;
    const s = startHorde(g, 1, id, 0, 0);
    expect(s.skills).toEqual(['airstrike']);
    expect(skillLock({ ...s, cash: 99 }, 'airstrike')).toBeNull();
    const none = startHorde({ ...g, research: [] }, 1, id, 0, 0);
    expect(skillLock({ ...none, cash: 99 }, 'airstrike')).toBe('Research Airstrike first');
    const next = startHorde(g, 2, id, 0, 0);
    expect(next.cooldowns).toEqual({ airstrike: 0 });
    expect(next.fires).toEqual([]);
  });
});

function ok<T>(r: { ok: true; game: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}
