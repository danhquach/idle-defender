import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment, newBase, type Base } from '../core/base.ts';
import { START_STOCK } from '../core/data.ts';
import {
  clampCamera,
  depthSort,
  project,
  slotAt,
  unproject,
  wallHeight,
  zoomAt,
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
    // The pannable depth is -MARGIN_Y…400; a view 120 high at zoom 2 shows 100 world units.
    const short = { w: 800, h: 120 };
    expect(clampCamera({ x: 0, y: -500, zoom: 2 }, short).y).toBe(-80);
    expect(clampCamera({ x: 0, y: 500, zoom: 2 }, short).y).toBe(300);
  });

  it('centres the field on an axis where it all fits', () => {
    // 600 / 1.2 = 500 world units deep, more than the 480 to show: centred at (-80 + 400 - 500) / 2.
    expect(clampCamera({ x: 0, y: 300, zoom: 2 }, { w: 800, h: 600 }).y).toBe(-90);
    // 2000 wide at zoom 0.5 shows 4000 world units of a 1600 field: centred at -1200.
    expect(clampCamera({ x: 300, y: 0, zoom: 0.5 }, { w: 2000, h: 600 }).x).toBe(-1200);
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

describe('slotAt', () => {
  // The starting base: column 0 built (wall x 500), towers at column 0 rows 1 and 3
  // (x 420); columns 1 (x 760) and 2 (x 1020) empty.
  const base = newBase();

  it('hits each kind of empty slot on its footprint', () => {
    expect(slotAt(770, 40, base)).toEqual({ column: 1, row: 0, what: 'segment' });
    expect(slotAt(680, 200, base)).toEqual({ column: 1, row: 2, what: 'tower' });
    expect(slotAt(600, 360, base)).toEqual({ column: 1, row: 4, what: 'ground' });
    expect(slotAt(1030, 399, base)).toEqual({ column: 2, row: 4, what: 'segment' });
    expect(slotAt(340, 100, base)).toEqual({ column: 0, row: 1, what: 'ground' });
  });

  it('hits a built piece on its top face, the front one where they overlap', () => {
    // Tower row 1 (centre y 120): a 50-high box shows 50 × 0.8 / 0.6 ≈ 66.7 behind its footprint.
    expect(slotAt(420, 60, base)).toEqual({ column: 0, row: 1, what: 'tower' });
    // The built tower at row 3 covers y 189…304; the empty row-2 slot only 176…224.
    expect(slotAt(420, 200, base)).toEqual({ column: 0, row: 3, what: 'tower' });
    expect(slotAt(420, 180, base)).toEqual({ column: 0, row: 2, what: 'tower' });
    expect(slotAt(420, 160, base)).toBeNull();
    // A full wall's top face (40 high, ≈ 53.3) at row 1 is in front of row 0's front face.
    expect(slotAt(510, 75, base)).toEqual({ column: 0, row: 1, what: 'segment' });
    expect(slotAt(510, 20, base)).toEqual({ column: 0, row: 0, what: 'segment' });
  });

  it('misses between slots and off the grid', () => {
    expect(slotAt(460, 120, base)).toBeNull(); // between a tower and the wall
    expect(slotAt(340, 80, base)).toBeNull(); // between two empty ground slots
    expect(slotAt(600, 145, base)).toBeNull(); // just past an empty ground slot's depth
    expect(slotAt(510, 400, base)).toBeNull();
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
});

describe('wallHeight', () => {
  it('drops with damage to a stub when broken', () => {
    expect(wallHeight(200, 200)).toBe(40);
    expect(wallHeight(100, 200)).toBe(30);
    expect(wallHeight(1, 200)).toBeCloseTo(20.1);
    expect(wallHeight(0, 200)).toBe(12);
  });
});
