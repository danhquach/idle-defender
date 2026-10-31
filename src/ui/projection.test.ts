import { describe, expect, it } from 'vitest';
import {
  buildPost,
  buildSegment,
  buildTurret,
  newBase,
  spotField,
  spotOf,
  type Base,
} from '../core/base.ts';
import { COLUMNS, FIELD, POST_OFFSET, SEGMENT_HEIGHT, START_STOCK, WALL } from '../core/data.ts';
import { layoutOf, newHorde, standing } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import {
  baseEdge,
  clampCamera,
  depthSort,
  fightHitAt,
  MARGIN_Y,
  mountDepth,
  openingCamera,
  PIECE,
  project,
  slotAt,
  unproject,
  wallHeight,
  zoomAt,
  type Camera,
} from './projection.ts';

describe('projection', () => {
  it('projects with tilt and height', () => {
    const cam = { x: 100, y: 0, zoom: 2 };
    expect(project({ x: 150, y: 80 }, cam)).toEqual({ sx: 100, sy: 96, scale: 2 });
    expect(project({ x: 150, y: 80, z: 10 }, cam).sy).toBe(80);
  });

  it('unprojects a click to the ground', () => {
    const cam = { x: 100, y: 0, zoom: 2 };
    expect(unproject({ sx: 100, sy: 96 }, cam)).toEqual({ x: 150, y: 80 });
    const round = { x: 37, y: -20, zoom: 0.75 };
    const p = unproject(project({ x: 913.5, y: 271.25 }, round), round);
    expect(p.x).toBeCloseTo(913.5);
    expect(p.y).toBeCloseTo(271.25);
  });

  it('clamps zoom and pan', () => {
    const view = { w: 800, h: 600 };
    const low = clampCamera({ x: -50, y: 0, zoom: 5 }, view);
    expect(low.zoom).toBe(2);
    expect(low.x).toBe(0);
    expect(clampCamera({ x: 5000, y: 0, zoom: 1 }, view).x).toBe(800);
    expect(clampCamera({ x: 0, y: 0, zoom: 0.1 }, view).zoom).toBe(0.5);
  });

  it('clamps vertical pan to the field', () => {
    // The pannable depth is -MARGIN_Y…800; a view 120 high at zoom 2 shows 100 world units.
    const short = { w: 800, h: 120 };
    expect(clampCamera({ x: 0, y: -500, zoom: 2 }, short).y).toBe(-80);
    expect(clampCamera({ x: 0, y: 900, zoom: 2 }, short).y).toBe(700);
  });

  it('centres the field on an axis where it all fits', () => {
    // 600 / 0.6 = 1000 world units deep, more than the 880 to show: centred at (-80 + 800 - 1000) / 2.
    expect(clampCamera({ x: 0, y: 300, zoom: 1 }, { w: 800, h: 600 }).y).toBe(-140);
    // 2000 wide at zoom 0.5 shows 4000 world units of a 1600 field: centred at -1200.
    expect(clampCamera({ x: 300, y: 0, zoom: 0.5 }, { w: 2000, h: 600 }).x).toBe(-1200);
  });

  /** True when the world point shows inside `view` under `cam` (with a rounding hair). */
  const shows = (p: { x: number; y: number }, cam: Camera, view: { w: number; h: number }) => {
    const { sx, sy } = project(p, cam);
    return sx >= -1e-9 && sx <= view.w + 1e-9 && sy >= -1e-9 && sy <= view.h + 1e-9;
  };
  const corners = [
    { x: 0, y: -MARGIN_Y },
    { x: FIELD.right, y: -MARGIN_Y },
    { x: 0, y: FIELD.height },
    { x: FIELD.right, y: FIELD.height },
  ];

  describe('opening view (ID-057)', () => {
    const edge = baseEdge(newBase());
    /** Screen y of the field's back edge, its front edge, and of the strip above it. */
    const ys = (cam: Camera) => ({
      strip: project({ x: 0, y: -MARGIN_Y }, cam).sy,
      front: project({ x: 0, y: FIELD.height }, cam).sy,
    });

    it.each([
      { w: 1440, h: 900 },
      { w: 1280, h: 720 },
    ])('fills the height at $w×$h with the field: no band above or below', (view) => {
      const cam = openingCamera(view, edge);
      expect(ys(cam).strip).toBeCloseTo(0);
      expect(ys(cam).front).toBeCloseTo(view.h);
      // Far more zoomed in than the old fit-the-width view (1440 / 1600 = 0.9).
      expect(cam.zoom).toBeCloseTo(view.h / ((FIELD.height + MARGIN_Y) * 0.6));
    });

    it.each([
      { w: 1440, h: 900 },
      { w: 1280, h: 720 },
    ])(
      'shows the outer wall, its ground posts and the field toward the spawn side at $w×$h',
      (view) => {
        const cam = openingCamera(view, edge);
        const at = (x: number) => project({ x, y: 0 }, cam).sx;
        expect(at(edge + POST_OFFSET.ground - PIECE.ground.halfWidth)).toBeGreaterThan(0);
        // The wall sits in the left third; the rest of the screen looks toward the spawn.
        expect(at(edge)).toBeLessThan(view.w / 3);
        expect(at(edge + WALL.depth + 500)).toBeLessThan(view.w);
      },
    );

    it('frames the outermost built layer', () => {
      const base = newBase();
      expect(baseEdge(base)).toBe(COLUMNS[0]);
      const grown = { layers: [...base.layers, { column: 2, slots: [] }] };
      expect(baseEdge(grown)).toBe(COLUMNS[2]);
      // A base with no layer at all frames the first column.
      expect(baseEdge({ layers: [] })).toBe(COLUMNS[0]);
      // The camera follows: the outer wall stands at the same spot on screen.
      const view = { w: 1440, h: 900 };
      const near = project({ x: COLUMNS[0]!, y: 0 }, openingCamera(view, COLUMNS[0]!)).sx;
      const far = project({ x: COLUMNS[1]!, y: 0 }, openingCamera(view, COLUMNS[1]!)).sx;
      expect(far).toBeCloseTo(near);
    });

    it('fits the height on any screen, centring a field narrower than the view', () => {
      // Portrait: the height decides, about 1.54×, with the wall still near the left.
      const tall = { w: 375, h: 812 };
      expect(openingCamera(tall, edge).zoom).toBeCloseTo(812 / ((FIELD.height + MARGIN_Y) * 0.6));
      // Ultra-wide: 3440 / 1.136 ≈ 3027 units shows more than the field, so it is centred.
      const wide = { w: 3440, h: 600 };
      const w = openingCamera(wide, edge);
      expect(w.x).toBeCloseTo((FIELD.right - wide.w / w.zoom) / 2);
      // Too short to fill even at the 0.5 floor, or so tall it would pass 2×: clamped.
      expect(openingCamera({ w: 400, h: 200 }, edge).zoom).toBe(0.5);
      expect(openingCamera({ w: 1000, h: 3000 }, edge).zoom).toBe(2);
    });
  });

  it('pans to every corner at any zoom', () => {
    const view = { w: 1280, h: 720 };
    for (const zoom of [0.5, 1, 2]) {
      const topLeft = clampCamera({ x: -1e6, y: -1e6, zoom }, view);
      const bottomRight = clampCamera({ x: 1e6, y: 1e6, zoom }, view);
      expect(shows(corners[0]!, topLeft, view), `zoom ${zoom}`).toBe(true);
      expect(shows(corners[3]!, bottomRight, view), `zoom ${zoom}`).toBe(true);
    }
  });

  it('zooms around the cursor', () => {
    const cam = zoomAt(
      { x: 200, y: 0, zoom: 1 },
      2,
      { sx: 400, sy: 0 },
      {
        w: 800,
        h: 600,
      },
    );
    expect(cam.zoom).toBe(2);
    expect(cam.x).toBe(400);
  });

  it('zooms around the cursor in depth too', () => {
    // A short view, so the field doesn't fit vertically and y isn't centred.
    const view = { w: 800, h: 120 };
    const before = { x: 0, y: 100, zoom: 1 };
    const anchor = { sx: 0, sy: 60 };
    const cam = zoomAt(before, 1.5, anchor, view);
    // World y under the cursor: 100 + 60 / (1 × 0.6) = 200 before and after.
    expect(cam.y + anchor.sy / (cam.zoom * 0.6)).toBeCloseTo(200);
    expect(cam.y).toBeCloseTo(200 - 60 / 0.9);
  });

  it('keeps the anchor when the zoom saturates', () => {
    const cam = zoomAt({ x: 200, y: 0, zoom: 1.5 }, 4, { sx: 300, sy: 0 }, { w: 800, h: 600 });
    expect(cam.zoom).toBe(2);
    // World x under the cursor: 200 + 300 / 1.5 = 400; after: 400 - 300 / 2 = 250.
    expect(cam.x).toBe(250);
  });

  it.each([
    [NaN, { sx: 100, sy: 0 }],
    [Infinity, { sx: 100, sy: 0 }],
    [2, { sx: NaN, sy: 0 }],
    [2, { sx: 0, sy: -Infinity }],
  ])('ignores a non-finite zoom %s at %o', (factor, anchor) => {
    const cam = { x: 200, y: -80, zoom: 1 };
    expect(zoomAt(cam, factor, anchor, { w: 800, h: 120 })).toEqual(cam);
  });

  it('sorts back to front', () => {
    const items = [
      { y: 160, x: 10 },
      { y: 0, x: 5 },
      { y: 0, x: 50 },
    ];
    expect(depthSort(items)).toEqual([
      { y: 0, x: 50 },
      { y: 0, x: 5 },
      { y: 160, x: 10 },
    ]);
    expect(items[0]).toEqual({ y: 160, x: 10 });
  });
});

describe('two spots on one wall segment (ID-048)', () => {
  const rich = { ...START_STOCK, wood: 500, scrap: 500 };
  let base = newBase();
  for (const spot of [1, 0] as const) {
    const r = buildPost(base, rich, { kind: 'wall-walk', column: 0, row: 3, ...spotField(spot) });
    if (!r.ok) throw new Error(r.reason);
    base = r.base;
  }
  const r = buildTurret(base, rich, true, 'wall-walk', 0, 2, 0);
  if (!r.ok) throw new Error(r.reason);
  const { posts, turrets } = layoutOf(r.base);
  const [top, bottom] = posts.filter((p) => p.kind === 'wall-walk');

  it('stand side by side without their platforms or defenders overlapping', () => {
    expect(spotOf(top!)).toBe(0);
    expect(spotOf(bottom!)).toBe(1);
    expect(top!.x).toBe(bottom!.x);
    for (const half of [PIECE.walk.halfDepth, PIECE.defender.halfDepth]) {
      expect(top!.y + half).toBeLessThan(bottom!.y - half);
      // Each stays on its own segment.
      expect(top!.y - half).toBeGreaterThanOrEqual(3 * SEGMENT_HEIGHT);
      expect(bottom!.y + half).toBeLessThanOrEqual(4 * SEGMENT_HEIGHT);
    }
  });

  it('draw on top of their segment, back spot first; other pieces keep their y', () => {
    const segment = (row: number) => ({
      name: `wall ${row}`,
      y: (row + 0.5) * SEGMENT_HEIGHT,
      x: 500 + WALL.depth + 0.5,
    });
    const sprites = [
      { name: 'spot 2', y: mountDepth(bottom!.kind, bottom!.y, bottom!.row), x: bottom!.x },
      { name: 'spot 1', y: mountDepth(top!.kind, top!.y, top!.row), x: top!.x },
      {
        name: 'turret',
        y: mountDepth(turrets[0]!.mount, turrets[0]!.y, turrets[0]!.row),
        x: turrets[0]!.x,
      },
      segment(3),
      segment(2),
    ];
    expect(depthSort(sprites).map((x) => x.name)).toEqual([
      'wall 2',
      'turret',
      'wall 3',
      'spot 1',
      'spot 2',
    ]);
    expect(mountDepth('tower', 123, 1)).toBe(123);
    expect(mountDepth('ground', 5, 0)).toBe(5);
  });
});

describe('slotAt', () => {
  // The starting base: column 0 built (wall x 500), towers at column 0 rows 4 and 6
  // (x 420); columns 1 (x 760) and 2 (x 1020) empty.
  const base = newBase();

  it('hits a trap cell on the outer layer’s strip, by row', () => {
    expect(slotAt(1100, 0, base)).toEqual({ column: 2, row: 0, what: 'trap' });
    expect(slotAt(1160, 250, base)).toEqual({ column: 2, row: 3, what: 'trap' });
    expect(slotAt(1220, 799, base)).toEqual({ column: 2, row: 9, what: 'trap' });
    expect(slotAt(1099, 200, base)).toBeNull();
    expect(slotAt(1221, 200, base)).toBeNull();
    expect(slotAt(1160, 800, base)).toBeNull();
    expect(slotAt(1160, -1, base)).toBeNull();
  });

  it('hits each kind of empty slot on its footprint', () => {
    expect(slotAt(770, 40, base)).toEqual({ column: 1, row: 0, what: 'segment' });
    expect(slotAt(680, 200, base)).toEqual({ column: 1, row: 2, what: 'tower' });
    expect(slotAt(600, 360, base)).toEqual({ column: 1, row: 4, what: 'ground' });
    expect(slotAt(1030, 799, base)).toEqual({ column: 2, row: 9, what: 'segment' });
    expect(slotAt(340, 100, base)).toEqual({ column: 0, row: 1, what: 'ground' });
  });

  it('hits a built piece on its top face, the front one where they overlap', () => {
    // Tower row 4 (centre y 360): a 50-high box shows 50 × 0.8 / 0.6 ≈ 66.7 behind its footprint.
    expect(slotAt(420, 300, base)).toEqual({ column: 0, row: 4, what: 'tower' });
    // The built tower at row 6 covers y 429…544; the empty row-5 slot only 416…464.
    expect(slotAt(420, 440, base)).toEqual({ column: 0, row: 6, what: 'tower' });
    expect(slotAt(420, 420, base)).toEqual({ column: 0, row: 5, what: 'tower' });
    expect(slotAt(420, 400, base)).toBeNull();
    // A full wall's top face (40 high, ≈ 53.3) at row 1 is in front of row 0's front face.
    expect(slotAt(510, 75, base)).toEqual({ column: 0, row: 1, what: 'segment' });
    expect(slotAt(510, 20, base)).toEqual({ column: 0, row: 0, what: 'segment' });
  });

  it('misses between slots and off the grid', () => {
    expect(slotAt(460, 120, base)).toBeNull(); // between a tower and the wall
    expect(slotAt(340, 80, base)).toBeNull(); // between two empty ground slots
    expect(slotAt(600, 145, base)).toBeNull(); // just past an empty ground slot's depth
    expect(slotAt(510, 800, base)).toBeNull();
    expect(slotAt(510, -60, base)).toBeNull();
    expect(slotAt(1500, 200, base)).toBeNull();
    expect(slotAt(NaN, 200, base)).toBeNull();
    expect(slotAt(510, Infinity, base)).toBeNull();
  });

  it('follows a damaged wall, a wall-walk post and built posts in outer columns', () => {
    const rich = { ...START_STOCK, wood: 500, scrap: 500 };
    const ok = (r: ReturnType<typeof buildPost>): Base => {
      if (!r.ok) throw new Error(r.reason);
      return r.base;
    };
    let b = ok(buildSegment(base, rich, ['wood'], 1, 2, 'wall', 'wood'));
    b = ok(buildPost(b, rich, { kind: 'ground', column: 1, row: 2 }));
    b = ok(buildPost(b, rich, { kind: 'wall-walk', column: 0, row: 1 }));
    // Built ground post (12 high, lift 16) at x 600, centre y 200: covers 160…224.
    expect(slotAt(600, 162, b)).toEqual({ column: 1, row: 2, what: 'ground' });
    expect(slotAt(600, 158, b)).toBeNull();
    // Column 1's new wall at row 2 (x 760).
    expect(slotAt(765, 150, b)).toEqual({ column: 1, row: 2, what: 'segment' });
    // Row 1 with a wall-walk post: 40 + 6 high → lift 61.3, from y 18.7.
    expect(slotAt(510, 20, b)).toEqual({ column: 0, row: 1, what: 'segment' });
    // At half HP row 1 is 30 high (lift 40): y 20 is row 0 again, y 45 still row 1.
    b.layers[0]!.slots[1]!.hp = 100;
    b.posts = b.posts.filter((p) => p.kind !== 'wall-walk');
    expect(slotAt(510, 20, b)).toEqual({ column: 0, row: 0, what: 'segment' });
    expect(slotAt(510, 45, b)).toEqual({ column: 0, row: 1, what: 'segment' });
  });

  it("selects a turret's spot by its head, on a tower or a wall mount", () => {
    const rich = { ...START_STOCK, wood: 500, scrap: 500 };
    let r = buildTurret(base, rich, true, 'tower', 0, 5);
    if (!r.ok) throw new Error(r.reason);
    r = buildTurret(r.base, r.stock, true, 'wall-walk', 0, 1);
    if (!r.ok) throw new Error(r.reason);
    // Tower turret at row 5 (centre y 440): 50 + 12 high → lift 82.7, from y 333.3; it is
    // in front of the row-4 tower, which wins there without the turret.
    expect(slotAt(420, 340, base)).toEqual({ column: 0, row: 4, what: 'tower' });
    expect(slotAt(420, 340, r.base)).toEqual({ column: 0, row: 5, what: 'tower' });
    // Wall turret on row 1 (y0 80): 40 + 6 + 12 high → lift 77.3, from y 2.7.
    expect(slotAt(510, 10, base)).toEqual({ column: 0, row: 0, what: 'segment' });
    expect(slotAt(510, 10, r.base)).toEqual({ column: 0, row: 1, what: 'segment' });
  });
});

describe('fightHitAt', () => {
  // The starting base plus wall-walk posts on column 0 rows 0 and 1; a stands on the
  // row-4 tower (420, 360), b walks at (460, 440).
  function fight() {
    const rich = { ...START_STOCK, wood: 500, scrap: 500 };
    let base = newBase();
    for (const [row, spot] of [
      [0, 0],
      [0, 1],
      [1, 0],
    ] as const) {
      const r = buildPost(base, rich, { kind: 'wall-walk', column: 0, row, ...spotField(spot) });
      if (!r.ok) throw new Error(r.reason);
      base = r.base;
    }
    const s = newHorde(1, { ...setup(), base, startPostId: 0 });
    const post = s.posts[1]!;
    s.defenders.push({ ...standing(s.bench[0]!, post, 0), x: 460, y: 440, walking: true });
    post.defenderId = 'b';
    return s;
  }

  it('hits a defender before the post it stands on', () => {
    const s = fight();
    // a on the 50-high tower: its body (z 50…80) shows over y ≈ 243…303.
    expect(fightHitAt(420, 270, s)).toEqual({ defenderId: 'a' });
    expect(fightHitAt(420, 340, s)).toEqual({ postId: 0 });
    // b walks on the ground (z 0…30): y 390…450.
    expect(fightHitAt(460, 400, s)).toEqual({ defenderId: 'b' });
    expect(fightHitAt(460, 452, s)).toBeNull();
  });

  it('a wall-walk post covers its spot of the segment, up to its top; the front one wins', () => {
    const s = fight();
    const ww = (row: number, spot: number) =>
      s.posts.findIndex((p) => p.kind === 'wall-walk' && p.row === row && spotOf(p) === spot);
    // Each spot is 40 deep; its 46-high post lifts its top 61 up the screen.
    expect(fightHitAt(510, -40, s)).toEqual({ postId: ww(0, 0) });
    expect(fightHitAt(510, 0, s)).toEqual({ postId: ww(0, 1) });
    expect(fightHitAt(510, 70, s)).toEqual({ postId: ww(1, 0) });
    // Row 1's spot 2 is unbuilt.
    expect(fightHitAt(515, 150, s)).toBeNull();
  });

  it('misses open ground and bad points', () => {
    const s = fight();
    expect(fightHitAt(460, 300, s)).toBeNull();
    expect(fightHitAt(800, 200, s)).toBeNull();
    expect(fightHitAt(NaN, 30, s)).toBeNull();
    expect(fightHitAt(420, Infinity, s)).toBeNull();
  });
});

describe('wallHeight', () => {
  it('drops with damage to a stub when broken', () => {
    expect(wallHeight(200, 200)).toBe(40);
    expect(wallHeight(100, 200)).toBe(30);
    expect(wallHeight(1, 200)).toBeCloseTo(20.1);
    expect(wallHeight(0, 200)).toBe(12);
  });
});
