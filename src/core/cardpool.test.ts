// Design §8, as built ID-022: the card pool — behaviour, barrier and power cards on
// real bullets, rarity by wave, and the synergy (the Master Gunner one is parked, ID-084).
import { describe, expect, it } from 'vitest';
import {
  chooseCard,
  eligible,
  rarityOdds,
  rollOffer,
  synergyOf,
  UPGRADE_IDS,
  UPGRADES,
} from './cards.ts';
import {
  BANK_CAP,
  CARD,
  ENEMIES,
  MAX_CONDITION,
  SEGMENT_HEIGHT,
  STEP,
  TURRET,
  WEAPONS,
  type CardRarity,
  type EnemyKind,
} from './data.ts';
import {
  HIT_MARK_GAP,
  newHorde,
  standing,
  tick,
  turretState,
  type Bullet,
  type Card,
  type Enemy,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { createRng } from './rng.ts';
import { enemy, setup } from './testing.ts';

const tough = { hp: 1000, maxHp: 1000 };
/** Held still, so bullets fly straight at them and nothing walks. */
const still = { stunnedUntil: 1e9 };
/** Row 4's middle: level with defender a on the upper tower (420, 360). */
const ROW4 = 4.5 * SEGMENT_HEIGHT;

/** Horde 1 with nothing left to spawn, the cards `taken`; defender a never fires. */
function quiet(...taken: UpgradeId[]): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  s.taken = [...taken];
  return s;
}
/** `s` ticked `n` steps. */
function steps(s: HordeState, n: number): HordeState {
  let t = s;
  for (let i = 0; i < n; i++) t = tick(t, STEP);
  return t;
}
/** A bullet from `(x, y)` flying right (or along `dx, dy`) for `damage`, fired by `owner`. */
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
const hpOf = (s: HordeState, id: number): number | undefined =>
  s.enemies.find((e) => e.id === id)?.hp;
const upgrades = (offer: Card[]): UpgradeId[] =>
  offer.flatMap((c) => (c.kind === 'upgrade' ? [c.id] : []));

describe('card data', () => {
  it('every card has a category and rarity; the first five keep theirs', () => {
    for (const id of UPGRADE_IDS) {
      expect(['stat', 'behaviour', 'barrier', 'power']).toContain(UPGRADES[id].category);
      expect(['common', 'rare', 'epic']).toContain(UPGRADES[id].rarity);
    }
    for (const id of ['sharpshooter', 'rapid-fire', 'long-sight'] as const) {
      expect(UPGRADES[id]).toMatchObject({ category: 'stat', rarity: 'common', once: false });
    }
    for (const id of ['patch-up', 'reinforce'] as const) {
      expect(UPGRADES[id]).toMatchObject({ category: 'barrier', rarity: 'common', once: false });
    }
  });
});

describe('rarity', () => {
  it('starts at 70/25/5 and shifts toward rare and epic, held at 40/45/15', () => {
    expect(rarityOdds(1)).toEqual({ common: 70, rare: 25, epic: 5 });
    expect(rarityOdds(4)).toEqual({ common: 58, rare: 34, epic: 8 });
    expect(rarityOdds(9)).toEqual({ common: 40, rare: 45, epic: 13 });
    expect(rarityOdds(30)).toEqual({ common: 40, rare: 45, epic: 15 });
  });

  it('offers rarer cards more often in later waves (seeded)', () => {
    const share = (wave: number, r: CardRarity): number => {
      const s = quiet();
      s.bench = [];
      s.wave = wave;
      let n = 0;
      let total = 0;
      for (let seed = 0; seed < 2000; seed++) {
        for (const id of upgrades(rollOffer(createRng(seed), s))) {
          total += 1;
          if (UPGRADES[id].rarity === r) n += 1;
        }
      }
      return n / total;
    };
    expect(share(1, 'epic')).toBeGreaterThan(0.02);
    expect(share(1, 'epic')).toBeLessThan(0.08);
    expect(share(10, 'epic')).toBeGreaterThan(2 * share(1, 'epic'));
    expect(share(10, 'common')).toBeLessThan(share(1, 'common'));
  });

  it('falls back to the next rarity down when none of the rolled one is left', () => {
    const s = quiet('frag-grenades');
    s.bench = [];
    // 0.999 rolls epic every slot (and picks the last card of a list).
    const top = () => 0.999;
    expect(upgrades(rollOffer(top, s)).map((id) => UPGRADES[id].rarity)).toEqual([
      'rare',
      'rare',
      'rare',
    ]);
    s.taken.push(
      'piercing-rounds',
      'ricochet',
      'burning-rounds',
      'stopping-power',
      'extended-mags',
      'spiked-walls',
      'barbed-wire',
    );
    // No turret, so Power Surge (rare) is out too: down to common.
    expect(upgrades(rollOffer(top, s)).map((id) => UPGRADES[id].rarity)).toEqual([
      'common',
      'common',
      'common',
    ]);
  });

  it('rolls the same offers from the same seed', () => {
    const s = quiet();
    s.wave = 5;
    expect(rollOffer(createRng(42), s)).toEqual(rollOffer(createRng(42), s));
  });
});

describe('offers', () => {
  it('never offers a once-per-horde card again once taken', () => {
    let s = quiet();
    s.offer = [
      { kind: 'upgrade', id: 'ricochet' },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'speed-loaders' },
    ];
    s = chooseCard(s, 0);
    s.offer = [
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'speed-loaders' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    s = chooseCard(s, 0);
    expect(s.taken).toEqual(['ricochet', 'sharpshooter']);
    expect(eligible(s, 'ricochet')).toBe(false);
    expect(eligible(s, 'sharpshooter')).toBe(true);
    s.bench = [];
    for (let seed = 0; seed < 300; seed++) {
      expect(upgrades(rollOffer(createRng(seed), s))).not.toContain('ricochet');
    }
  });

  it('offers power cards only with a turret, and they stay in the pool', () => {
    const s = quiet();
    s.bench = [];
    const power = (st: HordeState): boolean =>
      Array.from({ length: 300 }, (_, seed) => upgrades(rollOffer(createRng(seed), st))).some(
        (ids) => ids.some((id) => UPGRADES[id].category === 'power'),
      );
    expect(power(s)).toBe(false);
    s.turrets.push(tower());
    expect(power(s)).toBe(true);
    s.taken = ['recharge', 'power-surge'];
    expect(eligible(s, 'recharge') && eligible(s, 'power-surge')).toBe(true);
  });

  it('never runs the pool dry: at least 3 repeatable cards need no turret', () => {
    const always = UPGRADE_IDS.filter(
      (id) => !UPGRADES[id].once && UPGRADES[id].category !== 'power',
    );
    expect(always.length).toBeGreaterThanOrEqual(3);
    expect(always.every((id) => UPGRADES[id].rarity === 'common')).toBe(true);
  });

  it('never repeats a card in one offer', () => {
    const s = quiet();
    s.turrets.push(tower());
    for (let wave = 1; wave <= 10; wave++) {
      s.wave = wave;
      for (let seed = 0; seed < 200; seed++) {
        const ids = upgrades(rollOffer(createRng(seed), s));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe('behaviour cards', () => {
  it('Piercing Rounds: a squad bullet goes through one more enemy', () => {
    const pierced = (...taken: UpgradeId[]): [number, number] => {
      const s = newHorde(1, setup());
      s.toSpawn = 0;
      s.taken = taken;
      const a = enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
      const b = enemy(s, { ...tough, ...still, x: 640, y: ROW4 });
      const t = steps(s, 6);
      return [1000 - hpOf(t, a.id)!, 1000 - hpOf(t, b.id)!];
    };
    const [hit, behind] = pierced('piercing-rounds');
    expect(hit).toBeGreaterThan(0);
    expect(behind).toBeCloseTo(hit, 9);
    expect(pierced()[1]).toBe(0);
  });

  it('Ricochet: the first hit bounces once to the nearest other enemy at a quarter damage', () => {
    const s = quiet('ricochet');
    const a = enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
    const b = enemy(s, { ...tough, ...still, x: 600, y: ROW4 + 100 });
    const c = enemy(s, { ...tough, ...still, x: 600, y: ROW4 + 200 });
    shoot(s, { x: 500, y: ROW4, damage: 10 });
    const t = steps(s, 10);
    expect(hpOf(t, a.id)).toBe(990);
    expect(hpOf(t, b.id)).toBeCloseTo(1000 - 10 * CARD.ricochet.share, 9);
    // The bounce never bounces again.
    expect(hpOf(t, c.id)).toBe(1000);
    expect(t.bullets).toEqual([]);
  });

  it('Ricochet: no bounce with nobody else within range', () => {
    const s = quiet('ricochet');
    enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
    enemy(s, { ...tough, ...still, x: 600, y: ROW4 + CARD.ricochet.range + 30 });
    shoot(s, { x: 500, y: ROW4, damage: 10 });
    const t = steps(s, 2);
    expect(t.bullets).toEqual([]);
    expect(t.enemies[1]!.hp).toBe(1000);
  });

  /** Defender a's pistol after one step at an enemy in range, starting with `ammo` rounds. */
  function shotOnce(ammo: number, ...taken: UpgradeId[]) {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = taken;
    s.defenders[0]!.ammo.primary = ammo;
    enemy(s, { ...tough, ...still, x: 700, y: ROW4 });
    return { fired: s.time, d: tick(s, STEP).defenders[0]! };
  }

  it('Speed Loaders: a squad gun reloads in 70% of the time', () => {
    const reload = (...taken: UpgradeId[]): number => {
      const { fired, d } = shotOnce(1, ...taken);
      expect(d.ammo.primary).toBe(0);
      return d.reloadedAt.primary - fired;
    };
    expect(reload()).toBeGreaterThan(0);
    expect(reload('speed-loaders')).toBeCloseTo(reload() * CARD.loaders, 9);
  });

  it('Extended Mags: a squad gun refills to twice its magazine from its next reload', () => {
    expect(shotOnce(0).d.ammo.primary).toBe(WEAPONS.pistol.magazine - 1);
    expect(shotOnce(0, 'extended-mags').d.ammo.primary).toBe(
      WEAPONS.pistol.magazine * CARD.mags - 1,
    );
    // A magazine already in the gun keeps its rounds until it runs dry.
    expect(shotOnce(3, 'extended-mags').d.ammo.primary).toBe(2);
  });

  it('Burning Rounds: the enemy hit burns 3 dmg/s for 3 s; a new hit resets, never stacks', () => {
    const s = quiet('burning-rounds');
    const a = enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
    shoot(s, { x: 590, y: ROW4, damage: 10 });
    let t = tick(s, STEP);
    expect(t.enemies[0]!.burnUntil).toBeCloseTo(CARD.burn.seconds, 9);
    t = steps(t, Math.round(4 / STEP));
    expect(hpOf(t, a.id)).toBeCloseTo(990 - CARD.burn.dps * CARD.burn.seconds, 6);
    // Hit twice in a row: still one burn, timed from the last hit.
    const twice = quiet('burning-rounds');
    enemy(twice, { ...tough, ...still, x: 600, y: ROW4 });
    shoot(twice, { x: 590, y: ROW4, damage: 0 });
    let u = steps(twice, 15);
    shoot(u, { x: 590, y: ROW4, damage: 0 });
    u = tick(u, STEP);
    expect(u.enemies[0]!.burnUntil).toBeCloseTo(u.time - STEP + CARD.burn.seconds, 9);
    u = steps(u, Math.round(4 / STEP));
    expect(u.enemies[0]!.hp).toBeCloseTo(1000 - CARD.burn.dps * (0.5 + CARD.burn.seconds), 6);
  });

  /** Where an enemy (still, 1000 HP at x 600, `e` on top) ends up after a 10-damage bullet from `owner`. */
  function knocked(e: Partial<Enemy>, taken: UpgradeId[], owner = 'a'): number {
    const s = quiet(...taken);
    const target = enemy(s, { ...tough, ...still, x: 600, y: ROW4, ...e });
    shoot(s, { x: 590, y: ROW4, damage: 10, owner });
    return tick(s, STEP).enemies.find((o) => o.id === target.id)!.x;
  }

  it('Stopping Power: a hit knocks its enemy back 1 px per point of damage dealt', () => {
    expect(knocked({}, [])).toBe(600);
    expect(knocked({}, ['stopping-power'], 'turret:0')).toBe(600);
    expect(knocked({}, ['stopping-power'])).toBeCloseTo(600 + 10 * CARD.stopping.perDamage, 9);
    // A Brute: its armour takes 3 off the 10, and it's heavy, so half of that again.
    expect(knocked({ kind: 'brute' }, ['stopping-power'])).toBeCloseTo(
      600 + (10 - 3) * CARD.stopping.perDamage * CARD.stopping.heavy,
      9,
    );
    expect(knocked({ kind: 'swollen' }, ['stopping-power'])).toBeCloseTo(
      600 + 10 * CARD.stopping.perDamage * CARD.stopping.heavy,
      9,
    );
  });

  it('Stopping Power: never a Crawler on the wall, an enemy in the camp, or past the spawn edge', () => {
    expect(knocked({ kind: 'crawler', climbUntil: 1e9 }, ['stopping-power'])).toBe(600);
    expect(knocked({ inCamp: true }, ['stopping-power'])).toBe(600);
    const s = quiet('stopping-power');
    s.spawnX = 602;
    const e = enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
    shoot(s, { x: 590, y: ROW4, damage: 100 });
    expect(tick(s, STEP).enemies.find((o) => o.id === e.id)!.x).toBe(602);
  });

  /** Frag Grenades picked at time 0 by defender a (420, 360): a group of 3 far off and one enemy near. */
  function fragged(...extra: Partial<Enemy>[]) {
    let s = quiet();
    s.offer = [
      { kind: 'upgrade', id: 'frag-grenades' },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    s = chooseCard(s, 0);
    const group = [-30, 0, 30].map((dy) => enemy(s, { ...tough, ...still, x: 900, y: ROW4 + dy }));
    const lone = enemy(s, { ...tough, ...still, x: 700, y: ROW4 + 200 });
    for (const e of extra) enemy(s, { ...tough, ...still, ...e });
    return { s, group, lone };
  }

  it('Frag Grenades: thrown on pick at the thickest group, it bursts 20 flat on all in reach', () => {
    const { s, group, lone } = fragged({ kind: 'brute', x: 900, y: ROW4 + 60 });
    expect(s.nextFragAt).toBe(s.time);
    let t = tick(s, STEP);
    expect(t.grenades).toHaveLength(1);
    const g = t.grenades[0]!;
    // The middle one and the one below it both have 3 others within 70 px; same x, so lowest id.
    expect({ x: g.x, y: g.y }).toEqual({ x: 900, y: ROW4 });
    expect(g.lands).toBeCloseTo(g.at + CARD.frag.flight, 9);
    expect(t.nextFragAt).toBeCloseTo(g.at + CARD.frag.every, 9);
    // Nothing is hurt while it's in the air.
    expect(hpOf(t, group[1]!.id)).toBe(1000);
    t = steps(t, Math.round(CARD.frag.flight / STEP) + 1);
    // Within 70 px of (900, 390): the group of 3 and the Brute (armour doesn't count).
    for (const e of group) expect(hpOf(t, e.id)).toBe(1000 - CARD.frag.damage);
    expect(hpOf(t, t.enemies.at(-1)!.id)).toBe(1000 - CARD.frag.damage);
    expect(hpOf(t, lone.id)).toBe(1000);
    // One grenade every 8 s, no more.
    t = steps(t, Math.round((CARD.frag.every - CARD.frag.flight) / STEP) - 3);
    expect(t.grenades.filter((k) => !k.burst)).toHaveLength(0);
    t = steps(t, 4);
    expect(t.grenades.filter((k) => !k.burst)).toHaveLength(1);
  });

  it('Frag Grenades: waits for an enemy within reach of a survivor, then throws at once', () => {
    let s = quiet();
    s.offer = [
      { kind: 'upgrade', id: 'frag-grenades' },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    s = chooseCard(s, 0);
    const e = enemy(s, { ...tough, x: 420 + CARD.frag.range + 40, y: ROW4 });
    let t = steps(s, 3);
    expect(t.grenades).toHaveLength(0);
    // Walked into reach: the next step throws.
    t.enemies.find((o) => o.id === e.id)!.x = 420 + CARD.frag.range - 10;
    t = tick(t, STEP);
    expect(t.grenades).toHaveLength(1);
    // Without the card, no grenade ever.
    const none = quiet();
    enemy(none, { ...tough, ...still, x: 700, y: ROW4 });
    expect(steps(none, 10).grenades).toHaveLength(0);
  });

  it('Frag Grenades: every survivor on the line carries them, so two throw twice as often', () => {
    const { s } = fragged();
    const spec = {
      id: 'b',
      name: 'B',
      loadout: { primary: 'pistol' as const, secondary: null, item: null },
    };
    const post = s.posts[1]!;
    post.defenderId = 'b';
    s.defenders.push(standing(spec, post, 1e9));
    const t = tick(s, STEP);
    expect(t.grenades).toHaveLength(1);
    expect(t.nextFragAt).toBeCloseTo(t.grenades[0]!.at + CARD.frag.every / 2, 9);
  });

  it('turret bullets set off no behaviour card', () => {
    const all = UPGRADE_IDS.filter((id) => UPGRADES[id].category === 'behaviour');
    const s = quiet(...all);
    const a = enemy(s, { ...still, hp: 1, x: 600, y: ROW4 });
    const near = enemy(s, { ...tough, ...still, x: 600, y: ROW4 + 30 });
    shoot(s, { x: 590, y: ROW4, damage: 5, owner: 'turret:0' });
    const t = steps(s, 3);
    expect(hpOf(t, a.id)).toBeUndefined();
    expect(hpOf(t, near.id)).toBe(1000);
    expect(t.enemies[0]!.burnUntil).toBeUndefined();
    expect(t.bullets).toEqual([]);
  });
});

describe('barrier cards', () => {
  /** An enemy at the wall's stop line on row 4, hitting it from the first step. */
  function atWall(...taken: UpgradeId[]) {
    const s = quiet(...taken);
    const e = enemy(s, { ...tough, x: s.layers[0]!.x + 20, y: ROW4 });
    const t = tick(s, STEP);
    return { e: t.enemies.find((x) => x.id === e.id)!, seg: t.layers[0]!.segments[4]! };
  }

  it('Spiked Walls: each blow on a wall costs the enemy 3 HP', () => {
    const { e, seg } = atWall('spiked-walls');
    expect(seg.hp).toBe(seg.maxHp - ENEMIES.shambler.damage);
    expect(e.hp).toBe(1000 - CARD.spikes);
    expect(atWall().e.hp).toBe(1000);
  });

  it('Spiked Walls: marks the segment its stakes bite, at most once per hit-mark gap (ID-075)', () => {
    // The blow lands at the step's start.
    expect(atWall('spiked-walls').seg.spikeAt).toBe(0);
    expect(atWall().seg.spikeAt).toBeUndefined();
    // A crowd on one segment marks it again only once the gap has passed.
    const bitten = (now: number) => {
      const s = quiet('spiked-walls');
      s.layers[0]!.segments[4]!.spikeAt = 0.2;
      s.time = now;
      for (let k = 0; k < 2; k++) enemy(s, { ...tough, x: s.layers[0]!.x + 20, y: ROW4 + k });
      return tick(s, STEP).layers[0]!.segments[4]!.spikeAt;
    };
    expect(bitten(0.3)).toBe(0.2);
    expect(bitten(0.2 + HIT_MARK_GAP)).toBe(0.2 + HIT_MARK_GAP);
  });

  it('marks the pick of a barrier card, and only a barrier card, for the wall to pulse (ID-075)', () => {
    const pick = (id: UpgradeId) => {
      const s = quiet();
      s.time = 12.5;
      s.offer = [{ kind: 'upgrade', id }];
      return chooseCard(s, 0).barrierAt;
    };
    for (const id of UPGRADE_IDS) {
      expect(pick(id), id).toBe(UPGRADES[id].category === 'barrier' ? 12.5 : undefined);
    }
  });

  it('a repair card marks only the segments it heals (ID-075)', () => {
    for (const id of ['patch-up', 'field-repairs'] as const) {
      const s = quiet();
      s.time = 7;
      const segs = s.layers[0]!.segments;
      segs[1]!.hp = segs[1]!.maxHp / 2;
      segs[2]!.hp = 0;
      s.offer = [{ kind: 'upgrade', id }];
      const t = chooseCard(s, 0).layers[0]!.segments;
      expect(t[1]!.repairAt, id).toBe(7);
      expect(t[2]!.repairAt, id).toBe(7);
      // Whole already, or never built: nothing to heal, nothing shown.
      for (const seg of t.filter((g) => g.index !== 1 && g.index !== 2)) {
        expect(seg.repairAt, `${id} ${seg.index}`).toBeUndefined();
      }
    }
  });

  it('Spiked Walls: a Spewer spitting from afar is not spiked', () => {
    const s = quiet('spiked-walls');
    s.defenders = [];
    s.posts.forEach((p) => (p.defenderId = null));
    const e = enemy(s, { ...tough, kind: 'spewer', x: s.layers[0]!.x + 20 + 250, y: ROW4 });
    expect(tick(s, STEP).enemies.find((x) => x.id === e.id)!.hp).toBe(1000);
  });

  /** The wall's front: the starting layer (x 500) and its depth. */
  const FRONT = 520;
  /** How far an enemy of `kind` at `x` on row 4 walks in one step, with `taken`. */
  const moved = (kind: EnemyKind, x: number, ...taken: UpgradeId[]): number => {
    const s = quiet(...taken);
    const e = enemy(s, { ...tough, kind, x, y: ROW4 });
    return x - tick(s, STEP).enemies.find((o) => o.id === e.id)!.x;
  };

  it('Barbed Wire: enemies in the band 250–400 px out move 35% slower; outside it, full speed', () => {
    const step = ENEMIES.shambler.speed * STEP;
    const slow = step * (1 - CARD.wire.slow);
    expect(moved('shambler', FRONT + 300, 'barbed-wire')).toBeCloseTo(slow, 9);
    expect(moved('shambler', FRONT + CARD.wire.from, 'barbed-wire')).toBeCloseTo(slow, 9);
    expect(moved('shambler', FRONT + CARD.wire.to, 'barbed-wire')).toBeCloseTo(slow, 9);
    expect(moved('shambler', FRONT + 300)).toBeCloseTo(step, 9);
    // In front of the band and between it and the wall: full speed.
    expect(moved('shambler', FRONT + CARD.wire.to + 30, 'barbed-wire')).toBeCloseTo(step, 9);
    expect(moved('shambler', FRONT + CARD.wire.from - 30, 'barbed-wire')).toBeCloseTo(step, 9);
    // It multiplies with a Runner's own speed like any slow.
    expect(moved('runner', FRONT + 300, 'barbed-wire')).toBeCloseTo(
      ENEMIES.runner.speed * STEP * (1 - CARD.wire.slow),
      9,
    );
  });

  it('Barbed Wire: stays put when the wall in front of it falls', () => {
    const s = quiet('barbed-wire');
    for (const seg of s.layers[0]!.segments) seg.hp = 0;
    const e = enemy(s, { ...tough, x: FRONT + 300, y: ROW4 });
    const t = tick(s, STEP);
    expect(FRONT + 300 - t.enemies.find((o) => o.id === e.id)!.x).toBeCloseTo(
      ENEMIES.shambler.speed * STEP * (1 - CARD.wire.slow),
      9,
    );
  });
});

/** A turret on the upper tower: never needs a wall. */
function tower() {
  return {
    id: 0,
    mount: 'tower' as const,
    column: 0,
    row: 4,
    x: 420,
    y: ROW4,
    condition: MAX_CONDITION,
    nextShotAt: 0,
  };
}

describe('power cards', () => {
  it('Recharge: adds a quarter of the cap, never past it', () => {
    const s = quiet();
    s.turrets.push(tower());
    s.energy = 100;
    s.offer = [
      { kind: 'upgrade', id: 'recharge' },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    expect(chooseCard(s, 0).energy).toBe(100 + CARD.recharge * BANK_CAP);
    s.energy = BANK_CAP - 1;
    expect(chooseCard(s, 0).energy).toBe(BANK_CAP);
  });

  it('Power Surge: turrets fire on an empty bank and draw nothing until the wave ends', () => {
    let s = quiet();
    s.turrets.push(tower());
    s.energy = 0;
    const target = enemy(s, { ...tough, ...still, x: 700, y: ROW4 });
    expect(turretState(s, s.turrets[0]!)).toBe('dark');
    s.offer = [
      { kind: 'upgrade', id: 'power-surge' },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    s = chooseCard(s, 0);
    expect(turretState(s, s.turrets[0]!)).toBe('lit');
    s.energy = 50;
    const t = steps(s, 30);
    expect(t.energy).toBe(50);
    expect(hpOf(t, target.id)).toBeLessThan(1000);
    // The next wave draws again.
    t.wave += 1;
    expect(steps(t, 30).energy).toBeCloseTo(50 - TURRET.draw * 30 * STEP, 6);
  });
});

describe('synergies', () => {
  it('Burning Rounds never spreads: a burning enemy that dies leaves its neighbour alone (ID-084)', () => {
    const s = quiet('burning-rounds');
    const spec = {
      id: 'g',
      name: 'G',
      loadout: { primary: 'pistol' as const, secondary: null, item: null },
      stats: { instinct: 50, agility: 50, mind: 50, tinker: 0 },
    };
    s.defenders.push(standing(spec, { ...s.posts[1]!, id: 1 }, 1e9));
    enemy(s, { ...still, hp: 0.01, x: 900, y: ROW4, burnUntil: 2 });
    const near = enemy(s, { ...tough, ...still, x: 900, y: ROW4 + 5 });
    const t = tick(s, STEP);
    expect(t.enemies.find((e) => e.id === near.id)!.burnUntil ?? 0).toBe(0);
  });

  it('Ricochet + Piercing Rounds: the bounce keeps the pierce the bullet had before the hit', () => {
    const bounced = (...taken: UpgradeId[]) => {
      const s = quiet(...taken);
      enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
      enemy(s, { ...tough, ...still, x: 600, y: ROW4 + 100 });
      const behind = enemy(s, { ...tough, ...still, x: 600, y: ROW4 + 140 });
      shoot(s, { x: 500, y: ROW4, damage: 10, pierce: 1, left: 100 });
      return hpOf(steps(s, 10), behind.id);
    };
    expect(bounced('ricochet', 'piercing-rounds')).toBeLessThan(1000);
    expect(bounced('ricochet')).toBe(1000);
  });

  it('a card shows its synergy line only when it would be on', () => {
    const s = quiet();
    expect(synergyOf(s, 'ricochet')).toBeNull();
    s.taken = ['piercing-rounds'];
    expect(synergyOf(s, 'ricochet')).toMatch(/Piercing Rounds/);
    s.taken = ['ricochet'];
    expect(synergyOf(s, 'piercing-rounds')).toMatch(/Ricochet/);
    s.defenders[0]!.stats = { instinct: 50, agility: 50, mind: 50, tinker: 0 };
    expect(synergyOf(s, 'burning-rounds')).toBeNull();
    expect(synergyOf(s, 'sharpshooter')).toBeNull();
  });
});

describe('determinism and cost', () => {
  const ALL = UPGRADE_IDS.filter((id) => UPGRADES[id].category === 'behaviour');

  it('the same seed with every card that acts in the fight plays the same fight', () => {
    const play = () => {
      const s = newHorde(7, { ...setup(), hordeNumber: 6 });
      s.taken = [...ALL, 'speed-loaders', 'extended-mags', 'barbed-wire', 'spiked-walls'];
      s.nextFragAt = 0;
      return steps(s, Math.round(40 / STEP));
    };
    const t = play();
    expect(t.grenades.length + t.enemies.length).toBeGreaterThan(0);
    expect(t).toEqual(play());
  });

  it('300 enemies and 200 bullets with every behaviour card, a grenade thrown, cost well under the 33 ms step', () => {
    const s = quiet(...ALL);
    s.nextFragAt = 2 * STEP;
    const kinds = Object.keys(ENEMIES) as EnemyKind[];
    for (let i = 0; i < 300; i++) {
      enemy(s, {
        ...tough,
        kind: kinds[i % kinds.length]!,
        x: 560 + (i % 30) * 34,
        y: 20 + Math.floor(i / 30) * 76,
      });
    }
    for (let i = 0; i < 200; i++) shoot(s, { x: 420, y: 20 + i * 3.8, speed: 600 });
    s.defenders[0]!.nextShotAt = 0;
    let t = tick(s, STEP);
    const start = performance.now();
    for (let i = 0; i < 30; i++) t = tick(t, STEP);
    expect((performance.now() - start) / 30).toBeLessThan(16);
  });
});
