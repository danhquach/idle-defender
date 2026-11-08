// ID-110: each kill picks one of several deaths from the fight's seed, never Math.random.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENEMIES, type EnemyKind } from '../core/data.ts';
import { ANIM } from './anim.ts';
import {
  CUTS,
  DEATH,
  deathOf,
  deathPose,
  deathsOf,
  dyingLeft,
  dustOf,
  limbFlight,
  sprayOf,
  type Death,
} from './death.ts';
import { ENEMY_ART } from './sprites.ts';

const KINDS = Object.keys(ENEMIES) as EnemyKind[];
const DEATHS: Death[] = ['back', 'face', 'limb', 'head', 'boss'];

/** A bundled sprite's size in px, from its PNG header. */
function sizeOf(id: string): { w: number; h: number } {
  const png = readFileSync(new URL(`../assets/art/${id}.png`, import.meta.url));
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

afterEach(() => vi.restoreAllMocks());

describe('picking a death', () => {
  it('gives the boss its own death and every other kind all four', () => {
    expect(deathsOf('horror')).toEqual(['boss']);
    for (const kind of KINDS.filter((k) => k !== 'horror')) {
      expect(deathsOf(kind), kind).toEqual(['back', 'face', 'limb', 'head']);
    }
  });

  it('gives the same seed and enemy the same death, through the seeded RNG only', () => {
    const random = vi.spyOn(Math, 'random');
    const run = (seed: number) =>
      Array.from({ length: 50 }, (_, id) => deathOf(seed, { id, kind: 'shambler' }));
    expect(run(1234)).toEqual(run(1234));
    expect(run(1234)).not.toEqual(run(1235));
    expect(random).not.toHaveBeenCalled();
  });

  it('spreads a crowd evenly over the four deaths', () => {
    const counts = new Map<Death, number>();
    for (let id = 0; id < 2000; id++) {
      const d = deathOf(99, { id, kind: 'runner' });
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(['back', 'face', 'head', 'limb']);
    for (const n of counts.values()) expect(n / 2000).toBeGreaterThan(0.2);
  });

  it('gives neighbouring enemies varied deaths in every fight, not one death for all', () => {
    for (const seed of [0, 1, 7, 0xffffffff]) {
      const ten = new Set(
        Array.from({ length: 10 }, (_, id) => deathOf(seed, { id, kind: 'brute' })),
      );
      expect(ten.size, String(seed)).toBeGreaterThan(1);
    }
  });
});

describe('death poses', () => {
  it('each flashes from the killing blow, then is gone in about a second', () => {
    for (const d of DEATHS) {
      const time = DEATH.time[d];
      expect(time, d).toBeLessThanOrEqual(1);
      // The animator keeps a corpse for the longest death.
      expect(time, d).toBeLessThanOrEqual(ANIM.fall.time);
      expect(deathPose(d, 0), d).toMatchObject({ alpha: 1, flash: 1 });
      expect(deathPose(d, ANIM.flinch.flash).flash, d).toBe(0);
      expect(deathPose(d, time - DEATH.fade).alpha, d).toBeCloseTo(1, 9);
      expect(deathPose(d, time - DEATH.fade / 2).alpha, d).toBeCloseTo(0.5, 9);
      expect(deathPose(d, time).alpha, d).toBe(0);
    }
    expect(Math.max(...DEATHS.map((d) => DEATH.time[d]))).toBe(ANIM.fall.time);
  });

  it('falls back, forward onto its front, or the way each death goes, flat as it fades', () => {
    const flat = (d: Death) => deathPose(d, DEATH.time[d] - DEATH.fade).rot;
    expect(flat('back')).toBeCloseTo(Math.PI / 2, 9);
    expect(flat('face')).toBeCloseTo(-Math.PI / 2, 9);
    expect(flat('limb')).toBeCloseTo(-Math.PI / 2, 9);
    expect(flat('head')).toBeCloseTo(Math.PI / 2, 9);
    expect(flat('boss')).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('staggers back when it loses a limb before it falls', () => {
    const reeling = deathPose('limb', DEATH.limb.reel / 2);
    expect(reeling.dx).toBeCloseTo(DEATH.limb.stagger, 9);
    expect(reeling.rot).toBe(0);
    expect(deathPose('limb', DEATH.limb.reel).dx).toBeCloseTo(0, 9);
  });

  it('stands a moment headless before it drops', () => {
    expect(deathPose('head', DEATH.head.stand).rot).toBe(0);
    expect(deathPose('head', DEATH.head.stand + 0.1).rot).toBeGreaterThan(0);
  });

  it('sinks the boss to its knees, buckling forward, then lets it fall', () => {
    const knelt = deathPose('boss', DEATH.boss.kneel);
    expect(knelt.sy).toBeCloseTo(1 - DEATH.boss.sink, 9);
    expect(knelt.rot).toBeCloseTo(-DEATH.boss.lean, 9);
    expect(deathPose('boss', 0)).toMatchObject({ sy: 1, rot: 0 });
    expect(deathPose('boss', DEATH.boss.kneel + 0.2).rot).toBeLessThan(-DEATH.boss.lean);
  });
});

describe('how long the dying have left', () => {
  const at = (id: number, kind: EnemyKind, died: number) => ({ enemy: { id, kind }, at: died });
  it('waits for the last one to finish its own death, and none for none', () => {
    expect(dyingLeft(5, 10, [], false)).toBe(0);
    const boss = at(1, 'horror', 9.8);
    expect(dyingLeft(5, 10, [boss], false)).toBeCloseTo(DEATH.time.boss - 0.2, 9);
    const shambler = at(2, 'shambler', 10);
    const own = DEATH.time[deathOf(5, shambler.enemy)];
    expect(dyingLeft(5, 10, [boss, shambler], false)).toBeCloseTo(Math.max(own, 0.8), 9);
    // Long done: nothing to wait for.
    expect(dyingLeft(5, 10, [at(3, 'runner', 7)], false)).toBe(0);
  });

  it('with Reduce motion, waits only for the plain death', () => {
    expect(dyingLeft(5, 10, [at(1, 'horror', 10)], true)).toBe(DEATH.time.back);
  });
});

describe('gore', () => {
  it('bursts the spray, breaks it up, and is gone before the body', () => {
    expect(sprayOf(-0.01)).toBeNull();
    expect(sprayOf(0)).toEqual({ art: DEATH.art.spray, alpha: 1, grow: 0.6 });
    expect(sprayOf(DEATH.head.burst)).toEqual({ art: DEATH.art.breakup, alpha: 1, grow: 1 });
    expect(sprayOf((DEATH.head.burst + DEATH.head.spray) / 2)!.alpha).toBeCloseTo(0.5, 9);
    expect(sprayOf(DEATH.head.spray)).toBeNull();
    expect(DEATH.head.spray).toBeLessThan(DEATH.time.head);
  });

  it('flies the limb to the ground, where it stays', () => {
    expect(limbFlight(0)).toEqual({ u: 0, spin: 0 });
    expect(limbFlight(DEATH.limb.fly)).toEqual({ u: 1, spin: DEATH.limb.spin });
    expect(limbFlight(DEATH.time.limb)).toEqual(limbFlight(DEATH.limb.fly));
  });

  it("raises the boss's dust just before it lands, fading by the end", () => {
    const from = DEATH.time.boss - DEATH.fade - DEATH.boss.early;
    expect(dustOf(from - 0.01)).toBeNull();
    expect(dustOf(from)!.alpha).toBe(DEATH.boss.puff);
    // Its outline still shows through the dust.
    expect(DEATH.boss.puff).toBeLessThanOrEqual(0.8);
    expect(dustOf(DEATH.time.boss)).toBeNull();
  });
});

describe('cuts', () => {
  it("fit inside each kind's corpse frame, the head above its middle", () => {
    for (const kind of KINDS) {
      const cuts = CUTS[kind];
      if (!cuts) continue;
      const { w, h } = sizeOf(ENEMY_ART[kind].walk[1]);
      for (const [name, cut] of Object.entries(cuts)) {
        expect(cut.poly.length, `${kind} ${name}`).toBeGreaterThanOrEqual(3);
        for (const [x, y] of [...cut.poly, cut.at]) {
          expect(x, `${kind} ${name}`).toBeGreaterThanOrEqual(0);
          expect(x, `${kind} ${name}`).toBeLessThanOrEqual(w);
          expect(y, `${kind} ${name}`).toBeGreaterThanOrEqual(0);
          expect(y, `${kind} ${name}`).toBeLessThanOrEqual(h);
        }
      }
      expect(Math.min(...cuts.head.poly.map((p) => p[1])), kind).toBeLessThan(h / 2);
    }
  });
});
