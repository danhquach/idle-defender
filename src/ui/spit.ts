// A Spewer's spit (ID-118): a generated acid glob arcing to its target, then a flip-book
// splash where it lands (a burst, settling into a dripping stain that fades). Pure look
// functions (testable); times are shares of the spit's life on screen (`SPEWER.splash`).
import type { ArtId } from './sprites.ts';

/**
 * The spit's look: the glob flies for the first `fly` of its life, `glob` world px long.
 * Then the splash, `splash` world px across: it bursts from `grow[0]` of its size to full
 * by `grow[1]` of the splash, fades into the stain beneath it over `stain`, and the stain fades
 * out by the end. With Reduce motion the splash holds full size and only fades.
 */
export const SPIT = {
  art: { glob: 'acid-glob', splash: 'acid-splash', stain: 'acid-stain' },
  fly: 0.5,
  glob: 16,
  splash: 28,
  grow: [0.6, 0.25],
  stain: [0.3, 0.6],
} as const;

/** One frame of the spit to draw: its art, see-through `alpha` and `grow` × its size. */
export interface SpitFrame {
  art: ArtId;
  alpha: number;
  grow: number;
}

/** How far along its arc the glob is `u` into the spit's life: 0 just spat, 1 landed. */
export const spitFly = (u: number): number => Math.min(1, Math.max(0, u / SPIT.fly));

/** The spit frames to draw `u` into its life, back to front; none once gone. */
export function spitFrames(u: number, still = false): SpitFrame[] {
  if (u < 0 || u >= 1) return [];
  const S = SPIT;
  if (u < S.fly) return [{ art: S.art.glob, alpha: 1, grow: 1 }];
  const k = (u - S.fly) / (1 - S.fly);
  if (still) return [{ art: S.art.splash, alpha: 1 - k, grow: 1 }];
  const grow = S.grow[0] + (1 - S.grow[0]) * Math.min(1, k / S.grow[1]);
  if (k < S.stain[0]) return [{ art: S.art.splash, alpha: 1, grow }];
  const fade = 1 - (k - S.stain[1]) / (1 - S.stain[1]);
  if (k < S.stain[1]) {
    // The stain sits whole under the fading splash, so the spot never goes see-through;
    // the splash's longer streaks fade back to the stain's.
    const t = (k - S.stain[0]) / (S.stain[1] - S.stain[0]);
    return [
      { art: S.art.stain, alpha: 1, grow },
      { art: S.art.splash, alpha: 1 - t, grow },
    ];
  }
  return [{ art: S.art.stain, alpha: fade, grow }];
}
