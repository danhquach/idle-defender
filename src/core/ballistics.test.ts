// Design §6 Ballistics (ID-044): gun shots are bullets that fly, hit by collision and can miss.
import { describe, expect, it } from 'vitest';
import { buildTurret, newBase } from './base.ts';
import {
  ENEMY_RADIUS,
  GUNNER,
  IMPACT_FLASH,
  MUZZLE_FLASH,
  PIERCE,
  STEP,
  TURRET,
  WEAPONS,
} from './data.ts';
import { leadPoint, newHorde, tick, type Bullet, type HordeState } from './horde.ts';
import { loadoutFrom } from './loadout.ts';
import { spreadOf } from './stats.ts';
import { enemy, landed, setup } from './testing.ts';

/** Horde 1 with nothing left to spawn; defender a on the upper tower (420, 360). */
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  return s;
}
/** As `quiet`, but a never fires: only hand-placed bullets fly. */
function holding(): HordeState {
  const s = quiet();
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
/** A bullet at `(x, y)` heading along +x unless told otherwise. */
function bullet(s: HordeState, b: Partial<Bullet>): Bullet {
  const made: Bullet = {
    x: 420,
    y: 360,
    dx: 1,
    dy: 0,
    speed: 1800,
    damage: 6,
    owner: 'a',
    fromX: 420,
    fromY: 360,
    aim: 400,
    left: 600,
    pierce: 0,
    hit: [],
    tracer: WEAPONS.pistol.tracer,
    ...b,
  };
  s.bullets.push(made);
  return made;
}
const hpOf = (s: HordeState, id: number): number | undefined =>
  s.enemies.find((e) => e.id === id)?.hp;

describe('bullets in flight', () => {
  it('take time to arrive: no damage at the trigger, the hit lands when the bullet reaches the body', () => {
    const s = quiet();
    // 368 px to the body's edge: inside the Gunner's ±1.25° cone at that range.
    const e = enemy(s, { hp: 1000, maxHp: 1000, x: 800, y: 360, stunnedUntil: 9 });
    const fired = tick(s, STEP);
    expect(hpOf(fired, e.id)).toBe(1000);
    expect(fired.bullets).toHaveLength(1);
    // At 1,800 px/s that is 0.2 s: the hit lands in step 7.
    const steps = (800 - ENEMY_RADIUS - 420) / (WEAPONS.pistol.speed * STEP);
    let t = fired;
    let n = 1;
    while (hpOf(t, e.id) === 1000 && n < 30) {
      t = tick(t, STEP);
      n += 1;
    }
    expect(n).toBe(Math.ceil(steps));
    expect(hpOf(t, e.id)).toBe(1000 - WEAPONS.pistol.damage);
  });

  it('hit once and are gone', () => {
    const s = holding();
    const e = enemy(s, { hp: 100, maxHp: 100, x: 500, y: 360, stunnedUntil: 9 });
    bullet(s, {});
    const after = landed(s);
    expect(hpOf(after, e.id)).toBe(94);
    expect(hpOf(tick(after, 1), e.id)).toBe(94);
  });

  it("never tunnel: a bullet faster than an enemy's body per step still hits it", () => {
    const s = holding();
    const e = enemy(s, { hp: 100, maxHp: 100, x: 700, y: 360, stunnedUntil: 9 });
    // 30,000 px/s: 1,000 px a step, far more than the 24 px body.
    bullet(s, { speed: 30_000, left: 2000 });
    const after = tick(s, STEP);
    expect(hpOf(after, e.id)).toBe(94);
    expect(after.bullets).toEqual([]);
  });

  it('hit the first enemy in their path, not the one they were aimed at', () => {
    const s = holding();
    const front = enemy(s, { hp: 100, maxHp: 100, x: 550, y: 360, stunnedUntil: 9 });
    const back = enemy(s, { hp: 100, maxHp: 100, x: 650, y: 360, stunnedUntil: 9 });
    bullet(s, { aim: 230 });
    const after = landed(s);
    expect(hpOf(after, front.id)).toBe(94);
    expect(hpOf(after, back.id)).toBe(100);
  });

  it('fly on when their target dies first, and can hit another enemy behind it', () => {
    const s = holding();
    const target = enemy(s, { hp: 100, maxHp: 100, x: 600, y: 360, stunnedUntil: 9 });
    const behind = enemy(s, { hp: 100, maxHp: 100, x: 800, y: 360, stunnedUntil: 9 });
    bullet(s, {});
    // The target dies before the bullet gets there.
    s.enemies.find((e) => e.id === target.id)!.hp = 0;
    const after = landed(s);
    expect(hpOf(after, target.id)).toBeUndefined();
    expect(hpOf(after, behind.id)).toBe(94);
  });

  it('fall with no damage past their range', () => {
    const s = holding();
    const out = enemy(s, { hp: 100, maxHp: 100, x: 420 + 300, y: 360, stunnedUntil: 9 });
    bullet(s, { left: 300 - ENEMY_RADIUS - 1 });
    const after = landed(s);
    expect(after.bullets).toEqual([]);
    expect(hpOf(after, out.id)).toBe(100);
  });

  it('pass over walls, gates and defenders, never damaging the camp', () => {
    const s = holding();
    // Straight down the wall line from the top, over every segment and post of layer 0.
    bullet(s, { x: 510, y: 0, dx: 0, dy: 1, left: 800 });
    const before = structuredClone(s.layers);
    const after = landed(s);
    expect(after.layers).toEqual(before);
    expect(after.defenders[0]!.hp).toBe(s.defenders[0]!.hp);
  });

  it('pierce: through the first enemy to the next within 200 px, then stop', () => {
    const s = holding();
    const ids = [550, 600, 650].map(
      (x) => enemy(s, { hp: 100, maxHp: 100, x, y: 360, stunnedUntil: 9 }).id,
    );
    bullet(s, { pierce: 1 });
    const after = landed(s);
    expect(ids.map((id) => hpOf(after, id))).toEqual([94, 94, 100]);
    // The first hit is at its body's edge (538); the next body starts 210 px on: out of reach.
    const far = holding();
    const first = enemy(far, { hp: 100, maxHp: 100, x: 550, y: 360, stunnedUntil: 9 }).id;
    const beyond = enemy(far, {
      hp: 100,
      maxHp: 100,
      x: 538 + PIERCE.reach + 10 + ENEMY_RADIUS,
      y: 360,
      stunnedUntil: 9,
    }).id;
    bullet(far, { pierce: 1 });
    const done = landed(far);
    expect([hpOf(done, first), hpOf(done, beyond)]).toEqual([94, 100]);
  });

  it('are cleared when the horde ends, with their flashes and impacts', () => {
    const s = holding();
    s.wave = s.waveCount;
    bullet(s, { left: 600 });
    s.shots.push({ owner: 'a', at: 0 });
    s.impacts.push({ x: 500, y: 360, hit: true, at: 0 });
    const after = tick(s, STEP);
    expect(after.outcome).toBe('won');
    expect(after.bullets).toEqual([]);
    expect(after.shots).toEqual([]);
    expect(after.impacts).toEqual([]);
  });
});

describe('aiming', () => {
  it('leads a moving target: aims where it will be when the bullet arrives', () => {
    const e = { x: 800, y: 360, vx: -30, vy: 0 } as Parameters<typeof leadPoint>[2];
    const p = leadPoint(420, 360, e, 1800);
    const t = Math.hypot(p.x - 420, p.y - 360) / 1800;
    expect(p.x).toBeCloseTo(800 - 30 * t, 9);
    expect(p.y).toBe(360);
    const still = leadPoint(420, 360, { ...e, vx: 0 }, 1800);
    expect(still).toEqual({ x: 800, y: 360 });
  });

  it('a fired bullet is aimed at the lead point, not at where the enemy stands', () => {
    const s = quiet();
    // Moving down the field at 150 px/s: over the 0.15 s flight it goes 23 px, about 4.7°
    // off the straight line from the post, far outside the Gunner's ±1.25° cone.
    const e = enemy(s, { hp: 1000, maxHp: 1000, x: 700, y: 360, vy: 150 });
    const b = tick(s, STEP).bullets[0]!;
    const deg = (y: number, x: number): number => (Math.atan2(y, x) * 180) / Math.PI;
    const heading = deg(b.dy, b.dx);
    const lead = leadPoint(420, 360, e, WEAPONS.pistol.speed);
    const cone = WEAPONS.pistol.spread * GUNNER.spread;
    expect(Math.abs(heading - deg(lead.y - 360, lead.x - 420))).toBeLessThanOrEqual(cone + 1e-9);
    expect(Math.abs(heading - deg(e.y - 360, e.x - 420))).toBeGreaterThan(cone);
  });

  it('hits a Shambler walking straight', () => {
    const s = quiet();
    // Below and to the side, within the Gunner's cone at about 350 px.
    const e = enemy(s, { hp: 1000, maxHp: 1000, x: 700, y: 560 });
    let t = tick(s, 0.5); // walking for a while, so its velocity is known
    const hp = hpOf(t, e.id)!;
    t = landed(tick(t, 1));
    expect(hpOf(t, e.id)).toBeLessThan(hp);
  });

  it('misses an enemy that changes lane after the shot', () => {
    const s = holding();
    const e = enemy(s, { hp: 100, maxHp: 100, x: 900, y: 360, vx: 0, vy: 0, stunnedUntil: 9 });
    const fired = tick(s, STEP);
    bullet(fired, { x: 420, y: 360, left: 700 });
    // It steps 40 px up the field while the bullet flies.
    fired.enemies.find((x) => x.id === e.id)!.y = 320;
    expect(hpOf(landed(fired), e.id)).toBe(100);
  });

  it("spread: the gun's cone, halved for a Gunner, rolled only through the seeded RNG", () => {
    const gunner = { loadout: loadoutFrom('pistol') };
    const engineer = { loadout: loadoutFrom('toolkit') };
    expect(spreadOf(engineer, 'pistol')).toBe(WEAPONS.pistol.spread);
    expect(spreadOf(gunner, 'pistol')).toBe(WEAPONS.pistol.spread * GUNNER.spread);
    // Same seed, same headings; another seed turns the shot differently, within the cone.
    const heading = (seed: number): number => {
      const s = newHorde(seed, { ...setup(), base: newBase() });
      s.toSpawn = 0;
      enemy(s, { hp: 1000, maxHp: 1000, x: 900, y: 360, stunnedUntil: 9 });
      const b = tick(s, STEP).bullets[0]!;
      return (Math.atan2(b.dy, b.dx) * 180) / Math.PI;
    };
    expect(heading(7)).toBe(heading(7));
    const cone = WEAPONS.pistol.spread * GUNNER.spread;
    const all = [1, 2, 3, 4, 5, 6, 7, 8].map(heading);
    for (const h of all) expect(Math.abs(h)).toBeLessThanOrEqual(cone + 1e-9);
    expect(new Set(all).size).toBeGreaterThan(1);
  });
});

describe('turret bullets', () => {
  it('a turret fires a bullet at 2,000 px/s that lands for its damage', () => {
    const rich = { scrap: 999, wood: 999, metal: 0, concrete: 0 };
    const built = buildTurret(newBase(), rich, true, 'tower', 0, 5);
    if (!built.ok) throw new Error(built.reason);
    const s = newHorde(1, { ...setup(), base: built.base });
    s.toSpawn = 0;
    s.defenders[0]!.nextShotAt = 1e9;
    const e = enemy(s, { hp: 100, maxHp: 100, x: 800, y: 440, stunnedUntil: 9 });
    const fired = tick(s, STEP);
    expect(fired.bullets).toEqual([
      expect.objectContaining({
        owner: 'turret:0',
        speed: TURRET.speed,
        damage: TURRET.damage,
        tracer: TURRET.tracer,
      }),
    ]);
    expect(fired.shots).toEqual([{ owner: 'turret:0', at: STEP }]);
    expect(hpOf(fired, e.id)).toBe(100);
    expect(hpOf(landed(fired), e.id)).toBe(100 - TURRET.damage);
  });
});

// Design §15 (ID-045): what the renderer needs to draw shots, recorded by the fight.
describe('shots and impacts', () => {
  it("a gun going off is a shot by its owner for MUZZLE_FLASH s, its bullet in its gun's tracer", () => {
    const s = quiet();
    enemy(s, { hp: 1000, maxHp: 1000, x: 800, y: 360, stunnedUntil: 9 });
    s.defenders[0]!.loadout.secondary = 'knife'; // never in reach from the tower
    const fired = tick(s, STEP);
    // Stamped with the time the fight shows next, so its first frame shows it new.
    expect(fired.shots).toEqual([{ owner: 'a', at: fired.time }]);
    expect(fired.bullets[0]!.tracer).toEqual(WEAPONS.pistol.tracer);
    // Pruned once it is MUZZLE_FLASH old, while the next shot is not due yet.
    let t = fired;
    while (t.time - fired.time < MUZZLE_FLASH) t = tick(t, STEP);
    t = tick(t, STEP);
    expect(t.shots).toEqual([]);
  });

  it('a hit leaves an impact on the body, a pierce one per enemy, for IMPACT_FLASH s', () => {
    const s = holding();
    const e = enemy(s, { hp: 100, maxHp: 100, x: 500, y: 360, stunnedUntil: 9 });
    bullet(s, {});
    const after = landed(s);
    expect(after.impacts).toEqual([
      { x: 500 - ENEMY_RADIUS, y: 360, hit: true, at: expect.any(Number) },
    ]);
    expect(hpOf(after, e.id)).toBe(94);

    const p = holding();
    enemy(p, { hp: 100, maxHp: 100, x: 500, y: 360, stunnedUntil: 9 });
    enemy(p, { hp: 100, maxHp: 100, x: 600, y: 360, stunnedUntil: 9 });
    bullet(p, { pierce: 1 });
    expect(landed(p).impacts.map((i) => [i.x, i.hit])).toEqual([
      [500 - ENEMY_RADIUS, true],
      [600 - ENEMY_RADIUS, true],
    ]);

    let t = after;
    const at = t.impacts[0]!.at;
    while (t.time - at < IMPACT_FLASH) t = tick(t, STEP);
    t = tick(t, STEP);
    expect(t.impacts).toEqual([]);
  });

  it('a miss leaves dust where it fell past its range', () => {
    const s = holding();
    bullet(s, { left: 300 });
    const after = landed(s);
    expect(after.bullets).toEqual([]);
    expect(after.impacts).toHaveLength(1);
    expect(after.impacts[0]).toMatchObject({ y: 360, hit: false });
    expect(after.impacts[0]!.x).toBeCloseTo(420 + 300, 6);
  });
});
