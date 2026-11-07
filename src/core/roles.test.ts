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
  ENEMIES,
  STAT_EFFECT,
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
  slowedBy,
  staggered,
  tick,
  wallFront,
  type Bullet,
  type HordeState,
} from './horde.ts';
import { createRng } from './rng.ts';
import { enemy, setup } from './testing.ts';

const SHOOTERS = ['pistol', 'smg', 'rifle', 'shotgun', 'lmg', 'sniper'] as const;
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

  it('Pistol: the fastest reload of any gun', () => {
    for (const g of SHOOTERS.filter((g) => g !== 'pistol')) {
      expect(WEAPONS.pistol.reload, g).toBeLessThan(WEAPONS[g].reload);
    }
  });

  it('Rifle: +10% crit chance, a free one too; other guns add none without an affix', () => {
    expect(gunCrit(owned('rifle'))).toBeCloseTo(TRAIT.crit);
    expect(TRAIT.crit).toBe(0.1);
    for (const g of ['smg', 'shotgun', 'lmg', 'sniper'] as const) expect(gunCrit(owned(g))).toBe(0);
    expect(gunCrit('pistol')).toBe(0);
    expect(gunCritDamage(owned('rifle'))).toBe(0);
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

  it('Shotgun: a pellet stops the enemy it hits briefly, then not again until the gap is up', () => {
    const s = quiet();
    const e = enemy(s, { x: 700, y: 100, hp: 1000, maxHp: 1000 });
    shoot(s, { x: 680, y: 100, stagger: true });
    let t = steps(s, 1);
    const at = find(t, e.id).x;
    expect(staggered(t, find(t, e.id))).toBe(true);
    // Still for the stagger, a second pellet in that time adds nothing.
    shoot(t, { x: at - 20, y: 100, stagger: true });
    t = steps(t, Math.floor(TRAIT.stagger.seconds / STEP) - 1);
    expect(find(t, e.id).x).toBeCloseTo(at);
    t = steps(t, 2);
    expect(staggered(t, find(t, e.id))).toBe(false);
    expect(find(t, e.id).x).toBeLessThan(at);
    // Inside the gap a pellet doesn't stagger it again.
    shoot(t, { x: find(t, e.id).x - 20, y: 100, stagger: true });
    t = steps(t, 1);
    expect(staggered(t, find(t, e.id))).toBe(false);
  });

  it('LMG: a hit slows 20% for 1 s; more hits renew it, never stacking', () => {
    const s = quiet();
    const e = enemy(s, { x: 700, y: 100, hp: 1000, maxHp: 1000 });
    for (let i = 0; i < 3; i++) shoot(s, { x: 680 - i * 5, y: 100, slow: TRAIT.slow.by });
    let t = steps(s, 2);
    expect(slowedBy(t, find(t, e.id))).toBeCloseTo(0.2);
    // Moving at 80% of its speed.
    const from = find(t, e.id).x;
    t = steps(t, 10);
    expect(from - find(t, e.id).x).toBeCloseTo(10 * STEP * ENEMIES.shambler.speed * 0.8, 6);
    t = steps(t, Math.ceil(TRAIT.slow.seconds / STEP));
    expect(slowedBy(t, find(t, e.id))).toBe(0);
  });

  it('an LMG shot carries 20% slow, plus its slow affix, capped', () => {
    const slowOf = (affixes: OwnedWeapon['affixes']) => {
      const s = newHorde(1, {
        ...setup(),
        roster: [
          {
            id: 'a',
            name: 'A',
            loadout: { primary: owned('lmg', affixes), secondary: null, item: null },
          },
        ],
      });
      s.toSpawn = 0;
      enemy(s, { x: 650, y: 360, hp: 1000, maxHp: 1000, stunnedUntil: 1e9 });
      return tick(s, STEP).bullets[0]!.slow;
    };
    expect(slowOf([])).toBeCloseTo(0.2);
    expect(slowOf([{ id: 'slow', value: 10 }])).toBeCloseTo(0.3);
    expect(slowOf([{ id: 'slow', value: 99 }])).toBeCloseTo(TRAIT.slow.max);
  });

  it('Sniper rifle: ignores armour (a Brute’s, a Horror’s, boss plates), pierces 1', () => {
    const s = quiet();
    const brute = enemy(s, { kind: 'brute', hp: 1000, maxHp: 1000 });
    const h = enemy(s, { kind: 'horror', hp: 1000, maxHp: 1000 });
    expect(hitDamage(brute, 22, true)).toBe(22);
    expect(hitDamage(brute, 22)).toBe(22 - BRUTE.armour);
    expect(hitDamage(h, 22, true)).toBe(22);
    expect(hitDamage(h, 22)).toBe(22 - HORROR.armour);
    expect(WEAPONS.sniper.pierce).toBe(1);
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
  it('the Rifle’s trait and crit affixes raise its dmg/s, so a crit-rolled gun never ranks as weaker', () => {
    const raw = (h: OwnedWeapon) => {
      const w = statsOf(h);
      if (w.kind !== 'gun') throw new Error('no gun');
      return (w.damage * w.pellets * w.magazine) / (w.magazine * w.fireInterval + w.reload);
    };
    const rifle = owned('rifle');
    expect(gunPower(rifle)).toBeCloseTo(
      raw(rifle) * (1 + TRAIT.crit * (STAT_EFFECT.critDamage - 1)),
    );
    const rolled = owned('rifle', [{ id: 'critDamage', value: 50 }]);
    expect(gunPower(rolled)).toBeGreaterThan(gunPower(rifle));
    // No crit of its own: dmg/s as before.
    expect(gunPower(owned('smg'))).toBeCloseTo(raw(owned('smg')));
  });
});

describe('role affixes', () => {
  it('each gun rolls its role affixes and today’s general ones; no gun rolls another’s role affix', () => {
    const roleAffixes: Record<(typeof SHOOTERS)[number], AffixId[]> = {
      pistol: ['crit'],
      smg: ['closeDamage'],
      rifle: ['crit', 'critDamage'],
      shotgun: ['cone', 'pellets'],
      lmg: ['slow', 'magazine'],
      sniper: ['bossDamage', 'pierce'],
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
    expect(gunCrit(owned('rifle', [{ id: 'crit', value: 5 }]))).toBeCloseTo(0.15);
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

describe('stagger, slow and paralysis stack, but never hold an enemy in place', () => {
  it('a Shambler hit every step by a Shotgun pellet and a max-slow LMG round, with Shock Rounds at max, still walks', () => {
    const run = (hit: boolean) => {
      let s = quiet();
      s.taken.push('shock-rounds');
      const e = enemy(s, { x: 1000, y: 100, hp: 1e9, maxHp: 1e9 });
      const from = e.x;
      const seconds = 10;
      for (let i = 0; i < seconds / STEP; i++) {
        if (hit) {
          const x = find(s, e.id).x - 15;
          shoot(s, { x, y: 100, stagger: true, damage: 0 });
          shoot(s, { x: x - 1, y: 100, slow: TRAIT.slow.max, damage: 0 });
        }
        s = tick(s, STEP);
      }
      return from - find(s, e.id).x;
    };
    const free = run(false);
    const held = run(true);
    expect(free).toBeCloseTo(10 * ENEMIES.shambler.speed, 0);
    // Even this worst case keeps over a quarter of its pace (about 30%).
    expect(held / free).toBeGreaterThan(0.25);
    expect(held / free).toBeLessThan(0.8);
  });
});
