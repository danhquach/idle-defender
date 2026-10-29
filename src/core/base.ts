// The persistent base between hordes (design §3): layers of segments on a fixed
// grid, posts, and the build actions that spend materials on them. Every action
// is pure: it returns a new base and stock, or a refusal the UI shows as-is.
import {
  COLUMNS,
  GATE_HP,
  MATERIALS,
  POST_COST,
  POST_KINDS,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  TIER_ORDER,
  TIERS,
  type Material,
  type PostKind,
  type Stock,
  type Tier,
} from './data.ts';

export type { PostKind, Tier } from './data.ts';
export type SegmentKind = 'wall' | 'gate';
export interface BaseSegment {
  kind: SegmentKind;
  tier: Tier;
  hp: number;
  maxHp: number;
}
/** One layer: `SEGMENTS` slots top to bottom; null = unbuilt (an open gap). */
export interface BaseLayer {
  column: number;
  slots: (BaseSegment | null)[];
}
export interface BasePost {
  kind: PostKind;
  column: number;
  row: number;
}
/** Layers sorted by column; posts sorted by (column, kind, row). */
export interface Base {
  layers: BaseLayer[];
  posts: BasePost[];
}
export type Result = { ok: true; base: Base; stock: Stock } | { ok: false; reason: string };

export function segmentMaxHp(kind: SegmentKind, tier: Tier): number {
  checkKind(kind);
  checkTier(tier);
  return TIERS[tier].hp * (kind === 'gate' ? GATE_HP : 1);
}

export function postXY(post: BasePost): { x: number; y: number } {
  checkPost(post);
  return {
    x: COLUMNS[post.column]! + POST_OFFSET[post.kind],
    y: (post.row + 0.5) * SEGMENT_HEIGHT,
  };
}

/** The starting base (design §11): one wood layer with a gate, two towers. */
export function newBase(): Base {
  const segment = (kind: SegmentKind): BaseSegment => {
    const hp = segmentMaxHp(kind, 'wood');
    return { kind, tier: 'wood', hp, maxHp: hp };
  };
  return {
    layers: [
      {
        column: 0,
        slots: Array.from({ length: SEGMENTS }, (_, row) => segment(row === 2 ? 'gate' : 'wall')),
      },
    ],
    posts: [
      { kind: 'tower', column: 0, row: 1 },
      { kind: 'tower', column: 0, row: 3 },
    ],
  };
}

export function buildSegment(
  base: Base,
  stock: Stock,
  tiers: readonly Tier[],
  column: number,
  row: number,
  kind: SegmentKind,
  tier: Tier,
): Result {
  checkSlot(column, row);
  checkKind(kind);
  checkTier(tier);
  const layer = layerAt(base, column);
  if (layer?.slots[row]) return refuse('Slot taken');
  if (!tiers.includes(tier)) return refuse(`${TIERS[tier].name} is locked`);
  if (kind === 'gate' && layer?.slots.some((s) => s?.kind === 'gate')) {
    return refuse('This layer already has a gate');
  }
  return pay(base, stock, TIERS[tier].cost, (b) => {
    let l = layerAt(b, column);
    if (!l) {
      l = { column, slots: Array.from({ length: SEGMENTS }, () => null) };
      b.layers.push(l);
      b.layers.sort((x, y) => x.column - y.column);
    }
    const hp = segmentMaxHp(kind, tier);
    l.slots[row] = { kind, tier, hp, maxHp: hp };
  });
}

/** Pays the next tier's full cost and refills the segment. */
export function upgradeSegment(
  base: Base,
  stock: Stock,
  tiers: readonly Tier[],
  column: number,
  row: number,
): Result {
  checkSlot(column, row);
  const seg = layerAt(base, column)?.slots[row];
  if (!seg) return refuse('Nothing built here');
  const next = TIER_ORDER[TIER_ORDER.indexOf(seg.tier) + 1];
  if (!next) return refuse('Already at the top tier');
  if (!tiers.includes(next)) return refuse(`${TIERS[next].name} is locked`);
  return pay(base, stock, TIERS[next].cost, (b) => {
    const hp = segmentMaxHp(seg.kind, next);
    layerAt(b, column)!.slots[row] = { kind: seg.kind, tier: next, hp, maxHp: hp };
  });
}

/** The tier's cost × missing / max HP, rounded up per material. */
export function repairCost(seg: BaseSegment): Stock {
  const missing = (seg.maxHp - seg.hp) / seg.maxHp;
  const cost = TIERS[seg.tier].cost;
  return stockFrom((m) => Math.ceil((cost[m] ?? 0) * missing));
}

export function repairSegment(base: Base, stock: Stock, column: number, row: number): Result {
  checkSlot(column, row);
  const seg = layerAt(base, column)?.slots[row];
  if (!seg) return refuse('Nothing built here');
  if (seg.hp >= seg.maxHp) return refuse('Nothing to repair');
  return pay(base, stock, repairCost(seg), (b) => {
    const s = layerAt(b, column)!.slots[row]!;
    s.hp = s.maxHp;
  });
}

export function repairAllCost(base: Base): Stock {
  const total = stockFrom(() => 0);
  for (const seg of segments(base)) {
    const cost = repairCost(seg);
    for (const m of MATERIALS) total[m] += cost[m];
  }
  return total;
}

/** Repairs every damaged segment, or nothing if the stock can't cover them all. */
export function repairAll(base: Base, stock: Stock): Result {
  if (segments(base).every((s) => s.hp >= s.maxHp)) return refuse('Nothing to repair');
  return pay(base, stock, repairAllCost(base), (b) => {
    for (const s of segments(b)) s.hp = s.maxHp;
  });
}

export function buildPost(base: Base, stock: Stock, post: BasePost): Result {
  checkPost(post);
  const { kind, column, row } = post;
  if (base.posts.some((p) => p.kind === kind && p.column === column && p.row === row)) {
    return refuse('Slot taken');
  }
  const layer = layerAt(base, column);
  if (kind === 'wall-walk' && !layer?.slots[row]) return refuse('A wall-walk post needs a wall');
  if (kind !== 'wall-walk' && !layer?.slots.some((s) => s)) {
    return refuse(`${kind === 'tower' ? 'A tower' : 'A ground post'} needs a wall in front`);
  }
  return pay(base, stock, POST_COST[kind], (b) => {
    b.posts.push({ kind, column, row });
    b.posts.sort((x, y) => x.column - y.column || cmp(x.kind, y.kind) || x.row - y.row);
  });
}

const refuse = (reason: string): Result => ({ ok: false, reason });
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const layerAt = (base: Base, column: number): BaseLayer | undefined =>
  base.layers.find((l) => l.column === column);
const segments = (base: Base): BaseSegment[] =>
  base.layers.flatMap((l) => l.slots.filter((s): s is BaseSegment => s !== null));
const stockFrom = (f: (m: Material) => number): Stock => ({
  scrap: f('scrap'),
  wood: f('wood'),
  metal: f('metal'),
  concrete: f('concrete'),
});

/** Charges `cost` and applies `change` to a copy, or refuses naming the first short material. */
function pay(base: Base, stock: Stock, cost: Partial<Stock>, change: (b: Base) => void): Result {
  const short = MATERIALS.find((m) => stock[m] < (cost[m] ?? 0));
  if (short) return refuse(`Not enough ${short}`);
  const b = structuredClone(base);
  change(b);
  return { ok: true, base: b, stock: stockFrom((m) => stock[m] - (cost[m] ?? 0)) };
}

function checkSlot(column: number, row: number): void {
  if (!Number.isInteger(column) || column < 0 || column >= COLUMNS.length) {
    throw new RangeError(`base: bad column ${column}`);
  }
  if (!Number.isInteger(row) || row < 0 || row >= SEGMENTS) {
    throw new RangeError(`base: bad row ${row}`);
  }
}
function checkTier(tier: Tier): void {
  if (!TIER_ORDER.includes(tier)) throw new RangeError(`base: unknown tier ${String(tier)}`);
}
function checkKind(kind: SegmentKind): void {
  if (kind !== 'wall' && kind !== 'gate') {
    throw new RangeError(`base: unknown segment kind ${String(kind)}`);
  }
}
function checkPost(post: BasePost): void {
  if (!POST_KINDS.includes(post.kind)) {
    throw new RangeError(`base: unknown post kind ${String(post.kind)}`);
  }
  checkSlot(post.column, post.row);
}
