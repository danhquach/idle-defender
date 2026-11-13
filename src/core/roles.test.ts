// Gun roles (ID-101, design Part 4): a built-in trait per gun, and role affixes only it rolls.
import { describe, expect, it } from 'vitest';
import {
  affixBounds,
  affixesFor,
  affixRange,
  gunCrit,
  gunCritDamage,
  gunPower,
  isRoleAffix,
  roleOf,
  rollWeapon,
  statsOf,
  type OwnedWeapon,
} from './armoury.ts';
import {
  AFFIXES,
  BRUTE,
  FIELD,
  CRIT_DAMAGE,
  GUN_ROLES,
  HORROR,
  STEP,
  TRAIT,
  WEAPONS,
  type AffixId,
  type WeaponId,
} from './data.ts';
import {
  hitDamage,
  newHorde,
  reloadIn,
  tick,
  wallFront,
  type Bullet,
  type Enemy,
  type HordeState,
} from './horde.ts';
import { createRng } from './rng.ts';
import { enemy, landed, setup } from './testing.ts';

const SHOOTERS = [
  'pistol',
  'smg',
  'rifle',
  'shotgun',
  'lmg',
  'sniper',
  'handcannon',
  'machinepistol',
  'assault',
  'cartridge',
] as const;
const GENERAL: AffixId[] = ['damage', 'fireRate', 'magazine', 'reload', 'pierce'];
const owned = (base: WeaponId, affixes: OwnedWeapon['affixes'] = []): OwnedWeapon => ({
  uid: 'h1',
  base,
  rarity: 'common',
  affixes,
});

/** Horde 1 with nothing left to spawn; defender a never fires. */
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
/** A bullet flying right from `(x, y)` with `b`'s marks: it hits what stands in front of it. */
function shoot(s: HordeState, b: Partial<Bullet> & Pick<Bullet, 'x' | 'y'>): void {
  s.bullets.push({
    dx: 1,
    dy: 0,
    speed: 1800,
    damage: 10,
    owner: 'a',
    fromX: b.x,
    fromY: b.y,
    aim: 100,
    left: 1000,
    pierce: 0,
    hit: [],
    tracer: WEAPONS.pistol.tracer,
    ...b,
  });
}
function steps(s: HordeState, n: number): HordeState {
  let t = s;
  for (let i = 0; i < n; i++) t = tick(t, STEP);
  return t;
}
const find = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)!;
/** Horde 1, nothing to spawn: a plain survivor `a` alone on post 0 with `base`, so raw gun numbers. */
function solo(base: WeaponId, affixes: OwnedWeapon['affixes'] = [], seed = 1): HordeState {
  const s = newHorde(seed, {
    ...setup(),
    roster: [
      {
        id: 'a',
        name: 'A',
        loadout: { primary: owned(base, affixes), secondary: null, item: null },
        plain: true,
      },
    ],
  });
  s.toSpawn = 0;
  return s;
}
/** A target that never moves or dies, in range of post 0, `ahead` px past the wall's front. */
const dummy = (s: HordeState, ahead: number, kind: Enemy['kind'] = 'shambler') =>
  enemy(s, { kind, x: wallFront(s) + ahead, y: 360, hp: 1e9, maxHp: 1e9, stunnedUntil: 1e9 });
/** The fight times the first `n` shots of `s`'s survivor go off (its ammo drops), with its nextShotAt after each. */
function shotLog(s: HordeState, seconds: number): { at: number; next: number; burst: number }[] {
  const log: { at: number; next: number; burst: number }[] = [];
  let t = s;
  let ammo = t.defenders[0]!.ammo.primary;
  for (let i = 0; i < seconds / STEP; i++) {
    t = tick(t, STEP);
    const d = t.defenders[0]!;
    if (d.ammo.primary < ammo) log.push({ at: t.time, next: d.nextShotAt, burst: d.burst ?? 0 });
    ammo = d.ammo.primary;
  }
  return log;
}

describe('roles and traits', () => {
  it('every gun has a role and a trait; blades and tools have none', () => {
    for (const g of SHOOTERS) {
      expect(roleOf(g)).toEqual(GUN_ROLES[g]);
      expect(GUN_ROLES[g].role.length).toBeGreaterThan(0);
      expect(GUN_ROLES[g].trait.length).toBeGreaterThan(0);
    }
    expect(roleOf('knife')).toBeNull();
    expect(roleOf('toolkit')).toBeNull();
  });

  it('Pistol: the fastest reload of any gun ', () => {
    for (const g of SHOOTERS.filter((g) => g !== 'pistol')) {
      expect(WEAPONS.pistol.reload, g).toBeLessThan(WEAPONS[g].reload);
    }
  });

  it('crit trait by gun (ID-135): Carbine +10%, Assault +5%, LMG +8%, Sniper +20%; the rest add none', () => {
    expect(gunCrit(owned('rifle'))).toBeCloseTo(0.1);
    expect(gunCrit(owned('assault'))).toBeCloseTo(0.05);
    expect(gunCrit(owned('lmg'))).toBeCloseTo(0.08);
    expect(gunCrit(owned('sniper'))).toBeCloseTo(0.2);
    expect(TRAIT.crit).toEqual({ rifle: 0.1, assault: 0.05, lmg: 0.08, sniper: 0.2 });
    for (const g of ['smg', 'shotgun', 'cartridge', 'handcannon', 'machinepistol'] as const) {
      expect(gunCrit(owned(g)), g).toBe(0);
    }
    expect(gunCrit('pistol')).toBe(0);
    // Crit damage: only the Sniper rifle's trait adds to the ×2.
    expect(gunCritDamage(owned('sniper'))).toBeCloseTo(TRAIT.sniper.critDamage);
    for (const g of ['pistol', 'rifle', 'lmg', 'assault'] as const) {
      expect(gunCritDamage(owned(g)), g).toBe(0);
    }
  });

  it('LMG: its +8% crit shows in real shots, and the slow trait is gone', () => {
    // A plain survivor has no crit of its own, so the share of crit first shots is the gun's.
    let crits = 0;
    const seeds = 600;
    for (let seed = 1; seed <= seeds; seed++) {
      const s = solo('lmg', [], seed);
      dummy(s, 150);
      if (tick(s, STEP).bullets[0]!.crit) crits++;
    }
    // ±3.5 standard deviations of 8% over 600 shots is about ±0.039.
    expect(crits / seeds).toBeGreaterThan(TRAIT.crit.lmg - 0.039);
    expect(crits / seeds).toBeLessThan(TRAIT.crit.lmg + 0.039);
    const bullet = tick(
      (() => {
        const s = solo('lmg');
        dummy(s, 150);
        return s;
      })(),
      STEP,
    ).bullets[0]!;
    expect('slow' in bullet).toBe(false);
    expect('stagger' in bullet).toBe(false);
    expect(roleOf('lmg')?.trait).toMatch(/crit/);
  });

  it('Carbine: fires 3-round bursts, 0.08 s apart, then waits so a shot still averages its fire interval', () => {
    const w = WEAPONS.rifle;
    expect(w.burst).toEqual({ rounds: 3, gap: 0.08 });
    const s = solo('rifle');
    dummy(s, 150);
    const log = shotLog(s, 9);
    expect(log.length).toBeGreaterThanOrEqual(21);
    // The wait set after each shot: the gap inside a burst, the rest of the burst's time after its third.
    const waits = log.slice(1).map((k, i) => k.next - log[i]!.next);
    const long = 3 * w.fireInterval - 2 * w.burst.gap;
    // Shot k+1's stored wait is the wait after shot k+1: gap, gap, long, gap, gap, long …
    waits.slice(0, 18).forEach((wait, i) => {
      expect(wait, `shot ${i + 2}`).toBeCloseTo(i % 3 === 1 ? long : w.burst.gap, 9);
    });
    // The shots themselves go off in threes: close pairs, then a long pause.
    const gaps = log.slice(1, 19).map((k, i) => k.at - log[i]!.at);
    gaps.forEach((gap, i) => {
      const want = i % 3 === 2 ? long : w.burst.gap;
      expect(Math.abs(gap - want), `gap ${i + 1} ${gap}`).toBeLessThanOrEqual(STEP + 1e-9);
    });
    // Over 6 whole bursts the average is the fire interval, with no drift.
    expect((log[18]!.at - log[0]!.at) / 18).toBeCloseTo(w.fireInterval, 1);
    expect((log[18]!.next - log[0]!.next) / 18).toBeCloseTo(w.fireInterval, 9);
  });

  it('Carbine: the burst count resets when the magazine empties, so a reload always starts a fresh burst', () => {
    // 4 rounds left: one burst and one round over, so only the reset gives the fresh burst after.
    const s = solo('rifle');
    s.defenders[0]!.ammo.primary = 4;
    dummy(s, 150);
    let t = s;
    const bursts: number[] = [];
    let ammo = 4;
    for (let i = 0; i < 6 / STEP && bursts.length < 6; i++) {
      t = tick(t, STEP);
      const d = t.defenders[0]!;
      // Count after each shot, or after the tick that reloads (its first shot goes off in it).
      if (d.ammo.primary !== ammo) bursts.push(d.burst ?? 0);
      ammo = d.ammo.primary;
    }
    // Shots 1-4 count 1, 2, 0, then 1 wiped to 0 by the empty magazine; the reload tick's own
    // shot is the first of a fresh burst (1, not 2), the next its second.
    expect(bursts).toEqual([1, 2, 0, 0, 1, 2]);
  });

  it('Pump Shotgun: loads one shell every reload/magazine seconds, from the end of the shot cooldown', () => {
    const w = WEAPONS.shotgun;
    expect(w.shells).toBe(true);
    const s = solo('shotgun');
    const d = s.defenders[0]!;
    const shellIn = reloadIn(s, d, owned('shotgun')) / w.magazine;
    expect(shellIn).toBeCloseTo(w.reload / w.magazine, 9);
    // 3 of 6 shells in, the last shot's cooldown over at 1 s, nothing to shoot at.
    d.ammo.primary = 3;
    d.nextShotAt = 1;
    d.reloadedAt.primary = 1 + shellIn;
    const loadedAt: number[] = [];
    let t = s;
    let ammo = 3;
    for (let i = 0; i < 6 / STEP && ammo < w.magazine; i++) {
      t = tick(t, STEP);
      if (t.defenders[0]!.ammo.primary > ammo) loadedAt.push(t.time);
      ammo = t.defenders[0]!.ammo.primary;
    }
    expect(loadedAt).toHaveLength(3);
    loadedAt.forEach((at, i) => {
      expect(Math.abs(at - (1 + shellIn * (i + 1))), `shell ${i + 1}`).toBeLessThanOrEqual(
        STEP + 1e-9,
      );
    });
    expect(t.defenders[0]!.ammo.primary).toBe(w.magazine);
  });

  it('Pump Shotgun: mid-load it holds fire at an enemy beyond 250 px of the wall, fires at one within', () => {
    const w = WEAPONS.shotgun;
    const run = (ahead: number, ammo: number) => {
      const s = solo('shotgun');
      const d = s.defenders[0]!;
      d.ammo.primary = ammo;
      d.nextShotAt = 0;
      // The next shell is a long way off, so any shot in the window is a mid-load one.
      d.reloadedAt.primary = 1e6;
      dummy(s, ahead);
      const t = steps(s, 4);
      return { shot: t.shots.length > 0, ammo: t.defenders[0]!.ammo.primary };
    };
    // Far (still in range of the post): loading, so it waits.
    const far = run(TRAIT.close.range + 60, 3);
    expect(far).toEqual({ shot: false, ammo: 3 });
    // Near: it fires at once, one shell gone.
    const near = run(TRAIT.close.range - 20, 3);
    expect(near).toEqual({ shot: true, ammo: 2 });
    // Full: it fires at the far one too.
    const full = run(TRAIT.close.range + 60, w.magazine);
    expect(full.shot).toBe(true);
    expect(full.ammo).toBe(w.magazine - 1);
    // An empty gun with a near enemy still can't fire (no shell in).
    expect(run(TRAIT.close.range - 20, 0).shot).toBe(false);
  });

  it('Pump Shotgun: mid-load it shoots the enemy near the wall, never a focused one beyond it', () => {
    const s = solo('shotgun');
    const d = s.defenders[0]!;
    d.ammo.primary = 3;
    d.nextShotAt = 0;
    d.reloadedAt.primary = 1e6;
    const near = dummy(s, TRAIT.close.range - 20);
    // In the gun's range from the post, but past the near-the-wall band, and focused.
    const far = enemy(s, {
      x: wallFront(s) + TRAIT.close.range + 60,
      y: 300,
      hp: 1e9,
      maxHp: 1e9,
      stunnedUntil: 1e9,
    });
    s.focusId = far.id;
    const t = steps(s, 30);
    expect(t.defenders[0]!.ammo.primary).toBeLessThan(3);
    expect(find(t, near.id).hp).toBeLessThan(1e9);
    expect(find(t, far.id).hp).toBe(1e9);
    // Full, it shoots the focused one as any gun does.
    const u = solo('shotgun');
    dummy(u, TRAIT.close.range - 20);
    const far2 = enemy(u, {
      x: wallFront(u) + TRAIT.close.range + 60,
      y: 300,
      hp: 1e9,
      maxHp: 1e9,
      stunnedUntil: 1e9,
    });
    u.focusId = far2.id;
    expect(find(steps(u, 30), far2.id).hp).toBeLessThan(1e9);
  });

  it('Pump Shotgun: a shot sets its next shell’s time, so the first shell is one shellIn after the cooldown', () => {
    const s = solo('shotgun');
    dummy(s, TRAIT.close.range - 20);
    const t = steps(s, 3);
    const d = t.defenders[0]!;
    expect(d.ammo.primary).toBe(WEAPONS.shotgun.magazine - 1);
    expect(d.reloadedAt.primary).toBeCloseTo(
      d.nextShotAt + reloadIn(t, d, owned('shotgun')) / WEAPONS.shotgun.magazine,
      9,
    );
  });

  it('Cartridge Shotgun: loads a whole magazine at once after emptying, unlike the pump', () => {
    expect('shells' in WEAPONS.cartridge).toBe(false);
    const s = solo('cartridge');
    const d = s.defenders[0]!;
    d.ammo.primary = 2;
    d.nextShotAt = 1e9;
    let t = steps(s, 30);
    // Not empty, so no reload starts: it keeps what it has.
    expect(t.defenders[0]!.ammo.primary).toBe(2);
    d.ammo.primary = 0;
    d.reloadedAt.primary = 0.5;
    t = steps(s, Math.ceil(0.6 / STEP) + 2);
    expect(t.defenders[0]!.ammo.primary).toBe(WEAPONS.cartridge.magazine);
  });

  it('SMG: +25% damage within 250 px of the wall’s front, none past it', () => {
    const s = quiet();
    const front = wallFront(s);
    const near = enemy(s, {
      x: front + TRAIT.close.range - 5,
      y: 100,
      hp: 1000,
      maxHp: 1000,
      stunnedUntil: 1e9,
    });
    const far = enemy(s, {
      x: front + TRAIT.close.range + 30,
      y: 700,
      hp: 1000,
      maxHp: 1000,
      stunnedUntil: 1e9,
    });
    shoot(s, { x: near.x - 30, y: near.y, close: TRAIT.close.bonus });
    shoot(s, { x: far.x - 30, y: far.y, close: TRAIT.close.bonus });
    const t = steps(s, 3);
    expect(1000 - find(t, near.id).hp).toBeCloseTo(10 * 1.25);
    expect(1000 - find(t, far.id).hp).toBeCloseTo(10);
  });

  it('an SMG shot carries its trait plus its close-range affix', () => {
    for (const close of [0, 20]) {
      const s = newHorde(1, {
        ...setup(),
        roster: [
          {
            id: 'a',
            name: 'A',
            loadout: {
              primary: owned('smg', close ? [{ id: 'closeDamage', value: close }] : []),
              secondary: null,
              item: null,
            },
          },
        ],
      });
      s.toSpawn = 0;
      enemy(s, { x: 650, y: 360, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
      const fired = tick(s, STEP);
      expect(fired.bullets[0]!.close).toBeCloseTo(TRAIT.close.bonus + close / 100);
    }
  });

  it('Hand Cannon: each hit knocks an enemy back 12 px at any range', () => {
    const s = quiet();
    const near = dummy(s, 20);
    const far = enemy(s, { x: 1200, y: 700, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
    near.y = 100;
    shoot(s, { x: near.x - 30, y: near.y, knock: TRAIT.knock.hand });
    shoot(s, { x: far.x - 30, y: far.y, knock: TRAIT.knock.hand });
    const t = steps(s, 3);
    expect(find(t, near.id).x - near.x).toBeCloseTo(TRAIT.knock.hand);
    expect(find(t, far.id).x - far.x).toBeCloseTo(TRAIT.knock.hand);
    expect(TRAIT.knock.hand).toBe(12);
  });

  it('Shotguns: a shot knocks back 25 px only an enemy near the wall, never one past 250 px of it', () => {
    const s = quiet();
    const front = wallFront(s);
    const near = enemy(s, {
      x: front + TRAIT.close.range - 10,
      y: 100,
      hp: 1000,
      maxHp: 1000,
      stunnedUntil: 1e9,
    });
    const far = enemy(s, {
      x: front + TRAIT.close.range + 40,
      y: 700,
      hp: 1000,
      maxHp: 1000,
      stunnedUntil: 1e9,
    });
    for (const e of [near, far])
      shoot(s, { x: e.x - 30, y: e.y, knock: TRAIT.knock.shotgun, near: true });
    const t = steps(s, 3);
    expect(find(t, near.id).x - near.x).toBeCloseTo(TRAIT.knock.shotgun);
    expect(find(t, far.id).x).toBe(far.x);
    expect(find(t, far.id).knocked).toBeUndefined();
    expect(TRAIT.knock.shotgun).toBe(25);
  });

  it('a shot knocks an enemy back once, even with pellets landing in different steps; the next shot pushes again', () => {
    const s = quiet();
    const e = enemy(s, { x: wallFront(s) + 100, y: 100, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
    const base = { y: 100, knock: TRAIT.knock.shotgun, near: true as const, damage: 1 };
    // Two pellets of shot 1: one lands this step, the other two or three steps later.
    shoot(s, { ...base, x: e.x - 30, shot: 1 });
    shoot(s, { ...base, x: e.x - 170, shot: 1 });
    let t = steps(s, 8);
    expect(find(t, e.id).hp).toBeCloseTo(998);
    expect(find(t, e.id).x - e.x).toBeCloseTo(TRAIT.knock.shotgun);
    // Shot 2 from the same gun pushes again.
    shoot(t, { ...base, x: find(t, e.id).x - 30, shot: 2 });
    t = steps(t, 2);
    expect(find(t, e.id).x - e.x).toBeCloseTo(2 * TRAIT.knock.shotgun);
    // Another gun's shot of the same time is its own shot.
    shoot(t, { ...base, x: find(t, e.id).x - 30, shot: 2, owner: 'b' });
    t = steps(t, 2);
    expect(find(t, e.id).x - e.x).toBeCloseTo(3 * TRAIT.knock.shotgun);
  });

  it('Hand Cannon: two shots push twice (12 px each), the two pellets of one shot once', () => {
    const s = quiet();
    const e = enemy(s, { x: 1000, y: 100, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
    const base = { y: 100, knock: TRAIT.knock.hand, damage: 1 };
    shoot(s, { ...base, x: e.x - 30, shot: 1 });
    shoot(s, { ...base, x: e.x - 90, shot: 1 });
    let t = steps(s, 6);
    expect(find(t, e.id).x - e.x).toBeCloseTo(TRAIT.knock.hand);
    shoot(t, { ...base, x: find(t, e.id).x - 30, shot: 2 });
    t = steps(t, 2);
    expect(find(t, e.id).x - e.x).toBeCloseTo(2 * TRAIT.knock.hand);
  });

  it('a shotgun shot pushes 25 px once, and the Cartridge Shotgun does as the pump', () => {
    for (const base of ['shotgun', 'cartridge'] as const) {
      const s = solo(base);
      const e = dummy(s, 5);
      const first = tick(s, STEP);
      expect(first.bullets, base).toHaveLength(WEAPONS[base].pellets);
      for (const b of first.bullets) {
        expect(b.knock, base).toBe(TRAIT.knock.shotgun);
        expect(b.near, base).toBe(true);
      }
      // Several of the 6 pellets land, yet the shot pushes the enemy once, 25 px.
      const t = landed(first);
      const pellets = Math.round((e.hp - find(t, e.id).hp) / first.bullets[0]!.damage);
      expect(pellets, base).toBeGreaterThan(1);
      expect(find(t, e.id).x - e.x, base).toBeCloseTo(TRAIT.knock.shotgun);
      expect(find(t, e.id).knocked, base).toBeCloseTo(find(t, e.id).x - e.x);
    }
    // The Hand Cannon's round carries its 12 px, with no near-the-wall limit.
    const hc = solo('handcannon');
    dummy(hc, 150);
    const b = tick(hc, STEP).bullets[0]!;
    expect([b.knock, b.near]).toEqual([TRAIT.knock.hand, undefined]);
    // No other gun's bullet carries a knockback.
    for (const g of [
      'pistol',
      'smg',
      'rifle',
      'lmg',
      'sniper',
      'machinepistol',
      'assault',
    ] as const) {
      const x = solo(g);
      dummy(x, 150);
      expect(tick(x, STEP).bullets[0]!.knock, g).toBeUndefined();
    }
  });

  it('knockback: a heavy kind takes half, an enemy at most 100 px in all, never one in the camp, climbing or past the spawn edge', () => {
    const hit = (e: Enemy, knock: number = TRAIT.knock.hand, count = 1): HordeState => {
      let t = quiet();
      t.enemies.push(e);
      for (let i = 0; i < count; i++) {
        shoot(t, { x: find(t, e.id).x - 30, y: e.y, knock, damage: 1, shot: i + 1 });
        t = tick(t, STEP);
      }
      return t;
    };
    const mk = (over: Partial<Enemy>) =>
      enemy(quiet(), { x: 700, y: 360, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9, ...over });
    // A heavy kind (a Brute) takes `heavy` of it.
    const brute = mk({ kind: 'brute' });
    expect(find(hit(brute), brute.id).x - 700).toBeCloseTo(TRAIT.knock.hand * TRAIT.knock.heavy);
    // The cap: 100 px in all, then nothing more, however many hits (a shotgun's 25 px: 4 hits).
    const walker = mk({});
    const worn = hit(walker, TRAIT.knock.shotgun, 12);
    expect(find(worn, walker.id).x - 700).toBeCloseTo(TRAIT.knock.cap);
    expect(find(worn, walker.id).knocked).toBeCloseTo(TRAIT.knock.cap);
    // The last push is trimmed to the cap, not skipped: 12 px a hit stops at exactly 100.
    const small = mk({});
    expect(find(hit(small, TRAIT.knock.hand, 20), small.id).x - 700).toBeCloseTo(TRAIT.knock.cap);
    // Not in the camp, not a Crawler on the wall.
    const camp = mk({ inCamp: true });
    expect(find(hit(camp), camp.id).x).toBe(700);
    const climber = mk({ kind: 'crawler', climbUntil: 5 });
    expect(find(hit(climber), climber.id).x).toBe(700);
    // Never past the spawn edge.
    const edge = mk({ x: FIELD.right - 5 });
    const pushed = hit(edge);
    expect(find(pushed, edge.id).x).toBeLessThanOrEqual(pushed.spawnX ?? FIELD.right);
    expect(find(pushed, edge.id).x).toBeGreaterThanOrEqual(FIELD.right - 5);
  });

  it('Sniper rifle: only a crit ignores armour (a Brute’s, a Horror’s, boss plates); a plain hit does not', () => {
    const s = quiet();
    const brute = enemy(s, { kind: 'brute', hp: 1000, maxHp: 1000 });
    const h = enemy(s, { kind: 'horror', hp: 1000, maxHp: 1000 });
    expect(hitDamage(brute, 22, true)).toBe(22);
    expect(hitDamage(brute, 22)).toBe(22 - BRUTE.armour);
    expect(hitDamage(h, 22, true)).toBe(22);
    expect(hitDamage(h, 22)).toBe(22 - HORROR.armour);
    expect(WEAPONS.sniper.pierce).toBe(0);
    expect(TRAIT.sniper.pierce).toBe(0.1);
    expect(TRAIT.sniper.critDamage).toBe(0.5);

    // Real shots at a Brute: a non-crit round takes the armour off, a crit one doesn't.
    const seen = { plain: false, crit: false };
    for (let seed = 1; seed <= 80 && !(seen.plain && seen.crit); seed++) {
      const t = solo('sniper', [], seed);
      const target = dummy(t, 400, 'brute');
      const fired = tick(t, STEP);
      const b = fired.bullets[0]!;
      const after = landed(fired);
      const taken = target.hp - find(after, target.id).hp;
      if (b.crit) {
        expect(b.ap, `seed ${seed}`).toBe(true);
        expect(taken, `crit seed ${seed}`).toBeCloseTo(b.damage);
        seen.crit = true;
      } else {
        expect(b.ap, `seed ${seed}`).toBeUndefined();
        expect(taken, `plain seed ${seed}`).toBeCloseTo(b.damage - BRUTE.armour);
        seen.plain = true;
      }
    }
    expect(seen).toEqual({ plain: true, crit: true });
  });

  it('a Sniper rifle’s boss-damage affix hits bosses, mini-bosses and heavies harder, not the rest', () => {
    const s = quiet();
    const brute = enemy(s, {
      kind: 'brute',
      x: 700,
      y: 100,
      hp: 1000,
      maxHp: 1000,
      stunnedUntil: 1e9,
    });
    const walker = enemy(s, { x: 700, y: 700, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
    shoot(s, { x: 650, y: 100, ap: true, heavy: 0.3 });
    shoot(s, { x: 650, y: 700, ap: true, heavy: 0.3 });
    const t = steps(s, 3);
    expect(1000 - find(t, brute.id).hp).toBeCloseTo(13);
    expect(1000 - find(t, walker.id).hp).toBeCloseTo(10);
  });
});

describe('dmg/s counts a gun’s own crit (ID-101)', () => {
  it('a crit trait or affix raises its dmg/s, so a crit-rolled gun never ranks as weaker', () => {
    const raw = (h: OwnedWeapon) => {
      const w = statsOf(h);
      if (w.kind !== 'gun') throw new Error('no gun');
      return (w.damage * w.pellets * w.magazine) / (w.magazine * w.fireInterval + w.reload);
    };
    // The LMG's +8% and the Sniper's +20% with its +0.5 crit damage count (ID-135).
    const lmg = owned('lmg');
    expect(gunPower(lmg)).toBeCloseTo(raw(lmg) * (1 + TRAIT.crit.lmg * (CRIT_DAMAGE - 1)));
    const sniper = owned('sniper');
    expect(gunPower(sniper)).toBeCloseTo(
      raw(sniper) * (1 + TRAIT.crit.sniper * (CRIT_DAMAGE + TRAIT.sniper.critDamage - 1)),
    );
    const rifle = owned('rifle');
    const rolled = owned('rifle', [{ id: 'crit', value: 5 }]);
    expect(gunPower(rolled)).toBeGreaterThan(gunPower(rifle));
    // The Carbine's +10% counts, and a crit damage affix adds on top of it.
    expect(gunPower(rifle)).toBeCloseTo(raw(rifle) * (1 + TRAIT.crit.rifle * (CRIT_DAMAGE - 1)));
    const critDmg = owned('rifle', [{ id: 'critDamage', value: 50 }]);
    expect(gunPower(critDmg)).toBeGreaterThan(gunPower(rifle));
    // No crit of its own: dmg/s as before, and crit damage alone adds nothing.
    expect(gunPower(owned('smg'))).toBeCloseTo(raw(owned('smg')));
    // A gun with no crit chance gains nothing from crit damage (a hand-built roll).
    expect(gunPower(owned('smg', [{ id: 'critDamage', value: 50 }]))).toBeCloseTo(
      raw(owned('smg')),
    );
  });
});

describe('role affixes', () => {
  it('each gun rolls its role affixes and today’s general ones; no gun rolls another’s role affix', () => {
    const roleAffixes: Record<(typeof SHOOTERS)[number], AffixId[]> = {
      pistol: ['crit'],
      smg: ['closeDamage'],
      rifle: ['crit', 'critDamage'],
      shotgun: ['cone', 'pellets'],
      lmg: ['crit', 'magazine'],
      sniper: ['bossDamage', 'pierce'],
      handcannon: ['bossDamage'],
      machinepistol: ['magazine'],
      assault: ['crit'],
      cartridge: ['cone', 'pellets'],
    };
    for (const g of SHOOTERS) {
      const pool = affixesFor(g);
      for (const a of GENERAL) expect(pool, `${g} ${a}`).toContain(a);
      for (const a of roleAffixes[g]) {
        expect(pool, `${g} ${a}`).toContain(a);
        expect(isRoleAffix(g, a), `${g} ${a}`).toBe(true);
      }
      const theirs = new Set(roleAffixes[g]);
      for (const a of pool) if (!theirs.has(a)) expect(isRoleAffix(g, a), `${g} ${a}`).toBe(false);
    }
    expect(affixesFor('knife')).toEqual(['damage', 'fireRate']);
    expect(affixesFor('toolkit')).toEqual(['damage', 'fireRate', 'repair']);
  });

  it('the LMG’s magazine and the sniper’s pierce roll bigger, yet older rolls still read', () => {
    expect(affixRange('magazine', 'lmg').min).toBeGreaterThan(AFFIXES.magazine.max - 20);
    expect(affixRange('magazine', 'smg')).toEqual({
      min: AFFIXES.magazine.min,
      max: AFFIXES.magazine.max,
    });
    expect(affixRange('pierce', 'sniper').max).toBe(2);
    expect(affixBounds('magazine', 'lmg').min).toBe(AFFIXES.magazine.min);
    expect(affixBounds('pierce', 'sniper')).toEqual({ min: 1, max: 2 });
  });

  it('rolled values stay in the gun’s range, each affix at most once', () => {
    const rng = createRng(42);
    for (let i = 0; i < 400; i++) {
      const base = SHOOTERS[i % SHOOTERS.length]!;
      const w = rollWeapon(rng, `h${i}`, base, 'relic');
      expect(new Set(w.affixes.map((a) => a.id)).size).toBe(w.affixes.length);
      for (const a of w.affixes) {
        const { min, max } = affixRange(a.id, base);
        expect(a.value).toBeGreaterThanOrEqual(min);
        expect(a.value).toBeLessThanOrEqual(max);
        expect(affixesFor(base)).toContain(a.id);
      }
    }
  });

  it('crit affixes add to the gun’s crit; the Shotgun’s widen its cone and add pellets', () => {
    expect(gunCrit(owned('pistol', [{ id: 'crit', value: 6 }]))).toBeCloseTo(0.06);
    // Each adds its affix to its trait crit: the Carbine's 10%, the Assault Rifle's 5%, the LMG's 8%.
    expect(gunCrit(owned('rifle', [{ id: 'crit', value: 5 }]))).toBeCloseTo(0.15);
    expect(gunCrit(owned('assault', [{ id: 'crit', value: 5 }]))).toBeCloseTo(0.1);
    expect(gunCrit(owned('lmg', [{ id: 'crit', value: 5 }]))).toBeCloseTo(0.13);
    expect(gunCritDamage(owned('rifle', [{ id: 'critDamage', value: 40 }]))).toBeCloseTo(0.4);
    const sg = statsOf(
      owned('shotgun', [
        { id: 'cone', value: 25 },
        { id: 'pellets', value: 2 },
      ]),
    );
    expect(sg.kind === 'gun' && sg.spread).toBeCloseTo(WEAPONS.shotgun.spread * 1.25);
    expect(sg.kind === 'gun' && sg.pellets).toBe(WEAPONS.shotgun.pellets + 2);
  });
});

describe('knockback and paralysis stack, but never hold an enemy in place (ID-135)', () => {
  it('a Shambler hit every step by shotgun pellets, with Shock Rounds at max, is pushed at most 100 px, then walks', () => {
    const run = (hit: boolean) => {
      let s = quiet();
      s.taken.push('shock-rounds');
      const e = enemy(s, { x: wallFront(s) + 200, y: 100, hp: 1e9, maxHp: 1e9 });
      const from = e.x;
      const seconds = 10;
      for (let i = 0; i < seconds / STEP; i++) {
        if (hit) {
          shoot(s, {
            x: find(s, e.id).x - 15,
            y: 100,
            knock: TRAIT.knock.shotgun,
            near: true,
            shot: i,
            damage: 0,
          });
        }
        s = tick(s, STEP);
      }
      return { moved: from - find(s, e.id).x, knocked: find(s, e.id).knocked ?? 0 };
    };
    const free = run(false);
    const held = run(true);
    expect(held.knocked).toBeLessThanOrEqual(TRAIT.knock.cap + 1e-9);
    // The wall stops a free walker short; a pushed one is behind by at most the cap, so it
    // always keeps coming: it never ends further back than the cap.
    expect(held.moved).toBeGreaterThan(free.moved - TRAIT.knock.cap - 1e-9);
    expect(held.moved).toBeGreaterThan(0);
  });
});
