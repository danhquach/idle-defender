// Explosions (ID-107). An Airstrike bomb's and a Frag Grenade's blast is a flip-book of
// generated frames (a white-hot pop, the fireball, smoke) standing on the spot,
// with the scorch art under it; a Flashbang's is a white pop drawn as live shapes. Pure
// look functions (testable) and a painter; times are shares of the blast's life on screen.
import { project, TILT, type Camera } from './projection.ts';
import type { ArtId } from './sprites.ts';

/** Which explosion: a fireball (frag, airstrike) or a flashbang's white pop. */
export type BlastKind = 'fire' | 'white';

/**
 * A fireball's flip-book (ID-107), over its life `u` (0 just gone off, 1 gone): the `pop`
 * alone until `pop`, cross-fading into the `ball` by `ball[0]` and holding it to `ball[1]`,
 * cross-fading into `smoke` by `smoke` (no cooling frame, PM), which then fades out by the
 * end while rising `rise` (× its width) and growing `fade` more. The fire grows
 * `grow` over its first `growBy`. With Reduce motion it holds the ball and only fades.
 */
export const FIREBALL = {
  art: {
    pop: 'explosion-pop',
    ball: 'explosion',
    smoke: 'explosion-smoke',
  },
  pop: 0.05,
  ball: [0.12, 0.35],
  smoke: 0.65,
  grow: 0.08,
  growBy: 0.5,
  rise: 0.15,
  fade: 0.06,
} as const;

/** One frame of a fireball to draw: its art, see-through `alpha`, `grow` × size, `rise` × its width up. */
export interface FireFrame {
  art: ArtId;
  alpha: number;
  grow: number;
  rise: number;
}

/** The fireball frames to draw `u` into its life, back to front; none once gone. */
export function fireFrames(u: number, still = false): FireFrame[] {
  if (u < 0 || u >= 1) return [];
  const F = FIREBALL;
  if (still) return [{ art: F.art.ball, alpha: 1 - u, grow: 1, rise: 0 }];
  const grow = 1 + F.grow * Math.min(1, u / F.growBy);
  const at = (art: ArtId, alpha: number, extra = 0, rise = 0): FireFrame => ({
    art,
    alpha,
    grow: grow + extra,
    rise,
  });
  if (u < F.pop) return [{ art: F.art.pop, alpha: 1, grow: 1, rise: 0 }];
  if (u < F.ball[0]) {
    const k = (u - F.pop) / (F.ball[0] - F.pop);
    return [at(F.art.ball, k), { art: F.art.pop, alpha: 1 - k, grow: 1, rise: 0 }];
  }
  if (u < F.ball[1]) return [at(F.art.ball, 1)];
  const lift = F.rise * 0.3;
  if (u < F.smoke) {
    const k = (u - F.ball[1]) / (F.smoke - F.ball[1]);
    return [at(F.art.ball, 1 - k, 0, lift * k), at(F.art.smoke, k, 0, lift * k)];
  }
  const k = (u - F.smoke) / (1 - F.smoke);
  return [at(F.art.smoke, 1 - k, F.fade * k, lift + (F.rise - lift) * k)];
}

/**
 * A flashbang's white pop over its life `u`, sizes as shares of its reach `R`:
 * `flash` a soft white light swelling from `r[0]` to `r[1]` at `alpha` (dimmed, ID-107),
 * gone by `until`; `ring` a soft shockwave on the ground from `r[0]` to `r[1]`, gone by
 * `until`; `smoke` thin pale puffs rising. A fireball keeps only its `scorch`: the
 * ground's char at `r`, `alpha`, fading from `from` to the end. Screen sizes never drop
 * under `min` px.
 */
export const BLAST = {
  flash: { until: 0.1, r: [0.55, 0.95], alpha: 0.6 },
  ring: { until: 0.14, r: [0.35, 1.3], width: 0.05, alpha: 0.45 },
  smoke: { puffs: 5, from: 0.1, rise: 0.9, r: [0.15, 0.4], alpha: 0.3 },
  scorch: { r: 0.9, alpha: 0.85, from: 0.55 },
  min: 1.5,
  white: {
    flash: ['#f4f8fb', '#cfe0ee'],
    ring: '#e6f1f8',
    smoke: '#c9cfd4',
  },
} as const;

/** A filled disc on screen: a burst of light or a puff, both a soft radial fade. */
export interface BlastDisc {
  x: number;
  y: number;
  r: number;
  colour: string;
  alpha: number;
}
/** What an explosion shows on the ground at one moment, and in the air. */
export interface BlastLook {
  scorch: { r: number; alpha: number } | null;
  ring: { x: number; y: number; r: number; width: number; colour: string; alpha: number } | null;
  air: BlastDisc[];
}

/** A number in [0, 1) from a blast's seed and two indices: the same every replay. */
function roll(seed: number, i: number, j: number): number {
  let h =
    Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(i + 7, 0x85ebca6b) ^ Math.imul(j + 3, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** A blast's seed from where and when it went off. */
export const blastSeed = (x: number, y: number, at: number): number =>
  Math.round(x * 7 + y * 13 + at * 1000);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Explosion `kind` of reach `R` at `(x, y)` (world), `u` into its life, as seen by `cam`;
 * null once gone. A fireball's look is only its scorch (its frames are `fireFrames`); a
 * flashbang's is its pop. With `still` (Reduce motion) the pop holds its shape and fades.
 */
export function blastLook(
  kind: BlastKind,
  x: number,
  y: number,
  R: number,
  u: number,
  seed: number,
  cam: Camera,
  still = false,
): BlastLook | null {
  if (u < 0 || u >= 1) return null;
  if (kind === 'fire') {
    const S = BLAST.scorch;
    const fade = u < S.from ? 1 : 1 - (u - S.from) / (1 - S.from);
    return {
      scorch: { r: R * S.r, alpha: S.alpha * Math.min(1, u / 0.05) * fade },
      ring: null,
      air: [],
    };
  }
  const fadeOut = still ? 1 - u : 1;
  const t = still ? 0.05 : u;
  const Z = R * cam.zoom;
  const px = (share: number): number => Math.max(BLAST.min, share * Z);
  const c = project({ x, y }, cam);
  const W = BLAST.white;
  let ring: BlastLook['ring'] = null;
  if (t < BLAST.ring.until) {
    const k = t / BLAST.ring.until;
    ring = {
      x: c.sx,
      y: c.sy,
      r: px(lerp(BLAST.ring.r[0], BLAST.ring.r[1], ease(k))),
      width: px(BLAST.ring.width * (1 - 0.6 * k)),
      colour: W.ring,
      alpha: BLAST.ring.alpha * (1 - k) * fadeOut,
    };
  }
  const air: BlastDisc[] = [];
  for (let i = 0; i < BLAST.smoke.puffs; i++) {
    const from = BLAST.smoke.from + 0.15 * roll(seed, i, 4);
    if (t < from) continue;
    const k = (t - from) / (1 - from);
    const dx = (roll(seed, i, 5) - 0.5) * R * 0.8;
    const p = project({ x: x + dx, y, z: R * (0.2 + BLAST.smoke.rise * ease(k)) }, cam);
    air.push({
      x: p.sx,
      y: p.sy,
      r: px(lerp(BLAST.smoke.r[0], BLAST.smoke.r[1], ease(k))),
      colour: W.smoke,
      alpha: BLAST.smoke.alpha * Math.sin(Math.PI * Math.min(1, k * 1.2 + 0.1)) * fadeOut,
    });
  }
  if (t < BLAST.flash.until) {
    const k = t / BLAST.flash.until;
    const p = project({ x, y, z: R * 0.32 }, cam);
    air.push({
      x: p.sx,
      y: p.sy,
      r: px(lerp(BLAST.flash.r[0], BLAST.flash.r[1], ease(k))),
      colour: W.flash[0],
      alpha: BLAST.flash.alpha * (1 - k * k) * fadeOut,
    });
  }
  return { scorch: null, ring, air };
}

/** Paints `discs` in order, each a soft radial fade from its colour to clear (`glow`). */
export function paintDiscs(
  ctx: CanvasRenderingContext2D,
  discs: readonly BlastDisc[],
  glow: string,
): void {
  for (const d of discs) {
    if (d.alpha <= 0) continue;
    ctx.globalAlpha = Math.min(1, d.alpha);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    g.addColorStop(0, d.colour);
    g.addColorStop(0.4, d.colour);
    g.addColorStop(1, `${glow}00`);
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Paints a blast's shockwave ring along the ground. */
export function paintRing(
  ctx: CanvasRenderingContext2D,
  ring: NonNullable<BlastLook['ring']>,
): void {
  if (ring.alpha <= 0) return;
  ctx.globalAlpha = ring.alpha;
  ctx.strokeStyle = ring.colour;
  ctx.lineWidth = ring.width;
  ctx.beginPath();
  ctx.ellipse(ring.x, ring.y, ring.r, ring.r * TILT, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
