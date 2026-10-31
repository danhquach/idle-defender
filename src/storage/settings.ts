// Player settings (ID-039, ID-062): kept in this browser under their own key, outside the save
// and the backup code. A stored value is untrusted on the way back in: only the exact
// strings written here count, and anything else falls back to the default.
import type { SaveStorage } from './save.ts';

export const MOTION_KEY = 'idle-defender.reduce-motion';

/** Whether to reduce motion: the stored choice, else `systemAsks` (prefers-reduced-motion). */
export function readReduceMotion(storage: SaveStorage | null, systemAsks: boolean): boolean {
  let raw: string | null;
  try {
    raw = storage?.getItem(MOTION_KEY) ?? null;
  } catch {
    return systemAsks;
  }
  return raw === '1' ? true : raw === '0' ? false : systemAsks;
}

/** Stores the choice; where the browser refuses it, it still applies until reload. */
export function writeReduceMotion(storage: SaveStorage | null, on: boolean): void {
  try {
    storage?.setItem(MOTION_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked or full.
  }
}

export const SPEED_KEY = 'idle-defender.game-speed';
/** The fight speeds (ID-062): how many times fight time runs to real time. */
export const SPEEDS = [1, 2, 3] as const;
export type Speed = (typeof SPEEDS)[number];

/** The stored fight speed, else 1×. */
export function readSpeed(storage: SaveStorage | null): Speed {
  let raw: string | null;
  try {
    raw = storage?.getItem(SPEED_KEY) ?? null;
  } catch {
    return 1;
  }
  return raw === '2' ? 2 : raw === '3' ? 3 : 1;
}

/** Stores the speed; where the browser refuses it, it still applies until reload. */
export function writeSpeed(storage: SaveStorage | null, speed: Speed): void {
  try {
    storage?.setItem(SPEED_KEY, String(speed));
  } catch {
    // Storage blocked or full.
  }
}
