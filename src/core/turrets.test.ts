// Design §7, as built ID-014: turrets are built between hordes on tower and wall
// mounts, fire while the bank has charge, wear down and jam, and are never destroyed.
import { describe, expect, it } from 'vitest';
import {
  buildPost,
  buildTurret,
  moveTurret,
  newBase,
  repairAll,
  repairAllCost,
  repairTurret,
  salvageTurret,
  salvageValue,
  turretRepairCost,
  type Base,
  type TurretMount,
} from './base.ts';
import {
  ENGINEER_BUFF,
  MAX_CONDITION,
  SEGMENTS,
  STEP,
  TURRET,
  type Stock,
  stockOf,
} from './data.ts';
import { finishHorde, newGame } from './game.ts';
import {
  baseAfter,
  newHorde,
  standing,
  tick,
  turretBuff,
  turretState,
  type HordeState,
} from './horde.ts';
import { loadoutFrom } from './loadout.ts';
import { enemy, landed, setup } from './testing.ts';

const RICH: Stock = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });

/** The starting base with turrets at `spots`. */
function baseWith(...spots: [TurretMount, number, number][]): Base {
  let base = newBase();
  let stock = RICH;
  for (const [mount, column, row] of spots) {
    const r = buildTurret(base, stock, true, mount, column, row);
    if (!r.ok) throw new Error(r.reason);
    ({ base, stock } = r);
  }
  return base;
}

/** A horde on `base` with no spawns left and nobody on a post. */
function fight(base: Base): HordeState {
  const s = newHorde(1, { ...setup(), base });
  s.toSpawn = 0;
  s.defenders = [];
  s.bench = [];
  for (const p of s.posts) p.defenderId = null;
  return s;
}

describe('turret build actions', () => {
  it('builds on a free tower or wall mount for its cost, at full condition', () => {
    const r = buildTurret(newBase(), RICH, true, 'tower', 0, 5);
    expect(r.ok && r.base.turrets).toEqual([
      { mount: 'tower', column: 0, row: 5, condition: MAX_CONDITION },
    ]);
    expect(r.ok && r.stock).toEqual(stockOf({ scrap: 959, wood: 979, metal: 0, concrete: 0 }));
    expect(buildTurret(newBase(), RICH, true, 'wall-walk', 0, 0).ok).toBe(true);
  });

  it('refuses before the Auto-turret is researched, and on a bad spot', () => {
    expect(buildTurret(newBase(), RICH, false, 'tower', 0, 5)).toEqual({
      ok: false,
      reason: 'Research the Auto-turret first',
    });
    expect(buildTurret(newBase(), RICH, true, 'tower', 0, 4)).toEqual({
      ok: false,
      reason: 'Slot taken', // a tower post
    });
    expect(buildTurret(baseWith(['tower', 0, 5]), RICH, true, 'tower', 0, 5)).toEqual({
      ok: false,
      reason: 'Slot taken',
    });
    expect(buildTurret(newBase(), RICH, true, 'wall-walk', 1, 0)).toEqual({
      ok: false,
      reason: 'A wall mount needs a wall',
    });
    expect(buildTurret(newBase(), RICH, true, 'tower', 1, 0)).toEqual({
      ok: false,
      reason: 'A tower mount needs a wall in front',
    });
    const poor = stockOf({ scrap: 39, wood: 99, metal: 0, concrete: 0 });
    expect(buildTurret(newBase(), poor, true, 'tower', 0, 5)).toEqual({
      ok: false,
      reason: 'Not enough scrap',
      short: true,
    });
  });

  it('a post is refused on a turret spot', () => {
    const base = baseWith(['wall-walk', 0, 0]);
    expect(buildPost(base, RICH, { kind: 'wall-walk', column: 0, row: 0 })).toEqual({
      ok: false,
      reason: 'Slot taken',
    });
  });

  it('throws on a mount, spot or turret that does not exist', () => {
    expect(() => buildTurret(newBase(), RICH, true, 'ground' as TurretMount, 0, 2)).toThrow(
      RangeError,
    );
    expect(() => buildTurret(newBase(), RICH, true, 'tower', 0, SEGMENTS)).toThrow(RangeError);
    expect(() => repairTurret(newBase(), RICH, 0)).toThrow(RangeError);
    expect(() => salvageTurret(baseWith(['tower', 0, 5]), RICH, 1.5)).toThrow(RangeError);
  });

  it('repairs for Scrap in proportion to the missing condition, jammed included', () => {
    const base = baseWith(['tower', 0, 5]);
    expect(repairTurret(base, RICH, 0)).toEqual({ ok: false, reason: 'Nothing to repair' });
    base.turrets[0]!.condition = 0;
    expect(turretRepairCost(base.turrets[0]!).scrap).toBe(TURRET.repairScrap);
    base.turrets[0]!.condition = 61;
    expect(turretRepairCost(base.turrets[0]!)).toEqual(
      stockOf({
        scrap: 8,
        wood: 0,
        metal: 0,
        concrete: 0,
      }),
    );
    const r = repairTurret(base, RICH, 0);
    expect(r.ok && r.base.turrets[0]!.condition).toBe(MAX_CONDITION);
    expect(r.ok && r.stock.scrap).toBe(999 - 8);
    const broke = repairTurret(base, { ...RICH, scrap: 7 }, 0);
    expect(broke).toEqual({ ok: false, reason: 'Not enough scrap', short: true });
  });

  it('Repair all repairs turrets with the walls, all or nothing', () => {
    const base = baseWith(['tower', 0, 5], ['wall-walk', 0, 0]);
    expect(repairAll(base, RICH)).toEqual({ ok: false, reason: 'Nothing to repair' });
    base.turrets[0]!.condition = 0; // 20 scrap
    base.turrets[1]!.condition = 61; // 8 scrap
    expect(repairAllCost(base)).toEqual(stockOf({ scrap: 28, wood: 0, metal: 0, concrete: 0 }));
    base.layers[0]!.slots[1]!.hp = base.layers[0]!.slots[1]!.maxHp / 2;
    const cost = repairAllCost(base);
    expect(cost.scrap).toBeGreaterThan(28);
    expect(cost.wood).toBeGreaterThan(0);
    expect(repairAll(base, { ...RICH, scrap: cost.scrap - 1 })).toEqual({
      ok: false,
      reason: 'Not enough scrap',
      short: true,
    });
    const r = repairAll(base, RICH);
    expect(r.ok && r.base.turrets.map((t) => t.condition)).toEqual([100, 100]);
    expect(r.ok && r.base.layers[0]!.slots[1]!.hp).toBe(base.layers[0]!.slots[1]!.maxHp);
    expect(r.ok && r.stock.scrap).toBe(999 - cost.scrap);
    // Turrets alone are enough to repair.
    const worn = baseWith(['tower', 0, 5]);
    worn.turrets[0]!.condition = 50;
    expect(repairAll(worn, RICH)).toMatchObject({ ok: true, stock: { scrap: 989 } });
  });

  it('salvage refunds half the cost × condition share, rounded down, and frees the mount', () => {
    const base = baseWith(['tower', 0, 5], ['tower', 0, 7]);
    expect(salvageValue(base.turrets[0]!)).toMatchObject({ scrap: 20, wood: 10 });
    base.turrets[0]!.condition = 33;
    expect(salvageValue(base.turrets[0]!)).toMatchObject({ scrap: 6, wood: 3 }); // 6.6, 3.3
    base.turrets[0]!.condition = 0;
    expect(salvageValue(base.turrets[0]!)).toMatchObject({ scrap: 0, wood: 0 });
    const r = salvageTurret(base, RICH, 1);
    expect(r.ok && r.base.turrets).toEqual([base.turrets[0]]);
    expect(r.ok && r.stock).toEqual(stockOf({ scrap: 1019, wood: 1009, metal: 0, concrete: 0 }));
    expect(r.ok && buildTurret(r.base, r.stock, true, 'tower', 0, 7).ok).toBe(true);
  });

  it('relocates for free to another free mount, keeping its condition and order', () => {
    const base = baseWith(['tower', 0, 5]);
    base.turrets[0]!.condition = 40;
    const r = moveTurret(base, RICH, 0, 'wall-walk', 0, 4);
    expect(r.ok && r.base.turrets).toEqual([
      { mount: 'wall-walk', column: 0, row: 4, condition: 40 },
    ]);
    expect(r.ok && r.stock).toEqual(RICH);
    expect(moveTurret(base, RICH, 0, 'tower', 0, 5)).toEqual({
      ok: false,
      reason: 'Already there',
    });
    expect(moveTurret(base, RICH, 0, 'tower', 0, 4)).toEqual({ ok: false, reason: 'Slot taken' });
    expect(moveTurret(base, RICH, 0, 'wall-walk', 2, 0)).toEqual({
      ok: false,
      reason: 'A wall mount needs a wall',
    });
  });
});

describe('turrets in a horde', () => {
  it('fire at the nearest enemy in range: 5 damage, wear per shot, charge while it has a target', () => {
    const s = fight(baseWith(['tower', 0, 5]));
    expect(s.energy).toBe(setup().bank);
    const e = enemy(s, { x: 600, y: 440, hp: 100, maxHp: 100 });
    const t = tick(s, STEP);
    expect(t.bullets).toEqual([
      expect.objectContaining({ owner: 'turret:0', fromX: t.turrets[0]!.x, damage: TURRET.damage }),
    ]);
    expect(t.turrets[0]!.condition).toBeCloseTo(MAX_CONDITION - TURRET.shotWear);
    expect(t.energy).toBeCloseTo(setup().bank - TURRET.draw * STEP);
    expect(landed(t).enemies.find((x) => x.id === e.id)!.hp).toBe(100 - TURRET.damage);
    // One shot per 0.5 s.
    const later = landed(tick(t, 0.5));
    expect(later.enemies[0]!.hp).toBe(100 - 2 * TURRET.damage);
  });

  it('take the focused enemy in range over a closer one', () => {
    const s = fight(baseWith(['tower', 0, 5]));
    // Off the line of fire to the far one, which a bullet would otherwise hit first.
    const near = enemy(s, { x: 600, y: 360, hp: 100, maxHp: 100 });
    const far = enemy(s, { x: 900, y: 440, hp: 100, maxHp: 100 });
    s.focusId = far.id;
    const t = landed(tick(s, STEP));
    expect(t.enemies.find((e) => e.id === far.id)!.hp).toBe(95);
    expect(t.enemies.find((e) => e.id === near.id)!.hp).toBe(100);
  });

  it('a wall turret wears only by the damage its segment can still take', () => {
    const s = fight(baseWith(['wall-walk', 0, 0]));
    s.layers[0]!.segments[0]!.hp = 2;
    enemy(s, { x: 520, y: 40, hp: 1e6, maxHp: 1e6 });
    s.turrets[0]!.nextShotAt = 1e9;
    const t = tick(s, STEP);
    expect(t.layers[0]!.segments[0]!.hp).toBe(0);
    expect(t.turrets[0]!.condition).toBeCloseTo(MAX_CONDITION - TURRET.hitWear * 2);
  });

  it('idle turrets draw nothing; a tower reaches 625, a wall mount 500', () => {
    const s = fight(baseWith(['tower', 0, 5], ['wall-walk', 0, 0]));
    const t = tick(s, 1);
    expect(t.energy).toBe(setup().bank);
    const tower = s.turrets.find((x) => x.mount === 'tower')!;
    enemy(s, { x: tower.x + 620, y: tower.y, hp: 100, maxHp: 100 });
    const a = landed(tick(s, STEP));
    expect(a.enemies[0]!.hp).toBe(95);
    const s2 = fight(baseWith(['wall-walk', 0, 0]));
    const wall = s2.turrets[0]!;
    enemy(s2, { x: wall.x + 505, y: wall.y, hp: 100, maxHp: 100 });
    expect(tick(s2, STEP).enemies[0]!.hp).toBe(100);
  });

  it('go dark when the bank is empty, and the bank never goes below 0', () => {
    const s = fight(baseWith(['tower', 0, 5]));
    s.energy = STEP / 2;
    enemy(s, { x: 600, y: 440, hp: 100, maxHp: 100 });
    const t = tick(s, 1);
    expect(t.energy).toBe(0);
    expect(turretState(t, t.turrets[0]!)).toBe('dark');
    expect(t.enemies[0]!.hp).toBe(95); // the one shot before the charge ran out
  });

  it('fire slower below 50 condition, down to half speed; jam at 0', () => {
    const s = fight(baseWith(['tower', 0, 5]));
    s.turrets[0]!.condition = 25;
    enemy(s, { x: 600, y: 440, hp: 1000, maxHp: 1000 });
    const t = tick(s, STEP);
    expect(t.turrets[0]!.nextShotAt).toBeCloseTo(TURRET.fireInterval / 0.75);
    s.turrets[0]!.condition = 0;
    expect(turretState(s, s.turrets[0]!)).toBe('jammed');
    const j = tick(s, 1);
    expect(j.enemies[0]!.hp).toBe(1000);
    expect(j.energy).toBe(setup().bank);
  });

  it('a long fight wears a turret down to jammed, and it stays in the base', () => {
    const base = baseWith(['tower', 0, 5]);
    const s = fight(base);
    s.turrets[0]!.condition = 1;
    enemy(s, { x: 600, y: 440, hp: 1e6, maxHp: 1e6 });
    const t = tick(s, 5);
    expect(t.turrets[0]!.condition).toBe(0);
    expect(turretState(t, t.turrets[0]!)).toBe('jammed');
    expect(baseAfter(base, t).turrets).toEqual([
      { mount: 'tower', column: 0, row: 5, condition: 0 },
    ]);
  });

  it('a wall turret wears when its segment is hit, and goes offline (unworn) when it breaks', () => {
    const s = fight(baseWith(['wall-walk', 0, 0]));
    const seg = s.layers[0]!.segments[0]!;
    enemy(s, { x: 520, y: 40, hp: 1e6, maxHp: 1e6 });
    s.turrets[0]!.nextShotAt = 1e9; // hold fire, so only the hit wears it
    const t = tick(s, STEP);
    expect(t.layers[0]!.segments[0]!.hp).toBe(seg.hp - 5);
    expect(t.turrets[0]!.condition).toBeCloseTo(MAX_CONDITION - TURRET.hitWear * 5);
    t.layers[0]!.segments[0]!.hp = 0;
    expect(turretState(t, t.turrets[0]!)).toBe('offline');
    const c = t.turrets[0]!.condition;
    const later = tick(t, 1);
    expect(later.turrets[0]!.condition).toBe(c);
  });

  it('a standing Engineer within reach speeds a turret up and repairs it; never a jammed one', () => {
    const s = fight(baseWith(['tower', 0, 5]));
    const post = s.posts.find((p) => p.kind === 'tower' && p.row === 4)!; // 80 px away
    const eng = { id: 'e', name: 'E', loadout: loadoutFrom('toolkit') };
    post.defenderId = 'e';
    s.defenders.push(standing(eng, post, 1e9)); // never shoots, so only the turret hits
    expect(turretBuff(s, s.turrets[0]!)).toBeCloseTo(1 + ENGINEER_BUFF);
    s.turrets[0]!.condition = 40;
    enemy(s, { x: 600, y: 440, hp: 100, maxHp: 100 });
    const t = tick(s, STEP);
    expect(landed(t).enemies[0]!.hp).toBeCloseTo(100 - TURRET.damage * (1 + ENGINEER_BUFF));
    expect(t.turrets[0]!.nextShotAt).toBeCloseTo(
      TURRET.fireInterval / ((1 + ENGINEER_BUFF) * (0.5 + 40 / 100)),
    );
    expect(t.turrets[0]!.condition).toBeCloseTo(
      40 - TURRET.shotWear + TURRET.engineerRepair * STEP,
    );
    s.turrets[0]!.condition = 0;
    s.enemies = [];
    expect(tick(s, 1).turrets[0]!.condition).toBe(0);
  });

  it('no Engineer, a walking one or one out of reach gives nothing', () => {
    const s = fight(baseWith(['tower', 0, 7]));
    expect(turretBuff(s, s.turrets[0]!)).toBe(1);
    const post = s.posts.find((p) => p.kind === 'tower' && p.row === 4)!; // 240 px away
    s.defenders.push(standing({ id: 'e', name: 'E', loadout: loadoutFrom('toolkit') }, post, 0));
    expect(turretBuff(s, s.turrets[0]!)).toBe(1);
  });

  it('the base keeps each turret after the fight with its exact condition, never removed', () => {
    let game = newGame();
    game = { ...game, base: baseWith(['tower', 0, 5]), research: ['metal-walls', 'auto-turret'] };
    const s = newHorde(1, { ...setup(), base: game.base });
    s.turrets[0]!.condition = 12.3;
    s.outcome = 'lost';
    const after = finishHorde(game, s, 0);
    expect(after.base.turrets).toEqual([{ mount: 'tower', column: 0, row: 5, condition: 12.3 }]);
  });

  it('baseAfter refuses a horde fought with other turrets', () => {
    const s = fight(baseWith(['tower', 0, 5]));
    expect(() => baseAfter(newBase(), s)).toThrow(RangeError);
  });
});
