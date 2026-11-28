// An Airstrike bomb's drop (ID-107, ID-290): dropped from the sky straight down onto its spot,
// nose down, speeding up as it falls. A pure look function (testable, and loaded by the browser
// layout test); `drawThrown` in render.ts draws it.
import { project, type Camera } from './projection.ts';

/**
 * A bomb is `length` px long at zoom 1, nose to tail. With Reduce motion it falls only the
 * last `shortDrop` px (at zoom 1).
 */
export const BOMB = { length: 50, shortDrop: 40 } as const;

/**
 * Where an airstrike bomb landing on `spot` has its middle on screen `fall` of the way down
 * (0 just dropped, 1 landing): straight over its spot, dropping from the field's top edge (its
 * tail on the edge, so the top HUD never hides it) and speeding up as it falls (the drop goes
 * with `fall` squared), its nose on the spot as it lands. Every bomb falls at least
 * `BOMB.shortDrop` where there is room: it starts no more than half its length over the
 * field's top edge (on a phone the HUD strip sits just above it), so one aimed by the top edge
 * falls what fits from there, never upward. With Reduce motion (`still`) it falls only the
 * short drop.
 */
export function bombAt(
  spot: { x: number; y: number },
  fall: number,
  cam: Camera,
  still = false,
): { sx: number; sy: number } {
  const land = project({ x: spot.x, y: spot.y }, cam);
  const half = (BOMB.length * cam.zoom) / 2;
  // The middle when its nose is on the spot, and when its tail is on the field's top edge.
  const end = land.sy - half;
  const top = project({ x: spot.x, y: 0 }, cam).sy + half;
  const short = end - BOMB.shortDrop * cam.zoom;
  const start = still ? short : Math.min(end, Math.max(top - half, Math.min(top, short)));
  return { sx: land.sx, sy: start + (end - start) * fall * fall };
}
