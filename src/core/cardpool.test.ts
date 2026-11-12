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
  SEGMENTS,
  STEP,
  TURRET,
  WEAPONS,
  type CardRarity,
  type EnemyKind,
} from './data.ts';
import {
  fragDamage,
  newHorde,
  shamblerHp,
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
      expect(UPGRADES[id]).toMatchObject({ category: 'stat', rarity: 'common', levels: null });
    }
    for (const id of ['patch-up', 'reinforce'] as const) {
      expect(UPGRADES[id]).toMatchObject({ category: 'barrier', rarity: 'common', levels: null });
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
    const s = quiet('frag-grenades', 'concussion-rounds');
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
      'incendiary-rounds',
      'extended-mags',
      'shock-rounds',
      'barbed-wire',
      'aim-for-the-head',
      'hollow-point-rounds',
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
  it('never offers a unique card again once taken', () => {
    let s = quiet();
    s.offer = [
      { kind: 'upgrade', id: 'frag-grenades' },
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
    expect(s.taken).toEqual(['frag-grenades', 'sharpshooter']);
    expect(eligible(s, 'frag-grenades')).toBe(false);
    expect(eligible(s, 'sharpshooter')).toBe(true);
    s.bench = [];
    for (let seed = 0; seed < 300; seed++) {
      expect(upgrades(rollOffer(createRng(seed), s))).not.toContain('frag-grenades');
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
    // Patch Up is left out while the wall is whole (ID-097), so it doesn't count.
    const always = UPGRADE_IDS.filter(
      (id) =>
        UPGRADES[id].levels === null && UPGRADES[id].category !== 'power' && id !== 'patch-up',
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
    expect(hpOf(t, b.id)).toBeCloseTo(1000 - 10 * CARD.ricochet.share[2]!, 9);
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
    expect(reload('speed-loaders')).toBeCloseTo(reload() * CARD.loaders[2]!, 9);
  });

  it('Extended Mags: a squad gun refills to twice its magazine from its next reload', () => {
    expect(shotOnce(0).d.ammo.primary).toBe(WEAPONS.pistol.magazine - 1);
    expect(shotOnce(0, 'extended-mags').d.ammo.primary).toBe(
      WEAPONS.pistol.magazine * CARD.mags[2]! - 1,
    );
    // A magazine already in the gun keeps its rounds until it runs dry.
    expect(shotOnce(3, 'extended-mags').d.ammo.primary).toBe(2);
  });

  it('Incendiary Rounds at max: the enemy hit burns 9% of a Shambler’s HP a second for 3 s; a new hit resets, never stacks', () => {
    const s = quiet('incendiary-rounds');
    const dps = CARD.burn.share[2]! * shamblerHp(s);
    expect(dps).toBeGreaterThan(0);
    const a = enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
    shoot(s, { x: 590, y: ROW4, damage: 10 });
    let t = tick(s, STEP);
    expect(t.enemies[0]!.burnUntil).toBeCloseTo(CARD.burn.seconds, 9);
    t = steps(t, Math.round(4 / STEP));
    expect(hpOf(t, a.id)).toBeCloseTo(990 - dps * CARD.burn.seconds, 6);
    // It counts the HP fire took (for the view's hit flash, ID-089), not the bullet's.
    expect(t.enemies[0]!.burnt).toBeCloseTo(dps * CARD.burn.seconds, 6);
    // Hit twice in a row: still one burn, timed from the last hit.
    const twice = quiet('incendiary-rounds');
    enemy(twice, { ...tough, ...still, x: 600, y: ROW4 });
    shoot(twice, { x: 590, y: ROW4, damage: 0 });
    let u = steps(twice, 15);
    shoot(u, { x: 590, y: ROW4, damage: 0 });
    u = tick(u, STEP);
    expect(u.enemies[0]!.burnUntil).toBeCloseTo(u.time - STEP + CARD.burn.seconds, 9);
    u = steps(u, Math.round(4 / STEP));
    expect(u.enemies[0]!.hp).toBeCloseTo(1000 - dps * (0.5 + CARD.burn.seconds), 6);
  });

  /** Where an enemy (still, 1000 HP at x 600, `e` on top) ends up after a 10-damage bullet from `owner`. */
  function knocked(e: Partial<Enemy>, taken: UpgradeId[], owner = 'a'): number {
    const s = quiet(...taken);
    const target = enemy(s, { ...tough, ...still, x: 600, y: ROW4, ...e });
    shoot(s, { x: 590, y: ROW4, damage: 10, owner });
    return tick(s, STEP).enemies.find((o) => o.id === target.id)!.x;
  }

  it('Concussion Rounds: a hit knocks its enemy back its px per point of damage dealt', () => {
    expect(knocked({}, [])).toBe(600);
    expect(knocked({}, ['concussion-rounds'], 'turret:0')).toBe(600);
    expect(knocked({}, ['concussion-rounds'])).toBeCloseTo(600 + 10 * CARD.concussion.perDamage, 9);
    // A Brute: its armour takes 3 off the 10, and it's heavy, so half of that again.
    expect(knocked({ kind: 'brute' }, ['concussion-rounds'])).toBeCloseTo(
      600 + (10 - 3) * CARD.concussion.perDamage * CARD.concussion.heavy,
      9,
    );
    expect(knocked({ kind: 'swollen' }, ['concussion-rounds'])).toBeCloseTo(
      600 + 10 * CARD.concussion.perDamage * CARD.concussion.heavy,
      9,
    );
  });

  it('Concussion Rounds: never a Crawler on the wall, an enemy in the camp, or past the spawn edge', () => {
    expect(knocked({ kind: 'crawler', climbUntil: 1e9 }, ['concussion-rounds'])).toBe(600);
    expect(knocked({ inCamp: true }, ['concussion-rounds'])).toBe(600);
    const s = quiet('concussion-rounds');
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

  it('Frag Grenades: thrown on pick at the thickest group, it bursts for a share of the wave’s Shambler HP on all in reach', () => {
    const { s, group, lone } = fragged({ kind: 'brute', x: 900, y: ROW4 + 60 });
    expect(s.nextFragAt).toBe(s.time);
    let t = tick(s, STEP);
    expect(t.grenades).toHaveLength(1);
    const g = t.grenades[0]!;
    // The middle one and the one below it both have 3 others within 70 px; same x, so lowest id.
    expect({ x: g.x, y: g.y }).toEqual({ x: 900, y: ROW4 });
    expect(g.lands).toBeCloseTo(g.at + CARD.frag.flight, 9);
    expect(t.nextFragAt).toBeCloseTo(g.at + CARD.frag.every, 9);
    // It names its thrower (ID-119), who stands where it was thrown from.
    const by = t.defenders.find((d) => d.id === g.by)!;
    expect({ x: by.x, y: by.y }).toEqual({ x: g.fromX, y: g.fromY });
    // Nothing is hurt while it's in the air.
    expect(hpOf(t, group[1]!.id)).toBe(1000);
    t = steps(t, Math.round(CARD.frag.flight / STEP) + 1);
    // Within 70 px of (900, 390): the group of 3 and the Brute (armour doesn't count).
    const burst = fragDamage(t);
    expect(burst).toBeCloseTo(CARD.frag.share * shamblerHp(t), 9);
    expect(burst).toBeGreaterThan(0);
    for (const e of group) expect(hpOf(t, e.id)).toBeCloseTo(1000 - burst, 9);
    expect(hpOf(t, t.enemies.at(-1)!.id)).toBeCloseTo(1000 - burst, 9);
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
    const slow = step * (1 - CARD.wire.slow[2]!);
    expect(moved('shambler', FRONT + 300, 'barbed-wire')).toBeCloseTo(slow, 9);
    expect(moved('shambler', FRONT + CARD.wire.from, 'barbed-wire')).toBeCloseTo(slow, 9);
    expect(moved('shambler', FRONT + CARD.wire.to, 'barbed-wire')).toBeCloseTo(slow, 9);
    expect(moved('shambler', FRONT + 300)).toBeCloseTo(step, 9);
    // In front of the band and between it and the wall: full speed.
    expect(moved('shambler', FRONT + CARD.wire.to + 30, 'barbed-wire')).toBeCloseTo(step, 9);
    expect(moved('shambler', FRONT + CARD.wire.from - 30, 'barbed-wire')).toBeCloseTo(step, 9);
    // It multiplies with a Runner's own speed like any slow.
    expect(moved('runner', FRONT + 300, 'barbed-wire')).toBeCloseTo(
      ENEMIES.runner.speed * STEP * (1 - CARD.wire.slow[2]!),
      9,
    );
  });

  /** The band's row index 4, where ROW4 lies. */
  const ROW = 4;
  /** A row's durability before any level-up: level 1's (ID-104). */
  const WHOLE = CARD.wire.durability[0];

  it('Barbed Wire: each row starts whole, and each enemy wears its row by 1, only once (ID-090)', () => {
    const s = quiet('barbed-wire');
    expect(s.wire).toHaveLength(SEGMENTS);
    expect(s.wire.every((r) => r.durability === WHOLE && r.hit.length === 0)).toBe(true);
    const e = enemy(s, { ...tough, x: FRONT + 380, y: ROW4 });
    let t = tick(s, STEP);
    for (let i = 0; i < 20; i++) t = tick(t, STEP);
    expect(t.enemies.find((o) => o.id === e.id)!.x).toBeGreaterThan(FRONT + CARD.wire.from);
    expect(t.wire[ROW]).toMatchObject({ durability: WHOLE - 1, max: WHOLE, hit: [e.id] });
    // Only the row it walks in.
    expect(t.wire.filter((r) => r.durability < WHOLE)).toHaveLength(1);
    // A second enemy wears it again.
    const f = enemy(t, { ...tough, x: FRONT + 300, y: ROW4 });
    expect(tick(t, STEP).wire[ROW]).toMatchObject({
      durability: WHOLE - 2,
      hit: [e.id, f.id],
    });
  });

  it('Barbed Wire: each kind wears a row by its own wear, only once (ID-104)', () => {
    expect(CARD.wire.wear).toEqual({
      shambler: 1,
      runner: 1,
      crawler: 1,
      spewer: 1,
      screamer: 1,
      swollen: 3,
      brute: 4,
      horror: 10,
    });
    for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
      const s = quiet('barbed-wire');
      s.wire[ROW]!.durability = 30;
      // Three steps in the band: worn the first time only.
      const e = enemy(s, { ...tough, kind, x: FRONT + 300, y: ROW4 });
      let t = tick(s, STEP);
      t = tick(tick(t, STEP), STEP);
      expect(t.wire[ROW], kind).toMatchObject({
        durability: 30 - CARD.wire.wear[kind],
        hit: [e.id],
      });
    }
  });

  it('Barbed Wire: wear never takes a row below 0, and the enemy that breaks it is not slowed (ID-104)', () => {
    const step = ENEMIES.brute.speed * STEP;
    const s = quiet('barbed-wire');
    s.wire[ROW]!.durability = 2;
    const brute = enemy(s, { ...tough, kind: 'brute', x: FRONT + 300, y: ROW4 });
    const t = tick(s, STEP);
    expect(t.wire[ROW]).toMatchObject({ durability: 0, hit: [brute.id] });
    expect(FRONT + 300 - t.enemies.find((o) => o.id === brute.id)!.x).toBeCloseTo(step, 9);
  });

  it('Barbed Wire: outside the band, or without the card, nothing wears', () => {
    const out = quiet('barbed-wire');
    enemy(out, { ...tough, x: FRONT + CARD.wire.to + 30, y: ROW4 });
    enemy(out, { ...tough, x: FRONT + CARD.wire.from - 30, y: ROW4 });
    expect(tick(out, STEP).wire[ROW]!.durability).toBe(WHOLE);
    const none = quiet();
    enemy(none, { ...tough, x: FRONT + 300, y: ROW4 });
    expect(tick(none, STEP).wire[ROW]!.durability).toBe(WHOLE);
  });

  it('Barbed Wire: a broken row slows no one, the enemy that broke it included; other rows still do', () => {
    const step = ENEMIES.shambler.speed * STEP;
    const slow = step * (1 - CARD.wire.slow[2]!);
    const s = quiet('barbed-wire');
    s.wire[ROW]!.durability = 1;
    const breaker = enemy(s, { ...tough, x: FRONT + 300, y: ROW4 });
    const above = enemy(s, { ...tough, x: FRONT + 300, y: ROW4 - SEGMENT_HEIGHT });
    let t = tick(s, STEP);
    expect(t.wire[ROW]).toMatchObject({ durability: 0, hit: [breaker.id] });
    expect(FRONT + 300 - t.enemies.find((o) => o.id === breaker.id)!.x).toBeCloseTo(step, 9);
    expect(FRONT + 300 - t.enemies.find((o) => o.id === above.id)!.x).toBeCloseTo(slow, 9);
    // Broken stays broken: a newcomer walks through at full speed and wears nothing.
    const next = enemy(t, { ...tough, x: FRONT + 350, y: ROW4 });
    t = tick(t, STEP);
    expect(FRONT + 350 - t.enemies.find((o) => o.id === next.id)!.x).toBeCloseTo(step, 9);
    expect(t.wire[ROW]).toMatchObject({ durability: 0, hit: [breaker.id] });
  });

  it('Barbed Wire: stays put when the wall in front of it falls', () => {
    const s = quiet('barbed-wire');
    for (const seg of s.layers[0]!.segments) seg.hp = 0;
    const e = enemy(s, { ...tough, x: FRONT + 300, y: ROW4 });
    const t = tick(s, STEP);
    expect(FRONT + 300 - t.enemies.find((o) => o.id === e.id)!.x).toBeCloseTo(
      ENEMIES.shambler.speed * STEP * (1 - CARD.wire.slow[2]!),
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
  it('Incendiary Rounds never spreads: a burning enemy that dies leaves its neighbour alone (ID-084)', () => {
    const s = quiet('incendiary-rounds');
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
    expect(synergyOf(s, 'incendiary-rounds')).toBeNull();
    expect(synergyOf(s, 'sharpshooter')).toBeNull();
  });
});

describe('determinism and cost', () => {
  const ALL = UPGRADE_IDS.filter((id) => UPGRADES[id].category === 'behaviour');

  it('the same seed with every card that acts in the fight plays the same fight', () => {
    const play = () => {
      const s = newHorde(7, { ...setup(), hordeNumber: 6 });
      s.taken = [...ALL, 'speed-loaders', 'extended-mags', 'barbed-wire', 'shock-rounds'];
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
