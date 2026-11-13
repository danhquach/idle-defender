// Player settings (ID-039, ID-062): kept in this browser under their own key, outside the save
// and the backup code. A stored value is untrusted on the way back in: only the exact
// strings written here count, and anything else falls back to the default.
import type { ChatterLevel } from '../core/chatter.ts';
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

export const AUTO_STRIKE_KEY = 'idle-defender.airstrike-auto';

/** Whether the Airstrike's auto-aim is on (ID-140): only the stored '1' is on, anything else off. */
export function readAutoStrike(storage: SaveStorage | null): boolean {
  try {
    return storage?.getItem(AUTO_STRIKE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Stores the toggle; where the browser refuses it, it still applies until reload. */
export function writeAutoStrike(storage: SaveStorage | null, on: boolean): void {
  try {
    storage?.setItem(AUTO_STRIKE_KEY, on ? '1' : '0');
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

// Sound (ID-080): three volumes, 0–100 in steps of 5 (the slider's), and a mute switch.
export type Volume = 'master' | 'music' | 'effects';
export const VOLUMES: readonly Volume[] = ['master', 'music', 'effects'];
export const VOLUME_KEYS: Readonly<Record<Volume, string>> = {
  master: 'idle-defender.volume-master',
  music: 'idle-defender.volume-music',
  effects: 'idle-defender.volume-effects',
};
export const MUTE_KEY = 'idle-defender.mute';
export const VOLUME_DEFAULTS: Readonly<Record<Volume, number>> = {
  master: 80,
  music: 60,
  effects: 80,
};
export interface SoundSettings {
  volumes: Record<Volume, number>;
  muted: boolean;
}
// "0", "5" … "100": no sign, space, leading zero, other digit forms or off-step value.
const VOLUME_TEXT = /^(?:100|[1-9]?[05])$/;

/** The stored volumes and mute; anything but the exact strings written here is the default. */
export function readSound(storage: SaveStorage | null): SoundSettings {
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const volumes = { ...VOLUME_DEFAULTS };
  for (const v of VOLUMES) {
    const raw = read(VOLUME_KEYS[v]);
    if (raw !== null && raw.length <= 3 && VOLUME_TEXT.test(raw)) volumes[v] = Number(raw);
  }
  return { volumes, muted: read(MUTE_KEY) === '1' };
}

/** A volume as stored: 0–100 to the nearest 5 (anything else is clamped, NaN is 0). */
export function clampVolume(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n / 5) * 5)) : 0;
}

/** Stores one volume; where the browser refuses it, it still applies until reload. */
export function writeVolume(storage: SaveStorage | null, which: Volume, level: number): void {
  try {
    storage?.setItem(VOLUME_KEYS[which], String(clampVolume(level)));
  } catch {
    // Storage blocked or full.
  }
}

/** Stores the mute switch; where the browser refuses it, it still applies until reload. */
export function writeMute(storage: SaveStorage | null, on: boolean): void {
  try {
    storage?.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked or full.
  }
}

// Chatter (ID-085): how much survivors say in a fight. Only the exact strings written here
// count; anything else is Full.
export const CHATTER_KEY = 'idle-defender.chatter';

/** The stored chatter level, else Full. */
export function readChatter(storage: SaveStorage | null): ChatterLevel {
  let raw: string | null;
  try {
    raw = storage?.getItem(CHATTER_KEY) ?? null;
  } catch {
    return 'full';
  }
  return raw === 'off' ? 'off' : raw === 'low' ? 'low' : 'full';
}

/** Stores the level; where the browser refuses it, it still applies until reload. */
export function writeChatter(storage: SaveStorage | null, level: ChatterLevel): void {
  try {
    storage?.setItem(CHATTER_KEY, level);
  } catch {
    // Storage blocked or full.
  }
}

// The how-to-play card (ID-106): shown once, on a first launch. Only "1" counts as seen.
export const HOW_TO_SEEN_KEY = 'idle-defender.how-to-seen';

/** Whether the first-launch card has been shown in this browser. */
export function readHowToSeen(storage: SaveStorage | null): boolean {
  try {
    return storage?.getItem(HOW_TO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Marks the card shown; where the browser refuses it, it shows again next launch. */
export function writeHowToSeen(storage: SaveStorage | null): void {
  try {
    storage?.setItem(HOW_TO_SEEN_KEY, '1');
  } catch {
    // Storage blocked or full.
  }
}
