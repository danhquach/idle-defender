// Design §15 (ID-049): sprites move from fight state alone, and the animator remembers hits,
// shots and deaths between frames.
import { describe, expect, it } from 'vitest';
import { ENEMIES, STRIKE_FLASH } from '../core/data.ts';
import type { Enemy } from '../core/horde.ts';
import {
  ANIM,
  Animator,
  defenderPose,
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
const striding = (walked: number): EnemyActs => ({ ...IDLE, gait: { walked, moving: 1 } });

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
  it('bobs once per stride walked and leans side to side, the lean swinging back each stride', () => {
    const e = enemy({ id: 0 });
    const at = (walked: number) => enemyPose(e, 0, striding(walked));
    const lifts = Array.from({ length: 41 }, (_, i) => at((ANIM.stride * i) / 40).lift);
    expect(Math.max(...lifts)).toBeCloseTo(ANIM.bob, 1);
    expect(lifts[0]).toBeCloseTo(lifts[40]!, 9);
    const leans = Array.from({ length: 81 }, (_, i) => at((ANIM.stride * i) / 40).rot);
    expect(Math.max(...leans)).toBeGreaterThan(ANIM.sway * 0.99);
    expect(at(ANIM.stride * 0.5).rot).toBeCloseTo(-at(ANIM.stride * 1.5).rot, 9);
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
    const mid = enemyPose(e, attackedAt + ANIM.lunge.time / 2, IDLE);
    expect(mid.dx).toBeCloseTo(-ANIM.lunge.px, 9);
    expect(mid.rot).toBeLessThan(0);
    expect(enemyPose(e, attackedAt + ANIM.lunge.time, IDLE).dx).toBe(0);
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
      (_, i) => defenderPose(d, 0, { ...NONE, gait: { walked: i, moving: 1 } }).lift,
    );
    expect(Math.max(...lifts)).toBeCloseTo(ANIM.bob, 1);
  });

  it('kicks back on a shot, from the frame its muzzle flash shows', () => {
    const kick = defenderPose(d, 5, { ...NONE, shotAt: 5 });
    expect(kick.dx).toBeCloseTo(-ANIM.recoil.px, 9);
    expect(kick.rot).toBeLessThan(0);
    expect(defenderPose(d, 5 + ANIM.recoil.time, { ...NONE, shotAt: 5 }).dx).toBe(0);
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

  it('remembers a shot for the recoil after the fight drops it with its flash', () => {
    const a = new Animator();
    a.observe(frame(2, [], { shots: [{ owner: 'a', at: 2 }] }));
    a.observe(frame(2.1, []));
    expect(a.acts('a', []).shotAt).toBe(2);
    a.observe(frame(2 + ANIM.recoil.time, []));
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
