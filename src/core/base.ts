// The persistent base between hordes (design §3): layers of segments on a fixed
// grid, posts, and the build actions that spend materials on them. Every action
// is pure: it returns a new base and stock, or a refusal the UI shows as-is.
import {
  COLUMNS,
  GATE_HP,
  MATERIALS,
  MAX_CONDITION,
  POST_COST,
  POST_KINDS,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  TIER_ORDER,
  TIERS,
  TRAP_DURABILITY,
  TRAP_KINDS,
  TRAP_REFUND,
  TRAPS,
  TURRET,
  TURRET_MOUNTS,
  type Material,
  type PostKind,
  type Stock,
  type Tier,
  type TrapKind,
  type TurretMount,
} from './data.ts';

export type { PostKind, Tier, TrapKind, TurretMount } from './data.ts';
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
/** A turret on its mount (design §7): never destroyed, jammed at condition 0. */
export interface BaseTurret {
  mount: TurretMount;
  column: number;
  row: number;
  /** 0 (jammed) … `MAX_CONDITION`. */
  condition: number;
}
/** A trap in its cell of the outer layer's strip (design §7): never destroyed, broken at 0. */
export interface BaseTrap {
  kind: TrapKind;
  row: number;
  /** 0 (broken) … `TRAP_DURABILITY`. */
  durability: number;
}
/** Layers sorted by column; posts and turrets sorted by (column, kind, row); traps by row. */
export interface Base {
  layers: BaseLayer[];
  posts: BasePost[];
  turrets: BaseTurret[];
  traps: BaseTrap[];
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
    turrets: [],
    traps: [],
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

/** Every segment's, turret's and trap's repair cost, summed. */
export function repairAllCost(base: Base): Stock {
  const total = stockFrom(() => 0);
  for (const cost of [
    ...segments(base).map(repairCost),
    ...base.turrets.map(turretRepairCost),
    ...base.traps.map(trapRepairCost),
  ]) {
    for (const m of MATERIALS) total[m] += cost[m];
  }
  return total;
}

/** Repairs every damaged segment, turret and trap, or nothing if the stock can't cover them all. */
export function repairAll(base: Base, stock: Stock): Result {
  if (
    segments(base).every((s) => s.hp >= s.maxHp) &&
    base.turrets.every((t) => t.condition >= MAX_CONDITION) &&
    base.traps.every((t) => t.durability >= TRAP_DURABILITY)
  ) {
    return refuse('Nothing to repair');
  }
  return pay(base, stock, repairAllCost(base), (b) => {
    for (const s of segments(b)) s.hp = s.maxHp;
    for (const t of b.turrets) t.condition = MAX_CONDITION;
    for (const t of b.traps) t.durability = TRAP_DURABILITY;
  });
}

export function buildPost(base: Base, stock: Stock, post: BasePost): Result {
  checkPost(post);
  const { kind, column, row } = post;
  if (spotTaken(base, kind, column, row)) return refuse('Slot taken');
  const layer = layerAt(base, column);
  if (kind === 'wall-walk' && !layer?.slots[row]) return refuse('A wall-walk post needs a wall');
  if (kind !== 'wall-walk' && !layer?.slots.some((s) => s)) {
    return refuse(`${kind === 'tower' ? 'A tower' : 'A ground post'} needs a wall in front`);
  }
  return pay(base, stock, POST_COST[kind], (b) => {
    b.posts.push({ kind, column, row });
    b.posts.sort(byPost);
  });
}

/** Where a turret may go, or why not: a free spot, a wall under a wall mount, a wall in front of a tower. */
function mountError(base: Base, mount: TurretMount, column: number, row: number): string | null {
  if (spotTaken(base, mount, column, row)) return 'Slot taken';
  const layer = layerAt(base, column);
  if (mount === 'wall-walk' && !layer?.slots[row]) return 'A wall mount needs a wall';
  if (mount === 'tower' && !layer?.slots.some((s) => s))
    return 'A tower mount needs a wall in front';
  return null;
}

/** Builds an Auto-turret at full condition (design §7); needs the Auto-turret researched. */
export function buildTurret(
  base: Base,
  stock: Stock,
  researched: boolean,
  mount: TurretMount,
  column: number,
  row: number,
): Result {
  checkMount(mount, column, row);
  if (!researched) return refuse('Research the Auto-turret first');
  const why = mountError(base, mount, column, row);
  if (why) return refuse(why);
  return pay(base, stock, TURRET.cost, (b) => {
    b.turrets.push({ mount, column, row, condition: MAX_CONDITION });
    b.turrets.sort(byTurret);
  });
}

/** Scrap for `turret`'s missing condition, rounded up. */
export function turretRepairCost(turret: BaseTurret): Stock {
  const missing = (MAX_CONDITION - turret.condition) / MAX_CONDITION;
  return stockFrom((m) => (m === 'scrap' ? Math.ceil(TURRET.repairScrap * missing) : 0));
}

export function repairTurret(base: Base, stock: Stock, index: number): Result {
  const t = turretAt(base, index);
  if (t.condition >= MAX_CONDITION) return refuse('Nothing to repair');
  return pay(base, stock, turretRepairCost(t), (b) => {
    b.turrets[index]!.condition = MAX_CONDITION;
  });
}

/** What dismantling `turret` gives back: `TURRET.salvage` × cost × condition share, rounded down. */
export function salvageValue(turret: BaseTurret): Stock {
  const share = (TURRET.salvage * turret.condition) / MAX_CONDITION;
  return stockFrom((m) => Math.floor(((TURRET.cost as Partial<Stock>)[m] ?? 0) * share));
}

/** Dismantles turret `index` for its salvage value and frees the mount; never refused. */
export function salvageTurret(base: Base, stock: Stock, index: number): Result {
  const value = salvageValue(turretAt(base, index));
  const b = structuredClone(base);
  b.turrets.splice(index, 1);
  return { ok: true, base: b, stock: stockFrom((m) => stock[m] + value[m]) };
}

/** Moves turret `index` to another free mount, for free, keeping its condition. */
export function moveTurret(
  base: Base,
  stock: Stock,
  index: number,
  mount: TurretMount,
  column: number,
  row: number,
): Result {
  const t = turretAt(base, index);
  checkMount(mount, column, row);
  if (t.mount === mount && t.column === column && t.row === row) return refuse('Already there');
  const why = mountError(base, mount, column, row);
  if (why) return refuse(why);
  return pay(base, stock, {}, (b) => {
    const moved = b.turrets.splice(index, 1)[0]!;
    b.turrets.push({ ...moved, mount, column, row });
    b.turrets.sort(byTurret);
  });
}

/** Builds a trap at full durability in the strip's cell `row` (design §7); no research needed. */
export function buildTrap(base: Base, stock: Stock, kind: TrapKind, row: number): Result {
  checkTrap(kind, row);
  if (base.traps.some((t) => t.row === row)) return refuse('Slot taken');
  return pay(base, stock, TRAPS[kind].cost, (b) => {
    b.traps.push({ kind, row, durability: TRAP_DURABILITY });
    b.traps.sort((x, y) => x.row - y.row);
  });
}

/** The trap's cost × missing / full durability, rounded up per material. */
export function trapRepairCost(trap: BaseTrap): Stock {
  const missing = (TRAP_DURABILITY - trap.durability) / TRAP_DURABILITY;
  const cost = TRAPS[trap.kind].cost;
  return stockFrom((m) => Math.ceil((cost[m] ?? 0) * missing));
}

export function repairTrap(base: Base, stock: Stock, index: number): Result {
  const t = trapAt(base, index);
  if (t.durability >= TRAP_DURABILITY) return refuse('Nothing to repair');
  return pay(base, stock, trapRepairCost(t), (b) => {
    b.traps[index]!.durability = TRAP_DURABILITY;
  });
}

/** What removing `trap` gives back: `TRAP_REFUND` × cost × durability share, rounded down. */
export function trapRefund(trap: BaseTrap): Stock {
  const share = (TRAP_REFUND * trap.durability) / TRAP_DURABILITY;
  return stockFrom((m) => Math.floor((TRAPS[trap.kind].cost[m] ?? 0) * share));
}

/** Removes trap `index` for its refund and frees the cell; never refused. */
export function removeTrap(base: Base, stock: Stock, index: number): Result {
  const value = trapRefund(trapAt(base, index));
  const b = structuredClone(base);
  b.traps.splice(index, 1);
  return { ok: true, base: b, stock: stockFrom((m) => stock[m] + value[m]) };
}

const refuse = (reason: string): Result => ({ ok: false, reason });
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byPost = (x: BasePost, y: BasePost): number =>
  x.column - y.column || cmp(x.kind, y.kind) || x.row - y.row;
const byTurret = (x: BaseTurret, y: BaseTurret): number =>
  x.column - y.column || cmp(x.mount, y.mount) || x.row - y.row;
/** A post or a turret already holds this spot (a ground spot never holds a turret). */
const spotTaken = (base: Base, kind: PostKind, column: number, row: number): boolean =>
  base.posts.some((p) => p.kind === kind && p.column === column && p.row === row) ||
  base.turrets.some((t) => t.mount === kind && t.column === column && t.row === row);
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
function turretAt(base: Base, index: number): BaseTurret {
  const t = Number.isInteger(index) ? base.turrets[index] : undefined;
  if (!t) throw new RangeError(`base: no turret ${index}`);
  return t;
}
function trapAt(base: Base, index: number): BaseTrap {
  const t = Number.isInteger(index) ? base.traps[index] : undefined;
  if (!t) throw new RangeError(`base: no trap ${index}`);
  return t;
}
function checkTrap(kind: TrapKind, row: number): void {
  if (!TRAP_KINDS.includes(kind)) throw new RangeError(`base: unknown trap ${String(kind)}`);
  if (!Number.isInteger(row) || row < 0 || row >= SEGMENTS) {
    throw new RangeError(`base: bad row ${row}`);
  }
}
function checkMount(mount: TurretMount, column: number, row: number): void {
  if (!TURRET_MOUNTS.includes(mount)) {
    throw new RangeError(`base: unknown turret mount ${String(mount)}`);
  }
  checkSlot(column, row);
}
function checkPost(post: BasePost): void {
  if (!POST_KINDS.includes(post.kind)) {
    throw new RangeError(`base: unknown post kind ${String(post.kind)}`);
  }
  checkSlot(post.column, post.row);
}
