// Sprite animation (design §15, ID-049, ID-069): which frame a sprite shows (an enemy's
// walk cycle and strike, a survivor's idle or aimed gun) and the motion drawn on top of it
// (bob, lunge, recoil, swing, flinch, flash, fall). Cosmetic only: it reads the fight and
// never changes it. Every clock is fight time, so a pause freezes it and game speed carries it.
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
  /**
   * An enemy's strike at a wall or defender: its attack frame for `time` s (at most half
   * its attack interval, so a fast attacker still walks between blows), and a lunge `px`
   * forward (left) over the first `lunge` s.
   */
  strike: { time: 0.35, lunge: 0.25, px: 6 },
  /** Knocked back from a hit, the first `flash` s showing white (enemies only). */
  flinch: { time: 0.2, px: 3, flash: 0.1 },
  /**
   * A gun's kick straight back, from the shot that lit its muzzle flash: `time` s, or
   * `share` of the gun's time between shots when that is shorter, so a fast gun's kicks
   * never run into each other.
   */
  recoil: { time: 0.12, share: 0.8, px: 3 },
  /**
   * A survivor aims (ID-069) from a shot until `hold` s after their next shot or the end of
   * their reload is due; a target still in range keeps them firing, so the aim only drops
   * once nothing is left to shoot at.
   */
  aim: { hold: 0.3 },
  /**
   * The pace (px/s of `drift`) from which an enemy's walk frames cycle (ID-069): slower than
   * the slowest walk there is (a Horror on razor wire in a slow field, 15 × 0.35 × 0.7 ≈
   * 3.7 px/s), so no enemy that moves stands on one frame; the crowd's jostle drifts nowhere.
   */
  cycles: 1,
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
  /**
   * Its velocity of late (px/s, eased over `settle` s): a steady walk keeps it however slow,
   * while the crowd's jostle back and forth cancels out.
   */
  drift: { x: number; y: number };
  /** Its pace over the last frame (px/s), so it stands the moment it stops. */
  pace: number;
}
export const STANDING: Readonly<Gait> = { walked: 0, moving: 0, drift: { x: 0, y: 0 }, pace: 0 };

/**
 * Strides walked so far, from the sprite's own phase: a footfall on each whole number, the
 * body highest half way between.
 */
const strides = (gait: Gait, phase: number): number => gait.walked / ANIM.stride + 2 * phase;

/**
 * A bob each stride walked; a sprite with no walk frames (a defender) also leans left and
 * right on alternate strides.
 */
function walk(pose: Pose, gait: Gait, phase: number, sway: boolean): void {
  const step = Math.PI * strides(gait, phase);
  pose.lift += ANIM.bob * gait.moving * Math.abs(Math.sin(step));
  if (sway) pose.rot += ANIM.sway * gait.moving * Math.sin(step);
}

/** Walk frames: one foot forward, the legs passing, the other foot forward, passing. */
export type WalkFrame = 0 | 1 | 2;
/** An enemy's frame (ID-069): one of its walk poses, or its strike. */
export type EnemyFrame = WalkFrame | 'attack';
const CYCLE: readonly WalkFrame[] = [0, 1, 2, 1];

/** When an enemy last struck: the fight sets its next attack one interval after it. */
const struckAt = (e: Pick<Enemy, 'kind' | 'nextAttackAt'>): number =>
  e.nextAttackAt - ENEMIES[e.kind].attackInterval;

/**
 * Which frame an enemy shows (ID-069): its attack frame just after it strikes, else its walk
 * cycle, two frames a stride so its feet land on the stride frames and keep pace with the
 * ground it actually covers (slower on a trap, faster at 3×, held while paused). Standing,
 * it stands on its passing frame. The fight sets a fresh enemy's first attack at 0, so it
 * never starts in its attack frame.
 */
export function enemyFrame(
  e: Pick<Enemy, 'id' | 'kind' | 'nextAttackAt'>,
  time: number,
  acts: EnemyActs,
): EnemyFrame {
  const hold = Math.min(ANIM.strike.time, ENEMIES[e.kind].attackInterval / 2);
  if (e.nextAttackAt > 0 && decay(time, struckAt(e), hold) > 0) return 'attack';
  const { drift, pace } = acts.gait;
  if (pace < ANIM.cycles || Math.hypot(drift.x, drift.y) < ANIM.cycles) return 1;
  const quarter = Math.round(2 * strides(acts.gait, phaseOf(e.id)));
  return CYCLE[((quarter % 4) + 4) % 4]!;
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
  walk(pose, acts.gait, phase, false);
  breathe(pose, time, phase);
  // The attack frame leans into the blow; the lunge only carries it forward.
  const lunge = decay(time, struckAt(e), ANIM.strike.lunge);
  if (lunge > 0) pose.dx -= ANIM.strike.px * Math.sin(Math.PI * (1 - lunge));
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

/** A defender's gun clocks: when their next shot is due and when an empty gun is reloaded. */
type GunClock = Partial<Pick<Defender, 'nextShotAt' | 'reloadedAt'>>;

/** When `d`'s gun is next ready to fire: their next shot, or later, the end of their reload. */
const readyAt = (d: GunClock): number =>
  Math.max(d.nextShotAt ?? -Infinity, d.reloadedAt?.primary ?? -Infinity);

/**
 * Whether a survivor holds their gun raised and aimed (ID-069): from their last shot until
 * `aim.hold` s after the gun is ready again. While a target is in range they fire as soon as
 * it is, so the aim holds; with none left, the gun drops back to rest. One who has not
 * fired yet this fight is at rest.
 */
export function aiming(d: GunClock, time: number, acts: Pick<Acts, 'shotAt'>): boolean {
  if (!Number.isFinite(acts.shotAt) || time < acts.shotAt) return false;
  return time <= Math.max(acts.shotAt, readyAt(d)) + ANIM.aim.hold;
}

export function defenderPose(d: Pick<Defender, 'id'> & GunClock, time: number, acts: Acts): Pose {
  const pose = { ...STILL };
  const phase = phaseOf(d.id);
  walk(pose, acts.gait, phase, true);
  // A survivor aiming holds still behind the gun; at rest they breathe.
  if (!aiming(d, time, acts)) breathe(pose, time, phase);
  const between = (d.nextShotAt ?? Infinity) - acts.shotAt;
  const kick =
    between > 0 ? Math.min(ANIM.recoil.time, ANIM.recoil.share * between) : ANIM.recoil.time;
  pose.dx -= ANIM.recoil.px * decay(time, acts.shotAt, kick);
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
 * fight drops it with its muzzle flash; kept all fight, one per shooter, for the recoil and
 * the aim), and the enemies that died, kept until they have fallen. A Swollen that blew up
 * (in `bursts`) didn't die: it leaves no body. Fed the fight each frame; a fight whose time
 * runs back is a new one, and starts it afresh.
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
    if (!was) {
      return {
        x: now.x,
        y: now.y,
        hp: now.hp,
        hurtAt: NEVER,
        gait: { ...STANDING, drift: { x: 0, y: 0 } },
      };
    }
    const moved = Math.hypot(now.x - was.x, now.y - was.y);
    const ease = Math.min(1, dt / ANIM.settle);
    const pace = dt > 0 ? moved / dt : 0;
    const walking = Math.min(
      1,
      Math.max(0, (pace - ANIM.pace.still) / (ANIM.pace.full - ANIM.pace.still)),
    );
    const moving = was.gait.moving + (walking - was.gait.moving) * ease;
    const hurt = now.hp < was.hp && t - was.hurtAt >= ANIM.flinch.time;
    // Paused (no time passed), the gait holds as it was.
    const d = was.gait.drift;
    const drift =
      dt > 0
        ? {
            x: d.x + ((now.x - was.x) / dt - d.x) * ease,
            y: d.y + ((now.y - was.y) / dt - d.y) * ease,
          }
        : d;
    return {
      x: now.x,
      y: now.y,
      hp: now.hp,
      hurtAt: hurt ? t : was.hurtAt,
      gait: {
        walked: was.gait.walked + moved,
        moving: dt > 0 ? moving : was.gait.moving,
        drift,
        pace: dt > 0 ? pace : was.gait.pace,
      },
    };
  }

  /** `pose` as drawn: with Reduce motion on, no bob, lean, lunge or fall, only flash and fade. */
  shown(pose: Pose): Pose {
    return this.reduced ? { ...STILL, alpha: pose.alpha, flash: pose.flash } : pose;
  }

  /**
   * An enemy's frame as drawn: with Reduce motion on, the walk holds its passing frame; the
   * attack frame still shows, since it says the enemy is striking, not just moving.
   */
  shownFrame(frame: EnemyFrame): EnemyFrame {
    return this.reduced && frame !== 'attack' ? 1 : frame;
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
