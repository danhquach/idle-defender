import { describe, expect, it } from 'vitest';
import {
  buildPost,
  buildSegment,
  newBase,
  postXY,
  repairAll,
  repairAllCost,
  repairCost,
  repairSegment,
  segmentMaxHp,
  upgradeSegment,
  type Base,
  type Result,
} from './base.ts';
import { START_STOCK, type Stock, type Tier } from './data.ts';

const WOOD: Tier[] = ['wood'];
const ALL: Tier[] = ['wood', 'metal', 'concrete', 'reinforced'];
const rich = (): Stock => ({ scrap: 999, wood: 999, metal: 999, concrete: 999 });
const empty = (): Stock => ({ scrap: 0, wood: 0, metal: 0, concrete: 0 });

function ok(r: Result): { base: Base; stock: Stock } {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
}
function reason(r: Result): string {
  if (r.ok) throw new Error('expected a refusal');
  return r.reason;
}
/** The starting base with column 0 row `row` set to `hp`. */
function damaged(row: number, hp: number): Base {
  const base = newBase();
  base.layers[0]!.slots[row]!.hp = hp;
  return base;
}

describe('newBase', () => {
  it('is the starting base: one wood layer with a gate and two towers', () => {
    const base = newBase();
    expect(base.layers).toHaveLength(1);
    const layer = base.layers[0]!;
    expect(layer.column).toBe(0);
    expect(layer.slots.map((s) => s?.kind)).toEqual(['wall', 'wall', 'gate', 'wall', 'wall']);
    expect(layer.slots.every((s) => s?.tier === 'wood')).toBe(true);
    expect(layer.slots.map((s) => s?.hp)).toEqual([200, 200, 150, 200, 200]);
    expect(base.posts).toEqual([
      { kind: 'tower', column: 0, row: 1 },
      { kind: 'tower', column: 0, row: 3 },
    ]);
    expect(base.posts.map(postXY)).toEqual([
      { x: 420, y: 120 },
      { x: 420, y: 280 },
    ]);
  });

  it('segment max HP by kind and tier', () => {
    expect(segmentMaxHp('wall', 'reinforced')).toBe(1600);
    expect(segmentMaxHp('gate', 'metal')).toBe(300);
  });

  it('post positions per kind', () => {
    expect(postXY({ kind: 'wall-walk', column: 1, row: 0 })).toEqual({ x: 770, y: 40 });
    expect(postXY({ kind: 'ground', column: 2, row: 4 })).toEqual({ x: 860, y: 360 });
  });
});

describe('buildSegment', () => {
  it('builds a wood wall in a new layer and charges its cost', () => {
    const r = ok(buildSegment(newBase(), START_STOCK, WOOD, 1, 0, 'wall', 'wood'));
    expect(r.stock).toEqual({
      ...START_STOCK,
      wood: START_STOCK.wood - 10,
      scrap: START_STOCK.scrap - 5,
    });
    expect(r.base.layers.map((l) => l.column)).toEqual([0, 1]);
    expect(r.base.layers[1]!.slots).toEqual([
      { kind: 'wall', tier: 'wood', hp: 200, maxHp: 200 },
      null,
      null,
      null,
      null,
    ]);
  });

  it('keeps layers sorted by column', () => {
    let r = ok(buildSegment(newBase(), rich(), WOOD, 2, 0, 'wall', 'wood'));
    r = ok(buildSegment(r.base, r.stock, WOOD, 1, 0, 'wall', 'wood'));
    expect(r.base.layers.map((l) => l.column)).toEqual([0, 1, 2]);
  });

  it('refuses a taken slot, a locked tier, short stock and a second gate', () => {
    expect(reason(buildSegment(newBase(), rich(), WOOD, 0, 0, 'wall', 'wood'))).toBe('Slot taken');
    expect(reason(buildSegment(newBase(), rich(), WOOD, 1, 0, 'wall', 'metal'))).toBe(
      'Metal is locked',
    );
    expect(
      reason(buildSegment(newBase(), { ...rich(), wood: 9 }, WOOD, 1, 0, 'wall', 'wood')),
    ).toBe('Not enough wood');
    expect(
      reason(buildSegment(newBase(), { ...rich(), scrap: 4 }, WOOD, 1, 0, 'wall', 'wood')),
    ).toBe('Not enough scrap');
    let r = ok(buildSegment(newBase(), rich(), WOOD, 1, 0, 'gate', 'wood'));
    expect(reason(buildSegment(r.base, r.stock, WOOD, 1, 1, 'gate', 'wood'))).toBe(
      'This layer already has a gate',
    );
    r = ok(buildSegment(r.base, r.stock, WOOD, 1, 1, 'wall', 'wood'));
    expect(r.base.layers[1]!.slots[0]).toEqual({ kind: 'gate', tier: 'wood', hp: 150, maxHp: 150 });
  });

  it('builds a reinforced wall from concrete, metal and scrap', () => {
    const r = ok(buildSegment(newBase(), rich(), ALL, 1, 0, 'wall', 'reinforced'));
    expect(r.stock).toEqual({ scrap: 979, wood: 999, metal: 989, concrete: 989 });
  });
});

describe('upgradeSegment', () => {
  it('pays the next tier in full and refills a damaged segment', () => {
    const r = ok(upgradeSegment(damaged(0, 50), rich(), ALL, 0, 0));
    expect(r.base.layers[0]!.slots[0]).toEqual({
      kind: 'wall',
      tier: 'metal',
      hp: 400,
      maxHp: 400,
    });
    expect(r.stock).toEqual({ ...rich(), metal: 989, scrap: 989 });
  });

  it('a gate stays a gate', () => {
    const r = ok(upgradeSegment(newBase(), rich(), ALL, 0, 2));
    expect(r.base.layers[0]!.slots[2]).toEqual({
      kind: 'gate',
      tier: 'metal',
      hp: 300,
      maxHp: 300,
    });
  });

  it('refuses the top tier, a locked tier, an unbuilt slot and short stock', () => {
    let r = ok(upgradeSegment(newBase(), rich(), ALL, 0, 0));
    r = ok(upgradeSegment(r.base, r.stock, ALL, 0, 0));
    r = ok(upgradeSegment(r.base, r.stock, ALL, 0, 0));
    expect(reason(upgradeSegment(r.base, r.stock, ALL, 0, 0))).toBe('Already at the top tier');
    expect(reason(upgradeSegment(newBase(), rich(), WOOD, 0, 0))).toBe('Metal is locked');
    expect(reason(upgradeSegment(newBase(), rich(), ALL, 1, 0))).toBe('Nothing built here');
    expect(reason(upgradeSegment(newBase(), { ...rich(), metal: 9 }, ALL, 0, 0))).toBe(
      'Not enough metal',
    );
  });
});

describe('repair', () => {
  it('one missing HP still costs 1 of each material', () => {
    expect(repairCost({ kind: 'wall', tier: 'wood', hp: 199, maxHp: 200 })).toEqual({
      ...empty(),
      wood: 1,
      scrap: 1,
    });
  });

  it('a broken segment is repaired for the full tier cost, not rebuilt', () => {
    const r = ok(repairSegment(damaged(1, 0), START_STOCK, 0, 1));
    expect(r.base.layers[0]!.slots[1]).toEqual({ kind: 'wall', tier: 'wood', hp: 200, maxHp: 200 });
    expect(r.stock).toEqual({
      ...START_STOCK,
      wood: START_STOCK.wood - 10,
      scrap: START_STOCK.scrap - 5,
    });
  });

  it('a half-broken gate costs half, rounded up', () => {
    expect(repairCost({ kind: 'gate', tier: 'wood', hp: 75, maxHp: 150 })).toEqual({
      ...empty(),
      wood: 5,
      scrap: 3,
    });
  });

  it('refuses a full segment, an unbuilt slot and short stock', () => {
    expect(reason(repairSegment(newBase(), rich(), 0, 0))).toBe('Nothing to repair');
    expect(reason(repairSegment(newBase(), rich(), 1, 0))).toBe('Nothing built here');
    expect(reason(repairSegment(damaged(0, 0), { ...rich(), wood: 9 }, 0, 0))).toBe(
      'Not enough wood',
    );
  });

  it('repairAll is all or nothing', () => {
    const base = damaged(0, 0);
    base.layers[0]!.slots[1]!.hp = 100;
    expect(repairAllCost(base)).toEqual({ ...empty(), wood: 15, scrap: 8 });
    expect(reason(repairAll(base, { ...rich(), wood: 14 }))).toBe('Not enough wood');
    const r = ok(repairAll(base, rich()));
    expect(r.base).toEqual(newBase());
    expect(r.stock).toEqual({ ...rich(), wood: 984, scrap: 991 });
    expect(reason(repairAll(newBase(), rich()))).toBe('Nothing to repair');
  });
});

describe('buildPost', () => {
  it('builds each kind, charges its cost and keeps posts sorted', () => {
    let r = ok(buildPost(newBase(), rich(), { kind: 'ground', column: 0, row: 4 }));
    r = ok(buildPost(r.base, r.stock, { kind: 'wall-walk', column: 0, row: 0 }));
    r = ok(buildPost(r.base, r.stock, { kind: 'tower', column: 0, row: 0 }));
    expect(r.stock).toEqual({ ...rich(), wood: 999 - 5 - 5 - 20, scrap: 999 - 5 - 10 });
    expect(r.base.posts).toEqual([
      { kind: 'ground', column: 0, row: 4 },
      { kind: 'tower', column: 0, row: 0 },
      { kind: 'tower', column: 0, row: 1 },
      { kind: 'tower', column: 0, row: 3 },
      { kind: 'wall-walk', column: 0, row: 0 },
    ]);
  });

  it('a wall-walk post may go on a broken segment', () => {
    ok(buildPost(damaged(0, 0), rich(), { kind: 'wall-walk', column: 0, row: 0 }));
  });

  it('refuses a taken slot, a missing wall and short stock', () => {
    expect(reason(buildPost(newBase(), rich(), { kind: 'tower', column: 0, row: 1 }))).toBe(
      'Slot taken',
    );
    expect(reason(buildPost(newBase(), rich(), { kind: 'tower', column: 1, row: 1 }))).toBe(
      'A tower needs a wall in front',
    );
    expect(reason(buildPost(newBase(), rich(), { kind: 'ground', column: 1, row: 1 }))).toBe(
      'A ground post needs a wall in front',
    );
    const r = ok(buildSegment(newBase(), rich(), WOOD, 1, 0, 'wall', 'wood'));
    expect(reason(buildPost(r.base, r.stock, { kind: 'wall-walk', column: 1, row: 1 }))).toBe(
      'A wall-walk post needs a wall',
    );
    // One wall in the column is enough for a ground post.
    ok(buildPost(r.base, r.stock, { kind: 'ground', column: 1, row: 1 }));
    expect(
      reason(buildPost(newBase(), { ...rich(), wood: 19 }, { kind: 'tower', column: 0, row: 0 })),
    ).toBe('Not enough wood');
  });
});

describe('purity', () => {
  const actions: [string, (b: Base, s: Stock) => Result][] = [
    ['build ok', (b, s) => buildSegment(b, s, ALL, 1, 0, 'wall', 'wood')],
    ['build refused', (b, s) => buildSegment(b, s, ALL, 0, 0, 'wall', 'wood')],
    ['upgrade ok', (b, s) => upgradeSegment(b, s, ALL, 0, 0)],
    ['upgrade refused', (b, s) => upgradeSegment(b, s, WOOD, 0, 0)],
    ['repair ok', (b, s) => repairSegment(b, s, 0, 3)],
    ['repair refused', (b, s) => repairSegment(b, s, 0, 0)],
    ['repairAll ok', (b, s) => repairAll(b, s)],
    ['repairAll refused', (b) => repairAll(b, empty())],
    ['post ok', (b, s) => buildPost(b, s, { kind: 'ground', column: 0, row: 0 })],
    ['post refused', (b, s) => buildPost(b, s, { kind: 'tower', column: 0, row: 1 })],
  ];
  for (const [name, act] of actions) {
    it(`${name} leaves its inputs untouched`, () => {
      const base = damaged(3, 10);
      const stock = rich();
      const before = structuredClone({ base, stock });
      const r = act(base, stock);
      expect({ base, stock }).toEqual(before);
      if (r.ok) {
        // The result shares nothing mutable with the input.
        r.base.layers[0]!.slots[0]!.hp = -1;
        r.base.posts.push({ kind: 'ground', column: 0, row: 2 });
        r.stock.wood = -1;
        expect({ base, stock }).toEqual(before);
      }
    });
  }
});

describe('bad arguments', () => {
  it('throws RangeError for an off-grid column or row, or an unknown tier or kind', () => {
    const b = newBase();
    const s = rich();
    for (const [c, r] of [
      [3, 0],
      [-1, 0],
      [0, -1],
      [0, 5],
      [0, 1.5],
      [Number.NaN, 0],
    ] as const) {
      expect(() => buildSegment(b, s, ALL, c, r, 'wall', 'wood')).toThrow(RangeError);
      expect(() => upgradeSegment(b, s, ALL, c, r)).toThrow(RangeError);
      expect(() => repairSegment(b, s, c, r)).toThrow(RangeError);
      expect(() => buildPost(b, s, { kind: 'ground', column: c, row: r })).toThrow(RangeError);
    }
    expect(() => buildSegment(b, s, ALL, 1, 0, 'wall', 'gold' as Tier)).toThrow(RangeError);
    expect(() => buildSegment(b, s, ALL, 1, 0, 'moat' as 'wall', 'wood')).toThrow(RangeError);
    expect(() => buildPost(b, s, { kind: 'moat' as 'ground', column: 0, row: 0 })).toThrow(
      RangeError,
    );
  });
});
