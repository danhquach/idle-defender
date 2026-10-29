import { describe, expect, it } from 'vitest';
import { clampCamera, depthSort, project, unproject, zoomAt } from './projection.ts';

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
