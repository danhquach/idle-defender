// Design §8, as built ID-097: card levels (1, 2, max), unique epics, flat repeatable
// steps, Patch Up only on a damaged wall, Concussion and Shock Rounds, and the one ammo
// slot Incendiary and Shock Rounds share; and what each offer card says it gives.
import { describe, expect, it } from 'vitest';
import {
  chooseCard,
  crowded,
  effectAt,
  eligible,
  patchUpGain,
  pitch,
  replaces,
  rollOffer,
  THROWABLE_CARDS,
  UPGRADE_IDS,
  UPGRADES,
} from './cards.ts';
import { CARD, CARD_MAX_LEVEL, ENEMIES, SEGMENT_HEIGHT, STEP, SWARM, WEAPONS } from './data.ts';
import { enemyHp, waveCount, waveSize } from './waves.ts';
import {
  cardLevel,
  extraPierce,
  fireDps,
  fragDamage,
  gunRange,
  magazineOf,
  newHorde,
  rebuildWire,
  reloadIn,
  shamblerHp,
  shocked,
  stunned,
  tick,
  wireMax,
  type Bullet,
  type Enemy,
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
        'aim-for-the-head',
        'barbed-wire',
        'extended-mags',
        'first-aid-kits',
        'flashbang',
        'hollow-point-rounds',
        'incendiary-rounds',
        'kevlar-vests',
        'molotov',
        'piercing-rounds',
        'ricochet',
        'sandbags',
        'scavenged-ammo',
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
    // The survivor cards are offered only while the line is in trouble (ID-131).
    s.defenders[0]!.hp = 1;
    // Sandbags is offered only once enemies have reached the outer wall (ID-132).
    s.layers[0]!.segments[0]!.hp -= 1;
    // Flashbang and Molotov only while a crowd stands on the field (ID-139).
    for (let i = 0; i < CARD.crowd; i++) enemy(s, { ...tough, x: 900, y: ROW4 + i * 10 });
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

  it('Barbed Wire: a wave break keeps every row’s wear, broken rows broken; only a level-up rebuilds (ID-133)', () => {
    let s = at('barbed-wire', 2);
    s.wire[1]!.durability = 0;
    s.wire[5]!.durability = 3;
    s.wire[5]!.hit = [1, 2];
    expect(s.wave).toBe(1);
    // Nothing left to spawn and no enemy standing: the next step starts the break.
    s = tick(s, STEP);
    expect(s.wave).toBe(2);
    expect(s.wire.map((r) => r.durability)).toEqual([20, 0, 20, 20, 20, 3, 20, 20, 20, 20]);
    expect(s.wire.every((r) => r.max === 20 && r.hit.length === 0)).toBe(true);
    // The level-up rebuilds them all at its full.
    s = picked(s, 'barbed-wire');
    expect(s.wire.every((r) => r.durability === 30 && r.max === 30)).toBe(true);
  });

  it('Barbed Wire: at a wave break a row’s full follows the wave’s size, its worn share kept (ID-133)', () => {
    let s = at('barbed-wire', 2);
    // As if the last wave had been half the size: rows sized at 10.
    for (const row of s.wire) [row.durability, row.max] = [10, 10];
    s.wire[0]!.durability = 0;
    s.wire[1]!.durability = 5;
    s.wire[2]!.durability = 1;
    s.wire[3]!.durability = 0.2;
    s = tick(s, STEP);
    expect(s.wave).toBe(2);
    expect(s.wire.every((r) => r.max === 20)).toBe(true);
    // Broken stays broken, half stays half, and a worn row never rounds down to broken.
    expect(s.wire.slice(0, 5).map((r) => r.durability)).toEqual([0, 10, 2, 1, 20]);
    // And a shrinking wave shrinks the full the same way.
    for (const row of s.wire) [row.durability, row.max] = [row.durability * 2, 40];
    s.toSpawn = 0;
    s.enemies = [];
    s = tick(s, STEP);
    expect(s.wire.slice(0, 5).map((r) => [r.durability, r.max])).toEqual([
      [0, 20],
      [10, 20],
      [2, 20],
      [1, 20],
      [20, 20],
    ]);
  });

  it('Barbed Wire: a row’s full durability grows with the wave’s size, never below its level’s (ID-123)', () => {
    // 30 since ID-133 (was 60).
    expect(CARD.wire.perWave).toBe(30);
    expect(wireMax(1, 8)).toBe(10);
    expect(wireMax(1, 30)).toBe(10);
    expect(wireMax(1, 45)).toBe(15);
    expect(wireMax(2, 60)).toBe(40);
    expect(wireMax(3, 208)).toBe(208);
    // Not held counts as level 1; past max as max.
    expect(wireMax(0, 60)).toBe(20);
    expect(wireMax(4, 30)).toBe(30);
    // Above the floor each enemy in the wave brings the same durability, so a row lasts about
    // the same share of a Horde 15 swarm wave as of a Horde 10 last wave (at 30, Horde 5's last
    // wave is over the floor too, ID-133).
    expect(waveSize(5, waveCount(5))).toBeGreaterThan(CARD.wire.perWave);
    for (const lv of [1, 2, 3]) {
      const h10 = waveSize(10, waveCount(10));
      const h15 = waveSize(15, waveCount(15), true) * SWARM.size;
      expect(h15).toBeGreaterThan(1.4 * h10);
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
    // ID-128: a rebuild with enemies still standing (horde-only waves overlap) is sized for
    // them too, never under the wave's own size.
    const hard = newHorde(1, { ...setup(), hordeNumber: 15, harder: true });
    hard.wave = waveCount(15) - 1;
    hard.taken = ['barbed-wire'];
    hard.cardLevels = { 'barbed-wire': 1 };
    const wave = waveSize(15, hard.wave, true) * (hard.swarm ? SWARM.size : 1);
    hard.toSpawn = wave;
    for (let i = 0; i < 40; i++) enemy(hard, { x: 1200 });
    enemy(hard, { x: 1200, hp: 0 });
    rebuildWire(hard);
    expect(hard.wire.every((r) => r.max === wireMax(1, wave + 40))).toBe(true);
    hard.toSpawn = 0;
    rebuildWire(hard);
    expect(hard.wire.every((r) => r.max === wireMax(1, wave))).toBe(true);
    // Only there: the full game's rows (a pick mid-wave) stay sized for the wave.
    const full = newHorde(1, { ...setup(), hordeNumber: 15 });
    full.wave = waveCount(15);
    full.taken = ['barbed-wire'];
    full.cardLevels = { 'barbed-wire': 1 };
    full.toSpawn = 10;
    for (let i = 0; i < 80; i++) enemy(full, { x: 1200 });
    rebuildWire(full);
    expect(full.wire.every((r) => r.max === wireMax(1, last))).toBe(true);
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
    expect(s.mods.damage).toBeCloseTo(1.2 * CARD.heavyRounds.damage, 9);
    s = picked(s, 'sharpshooter');
    expect(s.mods.damage).toBeCloseTo(1.3 * CARD.heavyRounds.damage, 9);
  });

  it('Heavy Rounds (ID-136): epic and unique, +38% damage for +25% reload time, named on the card', () => {
    expect(UPGRADES['hollow-points']).toMatchObject({ rarity: 'epic', levels: 1 });
    expect(UPGRADES['hollow-points'].text).toBe('+38% damage, +25% reload time');
    expect(CARD.heavyRounds).toEqual({ damage: 1.38, reload: 1.25 });
    let s = quiet();
    s.research = ['hollow-points'];
    const d = s.defenders[0]!;
    const plain = reloadIn(s, d, 'pistol');
    s = picked(s, 'hollow-points');
    expect(s.mods.damage).toBeCloseTo(1.38, 9);
    expect(reloadIn(s, d, 'pistol')).toBeCloseTo(plain * 1.25, 9);
    // It multiplies with Speed Loaders: max (×0.7) and Heavy Rounds reload in ×0.875.
    s = picked(s, 'speed-loaders', 3);
    expect(reloadIn(s, d, 'pistol')).toBeCloseTo(plain * 0.7 * 1.25, 9);
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

  it('no push again within 0.5 s of the last, but the hit still deals its damage (dazed: ×1.3, ID-137)', () => {
    const s = at('concussion-rounds', 1);
    const e = enemy(s, { ...tough, stunnedUntil: 1e9, x: 600, y: ROW4 });
    shoot(s, { x: 590, y: ROW4, damage: 10 });
    let t = tick(s, STEP);
    const first = find(t, e.id);
    expect(first.x).toBeCloseTo(605, 9);
    shoot(t, { x: first.x - 10, y: ROW4, damage: 10 });
    t = tick(t, STEP);
    expect(find(t, e.id).x).toBeCloseTo(605, 9);
    expect(find(t, e.id).hp).toBeCloseTo(1000 - 10 - 10 * (1 + CARD.concussion.daze), 9);
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

describe('one throwable slot: Frag Grenades, Flashbang or Molotov (ID-139)', () => {
  const THROWN: readonly UpgradeId[] = ['frag-grenades', 'flashbang', 'molotov'];

  /** `n` enemies standing out on the field (held still), for a crowd. */
  function crowd(s: HordeState, n: number, extra: Partial<Enemy> = {}): Enemy[] {
    return Array.from({ length: n }, (_, i) =>
      enemy(s, {
        ...tough,
        stunnedUntil: 0,
        x: 900 + (i % 4) * 20,
        y: ROW4 + Math.floor(i / 4) * 20,
        ...extra,
      }),
    );
  }

  it('the slot holds exactly these three cards', () => {
    expect(THROWABLE_CARDS).toEqual(THROWN);
    expect(UPGRADES.flashbang).toMatchObject({ rarity: 'rare', levels: CARD_MAX_LEVEL });
    expect(UPGRADES.molotov).toMatchObject({ rarity: 'rare', levels: CARD_MAX_LEVEL });
    expect(UPGRADES['frag-grenades'].levels).toBe(1);
  });

  it('picking another throwable replaces the one held, at level 1, the old one and its levels gone', () => {
    let s = at('molotov', 2);
    expect(replaces(s, 'flashbang')).toBe('molotov');
    expect(replaces(s, 'frag-grenades')).toBe('molotov');
    expect(replaces(s, 'molotov')).toBeNull();
    s = picked(s, 'flashbang');
    expect(s.taken).toEqual(['flashbang']);
    expect(s.cardLevels).toEqual({ flashbang: 1 });
    s = picked(s, 'frag-grenades');
    expect(s.taken).toEqual(['frag-grenades']);
    expect(s.cardLevels).toEqual({ 'frag-grenades': 1 });
    s = picked(s, 'molotov');
    expect(s.taken).toEqual(['molotov']);
    expect(s.cardLevels).toEqual({ molotov: 1 });
    // An ammo card is another slot: it neither replaces a throwable nor is replaced by one.
    const both = picked(s, 'shock-rounds');
    expect(both.taken).toEqual(['molotov', 'shock-rounds']);
    expect(replaces(both, 'flashbang')).toBe('molotov');
    expect(replaces(both, 'incendiary-rounds')).toBe('shock-rounds');
  });

  it('a held Flashbang or Molotov levels up in place, and keeps its other cards', () => {
    for (const id of ['flashbang', 'molotov'] as const) {
      let s = at(id, 1);
      s = picked(s, 'sharpshooter');
      s = picked(s, id);
      expect(s.cardLevels[id]).toBe(2);
      s = picked(s, id);
      expect(s.cardLevels[id]).toBe(3);
      expect(s.taken).toEqual([id, 'sharpshooter']);
      expect(replaces(s, id)).toBeNull();
    }
  });

  it('the unique Frag Grenades is not offered again once held; the others are, until maxed', () => {
    const s = (held: UpgradeId, level = 1) => {
      const t = at(held, level);
      crowd(t, CARD.crowd);
      return t;
    };
    expect(eligible(s('frag-grenades'), 'frag-grenades')).toBe(false);
    expect(eligible(s('frag-grenades'), 'flashbang')).toBe(true);
    expect(eligible(s('frag-grenades'), 'molotov')).toBe(true);
    expect(eligible(s('molotov', 2), 'molotov')).toBe(true);
    expect(eligible(s('molotov', 3), 'molotov')).toBe(false);
    expect(eligible(s('molotov', 3), 'flashbang')).toBe(true);
    expect(eligible(s('flashbang', 3), 'flashbang')).toBe(false);
    expect(eligible(s('flashbang', 3), 'frag-grenades')).toBe(true);
  });

  it('a Flashbang or Molotov is offered only while CARD.crowd enemies stand outside the camp; Frag Grenades always', () => {
    const base = (): HordeState => quiet();
    expect(CARD.crowd).toBe(12);
    for (const id of ['flashbang', 'molotov'] as const) {
      const s = base();
      expect(eligible(s, id), 'none').toBe(false);
      crowd(s, CARD.crowd - 1);
      expect(eligible(s, id), 'one short').toBe(false);
      expect(crowded(s)).toBe(false);
      crowd(s, 1);
      expect(crowded(s)).toBe(true);
      expect(eligible(s, id), 'exactly enough').toBe(true);
      // Dead enemies and ones in the camp don't count.
      s.enemies[0]!.hp = 0;
      expect(eligible(s, id), 'a dead one').toBe(false);
      s.enemies[0]!.hp = 1000;
      s.enemies[1]!.inCamp = true;
      expect(eligible(s, id), 'one in camp').toBe(false);
    }
    expect(eligible(base(), 'frag-grenades')).toBe(true);
  });

  it('warns what a pick replaces: a unique card has no level to lose', () => {
    // Frag Grenades held (unique): no level, no "levels are lost".
    expect(pitch(at('frag-grenades', 1), 'molotov').replace).toEqual({
      warning: 'Replaces Frag Grenades.',
      swap: 'Frag Grenades → Molotov Lv 1',
    });
    expect(pitch(at('frag-grenades', 1), 'flashbang').replace).toEqual({
      warning: 'Replaces Frag Grenades.',
      swap: 'Frag Grenades → Flashbang Lv 1',
    });
    // A levelled card held: its level, and that its levels are lost.
    expect(pitch(at('molotov', 2), 'flashbang').replace).toEqual({
      warning: 'Replaces Molotov Lv 2. Its levels are lost.',
      swap: 'Molotov Lv 2 → Flashbang Lv 1',
    });
    expect(pitch(at('flashbang', 3), 'molotov').replace!.warning).toBe(
      'Replaces Flashbang Lv Max. Its levels are lost.',
    );
    // To a unique card: it starts with no level.
    expect(pitch(at('molotov', 2), 'frag-grenades').replace).toEqual({
      warning: 'Replaces Molotov Lv 2. Its levels are lost.',
      swap: 'Molotov Lv 2 → Frag Grenades',
    });
    // Nothing held, or the card itself held: nothing replaced.
    expect(pitch(quiet(), 'molotov').replace).toBeUndefined();
    expect(pitch(at('molotov', 1), 'molotov').replace).toBeUndefined();
    // Another slot's card is not what it replaces.
    expect(pitch(at('shock-rounds', 1), 'molotov').replace).toBeUndefined();
  });

  describe('the timer', () => {
    it('is set to now on the first throwable pick only; any other pick leaves it unset', () => {
      const s = quiet();
      s.time = 5;
      expect(picked(s, 'sharpshooter').nextThrowAt).toBeUndefined();
      expect(picked(s, 'shock-rounds').nextThrowAt).toBeUndefined();
      for (const id of THROWN) expect(picked(s, id).nextThrowAt, id).toBe(5);
    });

    it('is kept across a swap and across a level-up', () => {
      let s = picked(quiet(), 'flashbang');
      s.time = 9;
      s.nextThrowAt = 20; // the next throw still waits
      s = picked(s, 'molotov'); // a swap
      expect(s.nextThrowAt).toBe(20);
      s = picked(s, 'molotov'); // a level
      expect(s.nextThrowAt).toBe(20);
      s = picked(s, 'frag-grenades'); // a swap to the unique card
      expect(s.nextThrowAt).toBe(20);
      s = picked(s, 'flashbang');
      expect(s.nextThrowAt).toBe(20);
      // A swap with the timer in the past throws on the next step: nothing is reset to wait.
      s.nextThrowAt = 0;
      s = picked(s, 'molotov');
      expect(s.nextThrowAt).toBe(0);
    });

    it('each card comes every `every` s per survivor on the line', () => {
      expect(CARD.flashbang.every).toBe(10);
      expect(CARD.molotov.every).toBe(12);
      for (const id of ['flashbang', 'molotov'] as const) {
        const s = at(id, 1);
        crowd(s, 3);
        s.nextThrowAt = 0;
        const t = tick(s, STEP);
        expect(t.grenades, id).toHaveLength(1);
        expect(t.grenades[0]!.item).toBe(id);
        expect(t.nextThrowAt).toBeCloseTo(t.grenades[0]!.at + CARD[id].every, 9);
      }
    });

    it('a throw is a feat for the thrower, and only Frag Grenades takes their hands (ID-137)', () => {
      const shot = (id: UpgradeId): { after: number; feats: number } => {
        const s = at(id, 1);
        crowd(s, 3);
        s.nextThrowAt = 0;
        s.defenders[0]!.nextShotAt = 5;
        const t = tick(s, STEP);
        expect(t.grenades).toHaveLength(1);
        return {
          after: t.defenders[0]!.nextShotAt,
          feats: t.feats.filter((f) => f.kind === 'throw').length,
        };
      };
      expect(shot('frag-grenades')).toEqual({ after: 5 + CARD.frag.pause, feats: 1 });
      expect(shot('flashbang')).toEqual({ after: 5, feats: 1 });
      expect(shot('molotov')).toEqual({ after: 5, feats: 1 });
    });
  });

  describe('a throw in the air', () => {
    /** The throw of `id` at `lv`: a group of enemies, the timer due, one step. */
    function thrown(id: UpgradeId, lv: number): HordeState {
      const s = at(id, lv);
      crowd(s, 6);
      s.nextThrowAt = 0;
      return tick(s, STEP);
    }

    it('carries its level’s seconds when thrown', () => {
      for (let lv = 1; lv <= 3; lv++) {
        expect(thrown('flashbang', lv).grenades[0]!.seconds, `flashbang ${lv}`).toBe(
          CARD.flashbang.seconds[lv - 1],
        );
        expect(thrown('molotov', lv).grenades[0]!.seconds, `molotov ${lv}`).toBe(
          CARD.molotov.seconds[lv - 1],
        );
      }
      expect(thrown('frag-grenades', 1).grenades[0]!.seconds).toBeUndefined();
      expect(thrown('frag-grenades', 1).grenades[0]!.item).toBeUndefined();
    });

    it('a Molotov in the air when the card is swapped lands as the fire it was, at the level it was thrown', () => {
      let s = thrown('molotov', 3);
      const g = s.grenades[0]!;
      expect(g.seconds).toBe(CARD.molotov.seconds[2]);
      // Swap to a Flashbang, then to Frag Grenades, while it flies.
      s = picked(s, 'flashbang');
      s = picked(s, 'frag-grenades');
      s.nextThrowAt = 1e9; // nothing more is thrown
      while (s.time < g.lands + STEP) s = tick(s, STEP);
      expect(s.fires).toHaveLength(1);
      expect(s.fires[0]!.until - s.fires[0]!.at).toBeCloseTo(CARD.molotov.seconds[2]!, 9);
      expect({ x: s.fires[0]!.x, y: s.fires[0]!.y }).toEqual({ x: g.x, y: g.y });
      expect(s.blasts.some((b) => b.skill === 'flashbang')).toBe(false);
      expect(s.grenades.filter((k) => !k.burst)).toEqual([]);
    });

    it('a Flashbang in the air when the card is swapped lands as the stun it was, at the level it was thrown', () => {
      let s = thrown('flashbang', 2);
      const g = s.grenades[0]!;
      expect(g.seconds).toBe(CARD.flashbang.seconds[1]);
      s = picked(s, 'molotov');
      s.nextThrowAt = 1e9;
      // Held no more by Flashbang's glare, and unstunned: an enemy walks to where it lands.
      const e = enemy(s, { ...tough, x: g.x, y: g.y });
      while (s.time < g.lands + STEP) {
        s.enemies.find((o) => o.id === e.id)!.x = g.x;
        s.enemies.find((o) => o.id === e.id)!.y = g.y;
        s = tick(s, STEP);
      }
      const hit = s.enemies.find((o) => o.id === e.id)!;
      expect(hit.dazedUntil).toBeDefined();
      expect(hit.dazedUntil! - g.lands).toBeCloseTo(CARD.flashbang.seconds[1]!, 1);
      expect(s.fires).toEqual([]);
    });

    it('a landed Flashbang or Molotov is gone at once: no frag burst, and no damage from it', () => {
      for (const id of ['flashbang', 'molotov'] as const) {
        let s = thrown(id, 1);
        const g = s.grenades[0]!;
        s.nextThrowAt = 1e9;
        const e = crowd(s, 1, { x: g.x + 200, y: g.y })[0]!;
        const hp = e.hp;
        while (s.time < g.lands + 2 * STEP) s = tick(s, STEP);
        expect(
          s.grenades.filter((k) => k.item === id && k.burst),
          id,
        ).toEqual([]);
        expect(s.enemies.find((o) => o.id === e.id)!.hp).toBe(hp);
      }
    });
  });

  describe('Flashbang', () => {
    const FLASH = { x: 900, y: ROW4 };
    /** A Flashbang landing on `FLASH` on the next step, for `seconds`. */
    function landing(s: HordeState, seconds: number): void {
      s.grenades.push({
        item: 'flashbang',
        seconds,
        by: 'a',
        fromX: 420,
        fromY: 360,
        ...FLASH,
        at: s.time - 0.6,
        lands: s.time,
        burst: false,
      });
    }

    it('stuns enemies within its radius for its level’s seconds, with a white pop', () => {
      for (let lv = 1; lv <= 3; lv++) {
        const s = quiet();
        s.nextThrowAt = 1e9;
        const seconds = CARD.flashbang.seconds[lv - 1]!;
        const near = enemy(s, { ...tough, ...FLASH });
        const edge = enemy(s, { ...tough, x: FLASH.x + CARD.flashbang.radius, y: FLASH.y });
        const out = enemy(s, { ...tough, x: FLASH.x + CARD.flashbang.radius + 1, y: FLASH.y });
        landing(s, seconds);
        const t = tick(s, STEP);
        const by = (id: number) => find(t, id);
        expect(stunned(t, by(near.id)), `lv ${lv}`).toBe(true);
        expect(stunned(t, by(edge.id))).toBe(true);
        expect(stunned(t, by(out.id))).toBe(false);
        expect(by(near.id).dazedUntil).toBeCloseTo(t.time - STEP + seconds, 6);
        expect(t.blasts).toEqual([{ skill: 'flashbang', ...FLASH, at: t.time - STEP }]);
        // It holds for the seconds, and not past them.
        expect(stunned(steps(t, Math.round((seconds - 0.2) / STEP)), by(near.id))).toBe(true);
        const later = steps(t, Math.round((seconds + 0.2) / STEP));
        expect(stunned(later, find(later, near.id))).toBe(false);
      }
    });

    it('does not stun an enemy already stunned, nor one whose daze ended less than `immune` s ago', () => {
      const s = quiet();
      s.nextThrowAt = 1e9;
      s.time = 20;
      const fresh = enemy(s, { ...tough, ...FLASH });
      const held = enemy(s, { ...tough, ...FLASH, stunnedUntil: 1e9 });
      const lately = enemy(s, { ...tough, ...FLASH, dazedUntil: 20 - CARD.flashbang.immune + 1 });
      const long = enemy(s, { ...tough, ...FLASH, dazedUntil: 20 - CARD.flashbang.immune - 0.01 });
      landing(s, 3);
      const t = tick(s, STEP);
      expect(find(t, fresh.id).dazedUntil).toBeDefined();
      expect(find(t, long.id).dazedUntil! > 20).toBe(true);
      expect(find(t, held.id).dazedUntil).toBeUndefined();
      expect(find(t, held.id).stunnedUntil).toBe(1e9);
      expect(find(t, lately.id).dazedUntil).toBe(20 - CARD.flashbang.immune + 1);
      expect(stunned(t, find(t, lately.id))).toBe(false);
      // The pop still shows over them.
      expect(t.blasts).toHaveLength(1);
    });

    it('aims only at enemies it can stun: a lone one beats a group it can’t', () => {
      const s = at('flashbang', 1);
      s.nextThrowAt = 0;
      const group = crowd(s, 5, { stunnedUntil: 0, dazedUntil: s.time - 0.5 }); // just woke: immune
      const lone = enemy(s, { ...tough, stunnedUntil: 0, x: 700, y: ROW4 + 200 });
      const t = tick(s, STEP);
      expect(t.grenades).toHaveLength(1);
      const g = t.grenades[0]!;
      for (const e of group) expect(Math.hypot(g.x - e.x, g.y - e.y)).toBeGreaterThan(50);
      expect(Math.hypot(g.x - lone.x, g.y - lone.y)).toBeLessThan(40);
    });

    it('with nobody it can stun, it holds the throw; a stunned group is not thrown at', () => {
      const s = at('flashbang', 1);
      s.nextThrowAt = 0;
      crowd(s, 5, { stunnedUntil: 1e9 }); // held still by a stun
      const t = steps(s, 5);
      expect(t.grenades).toEqual([]);
      expect(t.nextThrowAt).toBe(0);
      // Nothing to throw at at all: the same.
      const none = at('flashbang', 1);
      none.nextThrowAt = 0;
      expect(steps(none, 5).grenades).toEqual([]);
    });

    it('its count is by those it can stun: the thickest stunnable group, not the thickest group', () => {
      const s = at('flashbang', 1);
      s.nextThrowAt = 0;
      // A tight group of 4, 3 of them immune; and a pair of two stunnable ones elsewhere.
      crowd(s, 3, { stunnedUntil: 0, dazedUntil: s.time - 0.5 });
      const withImmune = enemy(s, { ...tough, stunnedUntil: 0, x: 900, y: ROW4 + 60 });
      const a = enemy(s, { ...tough, stunnedUntil: 0, x: 700, y: ROW4 + 250 });
      const b = enemy(s, { ...tough, stunnedUntil: 0, x: 720, y: ROW4 + 250 });
      const t = tick(s, STEP);
      const g = t.grenades[0]!;
      expect(Math.hypot(g.x - withImmune.x, g.y - withImmune.y)).toBeGreaterThan(30);
      expect(
        Math.min(Math.hypot(g.x - a.x, g.y - a.y), Math.hypot(g.x - b.x, g.y - b.y)),
      ).toBeLessThan(40);
    });

    it('never holds a group for good: stun, then immunity, then it can be stunned again', () => {
      const s = at('flashbang', 1);
      s.defenders[0]!.nextShotAt = 1e9;
      for (let i = 0; i < 6; i++) {
        enemy(s, { hp: 1e6, maxHp: 1e6, x: 900 + (i % 3) * 20, y: ROW4 + Math.floor(i / 3) * 20 });
      }
      let t = s;
      const throws: { at: number; lands: number }[] = [];
      for (let i = 0; i < Math.round(12 / STEP); i++) {
        // The timer never gates once the last one landed: only who can be stunned does.
        if (!t.grenades.some((g) => !g.burst)) t.nextThrowAt = 0;
        const before = t.grenades.length;
        t = tick(t, STEP);
        if (t.grenades.length > before)
          throws.push({ at: t.grenades.at(-1)!.at, lands: t.grenades.at(-1)!.lands });
      }
      expect(throws.length).toBeGreaterThanOrEqual(2);
      const [first, second] = throws;
      // Not thrown again while the group is stunned, nor for `immune` s after.
      expect(second!.at).toBeGreaterThanOrEqual(
        first!.lands + CARD.flashbang.seconds[0]! + CARD.flashbang.immune - 2 * STEP,
      );
    });

    it('costs gun range while held: × glare at every level, gone when swapped away', () => {
      const post = quiet().posts[0]!;
      const base = gunRange(quiet(), post, 'pistol');
      expect(CARD.flashbang.glare).toBe(0.85);
      for (let lv = 1; lv <= 3; lv++) {
        expect(gunRange(at('flashbang', lv), post, 'pistol'), `lv ${lv}`).toBeCloseTo(
          base * CARD.flashbang.glare,
          9,
        );
      }
      expect(gunRange(at('molotov', 3), post, 'pistol')).toBe(base);
      expect(gunRange(at('frag-grenades', 1), post, 'pistol')).toBe(base);
      expect(gunRange(picked(at('flashbang', 3), 'molotov'), post, 'pistol')).toBe(base);
      expect(gunRange(picked(at('molotov', 3), 'flashbang'), post, 'pistol')).toBeCloseTo(
        base * CARD.flashbang.glare,
        9,
      );
    });
  });

  describe('Molotov', () => {
    const SPOT = { x: 900, y: ROW4 };
    /** A Molotov landing on `SPOT` on the next step, burning for `seconds`. */
    function landing(s: HordeState, seconds: number): void {
      s.grenades.push({
        item: 'molotov',
        seconds,
        by: 'a',
        fromX: 420,
        fromY: 360,
        ...SPOT,
        at: s.time - 0.6,
        lands: s.time,
        burst: false,
      });
    }

    it('lights a fire where it lands, burning for its level’s seconds', () => {
      for (let lv = 1; lv <= 3; lv++) {
        const s = quiet();
        s.nextThrowAt = 1e9;
        landing(s, CARD.molotov.seconds[lv - 1]!);
        const t = tick(s, STEP);
        expect(t.fires, `lv ${lv}`).toHaveLength(1);
        const f = t.fires[0]!;
        expect({ x: f.x, y: f.y }).toEqual(SPOT);
        expect(f.until - f.at).toBeCloseTo(CARD.molotov.seconds[lv - 1]!, 9);
      }
      expect(CARD.molotov.seconds).toEqual([4, 6, 8]);
    });

    it('burns every enemy inside for a share of the wave’s Shambler HP a second, at no skill power, then goes out', () => {
      for (const power of [undefined, 2]) {
        const s = quiet();
        s.nextThrowAt = 1e9;
        if (power) s.freeSkills = { power };
        const inside = enemy(s, { ...tough, stunnedUntil: 1e9, ...SPOT });
        const edge = enemy(s, {
          ...tough,
          stunnedUntil: 1e9,
          x: SPOT.x + CARD.molotov.radius,
          y: SPOT.y,
        });
        const outside = enemy(s, {
          ...tough,
          stunnedUntil: 1e9,
          x: SPOT.x,
          y: SPOT.y - CARD.molotov.radius - 1,
        });
        s.fires.push({ ...SPOT, at: s.time, until: s.time + 4 });
        const dps = CARD.molotov.burn * shamblerHp(s);
        expect(fireDps(s)).toBeCloseTo(dps, 9);
        expect(dps).toBeCloseTo(0.1 * ENEMIES.shambler.hp, 9); // Horde 1, wave 1: base HP
        let t = steps(s, Math.round(1 / STEP));
        expect(find(t, inside.id).hp).toBeCloseTo(1000 - dps, 6);
        expect(find(t, edge.id).hp).toBeCloseTo(1000 - dps, 6);
        expect(find(t, outside.id).hp).toBe(1000);
        expect(find(t, inside.id).burnt).toBeCloseTo(dps, 6);
        t = steps(t, Math.round(4 / STEP));
        expect(t.fires).toEqual([]);
        expect(find(t, inside.id).hp).toBeCloseTo(1000 - dps * 4, 5);
        const after = steps(t, Math.round(1 / STEP));
        expect(find(after, inside.id).hp).toBeCloseTo(find(t, inside.id).hp, 9);
      }
    });

    it('keeps up with the hordes: its fire’s damage follows the wave’s Shambler HP', () => {
      for (const n of [1, 4, 12]) {
        const s = newHorde(1, { ...setup(), hordeNumber: n });
        expect(fireDps(s)).toBeCloseTo(CARD.molotov.burn * enemyHp('shambler', n, s.wave), 9);
      }
      const squad = { ...newHorde(1, { ...setup(), hordeNumber: 7 }), hpScale: 3 };
      expect(fireDps(squad)).toBeCloseTo(
        CARD.molotov.burn * enemyHp('shambler', 7, squad.wave, 3),
        9,
      );
    });

    it('its cost: enemies inside a fire move × (1 + panic) faster, those outside as ever', () => {
      const dx = (inFire: boolean, atX = 700): number => {
        const s = quiet();
        s.nextThrowAt = 1e9;
        const e = enemy(s, { ...tough, x: atX, y: ROW4 + 100 });
        if (inFire) s.fires.push({ x: atX, y: ROW4 + 100, at: s.time, until: s.time + 99 });
        const t = steps(s, 3);
        return atX - find(t, e.id).x;
      };
      expect(CARD.molotov.panic).toBe(0.3);
      const plain = dx(false);
      expect(plain).toBeGreaterThan(0);
      expect(dx(true) / plain).toBeCloseTo(1 + CARD.molotov.panic, 6);
      // A fire elsewhere changes nothing.
      const s = quiet();
      const e = enemy(s, { ...tough, x: 700, y: ROW4 + 100 });
      s.fires.push({ x: 700 + CARD.molotov.radius + 1, y: ROW4 + 100, at: 0, until: 99 });
      expect(700 - find(steps(s, 3), e.id).x).toBeCloseTo(plain, 9);
    });

    it('a fire also leaves its enemies’ speed alone once out', () => {
      const s = quiet();
      const e = enemy(s, { ...tough, x: 700, y: ROW4 + 100 });
      s.fires.push({ x: 700, y: ROW4 + 100, at: 0, until: 0.05 });
      const t = steps(s, 6); // the fire is out after 2 steps
      expect(t.fires).toEqual([]);
      const moved = 700 - find(t, e.id).x;
      const plain = quiet();
      const p = enemy(plain, { ...tough, x: 700, y: ROW4 + 100 });
      expect(moved).toBeGreaterThan(700 - find(steps(plain, 6), p.id).x);
      expect(moved).toBeLessThan(6 * STEP * ENEMIES.shambler.speed * (1 + CARD.molotov.panic));
    });
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

describe('Flashbang and Molotov say they are thrown, and how often (ID-139 design review)', () => {
  it('every level names the cadence, the effect and the cost', () => {
    for (const n of [1, 2, 3]) {
      const f = effectAt('flashbang', n)!;
      expect(f.pre).toBe(
        `Each survivor throws one every ${CARD.flashbang.every} s: stuns enemies within ${CARD.flashbang.radius} px for `,
      );
      expect(f.value).toBe(`${CARD.flashbang.seconds[n - 1]} s`);
      expect(f.post).toBe('; −15% gun range for the whole squad while held');
      const m = effectAt('molotov', n)!;
      expect(m.pre).toBe(
        `Each survivor throws one every ${CARD.molotov.every} s: its fire burns for `,
      );
      expect(m.value).toBe(`${CARD.molotov.seconds[n - 1]} s`);
      expect(m.post).toContain('enemies move 30% faster in the flames');
    }
  });
});
