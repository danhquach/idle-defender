// Wave pacing (ID-171): how fast a horde's enemies come, in one place. Too slow and a
// fight drags; too fast and a squad is buried. Retune a horde by editing a row of
// `SQUAD_PACE` (or `FULL_PACE`); nothing else reads these numbers. Pure.

/** How a horde's waves come. */
export interface Pace {
  /** Seconds between two spawns (a swarm wave's `SWARM.size` times as many in the same time). */
  readonly interval: number;
  /** Seconds of quiet before each wave after the first. */
  readonly break: number;
  /**
   * How far the next wave may overlap this one, once this one has all spawned: 0 waits for
   * a clear field; between 0 and 1, it comes once at most that share of this wave's size is
   * still alive (0.5: half of it); 1 comes at once (ID-128). The last wave is always cleared
   * to win.
   */
  readonly overlap: number;
}

/** The full game's pacing, every horde (design §9). */
export const FULL_PACE: Pace = { interval: 0.8, break: 3, overlap: 0 };

/**
 * The horde-only build's pacing: each row holds from Horde `from` until the next row's.
 * Before overlap a small squad would be buried, so early hordes wait for a clear (ID-128).
 * ID-171: overlap no longer arrives in full at the horde Spewers join (Horde 6, `ENEMY_MIX`);
 * it builds a step a horde, so no horde from 5 to 8 is a cliff. Wherever overlap jumped
 * straight to 1, that horde was the cliff (20 seeds, first try: 13/20 at Horde 6 when it
 * came there; 11/20 at Horde 8 when Horde 6–7 ramped 0.25 and 0.6). This ramp: Hordes 5–8
 * won 20, 18, 16, 13 of 20.
 */
export const SQUAD_PACE: readonly (Pace & { readonly from: number })[] = [
  { from: 1, interval: 0.8, break: 3, overlap: 0 },
  { from: 6, interval: 0.6, break: 3, overlap: 0.5 },
  { from: 7, interval: 0.6, break: 3, overlap: 0.75 },
  { from: 8, interval: 0.6, break: 3, overlap: 1 },
];

/** Horde `hordeNumber`'s pacing: the horde-only build's (`harder`) or the full game's. */
export function wavePace(hordeNumber: number, harder: boolean): Pace {
  if (!harder) return FULL_PACE;
  let pace: Pace = SQUAD_PACE[0]!;
  for (const row of SQUAD_PACE) if (hordeNumber >= row.from) pace = row;
  return pace;
}

/**
 * Whether the next wave may come yet, once the current one has all spawned (`Pace.overlap`):
 * `alive` enemies on the field, of a wave of `size`.
 */
export function nextWaveDue(pace: Pace, alive: number, size: number): boolean {
  if (pace.overlap >= 1) return true;
  if (pace.overlap <= 0) return alive === 0;
  return alive <= pace.overlap * size;
}
