// Sprite animation (design §15, ID-049): motion drawn from the still sprites (bob, lean,
// lunge, recoil, swing, flinch, flash, fall). Cosmetic only: it reads the fight and never
// changes it. Every clock is fight time, so a pause freezes it and game speed carries it.
import { ENEMIES, STRIKE_FLASH } from '../core/data.ts';
import type { Defender, Enemy, Shot, Strike } from '../core/horde.ts';

/** How a sprite is moved off its spot: px at zoom 1, radians clockwise about its feet. */
export interface Pose {
  dx: number;
  lift: number;
  rot: number;
  sx: number;
  sy: number;
  alpha: number;
  /** How white it flashes, 0…1. */
  flash: number;
}

export const STILL: Readonly<Pose> = { dx: 0, lift: 0, rot: 0, sx: 1, sy: 1, alpha: 1, flash: 0 };

/** Timings in fight seconds, distances in px at zoom 1, leans in radians. */
export const ANIM = {
  /** Px walked per step: one bob and half a sway each. */
  stride: 20,
  /** Seconds the walk takes to start or settle, so stopping never pops. */
  settle: 0.15,
  /**
   * Px/s that count as walking: none up to `still` (a crowd's jostle), all from `full`
   * (under the slowest walk, a Shambler on barbed wire).
   */
  pace: { still: 4, full: 12 },
  bob: 2.5,
  sway: 0.06,
  /** Seconds per breath, and how far it stretches the sprite. */
  breath: 2.5,
  breathe: 0.025,
  /** An enemy's lunge at a wall or defender, forward (left). */
  lunge: { time: 0.25, px: 6, lean: 0.18 },
  /** Knocked back from a hit, the first `flash` s showing white (enemies only). */
  flinch: { time: 0.2, px: 3, flash: 0.1 },
  /** A gun's kick back, from the shot that lit its muzzle flash. */
  recoil: { time: 0.12, px: 3, lean: 0.06 },
  /** A blade or tool strike's swing, forward (right), over `STRIKE_FLASH`. */
  swing: { px: 2, lean: 0.35 },
  /** A dead enemy flashes from the killing blow, tips over backward, then fades over the last `fade` s. */
  fall: { time: 0.7, fade: 0.35 },
} as const;

/** Where in its cycle a sprite starts, 0…1, so a crowd never moves in lockstep. */
export function phaseOf(id: number | string): number {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h * 0.6180339887) % 1;
}

/** 1 → 0 over `time` s from `at`; 0 outside it. */
function decay(now: number, at: number, time: number): number {
  const since = now - at;
  return since >= 0 && since < time ? 1 - since / time : 0;
}

/**
 * How far a sprite has walked in this fight (px), and how much it is walking now, 0…1:
 * the bob follows the ground actually covered, so a slowed or jostled walk stays smooth.
 */
export interface Gait {
  walked: number;
  moving: number;
}
export const STANDING: Readonly<Gait> = { walked: 0, moving: 0 };

/** A bob each stride walked, leaning left and right on alternate strides. */
function walk(pose: Pose, gait: Gait, phase: number): void {
  const step = Math.PI * (gait.walked / ANIM.stride + 2 * phase);
  pose.lift += ANIM.bob * gait.moving * Math.abs(Math.sin(step));
  pose.rot += ANIM.sway * gait.moving * Math.sin(step);
}

/** A slow breath, a little taller and narrower at the top of it. */
function breathe(pose: Pose, time: number, phase: number): void {
  const b = ANIM.breathe * Math.sin(2 * Math.PI * (time / ANIM.breath + phase));
  pose.sy *= 1 + b;
  pose.sx *= 1 - b / 2;
}

/** What an enemy is doing besides walking, as fight times (−∞ for never). */
export interface EnemyActs {
  hurtAt: number;
  gait: Gait;
}

export function enemyPose(
  e: Pick<Enemy, 'id' | 'kind' | 'nextAttackAt'>,
  time: number,
  acts: EnemyActs,
): Pose {
  const pose = { ...STILL };
  const phase = phaseOf(e.id);
  const enemy = ENEMIES[e.kind];
  walk(pose, acts.gait, phase);
  breathe(pose, time, phase);
  // The fight sets the next attack one interval after the last.
  const lunge = decay(time, e.nextAttackAt - enemy.attackInterval, ANIM.lunge.time);
  if (lunge > 0) {
    const k = Math.sin(Math.PI * (1 - lunge));
    pose.dx -= ANIM.lunge.px * k;
    pose.rot -= ANIM.lunge.lean * k;
  }
  pose.dx += ANIM.flinch.px * decay(time, acts.hurtAt, ANIM.flinch.time);
  pose.flash = decay(time, acts.hurtAt, ANIM.flinch.flash);
  return pose;
}

/**
 * An enemy `since` s dead: white from the killing blow (it leaves the fight in the step
 * it took it, so it never flinched), tipping over backward, then fading.
 */
export function fallPose(since: number): Pose {
  const a = Math.min(1, Math.max(0, since / (ANIM.fall.time - ANIM.fall.fade)));
  return {
    ...STILL,
    rot: (Math.PI / 2) * a * a,
    alpha: Math.min(1, Math.max(0, (ANIM.fall.time - since) / ANIM.fall.fade)),
    flash: decay(since, 0, ANIM.flinch.flash),
  };
}

/** What a defender is doing besides walking, as fight times (−∞ for never). */
export interface Acts extends EnemyActs {
  shotAt: number;
  struckAt: number;
}

export function defenderPose(d: Pick<Defender, 'id'>, time: number, acts: Acts): Pose {
  const pose = { ...STILL };
  const phase = phaseOf(d.id);
  walk(pose, acts.gait, phase);
  breathe(pose, time, phase);
  const recoil = decay(time, acts.shotAt, ANIM.recoil.time);
  pose.dx -= ANIM.recoil.px * recoil;
  pose.rot -= ANIM.recoil.lean * recoil;
  const swing = decay(time, acts.struckAt, STRIKE_FLASH);
  if (swing > 0) {
    const k = Math.sin(Math.PI * (1 - swing));
    pose.dx += ANIM.swing.px * k;
    pose.rot += ANIM.swing.lean * k;
  }
  pose.dx -= ANIM.flinch.px * decay(time, acts.hurtAt, ANIM.flinch.time);
  return pose;
}

/** An enemy gone from the fight, still falling. */
export interface Corpse {
  enemy: Enemy;
  at: number;
}

const NEVER = -Infinity;

/** One sprite as last seen. */
interface Seen {
  x: number;
  y: number;
  hp: number;
  hurtAt: number;
  gait: Gait;
}

/**
 * What animation needs from earlier frames, which the fight doesn't keep: how far each
 * enemy and defender has walked and when they last lost HP, each shooter's last shot (the
 * fight drops it with its muzzle flash), and the enemies that died, kept until they have
 * fallen. A Swollen that blew up (in `bursts`) didn't die: it leaves no body. Fed the fight each frame; a fight whose time runs back is a new one, and starts
 * it afresh.
 */
export class Animator {
  /** Reduce motion (ID-039): sprites hold still, keeping only their hit flash and fade. */
  reduced = false;
  private time = NEVER;
  private enemies = new Map<number, Seen & { enemy: Enemy }>();
  private defenders = new Map<string, Seen>();
  private shots = new Map<string, number>();
  corpses: Corpse[] = [];

  observe(scene: {
    time: number;
    enemies: readonly Enemy[];
    defenders: readonly Pick<Defender, 'id' | 'hp' | 'x' | 'y'>[];
    shots: readonly Shot[];
    bursts?: readonly { id: number }[];
  }): void {
    const t = scene.time;
    if (t < this.time) {
      this.enemies.clear();
      this.defenders.clear();
      this.shots.clear();
      this.corpses = [];
    }
    const dt = Number.isFinite(this.time) ? t - this.time : 0;
    this.time = t;
    const enemies = new Map<number, Seen & { enemy: Enemy }>();
    for (const e of scene.enemies) {
      enemies.set(e.id, { ...this.seen(this.enemies.get(e.id), e, t, dt), enemy: e });
    }
    const burst = new Set(scene.bursts?.map((b) => b.id));
    for (const [id, was] of this.enemies) {
      if (!enemies.has(id) && !burst.has(id)) this.corpses.push({ enemy: was.enemy, at: t });
    }
    this.enemies = enemies;
    this.corpses = this.corpses.filter((c) => t - c.at < ANIM.fall.time);
    const defenders = new Map<string, Seen>();
    for (const d of scene.defenders)
      defenders.set(d.id, this.seen(this.defenders.get(d.id), d, t, dt));
    this.defenders = defenders;
    for (const k of scene.shots) {
      if (k.at > (this.shots.get(k.owner) ?? NEVER)) this.shots.set(k.owner, k.at);
    }
    for (const [owner, at] of this.shots) if (t - at >= ANIM.recoil.time) this.shots.delete(owner);
  }

  /**
   * A sprite `dt` s after it was last seen. The ground it covered adds to its walk, which
   * starts or settles over `settle` s toward how much its pace is a walk. A drop in HP
   * starts a flinch, unless one is still playing: damage every step (a fire, a trap)
   * twitches it each `flinch.time` instead of holding it back.
   */
  private seen(
    was: Seen | undefined,
    now: { x: number; y: number; hp: number },
    t: number,
    dt: number,
  ): Seen {
    if (!was) return { x: now.x, y: now.y, hp: now.hp, hurtAt: NEVER, gait: { ...STANDING } };
    const moved = Math.hypot(now.x - was.x, now.y - was.y);
    const ease = Math.min(1, dt / ANIM.settle);
    const pace = dt > 0 ? moved / dt : 0;
    const walking = Math.min(
      1,
      Math.max(0, (pace - ANIM.pace.still) / (ANIM.pace.full - ANIM.pace.still)),
    );
    const moving = was.gait.moving + (walking - was.gait.moving) * ease;
    const hurt = now.hp < was.hp && t - was.hurtAt >= ANIM.flinch.time;
    return {
      x: now.x,
      y: now.y,
      hp: now.hp,
      hurtAt: hurt ? t : was.hurtAt,
      gait: { walked: was.gait.walked + moved, moving: dt > 0 ? moving : was.gait.moving },
    };
  }

  /** `pose` as drawn: with Reduce motion on, no bob, lean, lunge or fall, only flash and fade. */
  shown(pose: Pose): Pose {
    return this.reduced ? { ...STILL, alpha: pose.alpha, flash: pose.flash } : pose;
  }

  enemy(id: number): EnemyActs {
    const seen = this.enemies.get(id);
    return { hurtAt: seen?.hurtAt ?? NEVER, gait: seen?.gait ?? STANDING };
  }

  acts(id: string, strikes: readonly Strike[]): Acts {
    let struckAt = NEVER;
    for (const k of strikes) if (k.owner === id && k.at > struckAt) struckAt = k.at;
    const seen = this.defenders.get(id);
    return {
      hurtAt: seen?.hurtAt ?? NEVER,
      gait: seen?.gait ?? STANDING,
      shotAt: this.shots.get(id) ?? NEVER,
      struckAt,
    };
  }
}
