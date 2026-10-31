// Design §7, as built ID-017: basic traps (spikes, barbed wire) on the outer layer's
// strip, built between hordes, triggered once per enemy, worn down and broken but
// never destroyed.
import { describe, expect, it } from 'vitest';
import {
  buildTrap,
  newBase,
  removeTrap,
  repairAll,
  repairAllCost,
  repairTrap,
  trapRefund,
  trapRepairCost,
  type Base,
  type TrapKind,
} from './base.ts';
import {
  ENEMIES,
  SEGMENTS,
  STEP,
  TRAP_DURABILITY,
  TRAP_STRIP,
  TRAPS,
  type Stock,
  stockOf,
} from './data.ts';
import { finishHorde, newGame } from './game.ts';
import { baseAfter, newHorde, tick, type HordeState } from './horde.ts';
import { enemy, setup } from './testing.ts';

const RICH: Stock = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });
/** Inside the strip, level with row 1. */
const IN = { x: TRAP_STRIP.x + TRAP_STRIP.width / 2, y: 120 };
const STRIDE = ENEMIES.shambler.speed * STEP;

/** The starting base with traps at `cells`. */
function baseWith(...cells: [TrapKind, number][]): Base {
  let base = newBase();
  let stock = RICH;
  for (const [kind, row] of cells) {
    const r = buildTrap(base, stock, kind, row);
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

describe('trap build actions', () => {
  it('builds a trap in a free cell for its cost, at full durability, kept in row order', () => {
    const r = buildTrap(baseWith(['wire', 3]), RICH, 'spikes', 1);
    expect(r.ok && r.base.traps).toEqual([
      { kind: 'spikes', row: 1, durability: TRAP_DURABILITY },
      { kind: 'wire', row: 3, durability: TRAP_DURABILITY },
    ]);
    expect(r.ok && r.stock).toEqual(stockOf({ scrap: 989, wood: 984, metal: 0, concrete: 0 }));
    const w = buildTrap(newBase(), RICH, 'wire', 0);
    expect(w.ok && w.stock).toEqual(stockOf({ scrap: 984, wood: 989, metal: 0, concrete: 0 }));
  });

  it('needs no research: a new game can build both', () => {
    const g = newGame();
    expect(buildTrap(g.base, g.stock, 'spikes', 0).ok).toBe(true);
    expect(buildTrap(g.base, g.stock, 'wire', 0).ok).toBe(true);
  });

  it('refuses a taken cell and short materials, without changing anything', () => {
    const base = baseWith(['spikes', 2]);
    expect(buildTrap(base, RICH, 'wire', 2)).toEqual({ ok: false, reason: 'Slot taken' });
    expect(buildTrap(base, RICH, 'spikes', 2)).toEqual({ ok: false, reason: 'Slot taken' });
    const poor = stockOf({ scrap: 9, wood: 99, metal: 0, concrete: 0 });
    expect(buildTrap(newBase(), poor, 'spikes', 0)).toEqual({
      ok: false,
      reason: 'Not enough scrap',
      short: true,
    });
    expect(base.traps).toHaveLength(1);
  });

  it('throws on a programmer error: unknown kind or a row off the strip', () => {
    expect(() => buildTrap(newBase(), RICH, 'mines' as TrapKind, 0)).toThrow(RangeError);
    expect(() => buildTrap(newBase(), RICH, 'spikes', SEGMENTS)).toThrow(RangeError);
    expect(() => buildTrap(newBase(), RICH, 'spikes', -1)).toThrow(RangeError);
    expect(() => buildTrap(newBase(), RICH, 'spikes', 1.5)).toThrow(RangeError);
    expect(() => repairTrap(newBase(), RICH, 0)).toThrow(RangeError);
    expect(() => removeTrap(newBase(), RICH, 0)).toThrow(RangeError);
  });

  it('repairs for its cost × the missing share, rounded up; refuses at full', () => {
    const base = baseWith(['spikes', 0]);
    expect(repairTrap(base, RICH, 0)).toEqual({ ok: false, reason: 'Nothing to repair' });
    base.traps[0]!.durability = 20; // a third missing: 5 Wood, 3.33 → 4 Scrap
    expect(trapRepairCost(base.traps[0]!)).toEqual(
      stockOf({ scrap: 4, wood: 5, metal: 0, concrete: 0 }),
    );
    const r = repairTrap(base, RICH, 0);
    expect(r.ok && r.base.traps[0]!.durability).toBe(TRAP_DURABILITY);
    expect(r.ok && r.stock).toEqual(stockOf({ scrap: 995, wood: 994, metal: 0, concrete: 0 }));
    base.traps[0]!.durability = 0; // broken: the build cost
    expect(trapRepairCost(base.traps[0]!)).toEqual(
      stockOf({ scrap: 10, wood: 15, metal: 0, concrete: 0 }),
    );
    expect(repairTrap(base, stockOf({ scrap: 9, wood: 99, metal: 0, concrete: 0 }), 0)).toEqual({
      ok: false,
      reason: 'Not enough scrap',
      short: true,
    });
  });

  it('removes for half its cost × its durability share, rounded down, and frees the cell', () => {
    const base = baseWith(['wire', 1], ['spikes', 4]);
    expect(trapRefund(base.traps[0]!)).toEqual(
      stockOf({ scrap: 7, wood: 5, metal: 0, concrete: 0 }),
    );
    base.traps[1]!.durability = 10; // a sixth: 2.5 → 2 Wood, 1.67 → 1 Scrap
    expect(trapRefund(base.traps[1]!)).toEqual(
      stockOf({ scrap: 1, wood: 2, metal: 0, concrete: 0 }),
    );
    base.traps[1]!.durability = 0;
    expect(trapRefund(base.traps[1]!)).toEqual(
      stockOf({ scrap: 0, wood: 0, metal: 0, concrete: 0 }),
    );
    const r = removeTrap(base, RICH, 0);
    expect(r.ok && r.base.traps).toEqual([{ kind: 'spikes', row: 4, durability: 0 }]);
    expect(r.ok && r.stock).toEqual(stockOf({ scrap: 1006, wood: 1004, metal: 0, concrete: 0 }));
    expect(r.ok && buildTrap(r.base, r.stock, 'spikes', 1).ok).toBe(true);
  });

  it('Repair all repairs traps with the walls, all or nothing', () => {
    const base = baseWith(['spikes', 0], ['wire', 1]);
    base.traps[0]!.durability = 0;
    base.traps[1]!.durability = 15;
    base.layers[0]!.slots[0]!.hp -= 100;
    const cost = repairAllCost(base);
    // Spikes 15 Wood 10 Scrap; wire half of 10 Wood 15 Scrap → 5, 7.5 → 8; the wood wall half of 10 Wood 5 Scrap → 5, 3.
    expect(cost).toEqual(stockOf({ scrap: 21, wood: 25, metal: 0, concrete: 0 }));
    const r = repairAll(base, RICH);
    expect(r.ok && r.base.traps.map((t) => t.durability)).toEqual([30, 30]);
    expect(repairAll(base, { ...cost, scrap: cost.scrap - 1 }).ok).toBe(false);
    const full = baseWith(['spikes', 0]);
    expect(repairAll(full, RICH)).toEqual({ ok: false, reason: 'Nothing to repair' });
    full.traps[0]!.durability = 29;
    expect(repairAll(full, RICH).ok).toBe(true);
  });
});

describe('traps in a fight', () => {
  it('spikes deal their damage once to each enemy that enters, costing 1 durability each', () => {
    let s = fight(baseWith(['spikes', 1]));
    const a = enemy(s, IN);
    const b = enemy(s, { ...IN, x: IN.x + 30 });
    s = tick(s, 10 * STEP);
    const hp = s.enemies.map((e) => e.hp);
    expect(hp).toEqual([20 - TRAPS.spikes.damage, 20 - TRAPS.spikes.damage]);
    expect(s.traps[0]!.durability).toBe(TRAP_DURABILITY - 2);
    expect(s.traps[0]!.hit).toEqual([a.id, b.id]);
    // Spikes don't slow.
    expect(s.enemies[0]!.x).toBeCloseTo(IN.x - 10 * STRIDE);
  });

  it('a spike kill counts like any kill', () => {
    let s = fight(baseWith(['spikes', 1]));
    enemy(s, { ...IN, hp: 5 });
    s = tick(s, 2 * STEP);
    expect(s.enemies).toEqual([]);
    expect(s.xp).toBe(ENEMIES.shambler.xp);
  });

  it('a spike kill clears the focus on it', () => {
    let s = fight(baseWith(['spikes', 1]));
    const e = enemy(s, { ...IN, hp: 5 });
    s.focusId = e.id;
    s = tick(s, 2 * STEP);
    expect(s.focusId).toBeNull();
  });

  it('ignores an enemy already in the camp', () => {
    let s = fight(baseWith(['spikes', 1]));
    enemy(s, { ...IN, inCamp: true });
    s = tick(s, STEP);
    expect(s.enemies[0]!.hp).toBe(20);
    expect(s.traps[0]!.durability).toBe(TRAP_DURABILITY);
  });

  it('an enemy walking into barbed wire is caught from its next step', () => {
    let s = fight(baseWith(['wire', 1]));
    const edge = TRAP_STRIP.x + TRAP_STRIP.width + STRIDE / 2;
    enemy(s, { ...IN, x: edge });
    s = tick(s, STEP); // full stride, now inside
    expect(s.enemies[0]!.x).toBeCloseTo(edge - STRIDE);
    expect(s.traps[0]!.hit).toEqual([]);
    s = tick(s, STEP); // triggers, then walks at half speed
    expect(s.traps[0]!.hit).toHaveLength(1);
    expect(s.enemies[0]!.x).toBeCloseTo(edge - STRIDE - STRIDE * TRAPS.wire.slow);
  });

  it('barbed wire holds an enemy to half speed while inside, and only inside', () => {
    let s = fight(baseWith(['wire', 1]));
    const near = TRAP_STRIP.x + 5 * STRIDE * TRAPS.wire.slow;
    enemy(s, { ...IN, x: near });
    enemy(s, { ...IN, y: 280 }); // row 3: no trap
    s = tick(s, 4 * STEP);
    expect(s.enemies[0]!.x).toBeCloseTo(near - 4 * STRIDE * TRAPS.wire.slow);
    expect(s.enemies[0]!.hp).toBe(20);
    expect(s.enemies[1]!.x).toBeCloseTo(IN.x - 4 * STRIDE);
    expect(s.traps[0]!.durability).toBe(TRAP_DURABILITY - 1);
    // Out of the cell, it walks at full speed again.
    s = tick(s, 4 * STEP);
    const left = s.enemies[0]!.x;
    s = tick(s, STEP);
    expect(left).toBeLessThan(TRAP_STRIP.x);
    expect(s.enemies[0]!.x).toBeCloseTo(left - STRIDE);
  });

  it('leaves enemies outside the strip alone', () => {
    let s = fight(baseWith(['spikes', 1]));
    enemy(s, { ...IN, x: TRAP_STRIP.x + TRAP_STRIP.width + 5 });
    enemy(s, { ...IN, x: TRAP_STRIP.x - 5 });
    s = tick(s, STEP);
    expect(s.enemies.map((e) => e.hp)).toEqual([20, 20]);
    expect(s.traps[0]!.durability).toBe(TRAP_DURABILITY);
  });

  it('wears out after its durability in triggers; a broken trap neither hurts nor slows', () => {
    let s = fight(baseWith(['spikes', 1], ['wire', 3]));
    for (let i = 0; i < TRAP_DURABILITY; i++) {
      enemy(s, IN);
      enemy(s, { ...IN, y: 280 });
      s = tick(s, STEP);
      s.enemies = [];
    }
    expect(s.traps.map((t) => t.durability)).toEqual([0, 0]);
    const spiked = enemy(s, IN);
    const wired = enemy(s, { ...IN, y: 280 });
    s = tick(s, STEP);
    expect(s.enemies.find((e) => e.id === spiked.id)!.hp).toBe(20);
    expect(s.enemies.find((e) => e.id === wired.id)!.x).toBeCloseTo(IN.x - STRIDE);
    expect(s.traps.map((t) => t.durability)).toEqual([0, 0]);
    expect(s.traps[0]!.hit).toHaveLength(TRAP_DURABILITY);
  });

  it('an enemy that slides into another row triggers that cell’s trap too, once', () => {
    let s = fight(baseWith(['spikes', 1], ['spikes', 2]));
    const e = enemy(s, IN);
    s = tick(s, STEP);
    s.enemies[0]!.y = 200; // row 2
    s = tick(s, 3 * STEP);
    expect(s.enemies[0]!.hp).toBe(20 - 2 * TRAPS.spikes.damage);
    expect(s.traps.map((t) => t.hit)).toEqual([[e.id], [e.id]]);
  });
});

describe('traps between hordes', () => {
  it('keep their wear after a fight and are never removed by one', () => {
    const base = baseWith(['spikes', 1], ['wire', 3]);
    const s = fight(base);
    s.traps[0]!.durability = 0;
    s.traps[1]!.durability = 12;
    expect(baseAfter(base, s).traps).toEqual([
      { kind: 'spikes', row: 1, durability: 0 },
      { kind: 'wire', row: 3, durability: 12 },
    ]);
    s.outcome = 'lost';
    const g = finishHorde({ ...newGame(), base }, s, 0);
    expect(g.base.traps.map((t) => t.durability)).toEqual([0, 12]);
  });

  it('refuses a horde fought with other traps', () => {
    const s = fight(baseWith(['spikes', 1]));
    expect(() => baseAfter(baseWith(['wire', 1]), s)).toThrow(RangeError);
    expect(() => baseAfter(newBase(), s)).toThrow(RangeError);
  });
});
