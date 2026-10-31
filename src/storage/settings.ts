// Player settings (ID-039): kept in this browser under their own key, outside the save
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
