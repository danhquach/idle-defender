// Design §8, as built ID-097: card levels (1, 2, max), unique epics, flat repeatable
// steps, Patch Up only on a damaged wall, Concussion and Shock Rounds, and the one ammo
// slot Incendiary and Shock Rounds share; and what each offer card says it gives.
import { describe, expect, it } from 'vitest';
import {
  chooseCard,
  effectAt,
  eligible,
  patchUpGain,
  pitch,
  replaces,
  rollOffer,
  UPGRADE_IDS,
  UPGRADES,
} from './cards.ts';
import { CARD, CARD_MAX_LEVEL, ENEMIES, SEGMENT_HEIGHT, STEP, SWARM, WEAPONS } from './data.ts';
import { enemyHp, waveCount, waveSize } from './waves.ts';
import {
  cardLevel,
  extraPierce,
  fragDamage,
  magazineOf,
  newHorde,
  rebuildWire,
  shamblerHp,
  shocked,
  stunned,
  tick,
  wireMax,
  type Bullet,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { SQUAD_CARDS } from './hordeonly.ts';
import { createRng } from './rng.ts';
import { enemy, setup } from './testing.ts';

const tough = { hp: 1000, maxHp: 1000 };
const ROW4 = 4.5 * SEGMENT_HEIGHT;
/** The cards with levels 1, 2 and max. */
const LEVELLED = UPGRADE_IDS.filter((id) => UPGRADES[id].levels === CARD_MAX_LEVEL);

/** Horde 1 with nothing left to spawn; defender a never fires. */
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
/** `s` with card `id` picked from an offer (as the player would), `times` times. */
function picked(s: HordeState, id: UpgradeId, times = 1): HordeState {
  let t = s;
  for (let i = 0; i < times; i++) {
    t = { ...t, offer: [{ kind: 'upgrade', id }] };
    t = chooseCard(t, 0);
    t.offer = null;
  }
  return t;
}
/** `s` with card `id` held at `level`. */
const at = (id: UpgradeId, level: number, s = quiet()): HordeState => picked(s, id, level);
function steps(s: HordeState, n: number): HordeState {
  let t = s;
  for (let i = 0; i < n; i++) t = tick(t, STEP);
  return t;
}
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
const find = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)!;

describe('levels (ID-097)', () => {
  it('every once-per-horde card that isn’t epic has levels 1, 2 and max; epics are unique', () => {
    expect(LEVELLED.sort()).toEqual(
      [
        'barbed-wire',
        'extended-mags',
        'incendiary-rounds',
        'piercing-rounds',
        'ricochet',
        'shock-rounds',
        'speed-loaders',
      ].sort(),
    );
    for (const id of UPGRADE_IDS.filter((u) => UPGRADES[u].rarity === 'epic')) {
      expect(UPGRADES[id].levels, id).toBe(1);
    }
    expect(UPGRADES['concussion-rounds'].rarity).toBe('epic');
    expect(UPGRADES['field-repairs']).toMatchObject({ rarity: 'epic', levels: 1 });
  });

  it.each(LEVELLED)('%s: each pick raises it by 1; at max it leaves the pool', (id) => {
    let s = quiet();
    for (let lv = 1; lv <= CARD_MAX_LEVEL; lv++) {
      expect(eligible(s, id)).toBe(true);
      s = picked(s, id);
      expect(cardLevel(s, id)).toBe(lv);
      expect(s.taken.filter((t) => t === id)).toHaveLength(1);
    }
    expect(eligible(s, id)).toBe(false);
    s.bench = [];
    for (let seed = 0; seed < 200; seed++) {
      expect(rollOffer(createRng(seed), s).some((c) => c.kind === 'upgrade' && c.id === id)).toBe(
        false,
      );
    }
  });

  it('epic cards are taken once, at their one (max) level', () => {
    for (const id of ['concussion-rounds', 'frag-grenades', 'field-repairs'] as const) {
      const s = picked(quiet(), id);
      expect(cardLevel(s, id)).toBe(1);
      expect(eligible(s, id)).toBe(false);
    }
  });

  it('levels last the horde only: a new horde holds none', () => {
    expect(newHorde(1, setup()).cardLevels).toEqual({});
    expect(newHorde(1, setup()).taken).toEqual([]);
  });

  it('Speed Loaders, Extended Mags, Barbed Wire and Ricochet use their level’s number', () => {
    for (let lv = 1; lv <= 3; lv++) {
      const s = at('extended-mags', lv);
      expect(magazineOf(s, 'pistol')).toBe(
        Math.round(WEAPONS.pistol.magazine * CARD.mags[lv - 1]!),
      );
    }
    expect(CARD.loaders).toEqual([0.9, 0.8, 0.7]);
    expect(CARD.mags.map((m) => Math.round(m * 100) / 100)).toEqual([1.33, 1.67, 2]);
    expect(CARD.pierce).toEqual([0.25, 0.5, 0.75]);
    expect(CARD.ricochet.share).toEqual([0.1, 0.18, 0.25]);
    expect(CARD.burn.share).toEqual([0.03, 0.06, 0.09]);
    expect(CARD.shock.seconds).toEqual([0.2, 0.3, 0.4]);
    expect(CARD.wire.slow).toEqual([0.15, 0.25, 0.35]);
  });

  it('Barbed Wire: each level slows enemies in the band by its share', () => {
    const FRONT = 520;
    const stepPx = ENEMIES.shambler.speed * STEP;
    for (let lv = 1; lv <= 3; lv++) {
      const s = at('barbed-wire', lv);
      const e = enemy(s, { ...tough, x: FRONT + 300, y: ROW4 });
      const moved = FRONT + 300 - find(tick(s, STEP), e.id).x;
      expect(moved).toBeCloseTo(stepPx * (1 - CARD.wire.slow[lv - 1]!), 9);
    }
  });

  it('Barbed Wire: each row has 10, 20 and 30 durability at levels 1, 2 and 3 (ID-104)', () => {
    expect(CARD.wire.durability).toEqual([10, 20, 30]);
    for (let lv = 1; lv <= 3; lv++) {
      const s = at('barbed-wire', lv);
      expect(
        s.wire.every((r) => r.durability === CARD.wire.durability[lv - 1]),
        `Lv ${lv}`,
      ).toBe(true);
    }
    // A new horde: the card is gone, and every row is whole again at level 1's.
    expect(quiet().wire.every((r) => r.durability === CARD.wire.durability[0])).toBe(true);
  });

  it('Barbed Wire: a level-up rebuilds every row, broken or worn, at the new level’s full (ID-123)', () => {
    let s = at('barbed-wire', 1);
    for (let lv = 2; lv <= CARD_MAX_LEVEL; lv++) {
      s.wire[2]!.durability = 0;
      s.wire[3]!.durability = 4;
      s.wire[3]!.hit = [7];
      s = picked(s, 'barbed-wire');
      expect(cardLevel(s, 'barbed-wire')).toBe(lv);
      const full = CARD.wire.durability[lv - 1]!;
      expect(s.wire.map((r) => [r.durability, r.max])).toEqual(
        Array.from({ length: s.wire.length }, () => [full, full]),
      );
      // An enemy that already wore a row still doesn't wear it twice.
      expect(s.wire[3]!.hit).toEqual([7]);
    }
  });

  it('Barbed Wire: each wave break rebuilds every row at the level’s full, a slab’s break included (ID-123)', () => {
    let s = at('barbed-wire', 2);
    s.wire[1]!.durability = 0;
    s.wire[5]!.durability = 3;
    s.wire[5]!.hit = [1, 2];
    expect(s.wave).toBe(1);
    // Nothing left to spawn and no enemy standing: the next step starts the break.
    s = tick(s, STEP);
    expect(s.wave).toBe(2);
    expect(s.wire.every((r) => r.durability === 20 && r.max === 20 && r.hit.length === 0)).toBe(
      true,
    );
  });

  it('Barbed Wire: a row’s full durability grows with the wave’s size, never below its level’s (ID-123)', () => {
    expect(CARD.wire.perWave).toBe(60);
    expect(wireMax(1, 8)).toBe(10);
    expect(wireMax(1, 60)).toBe(10);
    expect(wireMax(1, 90)).toBe(15);
    expect(wireMax(2, 120)).toBe(40);
    expect(wireMax(3, 208)).toBe(104);
    // Not held counts as level 1; past max as max.
    expect(wireMax(0, 120)).toBe(20);
    expect(wireMax(4, 60)).toBe(30);
    // Above the floor each enemy in the wave brings the same durability, so a row lasts about
    // the same share of a Horde 15 swarm wave as of a Horde 10 last wave (Horde 5's waves are
    // under the floor, and the rebuild at each break alone holds them).
    expect(waveSize(5, waveCount(5))).toBeLessThan(CARD.wire.perWave);
    for (const lv of [1, 2, 3]) {
      const h10 = waveSize(10, waveCount(10));
      const h15 = waveSize(15, waveCount(15), true) * SWARM.size;
      expect(h15).toBeGreaterThan(2 * h10);
      expect(wireMax(lv, h15) / h15).toBeCloseTo(wireMax(lv, h10) / h10, 2);
    }
    // A horde's rows start at level 1's full for its first wave's size; a big wave's rows,
    // rebuilt, at its size.
    const big = newHorde(1, { ...setup(), hordeNumber: 15 });
    expect(big.wire.every((r) => r.durability === 10 && r.max === 10)).toBe(true);
    big.wave = waveCount(15);
    big.taken = ['barbed-wire'];
    big.cardLevels = { 'barbed-wire': 1 };
    rebuildWire(big);
    const last = waveSize(15, waveCount(15));
    expect(last).toBeGreaterThan(CARD.wire.perWave);
    expect(big.wire.every((r) => r.durability === wireMax(1, last) && r.max === r.durability)).toBe(
      true,
    );
    expect(wireMax(1, last)).toBeGreaterThan(CARD.wire.durability[0]);
  });

  it('Extended Mags: an upgrade applies from each gun’s next reload', () => {
    const s = at('extended-mags', 1);
    s.defenders[0]!.ammo.primary = 3;
    const up = picked(s, 'extended-mags');
    expect(up.defenders[0]!.ammo.primary).toBe(3);
    expect(magazineOf(up, 'pistol')).toBe(Math.round(WEAPONS.pistol.magazine * CARD.mags[1]!));
  });

  it('Ricochet: the bounce takes its level’s share of the damage', () => {
    for (let lv = 1; lv <= 3; lv++) {
      const s = at('ricochet', lv);
      enemy(s, { ...tough, stunnedUntil: 1e9, x: 600, y: ROW4 });
      const b = enemy(s, { ...tough, stunnedUntil: 1e9, x: 600, y: ROW4 + 100 });
      shoot(s, { x: 500, y: ROW4, damage: 10 });
      expect(find(steps(s, 10), b.id).hp).toBeCloseTo(1000 - 10 * CARD.ricochet.share[lv - 1]!, 9);
    }
  });

  it('Ricochet + Piercing Rounds: a real shot’s rolled pierce carries into its bounce, at every level', () => {
    /** The pierce of every bounce seen while defender a fires for `n` steps, both cards at `lv`. */
    const bounces = (lv: number, n = 300): number[] => {
      let s = newHorde(1, setup());
      s.toSpawn = 0;
      s = picked(at('ricochet', lv, s), 'piercing-rounds', lv);
      s.defenders[0]!.ammo.primary = 1e6;
      for (const dy of [0, 60, 90]) {
        enemy(s, { hp: 1e9, maxHp: 1e9, stunnedUntil: 1e9, x: 650, y: 360 + dy });
      }
      const seen: number[] = [];
      for (let i = 0; i < n; i++) {
        s = tick(s, STEP);
        for (const b of s.bullets) if (b.ricochet && b.hit.length === 1) seen.push(b.pierce);
      }
      return seen;
    };
    for (let lv = 1; lv <= 3; lv++) {
      const seen = bounces(lv);
      expect(seen.length, `Lv ${lv}`).toBeGreaterThan(5);
      // Some bounces keep a pierce from their shot's roll; at every level (max is 75%,
      // ID-124) some shots rolled none.
      expect(
        seen.some((p) => p > 0),
        `Lv ${lv}`,
      ).toBe(true);
      expect(
        seen.some((p) => p === 0),
        `Lv ${lv}`,
      ).toBe(true);
    }
  });
});

describe('Piercing Rounds levels (ID-097)', () => {
  /** Extra pierce over `n` shots with the card at `level` (0 = none), and the RNG draws used. */
  function rolls(level: number, seed: number, n = 2000) {
    const s = level > 0 ? at('piercing-rounds', level) : quiet();
    let draws = 0;
    const base = createRng(seed);
    const rng = () => {
      draws += 1;
      return base();
    };
    const out = Array.from({ length: n }, () => extraPierce(s, rng));
    return { out, draws };
  }

  it('at every level a shot pierces by chance on the seeded RNG (25%, 50%, 75%, ID-124): the same seed, the same shots', () => {
    expect(rolls(1, 7).out).toEqual(rolls(1, 7).out);
    expect(rolls(3, 7).out).toEqual(rolls(3, 7).out);
    const share = (lv: number) => rolls(lv, 3).out.filter((p) => p === 1).length / 2000;
    expect(share(0)).toBe(0);
    // 2000 rolls: within 0.03 of the level's chance (about 3 standard deviations).
    for (const [lv, p] of [
      [1, 0.25],
      [2, 0.5],
      [3, 0.75],
    ] as const) {
      expect(Math.abs(share(lv) - p), `Lv ${lv}`).toBeLessThan(0.03);
    }
  });

  it('without the card, no roll: the fight’s RNG is left alone; with it, one roll a shot at every level', () => {
    expect(rolls(0, 11).draws).toBe(0);
    for (const lv of [1, 2, 3]) expect(rolls(lv, 11).draws, `Lv ${lv}`).toBe(2000);
  });

  it('squad bullets fired at max carry +1 pierce on some shots, not all (ID-124)', () => {
    let s = newHorde(1, setup());
    s.toSpawn = 0;
    s = at('piercing-rounds', 3, s);
    enemy(s, { ...tough, stunnedUntil: 1e9, x: 700, y: 360 });
    const seen = new Set<number>();
    for (let i = 0; i < Math.round(10 / STEP); i++) {
      s = tick(s, STEP);
      for (const b of s.bullets) seen.add(b.pierce);
    }
    expect([...seen].sort()).toEqual([WEAPONS.pistol.pierce, WEAPONS.pistol.pierce + 1]);
  });
});

describe('repeatable cards (ID-097)', () => {
  it('N picks add N flat steps, not compounded', () => {
    for (const n of [1, 3, 5]) {
      expect(picked(quiet(), 'sharpshooter', n).mods.damage).toBeCloseTo(1 + 0.1 * n, 9);
      expect(picked(quiet(), 'rapid-fire', n).mods.fireRate).toBeCloseTo(1 + 0.075 * n, 9);
      expect(picked(quiet(), 'long-sight', n).mods.range).toBeCloseTo(1 + 0.06 * n, 9);
    }
    // Five Sharpshooters were ×2.49; now +50%.
    expect(picked(quiet(), 'sharpshooter', 5).mods.damage).toBeCloseTo(1.5, 9);
  });

  it('the summed steps multiply once with other sources (Heavy Rounds)', () => {
    let s = quiet();
    s.research = ['hollow-points'];
    s = picked(s, 'sharpshooter', 2);
    s = picked(s, 'hollow-points');
    expect(s.mods.damage).toBeCloseTo(1.2 * CARD.hollowPoints, 9);
    s = picked(s, 'sharpshooter');
    expect(s.mods.damage).toBeCloseTo(1.3 * CARD.hollowPoints, 9);
  });

  it('Reinforce: each pick adds 10% of the segment’s starting max HP, and the same HP', () => {
    const s = quiet();
    const seg = s.layers[0]!.segments[0]!;
    const start = seg.maxHp;
    seg.hp = start / 2;
    const r = picked(s, 'reinforce', 4).layers[0]!.segments[0]!;
    expect(r.maxHp).toBeCloseTo(start * 1.4, 9);
    expect(r.hp).toBeCloseTo(start / 2 + start * 0.4, 9);
  });

  it('repeatable cards stay in the pool however often taken', () => {
    const s = picked(quiet(), 'sharpshooter', 12);
    expect(eligible(s, 'sharpshooter')).toBe(true);
  });
});

describe('Patch Up (ID-097)', () => {
  it('is never offered while the whole wall is at full HP', () => {
    const s = quiet();
    s.bench = [];
    expect(eligible(s, 'patch-up')).toBe(false);
    for (let seed = 0; seed < 500; seed++) {
      expect(
        rollOffer(createRng(seed), s).some((c) => c.kind === 'upgrade' && c.id === 'patch-up'),
      ).toBe(false);
    }
  });

  it('is offered once a segment is damaged or broken, showing what it restores', () => {
    const s = quiet();
    const segs = s.layers[0]!.segments;
    const max = segs[0]!.maxHp;
    segs[0]!.hp = max - 20;
    segs[1]!.hp = 0;
    expect(eligible(s, 'patch-up')).toBe(true);
    const gain = patchUpGain(s);
    expect(gain.segments).toBe(2);
    expect(gain.hp).toBeCloseTo(20 + 0.3 * max, 9);
    expect(pitch(s, 'patch-up').text).toBe(
      `Repairs ${Math.round(20 + 0.3 * max)} HP across 2 segments`,
    );
    expect(pitch(s, 'patch-up')).toMatchObject({
      tag: 'Repeatable',
      effect: {
        pre: 'Repairs ',
        to: `${Math.round(20 + 0.3 * max)} HP`,
        post: ' across 2 segments',
      },
    });
  });

  it('with Patch Up left out, the horde-only offer never comes up empty or repeats a card', () => {
    const s = quiet();
    s.bench = [];
    s.cardPool = [...SQUAD_CARDS];
    // Every card that can max out is at max: only the four repeatable commons are left.
    for (const id of SQUAD_CARDS) {
      const lv = UPGRADES[id].levels;
      if (lv !== null) {
        s.taken.push(id);
        s.cardLevels[id] = lv;
      }
    }
    for (let wave = 1; wave <= 10; wave++) {
      s.wave = wave;
      for (let seed = 0; seed < 100; seed++) {
        const ids = rollOffer(createRng(seed), s).flatMap((c) =>
          c.kind === 'upgrade' ? [c.id] : [],
        );
        expect(ids).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
        expect(ids).not.toContain('patch-up');
      }
    }
  });
});

describe('Concussion Rounds (ID-097)', () => {
  it('pushes 0.5 px per point of damage, half for the heavy kinds', () => {
    const push = (kind: 'shambler' | 'swollen') => {
      const s = at('concussion-rounds', 1);
      const e = enemy(s, { ...tough, kind, stunnedUntil: 1e9, x: 600, y: ROW4 });
      shoot(s, { x: 590, y: ROW4, damage: 10 });
      return find(tick(s, STEP), e.id).x - 600;
    };
    expect(push('shambler')).toBeCloseTo(10 * 0.5, 9);
    expect(push('swollen')).toBeCloseTo(10 * 0.5 * 0.5, 9);
  });

  it('no push again within 0.5 s of the last, but the hit still deals its damage', () => {
    const s = at('concussion-rounds', 1);
    const e = enemy(s, { ...tough, stunnedUntil: 1e9, x: 600, y: ROW4 });
    shoot(s, { x: 590, y: ROW4, damage: 10 });
    let t = tick(s, STEP);
    const first = find(t, e.id);
    expect(first.x).toBeCloseTo(605, 9);
    shoot(t, { x: first.x - 10, y: ROW4, damage: 10 });
    t = tick(t, STEP);
    expect(find(t, e.id).x).toBeCloseTo(605, 9);
    expect(find(t, e.id).hp).toBe(980);
  });

  it(`pushes one enemy at most ${CARD.concussion.cap} px in all, so steady fire can’t hold it in place (ID-124)`, () => {
    let s = at('concussion-rounds', 1);
    // Each hit would push 50 px; after the cap is spent the hits only deal damage.
    const e = enemy(s, { ...tough, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9, x: 600, y: ROW4 });
    let pushes = 0;
    let x = 600;
    for (let i = 0; i < Math.round(10 / STEP); i++) {
      shoot(s, { x: find(s, e.id).x - 10, y: ROW4, damage: 100 });
      s = tick(s, STEP);
      const now = find(s, e.id).x;
      if (now > x + 1e-9) pushes += 1;
      x = now;
    }
    expect(find(s, e.id).x - 600).toBeCloseTo(CARD.concussion.cap, 9);
    expect(find(s, e.id).pushed).toBeCloseTo(CARD.concussion.cap, 9);
    expect(pushes).toBe(Math.ceil(CARD.concussion.cap / 50));
    expect(find(s, e.id).hp).toBeLessThan(1e6 - 100 * 10);
    // Another enemy still has its whole cap.
    const o = enemy(s, { ...tough, stunnedUntil: 1e9, x: 600, y: ROW4 + 200 });
    shoot(s, { x: 590, y: ROW4 + 200, damage: 10 });
    s = tick(s, STEP);
    expect(find(s, o.id).x).toBeCloseTo(605, 9);
  });

  it('a steady stream of fire pushes an enemy at most twice a second', () => {
    let s = at('concussion-rounds', 1);
    const e = enemy(s, { ...tough, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9, x: 600, y: ROW4 });
    let pushes = 0;
    let x = 600;
    // A bullet on it every step for 3 s (far more than any LMG fires).
    for (let i = 0; i < Math.round(3 / STEP); i++) {
      shoot(s, { x: find(s, e.id).x - 10, y: ROW4, damage: 10 });
      s = tick(s, STEP);
      const now = find(s, e.id).x;
      if (now > x + 1e-9) pushes += 1;
      x = now;
    }
    expect(pushes).toBeGreaterThan(0);
    expect(pushes).toBeLessThanOrEqual(2 * 3);
  });
});

describe('Concussion Rounds with an LMG (ID-097)', () => {
  it('an LMG firing steadily at one enemy pushes it at most twice a second', () => {
    let s = newHorde(1, {
      ...setup(),
      roster: [
        {
          id: 'a',
          name: 'A',
          loadout: {
            primary: { uid: 'l1', base: 'lmg', rarity: 'common', affixes: [] },
            secondary: null,
            item: null,
          },
        },
      ],
    });
    s.toSpawn = 0;
    s = at('concussion-rounds', 1, s);
    s.defenders[0]!.ammo.primary = 1e6;
    const e = enemy(s, { hp: 1e7, maxHp: 1e7, stunnedUntil: 1e9, x: 700, y: 360 });
    const pushedAt: number[] = [];
    let x = 700;
    for (let i = 0; i < Math.round(4 / STEP); i++) {
      s = tick(s, STEP);
      const now = find(s, e.id).x;
      if (now > x + 1e-9) pushedAt.push(s.time);
      x = now;
    }
    // Hit far more often than twice a second, yet pushed only that often.
    expect(1e7 - find(s, e.id).hp).toBeGreaterThan(8 * 4 * WEAPONS.lmg.damage * 0.5);
    expect(pushedAt.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < pushedAt.length; i++) {
      expect(pushedAt[i]! - pushedAt[i - 1]!).toBeGreaterThanOrEqual(CARD.concussion.gap - 1e-9);
    }
  });
});

describe('Shock Rounds (ID-097)', () => {
  /** An enemy (1000 HP, walking) hit once by a 10-damage squad bullet with Shock Rounds at `level`. */
  function hit(level: number, kind: 'shambler' | 'brute' = 'shambler') {
    const s = at('shock-rounds', level);
    const e = enemy(s, { ...tough, kind, x: 700, y: ROW4 });
    shoot(s, { x: 690, y: ROW4, damage: 10 });
    return { t: tick(s, STEP), id: e.id, at: s.time };
  }

  it('a hit paralyses for its level’s time, half for a heavy kind, with no damage of its own', () => {
    for (let lv = 1; lv <= 3; lv++) {
      const { t, id, at: time } = hit(lv);
      const e = find(t, id);
      expect(e.shockUntil).toBeCloseTo(time + CARD.shock.seconds[lv - 1]!, 9);
      expect(stunned(t, e)).toBe(true);
      expect(shocked(t, e)).toBe(true);
      expect(e.hp).toBe(990);
      expect(e.burnUntil).toBeUndefined();
      const brute = hit(lv, 'brute');
      expect(find(brute.t, brute.id).shockUntil).toBeCloseTo(
        brute.at + CARD.shock.seconds[lv - 1]! * 0.5,
        9,
      );
    }
  });

  it('a paralysed enemy stops moving, then carries on', () => {
    const { t, id } = hit(3);
    const x = find(t, id).x;
    const held = steps(t, Math.floor(0.3 / STEP));
    expect(find(held, id).x).toBe(x);
    const on = steps(held, Math.round(0.5 / STEP));
    expect(find(on, id).x).toBeLessThan(x);
  });

  it('a new hit during a paralysis doesn’t extend it, nor one within 1 s after it ends', () => {
    const first = hit(3);
    const id = first.id;
    let t = first.t;
    const until = find(t, id).shockUntil!;
    shoot(t, { x: find(t, id).x - 10, y: ROW4, damage: 10 });
    t = tick(t, STEP);
    expect(find(t, id).shockUntil).toBe(until);
    // Just after it ends, still inside the 1 s gap.
    t = steps(t, Math.round((until - t.time + 0.5) / STEP));
    shoot(t, { x: find(t, id).x - 10, y: ROW4, damage: 10 });
    t = tick(t, STEP);
    expect(find(t, id).shockUntil).toBe(until);
    expect(stunned(t, find(t, id))).toBe(false);
    // Past the gap: a hit paralyses again.
    t = steps(t, Math.round(0.6 / STEP));
    shoot(t, { x: find(t, id).x - 10, y: ROW4, damage: 10 });
    t = tick(t, STEP);
    expect(find(t, id).shockUntil).toBeGreaterThan(until + CARD.shock.immune);
  });

  it('under a steady stream of fire, never paralysed for longer than its time in any 1 s after a stun', () => {
    let s = at('shock-rounds', 3);
    const e = enemy(s, { hp: 1e6, maxHp: 1e6, x: 700, y: ROW4 });
    const held: boolean[] = [];
    for (let i = 0; i < Math.round(5 / STEP); i++) {
      shoot(s, { x: find(s, e.id).x - 10, y: ROW4, damage: 1 });
      s = tick(s, STEP);
      held.push(stunned(s, find(s, e.id)));
    }
    const window = Math.round(1 / STEP);
    const limit = Math.ceil(CARD.shock.seconds[2]! / STEP) + 1;
    for (let i = 0; i + window <= held.length; i++) {
      expect(held.slice(i, i + window).filter(Boolean).length).toBeLessThanOrEqual(limit);
    }
    expect(held.some(Boolean)).toBe(true);
  });

  it('turret bullets never shock', () => {
    const s = at('shock-rounds', 3);
    const e = enemy(s, { ...tough, x: 700, y: ROW4 });
    shoot(s, { x: 690, y: ROW4, damage: 10, owner: 'turret:0' });
    expect(find(tick(s, STEP), e.id).shockUntil).toBeUndefined();
  });
});

describe('one ammo slot: Incendiary or Shock Rounds (ID-097)', () => {
  it('picking the other replaces the one held: it starts at level 1, the old card and its levels gone', () => {
    let s = at('incendiary-rounds', 2);
    expect(replaces(s, 'shock-rounds')).toBe('incendiary-rounds');
    expect(replaces(s, 'incendiary-rounds')).toBeNull();
    s = picked(s, 'shock-rounds');
    expect(s.taken).toEqual(['shock-rounds']);
    expect(s.cardLevels).toEqual({ 'shock-rounds': 1 });
    // The old one can come back and replace it the same way, at level 1.
    s = picked(s, 'incendiary-rounds');
    expect(s.taken).toEqual(['incendiary-rounds']);
    expect(s.cardLevels).toEqual({ 'incendiary-rounds': 1 });
  });

  it('both stay in the pool all horde, the other one even with the held one at max', () => {
    const s = at('incendiary-rounds', 3);
    expect(eligible(s, 'incendiary-rounds')).toBe(false);
    expect(eligible(s, 'shock-rounds')).toBe(true);
    expect(eligible(quiet(), 'incendiary-rounds') && eligible(quiet(), 'shock-rounds')).toBe(true);
  });

  it('after a swap, only the new card acts on new hits, at level 1; a burn already lit runs out', () => {
    let s = at('incendiary-rounds', 3);
    const a = enemy(s, { ...tough, x: 700, y: ROW4 });
    shoot(s, { x: 690, y: ROW4, damage: 10 });
    s = tick(s, STEP);
    const max = CARD.burn.share[2]! * shamblerHp(s);
    expect(find(s, a.id).burnDps).toBeCloseTo(max, 9);
    s = picked(s, 'shock-rounds');
    const b = enemy(s, { ...tough, x: 700, y: ROW4 + 200 });
    shoot(s, { x: 690, y: ROW4 + 200, damage: 10 });
    s = tick(s, STEP);
    expect(find(s, b.id).burnUntil).toBeUndefined();
    expect(find(s, b.id).shockUntil).toBeCloseTo(s.time - STEP + CARD.shock.seconds[0]!, 9);
    // The first enemy keeps burning at the rate it was lit with.
    const hp = find(s, a.id).hp;
    s = tick(s, STEP);
    expect(hp - find(s, a.id).hp).toBeCloseTo(max * STEP, 9);
  });

  it('Incendiary Rounds and Frag Grenades keep up with the hordes: a share of the wave’s Shambler HP (ID-124)', () => {
    /** Horde `n`'s quiet fight, an enemy lit by a max Incendiary hit: its burn and that wave's Shambler HP. */
    const lit = (n: number) => {
      const q = newHorde(1, { ...setup(), hordeNumber: n });
      q.toSpawn = 0;
      q.defenders[0]!.nextShotAt = 1e9;
      let s = at('incendiary-rounds', 3, q);
      const e = enemy(s, { ...tough, stunnedUntil: 1e9, x: 600, y: ROW4 });
      shoot(s, { x: 590, y: ROW4, damage: 10 });
      s = tick(s, STEP);
      expect(s.hordeNumber).toBe(n);
      const hp = enemyHp('shambler', n, s.wave, s.hpScale);
      return { burn: find(s, e.id).burnDps!, frag: fragDamage(s), hp };
    };
    const early = lit(1);
    const late = lit(15);
    for (const h of [early, late]) {
      expect(h.burn).toBeCloseTo(CARD.burn.share[2]! * h.hp, 9);
      expect(h.frag).toBeCloseTo(CARD.frag.share * h.hp, 9);
    }
    expect(late.hp).toBeGreaterThan(early.hp * 2);
    expect(late.burn).toBeGreaterThan(early.burn * 2);
    expect(late.frag).toBeGreaterThan(early.frag * 2);
  });

  it('Incendiary Rounds: each level burns at its rate', () => {
    for (let lv = 1; lv <= 3; lv++) {
      let s = at('incendiary-rounds', lv);
      const e = enemy(s, { ...tough, stunnedUntil: 1e9, x: 600, y: ROW4 });
      shoot(s, { x: 590, y: ROW4, damage: 10 });
      s = steps(s, Math.round(4 / STEP));
      const dps = CARD.burn.share[lv - 1]! * shamblerHp(s);
      expect(find(s, e.id).hp).toBeCloseTo(990 - dps * CARD.burn.seconds, 6);
    }
  });
});

describe('the offer spells out each pick (ID-097)', () => {
  it('a card not held shows "New" and its level 1 effect', () => {
    expect(pitch(quiet(), 'barbed-wire')).toMatchObject({
      tag: 'New',
      effect: { from: null, to: '15%', pre: 'Enemies ' },
    });
  });

  it('a card held shows its level step and the effect before and after', () => {
    expect(pitch(at('barbed-wire', 1), 'barbed-wire')).toMatchObject({
      tag: 'Lv 1 → 2',
      tagSpoken: 'Level 1 to 2',
      effect: { from: '15%', to: '25%' },
    });
    expect(pitch(at('barbed-wire', 2), 'barbed-wire')).toMatchObject({
      tag: 'Lv 2 → Max',
      tagSpoken: 'Level 2 to max',
      effect: { from: '25%', to: '35%' },
    });
    expect(pitch(at('extended-mags', 1), 'extended-mags').effect).toMatchObject({
      from: '×1.33',
      to: '×1.67',
    });
  });

  it('an epic shows "Unique"; a repeatable card its stack and totals', () => {
    expect(pitch(quiet(), 'concussion-rounds').tag).toBe('Unique');
    expect(pitch(quiet(), 'frag-grenades').tag).toBe('Unique');
    expect(pitch(quiet(), 'sharpshooter')).toMatchObject({
      tag: 'New',
      effect: { from: null, to: '+10%', post: ' damage' },
    });
    expect(pitch(picked(quiet(), 'sharpshooter', 3), 'sharpshooter')).toMatchObject({
      tag: '×3 → ×4',
      effect: { from: '+30%', to: '+40%', post: ' damage' },
    });
  });

  it('the other ammo card warns what it replaces, with what you’d hold before and after', () => {
    const p = pitch(at('incendiary-rounds', 2), 'shock-rounds');
    expect(p.tag).toBe('New');
    expect(p.replace).toEqual({
      warning: 'Replaces Incendiary Rounds Lv 2. Its levels are lost.',
      swap: 'Incendiary Rounds Lv 2 → Shock Rounds Lv 1',
    });
    expect(pitch(at('incendiary-rounds', 3), 'shock-rounds').replace!.warning).toBe(
      'Replaces Incendiary Rounds Lv Max. Its levels are lost.',
    );
    expect(pitch(quiet(), 'shock-rounds').replace).toBeUndefined();
  });
});

describe('a card states its number as the data has it (ID-125)', () => {
  it('Rapid Fire reads +7.5% a pick, not rounded to +8%', () => {
    expect(CARD.step.fireRate).toBe(0.075);
    expect(effectAt('rapid-fire', 1)).toEqual({ pre: '', value: '+7.5%', post: ' fire rate' });
    expect(effectAt('rapid-fire', 2)!.value).toBe('+15%');
    expect(effectAt('sharpshooter', 1)!.value).toBe('+10%');
  });
});
