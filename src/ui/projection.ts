// Angled overhead view of the open field: depth (y) recedes up the screen, height
// lifts a sprite. Screen units are CSS pixels.
import { FIELD } from '../core/data.ts';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export interface View {
  w: number;
  h: number;
}

/** Field depth (y) squash. */
export const TILT = 0.6;
/** How much world height lifts a sprite on screen. */
export const HEIGHT_SCALE = 0.8;
export const ZOOM = { min: 0.5, max: 2 } as const;
/** The camera may show a strip this deep above the field. */
export const MARGIN_Y = 80;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function project(
  p: { x: number; y: number; z?: number },
  cam: Camera,
): { sx: number; sy: number; scale: number } {
  return {
    sx: (p.x - cam.x) * cam.zoom,
    sy: (p.y - cam.y) * cam.zoom * TILT - (p.z ?? 0) * cam.zoom * HEIGHT_SCALE,
    scale: cam.zoom,
  };
}

/** The ground point (z = 0) under a screen point: the inverse of `project`. */
export function unproject(s: { sx: number; sy: number }, cam: Camera): { x: number; y: number } {
  return { x: s.sx / cam.zoom + cam.x, y: s.sy / (cam.zoom * TILT) + cam.y };
}

/** Pans `v` so `[lo, hi]` fills the visible span; centres it when it all fits. */
function fit(v: number, lo: number, hi: number, visible: number): number {
  return visible >= hi - lo ? (lo + hi - visible) / 2 : clamp(v, lo, hi - visible);
}

/** Keeps the zoom in range and the view on the field. */
export function clampCamera(cam: Camera, view: View): Camera {
  const zoom = clamp(cam.zoom, ZOOM.min, ZOOM.max);
  return {
    x: fit(cam.x, 0, FIELD.right, view.w / zoom),
    y: fit(cam.y, -MARGIN_Y, FIELD.height, view.h / (zoom * TILT)),
    zoom,
  };
}

/** Zooms by `factor` keeping the world point under `anchor` in place, then clamps. */
export function zoomAt(
  cam: Camera,
  factor: number,
  anchor: { sx: number; sy: number },
  view: View,
): Camera {
  if (![factor, anchor.sx, anchor.sy].every(Number.isFinite)) return clampCamera(cam, view);
  const zoom = clamp(cam.zoom * factor, ZOOM.min, ZOOM.max);
  const wx = cam.x + anchor.sx / cam.zoom;
  const wy = cam.y + anchor.sy / (cam.zoom * TILT);
  return clampCamera({ x: wx - anchor.sx / zoom, y: wy - anchor.sy / (zoom * TILT), zoom }, view);
}

/** Back to front: y ascending, then x descending. Returns a new array. */
export function depthSort<T extends { y: number; x: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || b.x - a.x);
}
