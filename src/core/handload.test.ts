// ID-284: Hand-loads. The first round of each squad gun's magazine always crits (at least
// TOP_CRIT, orange), ready at the fight's start and after every reload; one pellet of a shotgun's;
// never a blade, a tool, a turret or the Wall Machine Gun; no extra RNG draw; nothing without the
// research.
import { describe, expect, it } from 'vitest';
import { buildTurret, newBase } from './base.ts';
import { chooseCard } from './cards.ts';
import { CARD, CRIT_DAMAGE, STEP, TOP_CRIT, TRAIT, type TechId, WEAPONS } from './data.ts';
import { gunCritDamage, type Held, type OwnedWeapon } from './armoury.ts';
import {
  cardCritDamage,
  newHorde,
  standing,
  tick,
  WALL_GUN,
  type Bullet,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { startSquadHorde } from './hordeonly.ts';
import { squadAt } from './balance/shared.ts';
import { playSquadHorde } from './sim.ts';
import { critDamageOf, xpForLevel } from './stats.ts';
import { enemy, setup } from './testing.ts';

const HL: TechId[] = ['hand-loads'];
/** A plain owned gun of `base`; the free pistol is its own id. */
const gun = (base: OwnedWeapon['base']): Held =>
  base === 'pistol' ? 'pistol' : { uid: `g-${base}`, base, rarity: 'common', affixes: [] };
const SECOND = Math.round(1 / STEP);

interface Opts {
  seed?: number;
  secondary?: Held | null;
  job?: 'hunter';
  level?: number;
  tech?: readonly TechId[];
}
/**
 * Horde 1, nothing to spawn: survivor a holds `gun`, the others hold their fire; one unkillable,
 * motionless enemy in reach. `tech` is the research (Hand-loads by default).
 */
function fight(gun: Held, o: Opts = {}): HordeState {
  const sp = setup();
  sp.roster[0] = {
    ...sp.roster[0]!,
    loadout: { primary: gun, secondary: o.secondary ?? null, item: null },
    ...(o.job ? { job: o.job, xp: xpForLevel(o.level ?? 100) } : {}),
  };
  const tech = o.tech ?? HL;
  const s = newHorde(o.seed ?? 1, { ...sp, ...(tech.length > 0 ? { tech } : {}) });
  s.toSpawn = 0;
  for (const d of s.defenders) if (d.id !== 'a') d.nextShotAt = 1e9;
  enemy(s, { hp: 1e12, maxHp: 1e12, x: 640, y: 360 });
  return s;
}
const A = (s: HordeState) => s.defenders.find((d) => d.id === 'a')!;

interface Seen {
  /** Each volley a fired, in order: its bullets (pellet 0 first). */
  volleys: Bullet[][];
  end: HordeState;
}
/** Ticks `s` for `steps` and records every volley survivor `who` fires, by its `shot` time. */
function watch(s: HordeState, steps: number, who = 'a', each?: (t: HordeState) => void): Seen {
  const byShot = new Map<number, Bullet[]>();
  let t = s;
  for (let i = 0; i < steps; i++) {
    t = tick(t, STEP);
    each?.(t);
    for (const b of t.bullets) {
      if (b.owner !== who) continue;
      // A turret's or the wall gun's bullet has no `shot`: seen when new, within its first step.
      const key =
        b.shot ??
        (Math.hypot(b.x - b.fromX, b.y - b.fromY) <= b.speed * STEP * 1.01
          ? t.time + 1e-4 * b.dy
          : undefined);
      if (key === undefined) continue;
      if (!byShot.has(key)) byShot.set(key, []);
      const list = byShot.get(key)!;
      // The same bullet seen again on a later step: matched by its start.
      if (!list.some((o) => o.fromX === b.fromX && o.fromY === b.fromY && o.dy === b.dy))
        list.push({ ...b });
    }
  }
  const volleys = [...byShot.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
  return { volleys, end: t };
}
const top = (v: Bullet[]): boolean => v[0]!.top === true;

describe('the hand-load (ID-284)', () => {
  it('the fight’s first round is one, the second is not', () => {
    const { volleys } = watch(fight(gun('pistol')), 8 * SECOND);
    expect(volleys.length).toBeGreaterThan(5);
    const twin = watch(fight(gun('pistol'), { tech: [] }), 8 * SECOND).volleys;
    // A pistol has no crit chance: every round of the twin is plain.
    expect(twin[0]![0]!.crit).toBeUndefined();
    expect(volleys[0]![0]!.crit).toBe(true);
    expect(volleys[0]![0]!.top).toBe(true);
    expect(volleys[0]![0]!.damage).toBeCloseTo(twin[0]![0]!.damage * TOP_CRIT, 9);
    expect(volleys[1]![0]!.crit).toBeUndefined();
    expect(volleys[1]![0]!.top).toBeUndefined();
    expect(volleys[1]![0]!.damage).toBeCloseTo(twin[1]![0]!.damage, 9);
    // Only the first of the magazine.
    expect(volleys.slice(1, 10).filter(top)).toHaveLength(0);
  });

  it('is re-armed after a reload from empty: the first round of the next magazine', () => {
    const { volleys } = watch(fight(gun('pistol')), 20 * SECOND);
    const mag = WEAPONS.pistol.magazine;
    expect(volleys.length).toBeGreaterThan(mag + 3);
    const tops = volleys
      .map((v, i) => [i, top(v)] as const)
      .filter(([, t]) => t)
      .map(([i]) => i);
    expect(tops.slice(0, 2)).toEqual([0, mag]);
    // And no other round is one.
    for (const i of tops) expect(i % mag).toBe(0);
  });

  it('no hand key before the first round; after it a clip gun’s is 0 and nothing else', () => {
    const s = fight(gun('pistol'));
    expect(A(s).hand).toBeUndefined();
    const seen: (Record<string, number> | undefined)[] = [];
    watch(s, 20 * SECOND, 'a', (t) => seen.push(A(t).hand ? { ...A(t).hand } : undefined));
    expect(seen[0]).toEqual({ primary: 0 });
    for (const h of seen) expect(h === undefined || h.primary === 0).toBe(true);
  });

  it('is ready on a survivor swapped in, even after the one they replace has fired theirs', () => {
    const s = fight(gun('pistol'));
    const first = watch(s, 3 * SECOND);
    expect(top(first.volleys[0]!)).toBe(true);
    expect(A(first.end).hand).toEqual({ primary: 0 });
    const t = first.end;
    const sub = standing({ id: 'a', name: 'A', loadout: A(t).loadout }, t.posts[0]!, t.time);
    expect(sub.hand).toBeUndefined();
    t.defenders[t.defenders.findIndex((d) => d.id === 'a')] = sub;
    const next = watch(t, 2 * SECOND);
    expect(next.volleys.length).toBeGreaterThan(0);
    expect(top(next.volleys[0]!)).toBe(true);
  });

  it('primary and sidearm each have their own: the sidearm’s first round, then the primary’s', () => {
    const s = fight(gun('smg'), { secondary: gun('pistol') });
    // The primary is empty and reloading: a Gunner fires the sidearm at an enemy within 200 px.
    A(s).ammo.primary = 0;
    A(s).reloadedAt.primary = 2;
    s.enemies[0]!.x = 420 + 150;
    const { volleys, end } = watch(s, 6 * SECOND);
    const sidearm = volleys.filter((v) => v[0]!.speed === WEAPONS.pistol.speed);
    expect(volleys.length).toBeGreaterThan(2);
    expect(top(volleys[0]!)).toBe(true);
    // The sidearm's hand-load was the first volley; the primary's own is still ready after.
    expect(A(end).hand?.secondary).toBe(0);
    const smgFirst = volleys.find((v) => v[0]!.speed === WEAPONS.smg.speed)!;
    expect(smgFirst).toBeDefined();
    expect(top(smgFirst)).toBe(true);
    expect(sidearm.length).toBeGreaterThan(0);
  });

  it('a part-way refill re-arms it, but only when it adds rounds (Momentum)', () => {
    const k = CARD.momentum.kills;
    const arrange = (ammo: number): HordeState => {
      const s = fight(gun('pistol'));
      s.taken = ['momentum'];
      s.streak = k - 1;
      const d = A(s);
      d.nextShotAt = 1e9;
      d.ammo.primary = ammo;
      d.hand = { primary: 0 };
      enemy(s, { x: 1400, y: 100, hp: 0 });
      return tick(s, STEP);
    };
    // 4 of 10 rounds left: the refill adds 6, so the next round is a hand-load again.
    const part = arrange(4);
    expect(part.defenders.find((d) => d.id === 'a')!.ammo.primary).toBe(WEAPONS.pistol.magazine);
    expect(A(part).hand).toBeUndefined();
    // Already full: it adds nothing, so the spent hand-load stays spent.
    const full = arrange(WEAPONS.pistol.magazine);
    expect(A(full).hand).toEqual({ primary: 0 });
  });

  it('a shotgun’s is back only after a full magazine’s worth of shells', () => {
    const s = fight(gun('shotgun'));
    const mag = WEAPONS.shotgun.magazine;
    const counts: number[] = [];
    const { volleys } = watch(s, 30 * SECOND, 'a', (t) => {
      const h = A(t).hand?.primary;
      if (h !== undefined && counts.at(-1) !== h) counts.push(h);
    });
    // It fires the whole magazine before a shell goes in (a shot comes every 0.8 s, a shell takes
    // 0.9 s), then one a shell: none of those is a hand-load.
    const back = volleys.findIndex((v, i) => i > 0 && top(v));
    expect(back).toBeGreaterThan(mag);
    expect(volleys.slice(1, back).filter(top)).toHaveLength(0);
    // The count of shells since climbs one at a time to the magazine's size - 1, then the full
    // magazine's worth clears it and the next shot fires the new hand-load (count 0 again).
    expect(counts.slice(0, mag + 1)).toEqual([
      0,
      ...Array.from({ length: mag - 1 }, (_, i) => i + 1),
      0,
    ]);
  });

  it('topping a shotgun up never gives a hand-load', () => {
    const s = fight(gun('shotgun'));
    const d = A(s);
    const mag = WEAPONS.shotgun.magazine;
    d.hand = { primary: 0 };
    d.ammo.primary = mag - 1;
    d.nextShotAt = 1e9;
    // A shell goes in: the magazine is full again, but one shell is not a magazine's worth.
    const full = watch(s, 3 * SECOND).end;
    expect(A(full).ammo.primary).toBe(mag);
    expect(A(full).hand).toEqual({ primary: 1 });
    A(full).nextShotAt = full.time;
    const next = watch(full, 2 * SECOND);
    expect(next.volleys.length).toBeGreaterThan(0);
    expect(top(next.volleys[0]!)).toBe(false);
  });

  it('Extended Mags picked mid-magazine gives none', () => {
    let s = fight(gun('pistol'));
    const first = watch(s, 2 * SECOND);
    s = first.end;
    expect(A(s).hand).toEqual({ primary: 0 });
    s = chooseCard({ ...s, offer: [{ kind: 'upgrade', id: 'extended-mags' as UpgradeId }] }, 0);
    s.offer = null;
    expect(A(s).hand).toEqual({ primary: 0 });
    const next = watch(s, 2 * SECOND);
    expect(next.volleys.filter(top)).toHaveLength(0);
  });

  it('a round Scavenged Ammo saves still spends it', () => {
    const mag = WEAPONS.pistol.magazine;
    let found = 0;
    for (let seed = 1; seed <= 60 && found === 0; seed++) {
      let s = fight(gun('pistol'), { seed });
      s = chooseCard({ ...s, offer: [{ kind: 'upgrade', id: 'scavenged-ammo' as UpgradeId }] }, 0);
      s.offer = null;
      s.cardLevels['scavenged-ammo'] = 3;
      let t = s;
      for (let i = 0; i < 3 * SECOND && A(t).hand === undefined; i++) t = tick(t, STEP);
      // The first shot was fired; only a seed whose round was saved is the case.
      if (A(t).hand === undefined || A(t).ammo.primary !== mag || t.saves.length === 0) continue;
      found++;
      expect(A(t).hand, `seed ${seed}`).toEqual({ primary: 0 });
      const next = watch(t, 3 * SECOND);
      // The first volley is still in the air in the first step; every later one is a plain round.
      expect(next.volleys.length).toBeGreaterThan(1);
      expect(next.volleys.slice(1).filter(top), `seed ${seed}`).toHaveLength(0);
    }
    expect(found, 'a seed whose first round was saved').toBe(1);
  });

  it('a burst gun’s hand-load is the burst’s first round only', () => {
    const { volleys } = watch(fight(gun('rifle')), 3 * SECOND);
    expect(volleys.length).toBeGreaterThanOrEqual(3);
    expect(top(volleys[0]!)).toBe(true);
    expect(volleys[1]![0]!.top).toBeUndefined();
    expect(volleys[2]![0]!.top).toBeUndefined();
  });

  it('a shotgun’s is one pellet of its first shot, not the spread', () => {
    const { volleys } = watch(fight(gun('shotgun')), 3 * SECOND);
    const first = volleys[0]!;
    expect(first).toHaveLength(WEAPONS.shotgun.pellets);
    expect(first[0]!.top).toBe(true);
    expect(first[0]!.crit).toBe(true);
    for (const p of first.slice(1)) {
      expect(p.top).toBeUndefined();
      expect(p.crit).toBeUndefined();
      expect(first[0]!.damage).toBeCloseTo(p.damage * TOP_CRIT, 9);
    }
    // The second shot's pellets are all plain.
    for (const p of volleys[1]!) expect(p.top).toBeUndefined();
  });

  it('a Sniper rifle’s hand-load ignores armour like its own crit (ap), on the one bullet', () => {
    const { volleys } = watch(fight(gun('sniper')), 4 * SECOND);
    expect(volleys[0]![0]!.top).toBe(true);
    expect(volleys[0]![0]!.ap).toBe(true);
  });

  it('a higher own crit multiplier is kept: ×3.25 is the least, never a cut', () => {
    // A Hunter at a high level with a Sniper rifle and Hollow Points at Lv 3: more than ×3.25.
    let s = fight(gun('sniper'), { job: 'hunter', level: 400 });
    for (let i = 0; i < 3; i++) {
      s = chooseCard(
        { ...s, offer: [{ kind: 'upgrade', id: 'hollow-point-rounds' as UpgradeId }] },
        0,
      );
      s.offer = null;
    }
    const d = A(s);
    const own =
      CRIT_DAMAGE +
      TRAIT.sniper.critDamage +
      cardCritDamage(s) +
      critDamageOf(d, d.loadout.primary);
    expect(gunCritDamage(gun('sniper'))).toBe(TRAIT.sniper.critDamage);
    expect(own).toBeGreaterThan(TOP_CRIT);
    const { volleys } = watch(s, 14 * SECOND);
    const plain = volleys.slice(1).find((v) => v[0]!.crit === undefined)!;
    expect(volleys[0]![0]!.damage).toBeCloseTo(plain[0]!.damage * own, 9);
    expect(volleys[0]![0]!.top).toBe(true);
  });

  it('none for a blade or a tool', () => {
    for (const held of ['knife', 'toolkit'] as const) {
      const s = fight(gun('pistol'));
      A(s).loadout = { primary: held, secondary: null, item: null };
      A(s).ammo = { primary: 0, secondary: 0 };
      s.enemies[0]!.x = 440;
      const end = watch(s, 3 * SECOND).end;
      expect(A(end).hand, held).toBeUndefined();
      expect(
        end.pops.every((p) => !p.top),
        held,
      ).toBe(true);
    }
  });

  it('none for a turret’s bullet', () => {
    let base = newBase();
    const r = buildTurret(
      base,
      { scrap: 999, wood: 999, metal: 0, concrete: 0 } as never,
      true,
      'tower',
      0,
      5,
    );
    if (!r.ok) throw new Error(r.code);
    base = r.base;
    const s = newHorde(1, { ...setup(), base, tech: HL });
    s.toSpawn = 0;
    s.defenders = [];
    s.bench = [];
    for (const p of s.posts) p.defenderId = null;
    enemy(s, { x: 600, y: 440, hp: 1e9, maxHp: 1e9 });
    const { volleys } = watch(s, 3 * SECOND, 'turret:0');
    expect(volleys.length).toBeGreaterThan(0);
    for (const v of volleys) for (const b of v) expect(b.top).toBeUndefined();
  });

  it('none for the Wall Machine Gun', () => {
    let s = fight(gun('pistol'), {
      tech: [
        ...HL,
        'reinforced-wall',
        'steel-plating',
        'spiked-wall',
        'armour-piercing',
        'wall-machine-gun',
      ],
    });
    s = chooseCard({ ...s, offer: [{ kind: 'upgrade', id: 'wall-machine-gun' as UpgradeId }] }, 0);
    s.offer = null;
    s.gunDps = 12;
    const { volleys } = watch(s, 4 * SECOND, WALL_GUN);
    expect(volleys.length).toBeGreaterThan(0);
    for (const v of volleys) for (const b of v) expect(b.top).toBeUndefined();
  });
});

describe('the hand-load costs the RNG nothing and changes nothing unresearched (ID-284)', () => {
  it('draws exactly as many numbers as the unresearched fight, round for round', () => {
    // A rifle rolls a crit every shot, so the roll is in the count.
    const arm = (tech: readonly TechId[]) => {
      const s = fight(gun('rifle'), { tech });
      return watch(s, 6 * SECOND).end;
    };
    const with_ = arm(HL);
    const without = arm([]);
    // No kill lands earlier here (an unkillable target), so the stream is the same stream.
    expect(with_.rng).toEqual(without.rng);
  });

  it('writes no hand key without the research, and the unresearched fight has none', () => {
    const { end } = watch(fight(gun('pistol'), { tech: [] }), 5 * SECOND);
    expect(JSON.stringify(end)).not.toContain('"hand"');
    const real = playSquadHorde(squadAt(4, 4), 11, undefined, undefined, 4);
    expect(JSON.stringify(real)).not.toContain('"hand"');
    expect(JSON.stringify(startSquadHorde(squadAt(4, 4), 11, 0))).not.toContain('"hand"');
  });

  it('with the research, the hand key appears (so the check above is a check)', () => {
    const { end } = watch(fight(gun('pistol')), 2 * SECOND);
    expect(JSON.stringify(end)).toContain('"hand"');
  });
});
