// The build scene between hordes (ID-065): the camp as a walled plot, framed beside the
// build panel, with every empty slot ready to build and the camp's building plots. The
// right side is the real defence; a decorative fence closes the other three. View only:
// everything here is read from the game as it is, nothing is saved.
import { spotOf, type Base, type BaseSegment } from '../core/base.ts';
import {
  CAMP,
  CAMP_UPGRADES,
  COLUMNS,
  FIELD,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  TIER_ORDER,
  TRAP_STRIP,
  WALK_SPOTS,
  WALL,
  type Tier,
} from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import {
  HEIGHT_SCALE,
  HUD_SPACE,
  MIN_ZOOM,
  MARGIN_Y,
  PIECE,
  slotAt,
  TILT,
  type Camera,
  wallHeight,
  type SlotHit,
  type View,
} from './projection.ts';

/** The outer edge of the outermost column's wall: the fence runs this far along the field. */
export const FENCE_END = COLUMNS[COLUMNS.length - 1]! + WALL.depth;
/** The fence's thickness on the ground and its height, in world units. */
export const FENCE = { thickness: 8, height: 16 } as const;
/** Land shown outside the fence and past the trap strip. */
const LAND = 12;

/**
 * The fence's three runs as ground boxes: the camp's left side, then along the top and
 * the bottom of the field to the outermost column. Decoration only: no HP, no slot.
 */
export const FENCE_RUNS = [
  { x0: -FENCE.thickness, x1: 0, y0: -FENCE.thickness, y1: FIELD.height + FENCE.thickness },
  { x0: 0, x1: FENCE_END, y0: -FENCE.thickness, y1: 0 },
  { x0: 0, x1: FENCE_END, y0: FIELD.height, y1: FIELD.height + FENCE.thickness },
] as const;

/**
 * The build scene's world frame: from just outside the camp's fence through the trap
 * strip, every row, the strip above (where the back row's tops show) and the bottom fence.
 */
export const BUILD_FRAME = {
  left: -FENCE.thickness - LAND,
  right: TRAP_STRIP.x + TRAP_STRIP.width + LAND + FENCE.thickness,
  top: -MARGIN_Y,
  bottom: FIELD.height + FENCE.thickness + LAND,
} as const;
/** Screen px kept clear under the frame: the build mode has no bottom HUD. */
const BUILD_BOTTOM = 12;

/**
 * The camera on the build frame for a `view` whose build panel starts `room` px from
 * its left edge: zoomed to fit left of the panel and under the top bar (never under
 * MIN_ZOOM), centred in the spare space. Fixed: worked out again only on a resize.
 */
export function buildCamera(view: View, room: number): Camera {
  const w = BUILD_FRAME.right - BUILD_FRAME.left;
  const h = (BUILD_FRAME.bottom - BUILD_FRAME.top) * TILT;
  const across = Math.max(0, Math.min(view.w, room));
  const band = Math.max(0, view.h - HUD_SPACE.top - BUILD_BOTTOM);
  const zoom = Math.max(MIN_ZOOM, Math.min(across / w, band / h));
  const spareX = Math.max(0, across - w * zoom) / 2;
  const spareY = Math.max(0, band - h * zoom) / 2;
  return {
    x: BUILD_FRAME.left - spareX / zoom,
    y: BUILD_FRAME.top - (HUD_SPACE.top + spareY) / (zoom * TILT),
    zoom,
  };
}

/** How long Start Horde eases from the build frame into the fight frame, in ms. */
export const EASE_MS = 400;

/** The camera `t` (0…1) of the way from `a` to `b`, eased in and out. */
export function easeCamera(a: Camera, b: Camera, t: number): Camera {
  const u = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1));
  const s = u * u * (3 - 2 * u);
  const mix = (p: number, q: number): number => p + (q - p) * s;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), zoom: mix(a.zoom, b.zoom) };
}

/** The fence's tier: the most common among column 0's built segments (a tie goes up); wood with none. */
export function fenceTier(base: Base): Tier {
  const segs = base.layers.find((l) => l.column === 0)?.slots ?? [];
  let best: Tier = 'wood';
  let most = 0;
  for (const tier of TIER_ORDER) {
    const n = segs.filter((s) => s?.tier === tier).length;
    if (n > 0 && n >= most) {
      best = tier;
      most = n;
    }
  }
  return best;
}

/** A segment's tier badge: a letter on its tier's colour. */
export const TIER_BADGE: Readonly<Record<Tier, { text: string; colour: string }>> = {
  wood: { text: 'W', colour: '#9a6b3c' },
  metal: { text: 'M', colour: '#7895ad' },
  concrete: { text: 'C', colour: '#bcae92' },
  reinforced: { text: 'R', colour: '#4f6475' },
};

/** How a piece's condition shows: nothing when whole, a bar when damaged, a mark when broken. */
export type Condition = 'whole' | 'damaged' | 'broken';
export function conditionOf(value: number, max: number): Condition {
  if (!(value > 0)) return 'broken';
  return value < max ? 'damaged' : 'whole';
}

/** Shown in place of a "+" on a tower or ground-post slot no wall stands in front of. */
export const NEEDS_WALL = 'Needs a wall in front';

/** An empty slot that can be built now, or a post slot waiting for a wall. */
export type Ghost =
  | { what: 'segment'; column: number; row: number }
  | { what: 'walk'; column: number; row: number; spot: number }
  | { what: 'tower' | 'ground'; column: number; row: number; needsWall: boolean }
  | { what: 'trap'; row: number };

/**
 * Every empty slot, as the core allows building it (base.ts): a segment slot (wall or
 * gate), a free wall-walk spot on a built segment, a free tower or ground post (needing
 * a wall in its layer first), an empty trap cell. `lines` are the columns with no
 * segment built yet, shown as a ghost line.
 */
export function ghostsOf(base: Base): { slots: Ghost[]; lines: number[] } {
  const slots: Ghost[] = [];
  const lines: number[] = [];
  const taken = (kind: string, column: number, row: number, spot = 0): boolean =>
    base.posts.some(
      (p) => p.kind === kind && p.column === column && p.row === row && spotOf(p) === spot,
    ) ||
    base.turrets.some(
      (t) => t.mount === kind && t.column === column && t.row === row && spotOf(t) === spot,
    );
  COLUMNS.forEach((_, column) => {
    const segs: (BaseSegment | null)[] = base.layers.find((l) => l.column === column)?.slots ?? [];
    const walled = segs.some((s) => s);
    if (!walled) lines.push(column);
    for (let row = 0; row < SEGMENTS; row++) {
      if (segs[row]) {
        for (let spot = 0; spot < WALK_SPOTS; spot++) {
          if (!taken('wall-walk', column, row, spot))
            slots.push({ what: 'walk', column, row, spot });
        }
      } else {
        slots.push({ what: 'segment', column, row });
      }
      for (const what of ['tower', 'ground'] as const) {
        if (!taken(what, column, row)) slots.push({ what, column, row, needsWall: !walled });
      }
    }
  });
  for (let row = 0; row < SEGMENTS; row++) {
    if (!base.traps.some((t) => t.row === row)) slots.push({ what: 'trap', row });
  }
  return { slots, lines };
}

/** The camp's building plots, top to bottom; the Workbench's is kept free for ID-034. */
export const PLOT_IDS = ['lab', 'generator', 'workbench', 'hut-0', 'hut-1', 'hut-2'] as const;
export type PlotId = (typeof PLOT_IDS)[number];
/** Which part of the build panel a plot opens (#111): the Lab or power on Build, the roster's camp section. */
export type PlotSection = 'lab' | 'power' | 'camp';
/** A plot's footprint and, when built, its building's height. */
export const PLOT = { halfWidth: 46, halfDepth: 46, height: 36 } as const;
/** Plots stand between the camp line and column 0's ground posts. */
const PLOT_X = (CAMP.x + COLUMNS[0]! + POST_OFFSET.ground - PIECE.ground.halfWidth) / 2;
/** Each plot's centre on the ground. */
export const PLOT_AT: Readonly<Record<PlotId, { x: number; y: number }>> = Object.fromEntries(
  PLOT_IDS.map((id, i) => [id, { x: PLOT_X, y: ((i + 0.5) * FIELD.height) / PLOT_IDS.length }]),
) as Record<PlotId, { x: number; y: number }>;

export interface Plot {
  id: PlotId;
  kind: 'lab' | 'generator' | 'hut';
  /** Built, or a ghost "+" to build it. */
  built: boolean;
  /** Its name plate; '' for none. */
  label: string;
  /** A generator burning Gas now. */
  running: boolean;
  opens: PlotSection;
}

/**
 * The plots that show, read from the game: the Research Lab and the Generator (a ghost
 * until built, then the Lab's level or the generator's state), one hut per camp upgrade
 * bought and a ghost hut for the next while one is left.
 */
export function plotsOf(game: Pick<GameState, 'lab' | 'power' | 'camp'>): Plot[] {
  const gen = game.power.generator;
  const plots: Plot[] = [
    {
      id: 'lab',
      kind: 'lab',
      built: game.lab > 0,
      label: game.lab > 0 ? `Research Lab · Lv ${game.lab}` : 'Research Lab',
      running: false,
      opens: 'lab',
    },
    {
      id: 'generator',
      kind: 'generator',
      built: gen !== null,
      label: gen === null ? 'Generator' : `Generator · ${gen.at !== null ? 'running' : 'idle'}`,
      running: gen !== null && gen.at !== null,
      opens: 'power',
    },
  ];
  const huts = Math.min(game.camp.upgrades, CAMP_UPGRADES.length);
  for (let i = 0; i < Math.min(CAMP_UPGRADES.length, huts + 1); i++) {
    plots.push({
      id: `hut-${i}` as PlotId,
      kind: 'hut',
      built: i < huts,
      label: i < huts ? '' : 'Hut',
      running: false,
      opens: 'camp',
    });
  }
  return plots;
}

/** How far behind its footprint (in field `y`) the top of a piece `z` high shows. */
const lift = (z: number): number => (z * HEIGHT_SCALE) / TILT;

/**
 * The plot shown under ground point `(x, y)`, its building's face included, or null.
 * Where a building's face overlaps the plot behind it, the front one (lower) wins, as drawn.
 */
export function plotAt(x: number, y: number, plots: readonly Plot[]): Plot | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return (
    [...plots].reverse().find((p) => {
      const at = PLOT_AT[p.id];
      const top = p.built ? lift(PLOT.height) : 0;
      return (
        Math.abs(x - at.x) <= PLOT.halfWidth &&
        y >= at.y - PLOT.halfDepth - top &&
        y <= at.y + PLOT.halfDepth
      );
    }) ?? null
  );
}

/**
 * What the pointer is on in the build scene: a plot, a grid slot, or nothing (the fence
 * and open land). On a built segment's top it names the free wall-walk spot under it
 * too, highlighted as that spot; a click still opens the segment's menu.
 */
export type Target = { plot: Plot } | { slot: SlotHit; spot?: number };
export function targetAt(x: number, y: number, base: Base, plots: readonly Plot[]): Target | null {
  const plot = plotAt(x, y, plots);
  if (plot) return { plot };
  const slot = slotAt(x, y, base);
  if (!slot) return null;
  const seg = base.layers.find((l) => l.column === slot.column)?.slots[slot.row];
  if (slot.what !== 'segment' || !seg) return { slot };
  // The top face shows `lift` behind the footprint: undo it to find the spot along the row.
  const along = y + lift(wallHeight(seg.hp, seg.maxHp)) - slot.row * SEGMENT_HEIGHT;
  if (along < 0 || along >= SEGMENT_HEIGHT) return { slot };
  const spot = Math.floor((along / SEGMENT_HEIGHT) * WALK_SPOTS);
  const on = (p: { column: number; row: number; spot?: number }) =>
    p.column === slot.column && p.row === slot.row && spotOf(p) === spot;
  const taken =
    base.posts.some((p) => p.kind === 'wall-walk' && on(p)) ||
    base.turrets.some((t) => t.mount === 'wall-walk' && on(t));
  return taken ? { slot } : { slot, spot };
}

/** Where a ghost's "+" sits on the ground, and how high: a wall-walk spot is on its wall's top. */
export function ghostAt(g: Ghost, wallTop = 0): { x: number; y: number; z: number } {
  if (g.what === 'trap') {
    return { x: TRAP_STRIP.x + TRAP_STRIP.width / 2, y: (g.row + 0.5) * SEGMENT_HEIGHT, z: 0 };
  }
  const wx = COLUMNS[g.column]!;
  if (g.what === 'segment')
    return { x: wx + WALL.depth / 2, y: (g.row + 0.5) * SEGMENT_HEIGHT, z: 0 };
  if (g.what === 'walk') {
    return {
      x: wx + POST_OFFSET['wall-walk'],
      y: (g.row + (g.spot + 0.5) / WALK_SPOTS) * SEGMENT_HEIGHT,
      z: wallTop,
    };
  }
  return { x: wx + POST_OFFSET[g.what], y: (g.row + 0.5) * SEGMENT_HEIGHT, z: 0 };
}
