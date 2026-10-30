// Design §8, as built ID-022: the card pool — behaviour, barrier and power cards on
// real bullets, rarity by wave, and the two synergies.
import { describe, expect, it } from 'vitest';
import {
  chooseCard,
  eligible,
  masterGunner,
  rarityOdds,
  rollOffer,
  synergyOf,
  UPGRADE_IDS,
  UPGRADES,
} from './cards.ts';
import { buildPost, newBase, type Base } from './base.ts';
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
  type Stock,
  stockOf,
} from './data.ts';
import {
  newHorde,
  standing,
  tick,
  turretState,
  type Bullet,
  type Card,
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
    const s = quiet('split-shot', 'chain-lightning');
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
      'explode-on-kill',
      'spiked-walls',
      'slow-field',
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
      { kind: 'upgrade', id: 'cleave' },
    ];
    s = chooseCard(s, 0);
    s.offer = [
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'cleave' },
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

  it('Split Shot: each shot adds two bullets at ±10° and half damage', () => {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = ['split-shot'];
    enemy(s, { ...tough, ...still, x: 900, y: ROW4 });
    const t = tick(s, STEP);
    expect(t.bullets).toHaveLength(3);
    const [main, left, right] = t.bullets as [Bullet, Bullet, Bullet];
    expect(left.damage).toBeCloseTo(main.damage * CARD.split.share, 9);
    expect(right.damage).toBeCloseTo(main.damage * CARD.split.share, 9);
    const deg = (b: Bullet) => (Math.atan2(b.dy, b.dx) * 180) / Math.PI;
    expect(deg(right) - deg(left)).toBeCloseTo(2 * CARD.split.angle, 6);
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

  it('Explode on Kill: a bullet kill bursts on enemies within reach; bursts never chain', () => {
    const s = quiet('explode-on-kill');
    const a = enemy(s, { ...still, hp: 1, x: 600, y: ROW4 });
    const b = enemy(s, { ...still, hp: 10, x: 600, y: ROW4 + 30 });
    const c = enemy(s, { ...still, hp: 20, x: 600, y: ROW4 + 60 });
    const far = enemy(s, { ...tough, ...still, x: 600 + CARD.explode.radius + 5, y: ROW4 });
    shoot(s, { x: 590, y: ROW4, damage: 5 });
    const t = tick(s, STEP);
    expect(hpOf(t, a.id)).toBeUndefined();
    expect(hpOf(t, b.id)).toBeUndefined();
    expect(hpOf(t, c.id)).toBe(20);
    expect(hpOf(t, far.id)).toBe(1000);
    expect(t.pops).toHaveLength(1);
    // Not a kill: no burst.
    const hurt = quiet('explode-on-kill');
    enemy(hurt, { ...tough, ...still, x: 600, y: ROW4 });
    const near = enemy(hurt, { ...tough, ...still, x: 600, y: ROW4 + 30 });
    shoot(hurt, { x: 590, y: ROW4, damage: 5 });
    expect(hpOf(tick(hurt, STEP), near.id)).toBe(1000);
  });

  it('Chain Lightning: some hits arc to the 2 nearest within reach at half damage (seeded)', () => {
    let arced = 0;
    let not = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s = newHorde(seed, setup());
      s.toSpawn = 0;
      s.defenders[0]!.nextShotAt = 1e9;
      s.taken = ['chain-lightning'];
      const a = enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
      const b = enemy(s, { ...tough, ...still, x: 600, y: ROW4 + 60 });
      const c = enemy(s, { ...tough, ...still, x: 600, y: ROW4 - 70 });
      const d = enemy(s, { ...tough, ...still, x: 600, y: ROW4 + 90 });
      const out = enemy(s, { ...tough, ...still, x: 600, y: ROW4 + CARD.chain.radius + 40 });
      shoot(s, { x: 590, y: ROW4, damage: 10 });
      const t = tick(s, STEP);
      expect(hpOf(t, a.id)).toBe(990);
      expect(hpOf(t, out.id)).toBe(1000);
      if (t.arcs.length === 0) {
        not += 1;
        continue;
      }
      arced += 1;
      expect(t.arcs).toHaveLength(CARD.chain.targets);
      expect(hpOf(t, b.id)).toBeCloseTo(1000 - 10 * CARD.chain.share, 9);
      expect(hpOf(t, c.id)).toBeCloseTo(1000 - 10 * CARD.chain.share, 9);
      expect(hpOf(t, d.id)).toBe(1000);
    }
    expect(arced).toBeGreaterThan(0);
    expect(not).toBeGreaterThan(arced);
  });

  it('Chain Lightning: a Brute’s armour takes its share off an arc too', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = newHorde(seed, setup());
      s.toSpawn = 0;
      s.defenders[0]!.nextShotAt = 1e9;
      s.taken = ['chain-lightning'];
      enemy(s, { ...tough, ...still, x: 600, y: ROW4 });
      const brute = enemy(s, { ...tough, ...still, kind: 'brute', x: 600, y: ROW4 + 50 });
      shoot(s, { x: 590, y: ROW4, damage: 10 });
      const t = tick(s, STEP);
      if (t.arcs.length === 0) continue;
      expect(hpOf(t, brute.id)).toBe(1000 - 2); // 5 − 3 armour
      return;
    }
    throw new Error('no seed arced');
  });

  it.each(['knife', 'toolkit'] as const)(
    'Cleave: a %s hit cleaves a fifth more to enemies close by',
    (melee) => {
      const cleaved = (...taken: UpgradeId[]): [number, number] => {
        const { base, postId } = groundBase();
        const s = newHorde(1, {
          ...setup(),
          roster: [
            { id: 'a', name: 'A', loadout: { primary: 'pistol', secondary: melee, item: null } },
          ],
          base,
          startPostId: postId,
        });
        s.toSpawn = 0;
        s.taken = taken;
        const post = s.posts[s.defenders[0]!.postId]!;
        const target = enemy(s, { ...tough, ...still, x: post.x + 20, y: post.y });
        const near = enemy(s, { ...tough, ...still, x: post.x + 20, y: post.y + 20 });
        const t = tick(s, STEP);
        return [1000 - hpOf(t, target.id)!, 1000 - hpOf(t, near.id)!];
      };
      const [hit, side] = cleaved('cleave');
      expect(hit).toBeGreaterThan(0);
      expect(side).toBeCloseTo(hit * CARD.cleave, 9);
      expect(cleaved()[1]).toBe(0);
    },
  );

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
    expect(t.pops).toEqual([]);
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

  it('Spiked Walls: a Spewer spitting from afar is not spiked', () => {
    const s = quiet('spiked-walls');
    s.defenders = [];
    s.posts.forEach((p) => (p.defenderId = null));
    const e = enemy(s, { ...tough, kind: 'spewer', x: s.layers[0]!.x + 20 + 250, y: ROW4 });
    expect(tick(s, STEP).enemies.find((x) => x.id === e.id)!.hp).toBe(1000);
  });

  it('Slow Field: enemies just outside the outermost standing layer move 30% slower', () => {
    const moved = (kind: EnemyKind, x: number, ...taken: UpgradeId[]): number => {
      const s = quiet(...taken);
      const e = enemy(s, { ...tough, kind, x, y: ROW4 });
      return x - tick(s, STEP).enemies.find((o) => o.id === e.id)!.x;
    };
    const step = ENEMIES.shambler.speed * STEP;
    expect(moved('shambler', 600, 'slow-field')).toBeCloseTo(step * (1 - CARD.slowField.slow), 9);
    expect(moved('shambler', 600)).toBeCloseTo(step, 9);
    // Past the field's reach: full speed.
    expect(moved('shambler', 520 + CARD.slowField.reach + 30, 'slow-field')).toBeCloseTo(step, 9);
  });

  it('Slow Field: with the outer layer down it moves in to the next standing one, or is gone', () => {
    const s = quiet('slow-field');
    for (const seg of s.layers[0]!.segments) seg.hp = 0;
    const e = enemy(s, { ...tough, x: 600, y: ROW4 });
    const t = tick(s, STEP);
    expect(600 - t.enemies.find((o) => o.id === e.id)!.x).toBeCloseTo(
      ENEMIES.shambler.speed * STEP,
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
/** The starting base with a ground post behind the wall, and that post's id. */
function groundBase(): { base: Base; postId: number } {
  const r = buildPost(newBase(), RICH, { kind: 'ground', column: 0, row: 4 });
  if (!r.ok) throw new Error(r.reason);
  return { base: r.base, postId: r.base.posts.findIndex((p) => p.kind === 'ground') };
}
const RICH: Stock = stockOf({ scrap: 999, wood: 999, metal: 999, concrete: 999 });

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
  /** Burning Rounds taken; a burning enemy about to die and a neighbour not burning. */
  function dying(stats: { aim: number }) {
    const s = quiet('burning-rounds');
    const spec = {
      id: 'g',
      name: 'G',
      loadout: { primary: 'pistol' as const, secondary: null, item: null },
      stats: { aim: stats.aim, might: 0, tech: 0, grit: 0 },
    };
    s.defenders.push(standing(spec, { ...s.posts[1]!, id: 1 }, 1e9));
    enemy(s, { ...still, hp: 0.01, x: 900, y: ROW4, burnUntil: 2 });
    const near = enemy(s, { ...tough, ...still, x: 900, y: ROW4 + CARD.burn.spread - 5 });
    const far = enemy(s, { ...tough, ...still, x: 900, y: ROW4 + CARD.burn.spread + 20 });
    const t = tick(s, STEP);
    const burn = (id: number) => t.enemies.find((e) => e.id === id)!.burnUntil ?? 0;
    return { s, near: burn(near.id), far: burn(far.id) };
  }

  it('Burning Rounds + a Master Gunner: a burning enemy that dies sets those near it alight', () => {
    const master = dying({ aim: 50 });
    expect(masterGunner(master.s)).toBe(true);
    expect(master.near).toBeCloseTo(CARD.burn.seconds, 9);
    expect(master.far).toBe(0);
    const adept = dying({ aim: 49 });
    expect(masterGunner(adept.s)).toBe(false);
    expect(adept.near).toBe(0);
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
    expect(synergyOf(s, 'burning-rounds')).toBeNull();
    s.defenders[0]!.stats = { aim: 50, might: 0, tech: 0, grit: 0 };
    expect(synergyOf(s, 'burning-rounds')).toMatch(/Master Gunner/);
    expect(synergyOf(s, 'sharpshooter')).toBeNull();
  });
});

describe('determinism and cost', () => {
  const ALL = UPGRADE_IDS.filter((id) => UPGRADES[id].category === 'behaviour');

  it('the same seed with every behaviour card plays the same fight', () => {
    const play = () => {
      const s = newHorde(7, { ...setup(), hordeNumber: 6 });
      s.taken = [...ALL, 'slow-field', 'spiked-walls'];
      return steps(s, Math.round(40 / STEP));
    };
    expect(play()).toEqual(play());
  });

  it('300 enemies and 200 bullets with Split Shot, Ricochet and Chain Lightning cost well under the 33 ms step', () => {
    const s = quiet(...ALL);
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
