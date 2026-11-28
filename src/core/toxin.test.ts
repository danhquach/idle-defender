// ID-285: Toxin Rounds, the third ammo card. A hit poisons the enemy for ~4 s (a share of this wave's
// Shambler HP a second, armour ignored, never stacking); one that dies poisoned bursts for 15% of the
// same HP on every living enemy within 50 px and poisons them, with no burst of its own: it never chains.
import { describe, expect, it } from 'vitest';
import { chooseCard, synergyOf } from './cards.ts';
import { CARD, SEGMENT_HEIGHT, STEP, TECH_FX, WEAPONS, type TechId } from './data.ts';
import {
  mkOf,
  newHorde,
  poisoned,
  shamblerHp,
  tick,
  toxBurstOf,
  toxDpsOf,
  type Bullet,
  type Enemy,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { enemy, setup } from './testing.ts';

const ROW4 = 4.5 * SEGMENT_HEIGHT;
const BIG = 1e6;

/** Horde 1, nothing to spawn, nobody fires; `tech` researched. */
function quiet(tech: readonly TechId[] = []): HordeState {
  const s = newHorde(1, { ...setup(), ...(tech.length > 0 ? { tech } : {}) });
  s.toSpawn = 0;
  for (const d of s.defenders) d.nextShotAt = 1e9;
  return s;
}
/** `s` with card `id` taken `level` times. */
function held(s: HordeState, id: UpgradeId, level = 1): HordeState {
  let t = s;
  for (let i = 0; i < level; i++) {
    t = chooseCard({ ...t, offer: [{ kind: 'upgrade', id }] }, 0);
    t.offer = null;
  }
  return t;
}
const toxic = (level = 1, tech: readonly TechId[] = []): HordeState =>
  held(quiet(tech), 'toxin-rounds', level);
/** A still enemy (stunned for good) so no one walks or separates. */
const still = (s: HordeState, x: number, y = ROW4, over: Partial<Enemy> = {}): Enemy =>
  enemy(s, { x, y, hp: BIG, maxHp: BIG, stunnedUntil: 1e9, ...over });
const find = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id);
const run = (s: HordeState, seconds: number): HordeState => {
  let t = s;
  for (let i = 0; i < Math.round(seconds / STEP); i++) t = tick(t, STEP);
  return t;
};
/** A pistol bullet 10 px from `e`, flying at it. */
const shoot = (s: HordeState, e: Enemy, damage = 10): void => {
  s.bullets.push({
    x: e.x - 10,
    y: e.y,
    dx: 1,
    dy: 0,
    speed: 1800,
    damage,
    owner: 'a',
    fromX: e.x - 10,
    fromY: e.y,
    aim: 100,
    left: 1000,
    pierce: 0,
    hit: [],
    tracer: WEAPONS.pistol.tracer,
  } satisfies Bullet);
};
/** `s` after one step in which `e` was shot. */
const hit = (s: HordeState, e: Enemy, damage = 10): HordeState => {
  shoot(s, e, damage);
  return tick(s, STEP);
};
/** An enemy of `s` that is poisoned by a bullet, at the fight's own numbers. */
const poisonedAt = (s: HordeState, x: number, y = ROW4): { s: HordeState; id: number } => {
  const e = still(s, x, y);
  return { s: hit(s, e), id: e.id };
};
/** The HP `id` loses over `seconds` of the fight. */
const lost = (s: HordeState, id: number, seconds: number): number => {
  const before = find(s, id)!.hp;
  return before - find(run(s, seconds), id)!.hp;
};

describe('the poison (ID-285)', () => {
  it('Lv 1-3: 2 / 3 / 4% of a Shambler’s HP a second, for 4 s, then it stops', () => {
    for (const [level, share] of [
      [1, 0.02],
      [2, 0.03],
      [3, 0.04],
    ] as const) {
      const base = toxic(level);
      const { s, id } = poisonedAt(base, 700);
      const e = find(s, id)!;
      expect(e.toxDps! / shamblerHp(s), `Lv ${level}`).toBeCloseTo(share, 9);
      expect(e.toxUntil).toBeCloseTo(base.time + CARD.toxin.seconds, 9);
      // A second of it, then after 4 s from the hit nothing more.
      expect(lost(s, id, 1), `Lv ${level}`).toBeCloseTo(share * shamblerHp(s), 3);
      // The whole poison: exactly 4 s of it, no tick more or less (the hit's own step ticks once,
      // counted in `burnt`, as Incendiary's burn does).
      expect(lost(s, id, CARD.toxin.seconds + 0.2) + e.burnt!, `Lv ${level}`).toBeCloseTo(
        share * shamblerHp(s) * CARD.toxin.seconds,
        3,
      );
      const after = run(s, CARD.toxin.seconds + 0.2);
      expect(poisoned(after, find(after, id)!)).toBe(false);
      expect(lost(after, id, 2)).toBe(0);
    }
  });

  it('a new hit restarts it and never stacks: still one rate, and the end moves out', () => {
    const { s, id } = poisonedAt(toxic(2), 700);
    const mid = run(s, 3);
    const first = find(mid, id)!.toxUntil!;
    const again = hit(mid, find(mid, id)!);
    expect(find(again, id)!.toxUntil!).toBeGreaterThan(first + 2.9);
    expect(find(again, id)!.toxUntil!).toBeCloseTo(again.time - STEP + CARD.toxin.seconds, 6);
    expect(lost(again, id, 1)).toBeCloseTo(0.03 * shamblerHp(again), 3);
  });

  it('is armour-proof: a Brute loses the same poison as a Shambler', () => {
    const s = toxic();
    const a = still(s, 700);
    const b = still(s, 700, ROW4 + 120, { kind: 'brute' });
    shoot(s, a);
    shoot(s, b);
    const t = tick(s, STEP);
    const dpsA = find(t, a.id)!.toxDps!;
    expect(find(t, b.id)!.toxDps).toBe(dpsA);
    const la = lost(t, a.id, 1);
    const lb = lost(t, b.id, 1);
    expect(lb).toBeCloseTo(la, 6);
  });

  it('adds no field without the card, and a hit that kills sets none', () => {
    const s = quiet();
    const e = still(s, 700);
    const t = hit(s, e);
    const got = find(t, e.id)!;
    expect(got.toxUntil).toBeUndefined();
    expect(got.toxDps).toBeUndefined();
    expect(got.toxBurst).toBeUndefined();
    const k = toxic();
    const dead = still(k, 700, ROW4, { hp: 5, maxHp: 5 });
    const u = hit(k, dead, 50);
    expect(find(u, dead.id)).toBeUndefined();
    expect(u.blasts.some((b) => b.skill === 'toxin')).toBe(false);
  });

  it('is not fire: it lights no Oil Bomb slick and no Tar Moat (Incendiary Rounds does)', () => {
    for (const [id, lights] of [
      ['toxin-rounds', false],
      ['incendiary-rounds', true],
    ] as const) {
      const s = held(quiet(), id);
      s.slicks.push({ x: 700, y: ROW4, at: 0, until: 100 });
      const e = still(s, 700);
      const t = hit(s, e);
      expect(t.slicks[0]!.litAt !== undefined, `slick ${id}`).toBe(lights);
    }
    for (const [id, lights] of [
      ['toxin-rounds', false],
      ['incendiary-rounds', true],
    ] as const) {
      const s = held(held(quiet(), 'tar-moat'), id);
      const e = still(s, 550, 300);
      const t = hit(s, e);
      expect(t.moat?.litAt !== undefined, `moat ${id}`).toBe(lights);
    }
  });

  it('has no synergy, with or without an Oil Bomb', () => {
    expect(synergyOf(quiet(), 'toxin-rounds')).toBeNull();
    expect(synergyOf(held(quiet(), 'oil-bomb'), 'toxin-rounds')).toBeNull();
    expect(synergyOf(held(quiet(), 'toxin-rounds'), 'oil-bomb')).toBeNull();
  });
});

describe('the death burst (ID-285)', () => {
  /** A poisoned victim at x 700 with hp so low that its next poison tick kills it, and a still target `dx` px away. */
  function doomed(dx: number, over: Partial<Enemy> = {}) {
    const { s, id } = poisonedAt(toxic(), 700);
    find(s, id)!.hp = 1e-9;
    const target = still(s, 700 + dx, ROW4, over);
    return { s, id, target };
  }

  it('a death by poison bursts for 15% of a Shambler’s HP on an enemy within 50 px: 50 hit, 51 not', () => {
    const near = doomed(50);
    const far = still(near.s, 751);
    const t = tick(near.s, STEP);
    expect(find(t, near.id)).toBeUndefined();
    expect(find(t, near.target.id)!.hp).toBeCloseTo(BIG - 0.15 * shamblerHp(t), 3);
    expect(find(t, far.id)!.hp).toBe(BIG);
    expect(t.blasts).toContainEqual(
      expect.objectContaining({ skill: 'toxin', x: 700, y: ROW4, radius: CARD.toxin.radius }),
    );
    // Armour does not cut it: a Brute takes the same.
    const brute = doomed(30, { kind: 'brute' });
    expect(find(tick(brute.s, STEP), brute.target.id)!.hp).toBeCloseTo(
      BIG - 0.15 * shamblerHp(brute.s),
      3,
    );
  });

  it('a death by a bullet bursts', () => {
    const { s, id } = poisonedAt(toxic(), 700);
    find(s, id)!.hp = 5;
    const target = still(s, 740);
    const t = hit(s, find(s, id)!, 500);
    expect(find(t, id)).toBeUndefined();
    expect(find(t, target.id)!.hp).toBeLessThan(BIG);
  });

  it('a death by a Frag Grenade bursts', () => {
    const { s, id } = poisonedAt(toxic(), 700);
    find(s, id)!.hp = 1;
    const target = still(s, 730);
    s.grenades.push({
      by: 'a',
      fromX: 400,
      fromY: ROW4,
      x: 700,
      y: ROW4,
      at: s.time,
      lands: s.time,
      burst: false,
    });
    const t = tick(s, STEP);
    expect(find(t, id)).toBeUndefined();
    // The grenade's own burst (25%) also reaches it: the poison's 15% comes on top.
    const frag = CARD.frag.share * shamblerHp(t);
    expect(find(t, target.id)!.hp).toBeCloseTo(BIG - frag - 0.15 * shamblerHp(t), 3);
  });

  it('poisons what it hits at the dead one’s rate, so the victim then loses HP each second', () => {
    const { s, target } = doomed(40);
    const t = tick(s, STEP);
    const v = find(t, target.id)!;
    expect(poisoned(t, v)).toBe(true);
    expect(v.toxDps).toBeCloseTo(0.02 * shamblerHp(t), 6);
    expect(v.toxUntil).toBeCloseTo(t.time - STEP + CARD.toxin.seconds, 6);
    expect(lost(t, target.id, 1)).toBeCloseTo(0.02 * shamblerHp(t), 3);
  });

  it('never chains: a burst-poisoned enemy that dies bursts nothing', () => {
    const { s, target } = doomed(40);
    const farther = still(s, 790);
    const t = tick(s, STEP);
    expect(find(t, target.id)!.toxBurst).toBeUndefined();
    find(t, target.id)!.hp = 1e-9;
    const u = tick(t, STEP);
    expect(find(u, target.id)).toBeUndefined();
    expect(find(u, farther.id)!.hp).toBeCloseTo(find(t, farther.id)!.hp, 6);
    expect(u.blasts.filter((b) => b.skill === 'toxin')).toHaveLength(1);
  });

  it('one a burst kills in the same pass does not burst in turn, even if it was poisoned itself', () => {
    const { s, id } = poisonedAt(toxic(), 700);
    find(s, id)!.hp = 1e-9;
    const b = still(s, 740, ROW4, { hp: 1e-6, maxHp: 1e-6 });
    s.enemies.find((e) => e.id === b.id)!.toxUntil = s.time + 4;
    b.toxBurst = 1e5;
    b.toxDps = 0;
    const c = still(s, 790);
    const t = tick(s, STEP);
    expect(find(t, id)).toBeUndefined();
    expect(find(t, b.id)).toBeUndefined();
    expect(find(t, c.id)!.hp).toBe(BIG);
    expect(t.blasts.filter((x) => x.skill === 'toxin')).toHaveLength(1);
  });

  it('two poisoned deaths in one step each burst, and an enemy between them takes both', () => {
    const { s, id } = poisonedAt(toxic(), 700);
    find(s, id)!.hp = 1e-9;
    const two = still(s, 780, ROW4, { hp: 1e-9, maxHp: 1e-9 });
    two.toxUntil = s.time + 4;
    two.toxBurst = 0.15 * shamblerHp(s);
    two.toxDps = 1;
    const mid = still(s, 740);
    const t = tick(s, STEP);
    expect(find(t, mid.id)!.hp).toBeCloseTo(BIG - 2 * 0.15 * shamblerHp(t), 3);
    expect(t.blasts.filter((x) => x.skill === 'toxin')).toHaveLength(2);
  });

  it('the boundary: the last poison tick that kills bursts; death once it ran out does not', () => {
    const last = doomed(30);
    find(last.s, last.id)!.toxUntil = last.s.time + 0.001;
    const t = tick(last.s, STEP);
    expect(find(t, last.id)).toBeUndefined();
    expect(find(t, last.target.id)!.hp).toBeLessThan(BIG);

    const over = doomed(30);
    const e = find(over.s, over.id)!;
    e.toxUntil = over.s.time;
    // Past its end it neither ticks nor bursts: a death from something else is a plain one.
    e.hp = 0;
    const u = tick(over.s, STEP);
    expect(find(u, over.id)).toBeUndefined();
    expect(find(u, over.target.id)!.hp).toBe(BIG);
    expect(u.blasts.some((b) => b.skill === 'toxin')).toBe(false);
  });

  it('the boundary on the real schedule: poisoned by a hit, the last tick of the 4 s kills it and it bursts', () => {
    const { s, id } = poisonedAt(toxic(), 700);
    const target = still(s, 730);
    // The hit's step ticked once; run to the step of the last tick, then leave it HP for less than one tick.
    const before = run(s, CARD.toxin.seconds - 2 * STEP);
    const v = find(before, id)!;
    expect(poisoned(before, v)).toBe(true);
    v.hp = (v.toxDps! * STEP) / 2;
    const t = tick(before, STEP);
    expect(find(t, id)).toBeUndefined();
    expect(find(t, target.id)!.hp).toBeCloseTo(BIG - 0.15 * shamblerHp(t), 3);
  });

  it('a bullet-poisoned enemy in a burst keeps its own burst and the stronger rate, and bursts later', () => {
    const { s, id: a } = poisonedAt(toxic(), 700);
    // B is poisoned by its own bullet at Lv 2 (a higher rate than A's Lv 1 poison).
    const lv2 = held(s, 'toxin-rounds');
    const b = still(lv2, 730);
    const shot = hit(lv2, b);
    const own = find(shot, b.id)!;
    const ownBurst = own.toxBurst!;
    const ownRate = own.toxDps!;
    expect(ownRate).toBeGreaterThan(find(shot, a)!.toxDps!);
    find(shot, a)!.hp = 1e-9;
    const t = tick(shot, STEP);
    expect(find(t, a)).toBeUndefined();
    const after = find(t, b.id)!;
    expect(after.toxBurst).toBe(ownBurst);
    expect(after.toxDps).toBe(ownRate);
    expect(after.toxUntil).toBeCloseTo(t.time - STEP + CARD.toxin.seconds, 6);
    // B dies later and bursts on C.
    const c = still(t, 770);
    after.hp = 1e-9;
    const u = tick(t, STEP);
    expect(find(u, b.id)).toBeUndefined();
    expect(find(u, c.id)!.hp).toBeCloseTo(BIG - ownBurst, 3);
  });

  it('a burst that is not due again: an enemy never poisoned bursts nothing', () => {
    const s = toxic();
    const dead = still(s, 700, ROW4, { hp: 0 });
    const target = still(s, 720);
    const t = tick(s, STEP);
    expect(find(t, dead.id)).toBeUndefined();
    expect(find(t, target.id)!.hp).toBe(BIG);
  });

  it('a Swollen’s blast on the wall takes it off the field with no burst', () => {
    const s = toxic();
    const e = enemy(s, { kind: 'swollen', x: 521, y: ROW4, hp: 60, maxHp: 60 });
    e.toxUntil = s.time + 4;
    e.toxBurst = 0.15 * shamblerHp(s);
    e.toxDps = 0;
    const target = still(s, 545);
    const t = run(s, 0.2);
    expect(find(t, e.id)).toBeUndefined();
    expect(t.bursts.length).toBe(1);
    expect(find(t, target.id)!.hp).toBe(BIG);
    expect(t.blasts.some((b) => b.skill === 'toxin')).toBe(false);
  });

  it('after a swap to another ammo card the poison runs on and still bursts', () => {
    const { s, id } = poisonedAt(toxic(), 700);
    const swapped = held(s, 'shock-rounds');
    expect(swapped.taken).not.toContain('toxin-rounds');
    expect(lost(swapped, id, 1)).toBeCloseTo(0.02 * shamblerHp(swapped), 3);
    find(swapped, id)!.hp = 1e-9;
    const target = still(swapped, 730);
    const t = tick(swapped, STEP);
    expect(find(t, id)).toBeUndefined();
    expect(find(t, target.id)!.hp).toBeLessThan(BIG);
  });
});

describe('Mk II and Mk III (ID-285)', () => {
  const nodes = (mk: 0 | 1 | 2): TechId[] =>
    (['toxin-rounds', 'toxin-rounds-mk2', 'toxin-rounds-mk3'] as const).slice(
      0,
      mk + 1,
    ) as TechId[];

  it('Mk II: poison and burst x1.15, Mk III x1.3, the highest counts', () => {
    for (const [mk, f] of [
      [0, 1],
      [1, 1.15],
      [2, 1.3],
    ] as const) {
      const s = toxic(2, nodes(mk));
      expect(mkOf(s, 'toxin-rounds')).toBe(mk);
      expect(toxDpsOf(s) / shamblerHp(s)).toBeCloseTo(0.03 * f, 9);
      expect(toxBurstOf(s) / shamblerHp(s)).toBeCloseTo(0.15 * f, 9);
    }
    const only3 = toxic(1, ['toxin-rounds-mk3']);
    expect(mkOf(only3, 'toxin-rounds')).toBe(2);
    expect(toxBurstOf(only3) / shamblerHp(only3)).toBeCloseTo(0.15 * TECH_FX.mk.toxinBurst[1], 9);
  });

  it('gives no Mk to a card not held, and the hit fixes the numbers it was made with', () => {
    const notHeld = quiet(nodes(2));
    expect(mkOf(notHeld, 'toxin-rounds')).toBe(0);
    const s = toxic(1, nodes(2));
    const { s: t, id } = poisonedAt(s, 700);
    expect(find(t, id)!.toxDps! / shamblerHp(t)).toBeCloseTo(0.02 * 1.3, 9);
    expect(find(t, id)!.toxBurst! / shamblerHp(t)).toBeCloseTo(0.15 * 1.3, 9);
  });
});
