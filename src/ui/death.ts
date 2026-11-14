// How a killed enemy dies on screen (ID-110): each kill picks one of several deaths, seeded
// by the fight and the enemy, so a crowd's deaths vary and a replay draws them the same.
// Pure look functions (testable); the renderer cuts the pieces and draws them. Cosmetic
// only: picking a death never touches the fight's own random stream.
import { createRng, pick } from '../core/rng.ts';
import type { EnemyKind } from '../core/data.ts';
import { ANIM, STILL, type Pose } from './anim.ts';
import type { ArtId } from './sprites.ts';

/**
 * - `back`: tips over backward (the fall every kill had before ID-110).
 * - `face`: pitches forward toward the wall and lands on its front.
 * - `limb`: an arm or leg comes off and lands beside it; it staggers, then falls forward.
 * - `head`: its head bursts in a spray of blood; the body stands a moment, then drops back.
 * - `boss`: the boss (a Mutated Horror) sinks to its knees, then slams down on its front.
 */
export type Death = 'back' | 'face' | 'limb' | 'head' | 'boss';

/** A point in an enemy's corpse frame (its `walk-b` sprite), in that image's px. */
export type SpritePoint = readonly [number, number];

/**
 * A piece an enemy can lose: its outline (`poly`) on the corpse frame, where the wound
 * is (`at`), and which way the lost piece was from it (`turn`, degrees clockwise from
 * straight up), so the stump and spray face out of the wound.
 */
export interface Cut {
  poly: readonly SpritePoint[];
  at: SpritePoint;
  turn: number;
}

/**
 * The head and one arm or leg of each kind that can lose them, on its `walk-b` frame.
 * The Horror has none: it is only ever the boss, which has its own death.
 */
// prettier-ignore
export const CUTS: Readonly<Partial<Record<EnemyKind, { head: Cut; limb: Cut }>>> = {
  shambler: {
    head: { poly: [[56, 0], [114, 0], [114, 38], [102, 50], [92, 58], [62, 62], [54, 48]], at: [90, 56], turn: -10 },
    limb: { poly: [[24, 62], [62, 66], [64, 96], [24, 98]], at: [62, 76], turn: -90 },
  },
  runner: {
    head: { poly: [[30, 0], [88, 0], [88, 40], [80, 52], [70, 60], [56, 66], [32, 64]], at: [68, 60], turn: -20 },
    limb: { poly: [[120, 46], [172, 46], [172, 116], [128, 116], [121, 80]], at: [121, 58], turn: 90 },
  },
  crawler: {
    head: { poly: [[22, 50], [62, 50], [68, 80], [62, 100], [50, 112], [28, 110], [20, 90]], at: [62, 92], turn: -60 },
    limb: { poly: [[24, 128], [62, 118], [70, 150], [50, 170], [24, 170]], at: [60, 124], turn: -135 },
  },
  swollen: {
    head: { poly: [[24, 0], [66, 0], [72, 22], [66, 50], [52, 62], [30, 60], [22, 30]], at: [56, 56], turn: -20 },
    limb: { poly: [[92, 92], [128, 86], [130, 142], [94, 142]], at: [112, 90], turn: 180 },
  },
  spewer: {
    head: { poly: [[18, 0], [72, 0], [76, 30], [70, 50], [60, 62], [36, 76], [18, 64]], at: [70, 48], turn: -60 },
    limb: { poly: [[28, 80], [60, 64], [78, 72], [72, 100], [62, 134], [28, 134]], at: [72, 72], turn: -135 },
  },
  brute: {
    head: { poly: [[56, 0], [100, 0], [102, 30], [96, 48], [80, 58], [62, 56], [56, 40]], at: [82, 54], turn: -20 },
    limb: { poly: [[92, 88], [132, 82], [132, 128], [92, 128]], at: [114, 86], turn: 180 },
  },
  screamer: {
    head: { poly: [[58, 0], [104, 0], [104, 40], [90, 58], [72, 64], [60, 56], [56, 30]], at: [80, 62], turn: -10 },
    limb: { poly: [[30, 30], [60, 30], [66, 62], [50, 66], [30, 58]], at: [60, 60], turn: -45 },
  },
};

/**
 * Timings in fight seconds (each death's whole `time`, its last `fade` s fading out), px at
 * zoom 1, turns in radians.
 * - `limb`: the limb flies `throw` px out from the body's side it was on, arcing up to
 *   `pop` px and spinning `spin`, landing at `fly` s; the body staggers `stagger` px back
 *   over `reel` s, then falls.
 * - `head`: the spray bursts over `burst` s, then breaks up and fades by `spray` s; the
 *   body stands until `stand` s, then falls. The spray is `size` × the head's height.
 * - `boss`: it sinks `sink` of its height to its knees over `kneel` s, buckling `lean`
 *   forward, then falls; `early` s before it lands a dust cloud `dust` × its width rises
 *   where it lands, `puff` see-through at first, fading by the end.
 * - The stump is `stump` × the smaller side of the piece it lost.
 */
export const DEATH = {
  art: {
    spray: 'gore-spray',
    breakup: 'gore-spray-b',
    stump: 'gore-stump',
    dust: 'dust-puff',
  },
  time: { back: 0.7, face: 0.7, limb: 0.9, head: 0.85, boss: 1 },
  fade: 0.35,
  limb: { throw: 28, pop: 14, spin: 2.6, fly: 0.35, reel: 0.25, stagger: 4 },
  head: { burst: 0.12, spray: 0.4, stand: 0.15, size: 1.4 },
  boss: { kneel: 0.35, sink: 0.3, lean: 0.15, dust: 1.1, early: 0.05, puff: 0.7 },
  stump: 0.6,
} as const satisfies { art: Record<string, ArtId> } & Record<string, unknown>;

/** The deaths a kind can show: those that cut a piece off need its `CUTS`. */
export function deathsOf(kind: EnemyKind): readonly Death[] {
  if (kind === 'horror') return ['boss'];
  return CUTS[kind] ? ['back', 'face', 'limb', 'head'] : ['back', 'face'];
}

/**
 * The death enemy `id` of `kind` dies in a fight started from `seed`: the same pair always
 * gives the same death. Its own random source (seeded from both), never the fight's.
 */
export function deathOf(seed: number, enemy: { id: number; kind: EnemyKind }): Death {
  const mixed = (seed ^ Math.imul(enemy.id + 1, 0x9e3779b1)) >>> 0;
  return pick(createRng(mixed), deathsOf(enemy.kind));
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Seconds until the last of `dying` (each enemy and when it died) has finished dying at
 * fight time `now`, in the death each shows (with Reduce motion, the plain one); 0 if none.
 */
export function dyingLeft(
  seed: number,
  now: number,
  dying: readonly { enemy: { id: number; kind: EnemyKind }; at: number }[],
  reduced: boolean,
): number {
  let left = 0;
  for (const c of dying) {
    const time = DEATH.time[reduced ? 'back' : deathOf(seed, c.enemy)];
    left = Math.max(left, time - (now - c.at));
  }
  return left;
}

/**
 * A fall from upright, starting at `from` s, flat by the time its fade starts:
 * `dir` +1 backward (clockwise), −1 forward onto its front (toward the wall).
 */
function fall(since: number, from: number, time: number, dir: 1 | -1): number {
  const a = clamp01((since - from) / (time - DEATH.fade - from));
  return a === 0 ? 0 : dir * (Math.PI / 2) * a * a;
}

/**
 * The body of an enemy `since` s into `death`: white from the killing blow (it leaves the
 * fight in the step it took it, so it never flinched), then falling, then fading.
 */
export function deathPose(death: Death, since: number): Pose {
  const time = DEATH.time[death];
  const pose: Pose = {
    ...STILL,
    alpha: clamp01((time - since) / DEATH.fade),
    flash: since >= 0 && since < ANIM.flinch.flash ? 1 - since / ANIM.flinch.flash : 0,
  };
  switch (death) {
    case 'back':
    case 'face':
      pose.rot = fall(since, 0, time, death === 'back' ? 1 : -1);
      break;
    case 'limb': {
      const L = DEATH.limb;
      pose.dx = L.stagger * Math.sin(Math.PI * clamp01(since / L.reel));
      pose.rot = fall(since, L.reel, time, -1);
      break;
    }
    case 'head':
      pose.rot = fall(since, DEATH.head.stand, time, 1);
      break;
    case 'boss': {
      const B = DEATH.boss;
      const k = clamp01(since / B.kneel);
      const buckle = k * (2 - k);
      pose.sy = 1 - B.sink * buckle;
      // It buckles forward as it kneels, then falls on from there.
      pose.rot = -B.lean * buckle + fall(since, B.kneel, time, -1) * (1 - (2 * B.lean) / Math.PI);
      break;
    }
  }
  return pose;
}

/** A gore sprite to draw: its art, see-through `alpha` and `grow` × its size. */
export interface Gore {
  art: ArtId;
  alpha: number;
  grow: number;
}

/** A thrown limb `since` s after it came off: 0…1 of its flight, and its spin so far. */
export function limbFlight(since: number): { u: number; spin: number } {
  const u = clamp01(since / DEATH.limb.fly);
  return { u, spin: DEATH.limb.spin * u };
}

/** The head burst's spray `since` s after the kill, or null once it has gone. */
export function sprayOf(since: number): Gore | null {
  const H = DEATH.head;
  if (since < 0 || since >= H.spray) return null;
  if (since < H.burst)
    return { art: DEATH.art.spray, alpha: 1, grow: 0.6 + (0.4 * since) / H.burst };
  return { art: DEATH.art.breakup, alpha: 1 - (since - H.burst) / (H.spray - H.burst), grow: 1 };
}

/** The boss's dust cloud `since` s after its kill, from just before it lands; null before and after. */
export function dustOf(since: number): Gore | null {
  const B = DEATH.boss;
  const from = DEATH.time.boss - DEATH.fade - B.early;
  if (since < from || since >= DEATH.time.boss) return null;
  const k = (since - from) / (DEATH.time.boss - from);
  return { art: DEATH.art.dust, alpha: B.puff * (1 - k), grow: 0.7 + 0.3 * k };
}
