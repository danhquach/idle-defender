// ID-065: the build scene's frame, fence, ghosts and plots, and what a click lands on.
import { describe, expect, it } from 'vitest';
import {
  buildPost,
  buildSegment,
  buildTrap,
  buildTurret,
  newBase,
  type Base,
} from '../core/base.ts';
import {
  CAMP,
  COLUMNS,
  FIELD,
  POST_OFFSET,
  SEGMENT_HEIGHT,
  SEGMENTS,
  TIER_ORDER,
  TRAP_STRIP,
  WALK_SPOTS,
  WALL,
  stockOf,
} from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import {
  BUILD_FRAME,
  buildCamera,
  conditionOf,
  easeCamera,
  FENCE_END,
  FENCE_RUNS,
  fenceTier,
  ghostAt,
  ghostsOf,
  NEEDS_WALL,
  PLOT,
  PLOT_AT,
  PLOT_IDS,
  plotAt,
  plotsOf,
  targetAt,
  TIER_BADGE,
  type Ghost,
} from './buildscene.ts';
import {
  HEIGHT_SCALE,
  HUD_SPACE,
  MIN_ZOOM,
  PIECE,
  project,
  TILT,
  wallHeight,
} from './projection.ts';

const RICH = stockOf({ scrap: 999, wood: 999, metal: 999, concrete: 999 });
const ok = (r: { ok: true; base: Base } | { ok: false; reason: string }): Base => {
  if (!r.ok) throw new Error(r.reason);
  return r.base;
};

describe('the build frame (ID-065)', () => {
  /** The frame's corners on screen. */
  const box = (cam: ReturnType<typeof buildCamera>) => {
    const a = project({ x: BUILD_FRAME.left, y: BUILD_FRAME.top }, cam);
    const b = project({ x: BUILD_FRAME.right, y: BUILD_FRAME.bottom }, cam);
    return { left: a.sx, top: a.sy, right: b.sx, bottom: b.sy };
  };

  it('runs from just outside the camp’s fence through the trap strip, every row and both fence bands', () => {
    expect(BUILD_FRAME.left).toBeCloseTo(-20, 0);
    expect(BUILD_FRAME.right).toBeCloseTo(1240, 0);
    expect(BUILD_FRAME.left).toBeLessThan(Math.min(...FENCE_RUNS.map((r) => r.x0)));
    expect(BUILD_FRAME.right).toBeGreaterThan(TRAP_STRIP.x + TRAP_STRIP.width);
    expect(BUILD_FRAME.top).toBeLessThan(Math.min(...FENCE_RUNS.map((r) => r.y0)));
    expect(BUILD_FRAME.bottom).toBeGreaterThan(Math.max(...FENCE_RUNS.map((r) => r.y1)));
  });

  for (const v of [
    { w: 1280, h: 720, zoom: 0.78 },
    { w: 1440, h: 900, zoom: 0.91 },
  ]) {
    it(`fits left of the open build panel at ${v.w}×${v.h} (about ${v.zoom}×)`, () => {
      // The panel is 280 px wide, 12 px from the window's right edge.
      const room = v.w - 292;
      const cam = buildCamera(v, room);
      expect(cam.zoom).toBeCloseTo(v.zoom, 2);
      const b = box(cam);
      expect(b.left).toBeGreaterThanOrEqual(-1e-9);
      expect(b.right).toBeLessThanOrEqual(room + 1e-9);
      expect(b.top).toBeGreaterThanOrEqual(HUD_SPACE.top - 1e-9);
      expect(b.bottom).toBeLessThanOrEqual(v.h);
    });
  }

  it('centres a short frame in a tall band, never zooms under MIN_ZOOM, and stays finite', () => {
    const tall = buildCamera({ w: 1280, h: 1400 }, 988);
    const b = box(tall);
    expect(b.top - HUD_SPACE.top).toBeCloseTo(1400 - 12 - b.bottom, 6);
    for (const cam of [buildCamera({ w: 200, h: 100 }, 0), buildCamera({ w: 0, h: 0 }, -50)]) {
      expect(cam.zoom).toBe(MIN_ZOOM);
      expect(Object.values(cam).every(Number.isFinite)).toBe(true);
    }
    // A room wider than the window counts only the window.
    expect(buildCamera({ w: 1280, h: 720 }, 5000)).toEqual(buildCamera({ w: 1280, h: 720 }, 1280));
  });

  it('eases from one camera to another: the ends exactly, the middle between, clamped', () => {
    const a = { x: 0, y: -100, zoom: 0.8 };
    const b = { x: 300, y: -40, zoom: 1.1 };
    expect(easeCamera(a, b, 0)).toEqual(a);
    expect(easeCamera(a, b, 1)).toEqual(b);
    expect(easeCamera(a, b, -1)).toEqual(a);
    expect(easeCamera(a, b, 7)).toEqual(b);
    expect(easeCamera(a, b, NaN)).toEqual(b);
    const mid = easeCamera(a, b, 0.5);
    expect(mid.x).toBeCloseTo(150, 9);
    expect(mid.y).toBeCloseTo(-70, 9);
    expect(mid.zoom).toBeCloseTo(0.95, 9);
    // Eased: slower than linear at the start.
    expect(easeCamera(a, b, 0.1).x).toBeLessThan(30);
  });
});

describe('the fence (ID-065)', () => {
  it('runs along the camp’s left side and the top and bottom of the field to the outermost column', () => {
    expect(FENCE_END).toBe(COLUMNS.at(-1)! + WALL.depth);
    expect(FENCE_END).toBe(1040);
    const [left, top, bottom] = FENCE_RUNS;
    expect(left.x1).toBe(0);
    expect(left.y0).toBeLessThan(0);
    expect(left.y1).toBeGreaterThan(FIELD.height);
    expect([top.x0, top.x1, top.y1]).toEqual([0, FENCE_END, 0]);
    expect([bottom.x0, bottom.x1, bottom.y0]).toEqual([0, FENCE_END, FIELD.height]);
  });

  it('is drawn in the most common tier of column 0’s segments; a tie goes up; wood with none', () => {
    expect(fenceTier(newBase())).toBe('wood');
    const mixed = (tiers: (string | null)[]): Base => ({
      ...newBase(),
      layers: [
        {
          column: 0,
          slots: tiers.map((tier) =>
            tier === null ? null : { kind: 'wall', tier, hp: 0, maxHp: 1 },
          ) as Base['layers'][number]['slots'],
        },
        // Another column's tiers never count.
        {
          column: 1,
          slots: Array.from({ length: SEGMENTS }, () => ({
            kind: 'wall' as const,
            tier: 'reinforced' as const,
            hp: 1,
            maxHp: 1,
          })),
        },
      ],
    });
    // Broken segments still count by their tier.
    expect(fenceTier(mixed(['metal', 'metal', 'metal', 'wood', 'wood', null, null]))).toBe('metal');
    expect(fenceTier(mixed(['wood', 'wood', 'concrete', 'concrete']))).toBe('concrete');
    expect(fenceTier(mixed([null, null]))).toBe('wood');
    expect(fenceTier({ ...newBase(), layers: [] })).toBe('wood');
  });

  it('takes no clicks: no slot and no plot along any of its runs', () => {
    const plots = plotsOf(newGame());
    // Where a wall's drawn top stands over the top fence, a click there is on the wall, as drawn.
    const onWall = (x: number) => COLUMNS.some((wx) => x >= wx && x <= wx + WALL.depth);
    let checked = 0;
    for (const r of FENCE_RUNS) {
      for (let i = 0; i <= 40; i++) {
        const x = r.x0 + ((r.x1 - r.x0) * i) / 40;
        const y = r.y0 + ((r.y1 - r.y0) * i) / 40;
        if (onWall(x)) continue;
        expect(targetAt(x, y, newBase(), plots)).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('ghosts for every empty slot (ID-065)', () => {
  const of = (base: Base, what: Ghost['what']) =>
    ghostsOf(base).slots.filter((g) => g.what === what);

  it('on the starting base: a ghost on each empty slot type, none on a built one', () => {
    const base = newBase();
    const { lines } = ghostsOf(base);
    // Column 0 is a full wall: no segment ghosts there; columns 1 and 2 are ghost lines.
    expect(lines).toEqual([1, 2]);
    const segs = of(base, 'segment') as Extract<Ghost, { what: 'segment' }>[];
    expect(segs).toHaveLength(2 * SEGMENTS);
    expect(segs.every((g) => g.column > 0)).toBe(true);
    // Every wall-walk spot on column 0's built segments, both spots, gate included.
    const walks = of(base, 'walk') as Extract<Ghost, { what: 'walk' }>[];
    expect(walks).toHaveLength(SEGMENTS * WALK_SPOTS);
    expect(walks.every((g) => g.column === 0)).toBe(true);
    // Towers on rows 4 and 6 are built.
    const towers = of(base, 'tower') as Extract<Ghost, { what: 'tower' | 'ground' }>[];
    expect(towers.filter((g) => g.column === 0).map((g) => g.row)).toEqual([
      0, 1, 2, 3, 5, 7, 8, 9,
    ]);
    expect(of(base, 'ground')).toHaveLength(COLUMNS.length * SEGMENTS);
    expect(of(base, 'trap')).toHaveLength(SEGMENTS);
  });

  it('a tower or ground slot with no wall in front says so instead of a "+"', () => {
    const posts = [...of(newBase(), 'tower'), ...of(newBase(), 'ground')] as Extract<
      Ghost,
      { what: 'tower' | 'ground' }
    >[];
    expect(posts.filter((g) => g.column === 0).every((g) => !g.needsWall)).toBe(true);
    expect(posts.filter((g) => g.column > 0).every((g) => g.needsWall)).toBe(true);
    expect(NEEDS_WALL).toBe('Needs a wall in front');
    // As the core allows it: one segment in a layer lets every row's posts be built.
    const one = ok(buildSegment(newBase(), RICH, TIER_ORDER, 1, 3, 'wall', 'wood'));
    const col1 = [...of(one, 'tower'), ...of(one, 'ground')].filter(
      (g) => 'column' in g && g.column === 1,
    ) as Extract<Ghost, { what: 'tower' | 'ground' }>[];
    expect(col1).toHaveLength(2 * SEGMENTS);
    expect(col1.every((g) => !g.needsWall)).toBe(true);
    expect(ok(buildPost(one, RICH, { kind: 'tower', column: 1, row: 8 }))).toBeTruthy();
    expect(ghostsOf(one).lines).toEqual([2]);
  });

  it('none on a built segment, post, turret, wall-walk spot or trap', () => {
    let base = ok(buildSegment(newBase(), RICH, TIER_ORDER, 1, 3, 'gate', 'wood'));
    base = ok(buildPost(base, RICH, { kind: 'wall-walk', column: 0, row: 0, spot: 1 }));
    base = ok(buildTurret(base, RICH, true, 'wall-walk', 0, 1));
    base = ok(buildTurret(base, RICH, true, 'tower', 0, 0));
    base = ok(buildPost(base, RICH, { kind: 'ground', column: 0, row: 2 }));
    base = ok(buildTrap(base, RICH, 'spikes', 3));
    const slots = ghostsOf(base).slots;
    const has = (g: Partial<Ghost>) =>
      slots.some((s) =>
        Object.entries(g).every(([k, v]) => (s as Record<string, unknown>)[k] === v),
      );
    expect(has({ what: 'segment', column: 1, row: 3 })).toBe(false);
    expect(has({ what: 'walk', column: 1, row: 3, spot: 0 })).toBe(true);
    expect(has({ what: 'walk', column: 0, row: 0, spot: 1 })).toBe(false);
    expect(has({ what: 'walk', column: 0, row: 0, spot: 0 })).toBe(true);
    expect(has({ what: 'walk', column: 0, row: 1, spot: 0 })).toBe(false);
    expect(has({ what: 'walk', column: 0, row: 1, spot: 1 })).toBe(true);
    expect(has({ what: 'tower', column: 0, row: 0 })).toBe(false);
    expect(has({ what: 'ground', column: 0, row: 2 })).toBe(false);
    expect(has({ what: 'trap', row: 3 })).toBe(false);
    expect(has({ what: 'trap', row: 4 })).toBe(true);
  });

  it('puts each "+" on its slot: a wall-walk spot’s on its wall’s top', () => {
    expect(ghostAt({ what: 'segment', column: 1, row: 2 })).toEqual({
      x: COLUMNS[1]! + WALL.depth / 2,
      y: 2.5 * SEGMENT_HEIGHT,
      z: 0,
    });
    expect(ghostAt({ what: 'walk', column: 0, row: 2, spot: 1 }, 40)).toEqual({
      x: COLUMNS[0]! + POST_OFFSET['wall-walk'],
      y: (2 + 1.5 / WALK_SPOTS) * SEGMENT_HEIGHT,
      z: 40,
    });
    expect(ghostAt({ what: 'tower', column: 2, row: 0, needsWall: true }).x).toBe(
      COLUMNS[2]! + POST_OFFSET.tower,
    );
    expect(ghostAt({ what: 'trap', row: 9 })).toEqual({
      x: TRAP_STRIP.x + TRAP_STRIP.width / 2,
      y: 9.5 * SEGMENT_HEIGHT,
      z: 0,
    });
  });
});

describe('hit tests in the build scene (ID-065)', () => {
  const plots = plotsOf(newGame());

  it('lands on each slot type, a wall-walk spot opening its segment', () => {
    const base = newBase();
    const mid = (row: number) => (row + 0.5) * SEGMENT_HEIGHT;
    const at = (x: number, y: number) => targetAt(x, y, base, plots);
    expect(at(COLUMNS[1]! + 10, mid(2))).toEqual({ slot: { column: 1, row: 2, what: 'segment' } });
    expect(at(COLUMNS[0]! + POST_OFFSET.tower, mid(1))).toEqual({
      slot: { column: 0, row: 1, what: 'tower' },
    });
    expect(at(COLUMNS[2]! + POST_OFFSET.ground, mid(8))).toEqual({
      slot: { column: 2, row: 8, what: 'ground' },
    });
    expect(at(TRAP_STRIP.x + 5, mid(7))).toEqual({ slot: { column: 2, row: 7, what: 'trap' } });
    // A free spot on top of a built wall, where its ghost is drawn.
    const top = wallHeight(1, 1);
    const spot = ghostAt({ what: 'walk', column: 0, row: 3, spot: 1 }, top);
    const lifted = spot.y - (top * HEIGHT_SCALE) / TILT;
    // It names the spot, for its highlight; the click still opens the segment.
    expect(at(spot.x, lifted)).toEqual({ slot: { column: 0, row: 3, what: 'segment' }, spot: 1 });
    const first = ghostAt({ what: 'walk', column: 0, row: 3, spot: 0 }, top);
    expect(at(first.x, first.y - (top * HEIGHT_SCALE) / TILT)).toMatchObject({ spot: 0 });
    // On the wall's front face (the bottom row's: nothing stands in front of it), or on a
    // spot already holding a post: the segment alone.
    expect(at(spot.x, 9.98 * SEGMENT_HEIGHT)).toEqual({
      slot: { column: 0, row: 9, what: 'segment' },
    });
    const posted = ok(buildPost(base, RICH, { kind: 'wall-walk', column: 0, row: 3, spot: 1 }));
    expect(targetAt(spot.x, lifted, posted, plots)).toEqual({
      slot: { column: 0, row: 3, what: 'segment' },
    });
    // Open land in the camp is nothing.
    expect(at(60, 400)).toBeNull();
    expect(at(NaN, 400)).toBeNull();
  });

  it('lands on each plot shown, a built building’s face too; never on a free or hidden plot', () => {
    for (const p of plots) {
      expect(plotAt(PLOT_AT[p.id].x, PLOT_AT[p.id].y, plots)).toBe(p);
      expect(targetAt(PLOT_AT[p.id].x, PLOT_AT[p.id].y, newBase(), plots)).toEqual({ plot: p });
    }
    // The Workbench's plot is kept free (ID-034), and the huts past the next one hide.
    for (const id of ['workbench', 'hut-1', 'hut-2'] as const) {
      expect(plotAt(PLOT_AT[id].x, PLOT_AT[id].y, plots)).toBeNull();
    }
    const built = plotsOf({ ...newGame(), lab: 1 });
    const lab = PLOT_AT.lab;
    const face = lab.y - PLOT.halfDepth - (PLOT.height * HEIGHT_SCALE) / TILT / 2;
    expect(plotAt(lab.x, face, built)?.id).toBe('lab');
    expect(plotAt(lab.x, face, plots)).toBeNull();
    expect(plotAt(Infinity, 0, plots)).toBeNull();
  });

  it('keeps every plot between the camp line and column 0’s ground posts, clear of each other', () => {
    const groundPosts = COLUMNS[0]! + POST_OFFSET.ground - PIECE.ground.halfWidth;
    for (const id of PLOT_IDS) {
      const { x, y } = PLOT_AT[id];
      expect(x - PLOT.halfWidth).toBeGreaterThan(CAMP.x);
      expect(x + PLOT.halfWidth).toBeLessThan(groundPosts);
      expect(y - PLOT.halfDepth).toBeGreaterThanOrEqual(0);
      expect(y + PLOT.halfDepth).toBeLessThanOrEqual(FIELD.height);
    }
    const ys = PLOT_IDS.map((id) => PLOT_AT[id].y);
    for (let i = 1; i < ys.length; i++)
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThan(2 * PLOT.halfDepth);
  });
});

describe('the camp’s plots (ID-065)', () => {
  const game = (patch: Partial<GameState> = {}): GameState => ({ ...newGame(), ...patch });

  it('a new camp: a ghost Research Lab, a ghost Generator and a ghost hut for the first upgrade', () => {
    expect(plotsOf(game())).toEqual([
      { id: 'lab', kind: 'lab', built: false, label: 'Research Lab', running: false, opens: 'lab' },
      {
        id: 'generator',
        kind: 'generator',
        built: false,
        label: 'Generator',
        running: false,
        opens: 'power',
      },
      { id: 'hut-0', kind: 'hut', built: false, label: 'Hut', running: false, opens: 'camp' },
    ]);
  });

  it('the Lab shows its level; the Generator whether it is running or idle', () => {
    const g = game({ lab: 2 });
    const running = { ...g, power: { ...g.power, generator: { at: 5 } } };
    const idle = { ...g, power: { ...g.power, generator: { at: null } } };
    expect(plotsOf(g)[0]).toMatchObject({ built: true, label: 'Research Lab · Lv 2' });
    expect(plotsOf(running)[1]).toMatchObject({
      built: true,
      label: 'Generator · running',
      running: true,
    });
    expect(plotsOf(idle)[1]).toMatchObject({
      built: true,
      label: 'Generator · idle',
      running: false,
    });
  });

  it('one hut per camp upgrade, a ghost for the next while one is left, at most 3', () => {
    const huts = (upgrades: number) =>
      plotsOf(game({ camp: { ...newGame().camp, upgrades } }))
        .filter((p) => p.kind === 'hut')
        .map((p) => `${p.id}:${p.built ? 'built' : 'ghost'}`);
    expect(huts(0)).toEqual(['hut-0:ghost']);
    expect(huts(1)).toEqual(['hut-0:built', 'hut-1:ghost']);
    expect(huts(2)).toEqual(['hut-0:built', 'hut-1:built', 'hut-2:ghost']);
    expect(huts(3)).toEqual(['hut-0:built', 'hut-1:built', 'hut-2:built']);
    // A corrupt count never shows more than the plots there are.
    expect(huts(9)).toEqual(['hut-0:built', 'hut-1:built', 'hut-2:built']);
  });
});

describe('badges and condition (ID-065)', () => {
  it('a distinct badge per tier', () => {
    const badges = TIER_ORDER.map((t) => TIER_BADGE[t]);
    expect(badges.map((b) => b.text)).toEqual(['W', 'M', 'C', 'R']);
    expect(new Set(badges.map((b) => b.colour)).size).toBe(TIER_ORDER.length);
  });

  it('whole at full, damaged below it, broken at 0 or anything not a number above 0', () => {
    expect(conditionOf(200, 200)).toBe('whole');
    expect(conditionOf(150, 200)).toBe('damaged');
    expect(conditionOf(0.5, 200)).toBe('damaged');
    expect(conditionOf(0, 200)).toBe('broken');
    expect(conditionOf(-3, 200)).toBe('broken');
    expect(conditionOf(NaN, 200)).toBe('broken');
  });
});
