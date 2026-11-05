// Design §15 (ID-049): sprites move from fight state alone, and the animator remembers hits,
// shots and deaths between frames.
import { describe, expect, it } from 'vitest';
import { CARD, ENEMIES, STRIKE_FLASH, TRAP_RESEARCH, TRAPS } from '../core/data.ts';
import type { Enemy } from '../core/horde.ts';
import {
  aiming,
  ANIM,
  Animator,
  defenderPose,
  enemyFrame,
  enemyPose,
  fallPose,
  phaseOf,
  STANDING,
  STILL,
  type Acts,
  type EnemyActs,
} from './anim.ts';

const NONE: Acts = { hurtAt: -Infinity, gait: STANDING, shotAt: -Infinity, struckAt: -Infinity };
const IDLE: EnemyActs = { hurtAt: -Infinity, gait: STANDING };
/** Walking at full stride, `walked` px in. */
const striding = (walked: number): EnemyActs => ({
  ...IDLE,
  gait: { walked, moving: 1, drift: { x: -30, y: 0 }, pace: 30 },
});

function enemy(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    kind: 'shambler',
    x: 500,
    y: 50,
    hp: 20,
    maxHp: 20,
    nextAttackAt: 0,
    inCamp: false,
    stunnedUntil: 0,
    vx: -30,
    vy: 0,
    climbUntil: 0,
    climbed: false,
    ...over,
  };
}
const frame = (
  time: number,
  enemies: Enemy[],
  over: Partial<Parameters<Animator['observe']>[0]> = {},
) => ({
  time,
  enemies,
  defenders: [],
  shots: [],
  ...over,
});

describe('enemy pose', () => {
  it('bobs once per stride walked, upright: its walk frames carry the stride (ID-069)', () => {
    const e = enemy({ id: 0 });
    const at = (walked: number) => enemyPose(e, 0, striding(walked));
    const lifts = Array.from({ length: 41 }, (_, i) => at((ANIM.stride * i) / 40).lift);
    expect(Math.max(...lifts)).toBeCloseTo(ANIM.bob, 1);
    expect(lifts[0]).toBeCloseTo(lifts[40]!, 9);
    for (let i = 0; i <= 80; i++) expect(at((ANIM.stride * i) / 40).rot).toBe(0);
  });

  it('breathes in place, with no bob, while standing', () => {
    const p = enemyPose(enemy(), 0.7, IDLE);
    expect(p.lift).toBe(0);
    expect(p.rot).toBe(0);
    expect(Math.abs(p.sy - 1)).toBeLessThanOrEqual(ANIM.breathe);
  });

  it('lunges forward at the wall as it attacks, and is back by the end of the lunge', () => {
    const attackedAt = 10;
    const e = enemy({ vx: 0, nextAttackAt: attackedAt + ENEMIES.shambler.attackInterval });
    const mid = enemyPose(e, attackedAt + ANIM.strike.lunge / 2, IDLE);
    expect(mid.dx).toBeCloseTo(-ANIM.strike.px, 9);
    // The attack frame leans into the blow, so the sprite itself stays upright.
    expect(mid.rot).toBe(0);
    expect(enemyPose(e, attackedAt + ANIM.strike.lunge, IDLE).dx).toBe(0);
    expect(enemyPose(e, attackedAt - 0.01, IDLE).dx).toBe(0);
    // A fresh enemy (never attacked) doesn't lunge at the fight's start.
    expect(enemyPose(enemy({ vx: 0 }), 0, IDLE).dx).toBe(0);
  });

  it('flinches back from a hit and flashes white briefly', () => {
    const e = enemy({ vx: 0 });
    const hurt = { ...IDLE, hurtAt: 3 };
    const hit = enemyPose(e, 3, hurt);
    expect(hit.dx).toBeCloseTo(ANIM.flinch.px, 9);
    expect(hit.flash).toBe(1);
    const later = enemyPose(e, 3 + ANIM.flinch.flash, hurt);
    expect(later.flash).toBe(0);
    expect(later.dx).toBeGreaterThan(0);
    expect(enemyPose(e, 3 + ANIM.flinch.time, hurt)).toMatchObject({ dx: 0, flash: 0 });
  });

  it('starts each enemy at its own phase, so a crowd does not bob in lockstep', () => {
    const phases = Array.from({ length: 50 }, (_, id) => phaseOf(id));
    expect(new Set(phases.map((p) => p.toFixed(3))).size).toBe(50);
    for (const p of phases) expect(p >= 0 && p < 1).toBe(true);
    const lifts = Array.from(
      { length: 50 },
      (_, id) => enemyPose(enemy({ id }), 2, striding(40)).lift,
    );
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeGreaterThan(ANIM.bob * 0.8);
  });
});

describe('enemy frames (ID-069)', () => {
  const at = (walked: number, over: Partial<Enemy> = {}) =>
    enemyFrame(enemy({ id: 0, ...over }), 0, striding(walked));

  it('walks 1-2-3-2, two frames a stride, a foot down on each stride frame', () => {
    // Walked from where enemy 0's own phase puts its first footfall.
    const start = -2 * phaseOf(0) * ANIM.stride;
    const half = ANIM.stride / 2;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => at(start + i * half))).toEqual([
      0, 1, 2, 1, 0, 1, 2, 1, 0,
    ]);
    // Footfalls (the bob's low points) land on the stride frames, the top of it on passing.
    const e = enemy({ id: 0 });
    expect(enemyPose(e, 0, striding(start)).lift).toBeCloseTo(0, 9);
    expect(enemyPose(e, 0, striding(start + ANIM.stride)).lift).toBeCloseTo(0, 9);
    expect(enemyPose(e, 0, striding(start + half)).lift).toBeCloseTo(ANIM.bob, 9);
  });

  it('stands on its passing frame when not walking', () => {
    expect(enemyFrame(enemy(), 3, IDLE)).toBe(1);
    // Jostled by the crowd: it has covered ground back and forth, but drifts nowhere.
    const jostled = { walked: 33, moving: 0.3, drift: { x: ANIM.cycles * 0.6, y: -0.5 }, pace: 3 };
    expect(enemyFrame(enemy(), 3, { ...IDLE, gait: jostled })).toBe(1);
  });

  it('stands on its passing frame the moment it stops, not once its drift has faded', () => {
    const a = new Animator();
    let x = 900;
    let t = 0;
    for (; t < 2; t += 1 / 60) a.observe(frame(t, [enemy({ id: 0, x: (x -= 0.5) })]));
    // Walking 30 px/s: it steps. Then it stops dead (at the wall, say).
    a.observe(frame((t += 1 / 60), [enemy({ id: 0, x })]));
    expect(enemyFrame(enemy({ id: 0, x }), t, a.enemy(0))).toBe(1);
    // Paused on that frame, it holds.
    a.observe(frame(t, [enemy({ id: 0, x })]));
    expect(enemyFrame(enemy({ id: 0, x }), t, a.enemy(0))).toBe(1);
  });

  it('shows its attack frame just after it strikes, then walks or stands again', () => {
    for (const kind of Object.keys(ENEMIES) as (keyof typeof ENEMIES)[]) {
      const interval = ENEMIES[kind].attackInterval;
      const hold = Math.min(ANIM.strike.time, interval / 2);
      const e = enemy({ kind, nextAttackAt: 10 + interval });
      expect(enemyFrame(e, 10, IDLE), kind).toBe('attack');
      expect(enemyFrame(e, 10 + hold * 0.99, IDLE), kind).toBe('attack');
      expect(enemyFrame(e, 10 + hold + 1e-6, IDLE), kind).toBe(1);
      expect(enemyFrame(e, 9.99, IDLE), kind).toBe(1);
      // Never more than half its time between blows, so a fast attacker still moves.
      expect(hold, kind).toBeLessThanOrEqual(interval / 2);
    }
    // A fresh enemy, never yet attacking, walks from the start.
    expect(enemyFrame(enemy(), 0, striding(0))).not.toBe('attack');
  });

  /** Frames of enemy 0 walking left at `pace` px/s, fight time moving `speed`× per 60 Hz frame. */
  function walkFrames(pace: number, speed: number, seconds: number) {
    const a = new Animator();
    let x = 1400;
    const frames: (string | number)[] = [];
    for (let i = 0; i <= seconds * 60; i++) {
      const t = (i * speed) / 60;
      if (i > 0) x -= (pace * speed) / 60;
      const e = enemy({ id: 0, x });
      a.observe(frame(t, [e]));
      frames.push(enemyFrame(e, t, a.enemy(0)));
    }
    return frames;
  }
  const changes = (f: unknown[]) => f.filter((v, i) => i > 0 && v !== f[i - 1]).length;

  it('cycles at the pace it walks: twice as fast at twice the pace, half on a trap', () => {
    // Ten seconds at 30 px/s: 15 strides, 30 frame changes (less the start-up).
    const full = changes(walkFrames(30, 1, 10));
    expect(full).toBeGreaterThanOrEqual(28);
    expect(full).toBeLessThanOrEqual(31);
    const slowed = changes(walkFrames(15, 1, 10));
    expect(slowed).toBeGreaterThanOrEqual(13);
    expect(slowed).toBeLessThanOrEqual(16);
    const runner = changes(walkFrames(ENEMIES.runner.speed, 1, 10));
    expect(runner).toBeGreaterThan(full * 2);
  });

  it('keeps pace with game speed and holds still while paused', () => {
    // At 3× the same fight time covers the same ground in a third of the frames.
    const one = changes(walkFrames(30, 1, 6));
    const three = changes(walkFrames(30, 3, 2));
    expect(Math.abs(three - one)).toBeLessThanOrEqual(2);
    // Paused: the fight time stands, so the frame does too, however long the pause.
    const a = new Animator();
    let x = 900;
    for (let i = 0; i <= 60; i++) a.observe(frame(i / 60, [enemy({ id: 0, x: (x -= 0.5) })]));
    const e = enemy({ id: 0, x });
    const held = enemyFrame(e, 1, a.enemy(0));
    for (let i = 0; i < 120; i++) {
      a.observe(frame(1, [e]));
      expect(enemyFrame(e, 1, a.enemy(0))).toBe(held);
    }
  });

  it('never walks on a frozen pose: even the slowest walk shows every walk frame', () => {
    // The slowest walker (a Horror) at its slowest: on researched razor wire in a slow field.
    const speeds = Object.values(ENEMIES).map((k) => k.speed);
    const slowest =
      Math.min(...speeds) * TRAP_RESEARCH['razor-wire'].slow * (1 - CARD.slowField.slow);
    expect(slowest).toBeLessThan(TRAPS.wire.slow * Math.min(...speeds));
    // About 3.7 px/s: a stride each 5.4 s, so over 12 s (after a second's start-up) it steps
    // through every frame, at the pace its feet cover the ground.
    const frames = walkFrames(slowest, 1, 12).slice(60);
    expect(new Set(frames)).toEqual(new Set([0, 1, 2]));
    expect(changes(frames)).toBeGreaterThanOrEqual(3);
  });

  it('holds the passing frame under Reduce motion, but still shows the attack', () => {
    const a = new Animator();
    expect(a.shownFrame(2)).toBe(2);
    a.reduced = true;
    expect([0, 1, 2].map((f) => a.shownFrame(f as 0 | 1 | 2))).toEqual([1, 1, 1]);
    expect(a.shownFrame('attack')).toBe('attack');
  });
});

describe('aiming (ID-069)', () => {
  const gun = (nextShotAt: number, reload = 0) => ({
    nextShotAt,
    reloadedAt: { primary: reload, secondary: 0 },
  });

  it('aims from a shot until shortly after the gun is ready again, else rests', () => {
    expect(aiming(gun(6), 5, { shotAt: -Infinity })).toBe(false);
    expect(aiming(gun(6), 5, { shotAt: 5 })).toBe(true);
    expect(aiming(gun(6), 6 + ANIM.aim.hold, { shotAt: 5 })).toBe(true);
    expect(aiming(gun(6), 6 + ANIM.aim.hold + 0.01, { shotAt: 5 })).toBe(false);
    // A gun being reloaded stays up until the reload is done.
    expect(aiming(gun(5.5, 8), 7.5, { shotAt: 5 })).toBe(true);
    expect(aiming(gun(5.5, 8), 8 + ANIM.aim.hold + 0.01, { shotAt: 5 })).toBe(false);
  });

  /** A survivor firing every `interval` s of fight time while `inRange(t)`, at `speed`×. */
  function squad(
    interval: number,
    inRange: (t: number) => boolean,
    speed: number,
    seconds: number,
  ) {
    const a = new Animator();
    const d = { id: 'a', hp: 30, x: 0, y: 0, ...gun(0) };
    const states: { t: number; aim: boolean }[] = [];
    for (let i = 0; i <= seconds * 60; i++) {
      const t = (i * speed) / 60;
      const shots = [];
      if (inRange(t) && t >= d.nextShotAt) {
        shots.push({ owner: 'a', at: t });
        d.nextShotAt = t + interval;
      }
      a.observe(frame(t, [], { defenders: [d], shots }));
      states.push({ t, aim: aiming(d, t, a.acts('a', [])) });
    }
    return states;
  }

  it('holds the aim through a stream of shots and drops it once nothing is in range', () => {
    const inRange = (t: number) => t >= 1 && t < 4;
    for (const interval of [0.12, 0.5, 2]) {
      const s = squad(interval, inRange, 1, 6);
      expect(
        s.filter((x) => x.t < 1).every((x) => !x.aim),
        String(interval),
      ).toBe(true);
      expect(
        s.filter((x) => x.t >= 1 && x.t < 4).every((x) => x.aim),
        String(interval),
      ).toBe(true);
      expect(s.filter((x) => x.t > 4 + interval + ANIM.aim.hold).every((x) => !x.aim)).toBe(true);
    }
  });

  it('changes pose on fight time alone, so game speed and pause change nothing but pace', () => {
    const inRange = (t: number) => t >= 1 && t < 3;
    const at = (states: { t: number; aim: boolean }[], t: number) =>
      states.find((x) => Math.abs(x.t - t) < 1e-9)!.aim;
    const one = squad(0.5, inRange, 1, 6);
    const three = squad(0.5, inRange, 3, 2);
    for (const t of [0.5, 1, 2, 3, 3.5, 4, 5, 6]) expect(at(three, t), String(t)).toBe(at(one, t));
  });
});

describe('fall', () => {
  it('flashes from the killing blow, tips over, then fades out, gone by the end', () => {
    expect(fallPose(0)).toMatchObject({ rot: 0, alpha: 1, flash: 1 });
    expect(fallPose(ANIM.flinch.flash).flash).toBe(0);
    const tipped = fallPose(ANIM.fall.time - ANIM.fall.fade);
    expect(tipped.rot).toBeCloseTo(Math.PI / 2, 9);
    expect(tipped.alpha).toBeCloseTo(1, 9);
    expect(fallPose(ANIM.fall.time - ANIM.fall.fade / 2).alpha).toBeCloseTo(0.5, 9);
    expect(fallPose(ANIM.fall.time).alpha).toBe(0);
  });
});

describe('defender pose', () => {
  const d = { id: 'a' };

  it('breathes while standing and bobs while walking between posts', () => {
    const stand = [0, 0.6, 1.2].map((t) => defenderPose(d, t, NONE));
    expect(new Set(stand.map((p) => p.sy)).size).toBe(3);
    for (const p of stand) expect(p.lift).toBe(0);
    const lifts = Array.from(
      { length: 20 },
      (_, i) => defenderPose(d, 0, { ...NONE, gait: { ...STANDING, walked: i, moving: 1 } }).lift,
    );
    expect(Math.max(...lifts)).toBeCloseTo(ANIM.bob, 1);
  });

  it('kicks straight back on a shot, from the frame its muzzle flash shows, with no wiggle', () => {
    const kick = defenderPose(d, 5, { ...NONE, shotAt: 5 });
    expect(kick.dx).toBeCloseTo(-ANIM.recoil.px, 9);
    for (const t of [5, 5.03, 5.06, 5.09]) {
      expect(defenderPose(d, t, { ...NONE, shotAt: 5 }).rot).toBe(0);
    }
    expect(defenderPose(d, 5 + ANIM.recoil.time, { ...NONE, shotAt: 5 }).dx).toBe(0);
  });

  it("times the kick to the gun's fire rate: a fast gun's kick ends before its next shot (ID-069)", () => {
    const shot = { ...NONE, shotAt: 5 };
    // A slow gun kicks for the full recoil time.
    const slow = { ...d, nextShotAt: 6 };
    expect(defenderPose(slow, 5 + ANIM.recoil.time * 0.9, shot).dx).toBeLessThan(0);
    // One firing every 0.1 s kicks for 80% of that, done before the next shot.
    const fast = { ...d, nextShotAt: 5.1 };
    expect(defenderPose(fast, 5.04, shot).dx).toBeLessThan(0);
    expect(defenderPose(fast, 5 + 0.1 * ANIM.recoil.share, shot).dx).toBe(0);
    expect(defenderPose(fast, 5.099, shot).dx).toBe(0);
  });

  it('holds still while aiming and breathes at rest (ID-069)', () => {
    const gun = { ...d, nextShotAt: 6, reloadedAt: { primary: 0, secondary: 0 } };
    const firing = { ...NONE, shotAt: 5 };
    const aimed = [5.3, 5.6, 5.9].map((t) => defenderPose(gun, t, firing).sy);
    expect(new Set(aimed)).toEqual(new Set([1]));
    const rest = [9, 9.6, 10.2].map((t) => defenderPose(gun, t, firing).sy);
    expect(new Set(rest).size).toBe(3);
  });

  it('swings forward on a blade or tool strike, over the strike mark', () => {
    const swing = defenderPose(d, 5 + STRIKE_FLASH / 2, { ...NONE, struckAt: 5 });
    expect(swing.rot).toBeCloseTo(ANIM.swing.lean, 9);
    expect(swing.dx).toBeCloseTo(ANIM.swing.px, 9);
    expect(defenderPose(d, 5 + STRIKE_FLASH, { ...NONE, struckAt: 5 }).rot).toBe(
      defenderPose(d, 5 + STRIKE_FLASH, NONE).rot,
    );
  });

  it('flinches back when hit, without a flash', () => {
    const p = defenderPose(d, 2, { ...NONE, hurtAt: 2 });
    expect(p.dx).toBeCloseTo(-ANIM.flinch.px, 9);
    expect(p.flash).toBe(0);
  });

  it('STILL is the identity', () => {
    expect(STILL).toEqual({ dx: 0, lift: 0, rot: 0, sx: 1, sy: 1, alpha: 1, flash: 0 });
  });
});

describe('Animator', () => {
  it('starts a flinch when an enemy loses HP, not on its first frame', () => {
    const a = new Animator();
    a.observe(frame(1, [enemy({ hp: 20 })]));
    expect(a.enemy(1).hurtAt).toBe(-Infinity);
    a.observe(frame(1.1, [enemy({ hp: 14 })]));
    expect(a.enemy(1).hurtAt).toBe(1.1);
  });

  it('twitches under damage every step instead of holding a flinch', () => {
    const a = new Animator();
    let hp = 20;
    const starts = new Set<number>();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      a.observe(frame(t, [enemy({ hp: hp-- })]));
      starts.add(a.enemy(1).hurtAt);
    }
    starts.delete(-Infinity);
    // One second of damage every step: a new flinch each `flinch.time`, not 30.
    expect(starts.size).toBeLessThanOrEqual(Math.ceil(1 / ANIM.flinch.time) + 1);
    expect(starts.size).toBeGreaterThan(1);
  });

  it('keeps a dead enemy falling where it stood, then lets it go', () => {
    const a = new Animator();
    const e = enemy({ x: 321 });
    a.observe(frame(4, [e]));
    a.observe(frame(4.1, []));
    expect(a.corpses).toEqual([{ enemy: e, at: 4.1 }]);
    a.observe(frame(4.1 + ANIM.fall.time - 0.01, []));
    expect(a.corpses).toHaveLength(1);
    a.observe(frame(4.1 + ANIM.fall.time, []));
    expect(a.corpses).toEqual([]);
  });

  it('leaves no body for a Swollen that blew up rather than died (ID-023)', () => {
    const a = new Animator();
    const e = enemy({ kind: 'swollen' });
    a.observe(frame(4, [e]));
    a.observe(frame(4.1, [], { bursts: [{ id: e.id }] }));
    expect(a.corpses).toEqual([]);
  });

  it("remembers each shooter's last shot after the fight drops it with its flash", () => {
    const a = new Animator();
    a.observe(frame(2, [], { shots: [{ owner: 'a', at: 2 }] }));
    a.observe(frame(2.1, []));
    expect(a.acts('a', []).shotAt).toBe(2);
    // Kept for the aim, long after the recoil is done; a later shot replaces it.
    a.observe(frame(9, []));
    expect(a.acts('a', []).shotAt).toBe(2);
    a.observe(frame(9.5, [], { shots: [{ owner: 'a', at: 9.5 }] }));
    expect(a.acts('a', []).shotAt).toBe(9.5);
    // A new fight forgets it.
    a.observe(frame(0, []));
    expect(a.acts('a', []).shotAt).toBe(-Infinity);
  });

  it("takes a strike's swing from its owner only, and a defender's hit like an enemy's", () => {
    const a = new Animator();
    a.observe(frame(1, [], { defenders: [{ id: 'a', hp: 30, x: 0, y: 0 }] }));
    a.observe(frame(1.5, [], { defenders: [{ id: 'a', hp: 25, x: 0, y: 0 }] }));
    const strikes = [
      { x: 0, y: 0, at: 1.4, owner: 'a' },
      { x: 0, y: 0, at: 1.5, owner: 'b' },
    ];
    expect(a.acts('a', strikes)).toMatchObject({
      hurtAt: 1.5,
      shotAt: -Infinity,
      struckAt: 1.4,
    });
  });

  /** Lifts of enemy 0 walking left at `pace(t)` px/s for `seconds`, frames at 60 Hz from `t0`. */
  function walkLifts(pace: (t: number) => number, seconds: number, t0 = 0): number[] {
    const a = new Animator();
    let x = 900;
    const lifts: number[] = [];
    for (let i = 0; i <= seconds * 60; i++) {
      const t = t0 + i / 60;
      if (i > 0) x -= pace(t) / 60;
      const e = enemy({ id: 0, x });
      a.observe(frame(t, [e]));
      lifts.push(enemyPose(e, t, a.enemy(0)).lift);
    }
    return lifts;
  }
  /** Footfalls: the lift's low points. */
  const footfalls = (lift: number[]) =>
    lift.filter((l, i) => i > 0 && i < lift.length - 1 && l < lift[i - 1]! && l < lift[i + 1]!)
      .length;

  it('bobs at the pace an enemy actually walks: half as often when a trap halves it', () => {
    // Ten seconds: 30 px/s walks 15 strides, 15 px/s about 7.
    const full = footfalls(walkLifts(() => 30, 10));
    const slowed = footfalls(walkLifts(() => 15, 10));
    expect(full).toBeGreaterThanOrEqual(14);
    expect(full).toBeLessThanOrEqual(16);
    expect(slowed).toBeGreaterThanOrEqual(6);
    expect(slowed).toBeLessThanOrEqual(8);
  });

  it('stays smooth late in a long fight when the pace jitters from step to step', () => {
    // Five minutes in, a pace wobbling 25–35 px/s every frame.
    const lifts = walkLifts((t) => 30 + 5 * Math.sin(t * 977), 5, 300);
    // Under 1 px of walking a frame turns the bob by at most π/20.
    const most = ANIM.bob * (Math.PI / ANIM.stride) * (35 / 60);
    // From half a second in, once the walk has started up.
    for (let i = 31; i < lifts.length; i++) {
      expect(Math.abs(lifts[i]! - lifts[i - 1]!)).toBeLessThanOrEqual(most + 1e-9);
    }
  });

  it('does not walk when only jostled by the crowd', () => {
    const a = new Animator();
    let x = 500;
    let t = 0;
    for (let i = 0; i < 120; i++, t += 1 / 60) {
      x += i % 2 ? 0.05 : -0.05; // 3 px/s each way
      const e = enemy({ id: 0, x });
      a.observe(frame(t, [e]));
      expect(a.enemy(0).gait.moving).toBe(0);
      expect(enemyPose(e, t, a.enemy(0)).lift).toBe(0);
      // Nor step: the jostle back and forth drifts nowhere (ID-069).
      expect(enemyFrame(e, t, a.enemy(0))).toBe(1);
    }
  });

  it('settles from a walk to standing over a moment, never in one frame', () => {
    const a = new Animator();
    let x = 900;
    let t = 0;
    for (; t < 1; t += 1 / 60) {
      x -= 0.5;
      a.observe(frame(t, [enemy({ id: 0, x })]));
    }
    expect(a.enemy(0).gait.moving).toBeCloseTo(1, 2);
    a.observe(frame(t, [enemy({ id: 0, x })]));
    const first = a.enemy(0).gait.moving;
    expect(first).toBeGreaterThan(0.8);
    for (let i = 0; i < 60; i++) a.observe(frame((t += 1 / 60), [enemy({ id: 0, x })]));
    expect(a.enemy(0).gait.moving).toBeLessThan(0.01);
    // Paused (the same fight time), it holds where it was.
    const held = a.enemy(0).gait;
    a.observe(frame(t, [enemy({ id: 0, x })]));
    expect(a.enemy(0).gait).toEqual(held);
  });

  it('starts afresh when the fight time runs back (a new fight)', () => {
    const a = new Animator();
    a.observe(frame(50, [enemy()]));
    a.observe(frame(50.1, []));
    expect(a.corpses).toHaveLength(1);
    a.observe(frame(0, [enemy({ hp: 5 })]));
    expect(a.corpses).toEqual([]);
    expect(a.enemy(1).hurtAt).toBe(-Infinity);
  });
});

describe('Reduce motion (ID-039)', () => {
  it('holds sprites still but keeps the hit flash and the fade', () => {
    const a = new Animator();
    const moving = { ...STILL, dx: 3, lift: 2, rot: 0.4, sx: 1.1, sy: 0.9, alpha: 0.5, flash: 0.7 };
    expect(a.shown(moving)).toBe(moving);
    a.reduced = true;
    expect(a.shown(moving)).toEqual({ ...STILL, alpha: 0.5, flash: 0.7 });
    expect(a.shown(fallPose(0.2)).rot).toBe(0);
  });
});
