// Design §4, as built ID-019, ID-041: active skills researched at the Lab,
// paid with horde cash and then cooling down; they hit enemies only.
import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  FIELD,
  SKILL_FLASH,
  SKILL_IDS,
  SKILLS,
  STEP,
  type SkillId,
  stockOf,
  WALL,
} from './data.ts';
import { newGame, startHorde } from './game.ts';
import { newHorde, stunned, tick, type HordeState } from './horde.ts';
import { research, researchLock, upgradeLab } from './research.ts';
import { carpet, skillLeft, skillLock, useSkill, wallFront } from './skills.ts';
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

/** `s` ticked until every bomb and bottle in the air has landed. */
function landed(s: HordeState): HordeState {
  let t = s;
  for (let i = 0; i < 100 && t.incoming.length > 0; i++) t = tick(t, STEP);
  expect(t.incoming).toEqual([]);
  return t;
}

describe('airstrike (carpet bombing, ID-041)', () => {
  it('bombs the aimed row from the outer wall to the field’s end, one bomb at a time', () => {
    const s = fight();
    const { radius: r, every } = SKILLS.airstrike;
    const front = wallFront(s);
    expect(front).toBe(Math.max(...s.layers.map((l) => l.x + WALL.depth)));
    const after = used(s, 'airstrike', 300, 250);
    const bombs = after.incoming;
    expect(bombs).toEqual(
      carpet(s, 250).map((p, i) => ({ skill: 'airstrike', ...p, at: i * every })),
    );
    expect(bombs[0]!.x).toBeCloseTo(front + r, 9);
    for (let i = 1; i < bombs.length; i++)
      expect(bombs[i]!.x - bombs[i - 1]!.x).toBeCloseTo(2 * r, 9);
    expect(bombs.at(-1)!.x).toBeLessThanOrEqual(FIELD.right - r);
    expect(bombs.at(-1)!.x + 2 * r).toBeGreaterThan(FIELD.right - r);
    expect(bombs.every((b) => b.y === 250)).toBe(true);
    expect(after.cash).toBe(100 - SKILLS.airstrike.cost);
    expect(after.enemies).toEqual(s.enemies); // nothing lands until the fight runs
  });

  it('each bomb hits every enemy within its radius as it lands, edge included, nothing past it', () => {
    const s = fight();
    for (const d of s.defenders) d.nextShotAt = 1e9; // only the bombs hit
    const r = SKILLS.airstrike.radius;
    const [b0, b3] = [carpet(s, 200)[0]!, carpet(s, 200)[3]!];
    const hold = { hp: 100, maxHp: 100, stunnedUntil: 1e9 };
    const first = enemy(s, { x: b0.x, y: 200, ...hold });
    const edge = enemy(s, { x: b3.x, y: 200 + r, ...hold });
    const past = enemy(s, { x: b3.x, y: 200 - r - 1, ...hold });
    let t = tick(used(s, 'airstrike', 0, 200), STEP);
    const hp = (id: number) => t.enemies.find((e) => e.id === id)!.hp;
    expect(hp(first.id)).toBe(100 - SKILLS.airstrike.damage);
    expect(hp(edge.id)).toBe(100); // its bomb is still in the air
    expect(t.blasts).toHaveLength(1);
    t = landed(t);
    expect(hp(first.id)).toBe(100 - SKILLS.airstrike.damage);
    expect(hp(edge.id)).toBe(100 - SKILLS.airstrike.damage);
    expect(hp(past.id)).toBe(100);
  });

  it('kills pay XP and cash, and clear a focus on them', () => {
    const s = fight();
    const p = carpet(s, 200)[2]!;
    const a = enemy(s, { x: p.x, y: 200, stunnedUntil: 1e9 });
    enemy(s, { x: p.x + 20, y: 210, stunnedUntil: 1e9 });
    s.focusId = a.id;
    const after = landed(used(s, 'airstrike', 0, 200));
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
  });

  it('a pick holds the bombs in the air; the end of the fight drops them', () => {
    let s = used(fight(), 'airstrike', 0, 200);
    s.offer = [];
    s = tick(s, 5);
    expect(s.incoming).toHaveLength(carpet(s, 200).length);
    s.offer = null;
    s.wave = s.waveCount; // the last wave, cleared: the next step wins
    s = tick(s, STEP);
    expect(s.outcome).not.toBe('fighting');
    expect(s.incoming).toEqual([]);
  });
});

describe('molotov (scattered throws, ID-041)', () => {
  it('throws its bottles at random spots past the outer wall, one at a time, ignoring the aim', () => {
    const s = fight();
    const { radius: r, count, every } = SKILLS.molotov;
    const a = used(s, 'molotov', 0, 0);
    const b = used(s, 'molotov', 900, 700);
    expect(a.incoming).toEqual(b.incoming); // the aim makes no difference
    expect(a.incoming).toHaveLength(count);
    a.incoming.forEach((m, i) => {
      expect(m.skill).toBe('molotov');
      expect(m.at).toBeCloseTo(i * every, 9);
      expect(m.x).toBeGreaterThanOrEqual(wallFront(s) + r);
      expect(m.x).toBeLessThanOrEqual(FIELD.right - r);
      expect(m.y).toBeGreaterThanOrEqual(r);
      expect(m.y).toBeLessThanOrEqual(FIELD.height - r);
    });
    expect(new Set(a.incoming.map((m) => m.x)).size).toBe(count);
    // Seeded: the same fight throws the same way; the next throw lands elsewhere.
    expect(a.rng).not.toEqual(s.rng);
    expect(used(s, 'molotov').incoming).toEqual(a.incoming);
    expect(used({ ...a, cooldowns: s.cooldowns }, 'molotov').incoming.slice(count)).not.toEqual(
      a.incoming,
    );
  });

  it('each bottle lights a fire where it lands; every one of them lands', () => {
    const s = used(fight(), 'molotov');
    const fires = landed(s).fires;
    expect(fires.map((f) => [f.x, f.y])).toEqual(s.incoming.map((m) => [m.x, m.y]));
    fires.forEach((f, i) => {
      // On the first step at or after its landing time.
      expect(f.at).toBeGreaterThanOrEqual(s.incoming[i]!.at - 1e-9);
      expect(f.at).toBeLessThan(s.incoming[i]!.at + STEP);
      expect(f.until).toBeCloseTo(f.at + SKILLS.molotov.seconds, 9);
    });
  });

  it('a fire burns enemies inside for its seconds of fight time, then goes out', () => {
    let s = used(fight(), 'molotov');
    // One bottle only, so no other fire overlaps.
    s.incoming = s.incoming.slice(0, 1);
    const spot = s.incoming[0]!;
    // Held in place so they stay put, out of the defender's reach.
    const hold = { hp: 1000, maxHp: 1000, stunnedUntil: 1e9 };
    const held = enemy(s, { x: spot.x, y: spot.y, ...hold });
    // Just outside the fire, on whichever side has field to spare.
    const side = spot.y < FIELD.height / 2 ? 1 : -1;
    const out = enemy(s, { x: spot.x, y: spot.y + side * (SKILLS.molotov.radius + 1), ...hold });
    s = tick(s, 1);
    const hp = (id: number) => s.enemies.find((e) => e.id === id)!.hp;
    expect(hp(held.id)).toBeCloseTo(1000 - SKILLS.molotov.dps, 6);
    expect(hp(out.id)).toBe(1000);
    s = tick(s, SKILLS.molotov.seconds + 1);
    expect(s.fires).toEqual([]);
    expect(hp(held.id)).toBeCloseTo(1000 - SKILLS.molotov.dps * SKILLS.molotov.seconds, 6);
  });

  it('stops burning during a pick, and a burn kill pays cash', () => {
    let s = landed(used(fight(), 'molotov'));
    const spot = s.fires[0]!;
    const e = enemy(s, { x: spot.x, y: spot.y, hp: 1, stunnedUntil: 1e9 });
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

describe('flashbang (scattered throws, ID-041)', () => {
  /** A fight with one flashbang thrown (none landed yet) and where its first one lands. */
  function thrown(): { s: HordeState; spot: { x: number; y: number } } {
    const s = used(fight(), 'flashbang', 0, 0);
    return { s, spot: s.incoming[0]! };
  }

  it('throws its bangs at random spots past the outer wall, one at a time, ignoring the aim', () => {
    const s = fight();
    const { radius: r, count, every } = SKILLS.flashbang;
    const a = used(s, 'flashbang', 0, 0);
    expect(used(s, 'flashbang', 900, 700).incoming).toEqual(a.incoming);
    expect(a.incoming).toHaveLength(count);
    a.incoming.forEach((m, i) => {
      expect(m.skill).toBe('flashbang');
      expect(m.at).toBeCloseTo(i * every, 9);
      expect(m.x).toBeGreaterThanOrEqual(wallFront(s) + r);
      expect(m.x).toBeLessThanOrEqual(FIELD.right - r);
      expect(m.y).toBeGreaterThanOrEqual(r);
      expect(m.y).toBeLessThanOrEqual(FIELD.height - r);
    });
  });

  it('each bang stuns enemies in its radius from moving until it wears off', () => {
    const thrownOnce = thrown();
    let s = thrownOnce.s;
    const spot = thrownOnce.spot;
    const near = enemy(s, { ...spot, hp: 1e6, maxHp: 1e6 });
    const far = enemy(s, {
      x: spot.x,
      y: spot.y - SKILLS.flashbang.radius - 1,
      hp: 1e6,
      maxHp: 1e6,
    });
    // Only the first bang: the others land elsewhere.
    s.incoming = s.incoming.slice(0, 1);
    s = tick(s, STEP);
    const at = (id: number) => s.enemies.find((e) => e.id === id)!;
    expect(stunned(s, at(near.id))).toBe(true);
    expect(stunned(s, at(far.id))).toBe(false);
    expect(s.blasts).toEqual([{ skill: 'flashbang', ...spot, at: 0 }]);
    const x = at(near.id).x;
    s = tick(s, SKILLS.flashbang.seconds - 0.5);
    expect(at(near.id).x).toBe(x);
    expect(at(far.id).x).toBeLessThan(far.x);
    s = tick(s, 1);
    expect(stunned(s, at(near.id))).toBe(false);
    expect(at(near.id).x).toBeLessThan(x);
  });

  it('stops a stunned enemy hitting the wall; an unstunned one does', () => {
    const atWall = (stun: boolean): HordeState => {
      const s = fight();
      const outer = s.layers.reduce((a, b) => (b.x > a.x ? b : a));
      enemy(s, { x: outer.x + 20, y: 220, hp: 1e6, maxHp: 1e6 });
      if (!stun) return s;
      const t = used(s, 'flashbang', 0, 0);
      t.incoming = [{ skill: 'flashbang', x: outer.x + 20, y: 220, at: 0 }];
      return tick(t, STEP);
    };
    const control = atWall(false);
    expect(wallHp(tick(control, 2))).toBeLessThan(wallHp(control));
    const stunnedAtWall = atWall(true);
    expect(wallHp(tick(stunnedAtWall, 2))).toBe(wallHp(stunnedAtWall));
  });

  it('stuns in fight time: a pick holds it, and a second bang never shortens it', () => {
    let { s, spot } = thrown();
    enemy(s, { ...spot, stunnedUntil: 99 });
    expect(tick(s, STEP).enemies[0]!.stunnedUntil).toBe(99);

    ({ s, spot } = thrown());
    enemy(s, { ...spot });
    s = tick(s, STEP);
    s.offer = [];
    s = tick(s, 10);
    expect(stunned(s, s.enemies[0]!)).toBe(true);
  });

  it('a bang landing on a charging Horror holds its ability clocks (design §9, ID-024)', () => {
    const { s: first, spot } = thrown();
    let s = first;
    s.incoming = s.incoming.slice(0, 1);
    const h = enemy(s, { kind: 'horror', ...spot, hp: 1e6, maxHp: 1e6 });
    h.horror = {
      ability: 'charge',
      nextAt: 9,
      chargeUntil: 2,
      charged: false,
      hitAt: 0,
      seenHp: 1e6,
    };
    s = tick(s, STEP);
    const clock = () => s.enemies.find((e) => e.id === h.id)!.horror!;
    expect(
      stunned(
        s,
        s.enemies.find((e) => e.id === h.id)!,
      ),
    ).toBe(true);
    // Stunned on the bang's own step: its clocks move on with the time it loses.
    expect(clock().nextAt).toBeCloseTo(9 + STEP, 9);
    expect(clock().chargeUntil).toBeCloseTo(2 + STEP, 9);
    s = tick(s, 1);
    expect(clock().nextAt).toBeCloseTo(9 + STEP + 1, 6);
    expect(clock().chargeUntil).toBeCloseTo(2 + STEP + 1, 6);
  });

  it('a flash shows for about SKILL_FLASH seconds', () => {
    let { s } = thrown();
    s.incoming = s.incoming.slice(0, 1);
    s = tick(s, STEP);
    expect(s.blasts).toHaveLength(1);
    s = tick(s, SKILL_FLASH - 2 * STEP);
    expect(s.blasts).toHaveLength(1);
    s = tick(s, 3 * STEP);
    expect(s.blasts).toEqual([]);
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
    g.stock = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });
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
