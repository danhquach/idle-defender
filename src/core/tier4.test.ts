// ID-264: what the three Tier 4 cards do in a fight, each against its absent twin, and how they are offered.
import { describe, expect, it } from 'vitest';
import { chooseCard, offerWeights, rollOffer } from './cards.ts';
import { CARD, STEP, TECH_FX, TECH_IDS, WEAPONS, type TechId } from './data.ts';
import {
  hitDamage,
  moatPhase,
  netBand,
  newHorde,
  shamblerHp,
  tick,
  WALL_GUN,
  wallFront,
  type Bullet,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { hordeKindHp, SQUAD_CARDS, startSquadHorde, techCards } from './hordeonly.ts';
import { hordeHp } from './squadpower.ts';
import { hordeSeconds } from './pacing.ts';
import { squadAt } from './balance/shared.ts';
import { createRng } from './rng.ts';
import { enemy, setup } from './testing.ts';
import { cleanTech } from './techtree.ts';

const ALL: TechId[] = [...TECH_IDS];

/** Horde 1, nothing to spawn, nobody fires; the Tier 4 nodes researched. */
function quiet(tech: readonly TechId[] = []): HordeState {
  const s = newHorde(1, { ...setup(), ...(tech.length > 0 ? { tech } : {}) });
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
function picked(s: HordeState, ...ids: UpgradeId[]): HordeState {
  let t = s;
  for (const id of ids) {
    t = { ...t, offer: [{ kind: 'upgrade', id }] };
    t = chooseCard(t, 0);
    t.offer = null;
  }
  return t;
}
const run = (s: HordeState, seconds: number): HordeState => {
  let t = s;
  for (let i = 0; i < Math.round(seconds / STEP); i++) t = tick(t, STEP);
  return t;
};
const FRONT = 520;
const find = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)!;

describe('Wall Machine Gun', () => {
  it('its damage a second is its share of the horde’s demand, the same on every start, with no RNG and no key without the node', () => {
    for (const n of [4, 9, 15]) {
      const game = { ...squadAt(n, n), tech: ALL };
      const size = game.roster.length;
      const s = startSquadHorde(game, 1, 0, n, true);
      const want = (CARD.wallGun.share * hordeHp(n, 'normal', size)) / hordeSeconds(n);
      expect(Math.abs(s.gunDps! - want) / want).toBeLessThan(1e-9);
      // Another seed, and a second start of the same seed: the same number, and the same state.
      expect(startSquadHorde(game, 99, 0, n, true).gunDps).toBe(s.gunDps);
      expect(JSON.stringify(startSquadHorde(game, 1, 0, n))).toBe(
        JSON.stringify(startSquadHorde(game, 1, 0, n)),
      );
    }
    // With the theme counted (the plain start) it is the horde's HP by kind over the same seconds.
    const game = { ...squadAt(9, 9), tech: ALL };
    const withTheme = startSquadHorde(game, 1, 0);
    const demand = hordeKindHp(9, 'normal', game.roster.length, withTheme.theme ?? null).reduce(
      (sum, [, hp]) => sum + hp,
      0,
    );
    expect(withTheme.gunDps).toBeCloseTo((CARD.wallGun.share * demand) / hordeSeconds(9), 9);
    expect('gunDps' in startSquadHorde({ ...squadAt(9, 9), tech: ['reinforced-wall'] }, 1, 0)).toBe(
      false,
    );
    expect('gunDps' in startSquadHorde(squadAt(9, 9), 1, 0)).toBe(false);
  });

  const withGun = (): HordeState => {
    const s = picked(quiet(), 'wall-machine-gun');
    s.gunDps = 12;
    return s;
  };

  it('fires a straight 6-round burst every 2 s at the nearest enemy outside the camp, and draws nothing from the RNG', () => {
    let s = withGun();
    const near = enemy(s, { x: 900, y: 300, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
    enemy(s, { x: 1400, y: 500, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
    enemy(s, { x: 300, y: 400, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9, inCamp: true });
    const twin = quiet();
    enemy(twin, { x: 900, y: 300, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
    s = tick(s, STEP);
    const burst = s.bullets.filter((b) => b.owner === WALL_GUN);
    expect(burst.length).toBe(CARD.wallGun.burst);
    for (const b of burst) {
      expect(b.dx).toBe(burst[0]!.dx);
      expect(b.dy).toBe(burst[0]!.dy);
      expect(b.pierce).toBe(0);
      expect(b.damage).toBeCloseTo((12 * CARD.wallGun.every) / CARD.wallGun.burst, 12);
    }
    // At the near one: up and to the right of mid-wall.
    expect(Math.atan2(burst[0]!.dy, burst[0]!.dx)).toBeCloseTo(
      Math.atan2(near.y - 400, near.x - (FRONT - 10)),
      1,
    );
    expect(s.nextGunAt).toBeCloseTo(CARD.wallGun.every, 9);
    // Nothing else changes the RNG: the twin without the card is where this one is.
    expect(tick(twin, STEP).rng).toEqual(s.rng);
    // Over 4.1 s more: one burst each time `nextGunAt` moves (2.03 s and 4.03 s), 3 in all with the first.
    let later = s;
    let bursts = 1;
    for (let i = 0; i < Math.round(4.1 / STEP); i++) {
      const was = later.nextGunAt;
      later = tick(later, STEP);
      if (later.nextGunAt !== was) bursts++;
    }
    expect(bursts).toBe(3);
    const hurt = find(later, near.id).hp;
    expect(1e6 - hurt).toBeGreaterThan(12 * 4 * 0.9);
    expect(1e6 - hurt).toBeLessThanOrEqual(12 * 6.1);
  });

  it('aims at the nearest enemy, not the one the player focused', () => {
    const s = withGun();
    const near = enemy(s, { x: 700, y: 400, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
    const far = enemy(s, { x: 1400, y: 100, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
    s.focusId = far.id;
    const fired = tick(s, STEP).bullets.filter((b) => b.owner === WALL_GUN);
    expect(fired.length).toBe(CARD.wallGun.burst);
    expect(Math.atan2(fired[0]!.dy, fired[0]!.dx)).toBeCloseTo(
      Math.atan2(near.y - 400, near.x - (FRONT - 10)),
      1,
    );
  });

  it('waits with nobody outside the camp, and fires once someone is', () => {
    let s = withGun();
    s = run(s, 1);
    expect(s.bullets.length).toBe(0);
    expect(s.nextGunAt).toBe(0);
    enemy(s, { x: 1000, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
    s = tick(s, STEP);
    expect(s.bullets.some((b) => b.owner === WALL_GUN)).toBe(true);
  });

  it('always ignores its share of armour, and a plain turret bullet ignores none even with Armour-piercing', () => {
    const shot = (owner: string): number => {
      const s = quiet([
        'reinforced-wall',
        'steel-plating',
        'spiked-wall',
        'hand-loads',
        'armour-piercing',
      ]);
      const s2 = picked(s, 'hollow-points');
      const brute = enemy(s2, {
        kind: 'brute',
        x: 1000,
        y: 400,
        hp: 1000,
        maxHp: 1000,
        stunnedUntil: 1e9,
      });
      const b: Bullet = {
        x: 990,
        y: 400,
        dx: 1,
        dy: 0,
        speed: 1800,
        damage: 4,
        owner,
        fromX: 990,
        fromY: 400,
        aim: 10,
        left: 100,
        pierce: 0,
        hit: [],
        tracer: WEAPONS.pistol.tracer,
      };
      s2.bullets.push(b);
      const after = tick(s2, STEP);
      return 1000 - find(after, brute.id).hp;
    };
    const plain = shot('turret:0');
    const gun = shot(WALL_GUN);
    expect(plain).toBeCloseTo(hitDamage({ kind: 'brute' } as never, 4, false, false, 0), 9);
    expect(gun).toBeCloseTo(
      hitDamage({ kind: 'brute' } as never, 4, false, false, TECH_FX.pierce),
      9,
    );
    expect(gun).toBeGreaterThan(plain);
    // A squad bullet with the same tech and card does ignore it (the existing rule), a turret's does not.
    expect(shot('a')).toBeCloseTo(gun, 9);
  });

  it('carries no card effect: Incendiary Rounds and Concussion Rounds do nothing to what it hits', () => {
    const s = picked(withGun(), 'incendiary-rounds', 'concussion-rounds');
    const e = enemy(s, { x: 700, y: 400, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
    const after = run(s, 1.5);
    const got = find(after, e.id);
    expect(got.hp).toBeLessThan(1e6);
    expect(got.burnUntil).toBeUndefined();
    expect(got.x).toBe(700);
  });
});

describe('Shock Net', () => {
  const band = (s: HordeState) => netBand(s)!;
  const netted = (): HordeState => picked(quiet(), 'shock-net');

  it('the band is the wire band, in front of the wall’s face', () => {
    const s = netted();
    expect(wallFront(s)).toBe(FRONT);
    expect(band(s)).toEqual({ from: FRONT + CARD.wire.from, to: FRONT + CARD.wire.to });
  });

  it('stuns each enemy in the band for 2 s, never touches dazedUntil, and nets again only after its last net', () => {
    let s = netted();
    const inBand = enemy(s, { x: band(s).from + 20, y: 300, hp: 1e6, maxHp: 1e6 });
    const before = enemy(s, { x: band(s).from - 30, y: 300, hp: 1e6, maxHp: 1e6 });
    const past = enemy(s, { x: band(s).to + 30, y: 300, hp: 1e6, maxHp: 1e6 });
    const camp = enemy(s, { x: band(s).from + 20, y: 300, hp: 1e6, maxHp: 1e6, inCamp: true });
    s = tick(s, STEP);
    const hit = find(s, inBand.id);
    expect(hit.stunnedUntil).toBeCloseTo(CARD.net.seconds, 9);
    expect(hit.nettedUntil).toBeCloseTo(CARD.net.seconds, 9);
    expect(hit.dazedUntil).toBeUndefined();
    for (const e of [before, past, camp]) {
      expect(find(s, e.id).nettedUntil).toBeUndefined();
      expect(find(s, e.id).stunnedUntil).toBe(0);
    }
    expect(s.nextNetAt).toBeCloseTo(CARD.net.every, 9);
    // The stun holds it in place, so the next pulse (6 s) nets it again.
    s = run(s, CARD.net.every - 0.5);
    // It walked on out of the band while the stun ran out; put it back for the second pulse.
    find(s, inBand.id).x = band(s).from + 20;
    s = run(s, 0.7);
    expect(find(s, inBand.id).nettedUntil).toBeCloseTo(CARD.net.every + CARD.net.seconds, 9);
    expect(find(s, inBand.id).dazedUntil).toBeUndefined();
  });

  it('reads the Flashbang’s immunity: an enemy just flashed is skipped, and the net does not write that immunity', () => {
    let s = netted();
    s.time = 0;
    const flashed = enemy(s, { x: band(s).from + 20, y: 300, hp: 1e6, maxHp: 1e6 });
    flashed.dazedUntil = -1;
    s = tick(s, STEP);
    expect(find(s, flashed.id).nettedUntil).toBeUndefined();
  });

  it('on a fixed seed the Flashbang throws and stuns no less with the net, and the net leaves dazedUntil alone', () => {
    const fight = (net: boolean): { throws: number; stun: number } => {
      let s = picked(quiet(), 'flashbang', ...(net ? (['shock-net'] as UpgradeId[]) : []));
      s.defenders[0]!.nextShotAt = 1e9;
      for (let i = 0; i < 12; i++) {
        enemy(s, { x: FRONT + 260 + (i % 4) * 30, y: 80 + i * 55, hp: 1e6, maxHp: 1e6 });
      }
      let throws = 0;
      let stun = 0;
      const seen = new Set<number>();
      for (let i = 0; i < Math.round(40 / STEP); i++) {
        s = tick(s, STEP);
        for (const b of s.blasts) {
          if (b.skill === 'flashbang' && !seen.has(b.at)) {
            seen.add(b.at);
            throws++;
          }
        }
        stun += s.enemies.filter((e) => e.stunnedUntil > s.time).length * STEP;
      }
      return { throws, stun };
    };
    const plain = fight(false);
    const withNet = fight(true);
    expect(plain.throws).toBeGreaterThan(0);
    expect(withNet.throws).toBeGreaterThanOrEqual(plain.throws);
    expect(withNet.stun).toBeGreaterThanOrEqual(plain.stun);
  });
});

describe('Tar Moat', () => {
  const moated = (): HordeState => picked(quiet(), 'tar-moat');
  const held = (s: HordeState, x = FRONT + 30) =>
    enemy(s, { x, y: 300, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });

  it('is a strip along the wall’s face, full at the pick', () => {
    const s = moated();
    expect(s.moat).toEqual({});
    expect(moatPhase(s.moat!)).toBe('full');
  });

  it('lights itself 2 s after the first enemy steps in, not before, and not with nobody in it', () => {
    let s = moated();
    s = run(s, 5);
    expect(s.moat).toEqual({});
    const e = held(s);
    s = run(s, 1.9);
    expect(s.moat!.litAt).toBeUndefined();
    expect(s.moat!.touchedAt).toBeDefined();
    s = run(s, 0.4);
    expect(s.moat!.litAt).toBeCloseTo(s.moat!.touchedAt! + CARD.moat.fuse, 1);
    expect(find(s, e.id).hp).toBeLessThan(1e6);
  });

  it('burns 10% of Shambler HP a second for 3 s, is then gone, and refills 10 s later', () => {
    let s = moated();
    const e = held(s);
    const start = s.time;
    s = run(s, CARD.moat.fuse + 0.1);
    const litAt = s.moat!.litAt!;
    const hpAtLight = find(s, e.id).hp;
    s = run(s, CARD.oil.burnFor + 0.3);
    expect(moatPhase(s.moat!)).toBe('gone');
    const burnt = 1e6 - find(s, e.id).hp;
    expect(burnt).toBeCloseTo(CARD.moat.burn * shamblerHp(s) * CARD.oil.burnFor, 0);
    expect(hpAtLight).toBeGreaterThan(1e6 - 2 * CARD.moat.burn * shamblerHp(s) * STEP - 1);
    // Gone: no more burn, no slow; it refills `refill` s after it burnt out.
    const goneAt = s.moat!.refillAt! - CARD.moat.refill;
    expect(goneAt).toBeCloseTo(litAt + CARD.oil.burnFor, 1);
    const hp = find(s, e.id).hp;
    s = run(s, CARD.moat.refill - 1);
    expect(find(s, e.id).hp).toBe(hp);
    expect(moatPhase(s.moat!)).toBe('gone');
    s = run(s, 1.2);
    expect(s.moat!.litAt).toBeUndefined();
    expect(s.moat!.refillAt).toBeUndefined();
    // The enemy still inside starts a fresh fuse.
    expect(start).toBe(0);
    s = run(s, 0.1);
    expect(s.moat!.touchedAt).toBeDefined();
  });

  it('slows an enemy inside by 40%, a full or lit moat alike, and not a gone one or an enemy outside', () => {
    const step = (x: number, mutate?: (s: HordeState) => void): number => {
      const s = moated();
      const e = enemy(s, { x, y: 300, hp: 1e6, maxHp: 1e6 });
      mutate?.(s);
      return x - find(tick(s, STEP), e.id).x;
    };
    const full = step(FRONT + 50);
    const outside = step(FRONT + 300);
    expect(full / outside).toBeCloseTo(1 - CARD.moat.slow, 9);
    expect(step(FRONT + 50, (s) => (s.moat = { litAt: 0 })) / outside).toBeCloseTo(0.6, 9);
    expect(step(FRONT + 50, (s) => (s.moat = { litAt: -9, refillAt: 9 })) / outside).toBeCloseTo(
      1,
      9,
    );
  });

  const lightsAtOnce = (add: (s: HordeState) => void): boolean => {
    const s = moated();
    add(s);
    return tick(s, STEP).moat!.litAt !== undefined;
  };

  it('lights at once from a lit slick overlapping it, not an unlit or a far one', () => {
    expect(
      lightsAtOnce((s) => s.slicks.push({ x: FRONT + 100, y: 300, at: 0, until: 9, litAt: 0 })),
    ).toBe(true);
    expect(lightsAtOnce((s) => s.slicks.push({ x: FRONT + 100, y: 300, at: 0, until: 9 }))).toBe(
      false,
    );
    expect(
      lightsAtOnce((s) => s.slicks.push({ x: FRONT + 400, y: 300, at: 0, until: 9, litAt: 0 })),
    ).toBe(false);
  });

  it('lights at once from a Molotov fire overlapping it, not a far one', () => {
    expect(lightsAtOnce((s) => s.fires.push({ x: FRONT + 70, y: 300, at: 0, until: 4 }))).toBe(
      true,
    );
    expect(
      lightsAtOnce((s) =>
        s.fires.push({ x: FRONT + 60 + CARD.molotov.radius + 30, y: 300, at: 0, until: 4 }),
      ),
    ).toBe(false);
  });

  it('lights at once from an Incendiary Rounds hit on an enemy inside, not one outside', () => {
    const hitAt = (x: number): HordeState => {
      const s = picked(moated(), 'incendiary-rounds');
      enemy(s, { x, y: 300, hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9 });
      s.bullets.push({
        x: x - 10,
        y: 300,
        dx: 1,
        dy: 0,
        speed: 1800,
        damage: 5,
        owner: 'a',
        fromX: x - 10,
        fromY: 300,
        aim: 10,
        left: 100,
        pierce: 0,
        hit: [],
        tracer: WEAPONS.pistol.tracer,
      });
      return tick(s, STEP);
    };
    const inside = hitAt(FRONT + 30);
    expect(inside.moat!.litAt).toBeDefined();
    expect(inside.time).toBeLessThan(CARD.moat.fuse);
    expect(hitAt(FRONT + 300).moat!.litAt).toBeUndefined();
  });

  it('a gone moat is not lit again by a fire, and a lit one is left as it is', () => {
    const s = moated();
    s.moat = { litAt: -9, refillAt: 5 };
    s.fires.push({ x: FRONT + 70, y: 300, at: 0, until: 4 });
    expect(tick(s, STEP).moat).toEqual({ litAt: -9, refillAt: 5 });
    const lit = moated();
    lit.moat = { litAt: 0 };
    lit.fires.push({ x: FRONT + 70, y: 300, at: 0, until: 4 });
    expect(tick(lit, STEP).moat!.litAt).toBe(0);
  });
});

describe('offers', () => {
  const POOL: UpgradeId[] = [...SQUAD_CARDS];
  const THREE: UpgradeId[] = ['wall-machine-gun', 'shock-net', 'tar-moat'];

  it('a Tier 4 node adds no weight to any card: Tiers 1 to 3 weigh byte for byte the same with it researched', () => {
    const tiers13 = TECH_IDS.filter(
      (id) => id !== 'wall-machine-gun' && id !== 'shock-net' && id !== 'tar-moat',
    );
    const pool = [...POOL, ...THREE];
    expect(JSON.stringify(offerWeights(pool, ALL))).toBe(
      JSON.stringify(offerWeights(pool, tiers13)),
    );
    expect(JSON.stringify(offerWeights(POOL, ALL))).toBe(
      JSON.stringify(offerWeights(POOL, tiers13)),
    );
    expect(
      offerWeights(pool, ['wall-machine-gun', 'shock-net', 'tar-moat']).every((w) => w === 1),
    ).toBe(true);
  });

  it('the cards are in a fight’s pool only once their node is researched, and never in SQUAD_CARDS', () => {
    for (const id of THREE) expect(SQUAD_CARDS).not.toContain(id);
    const netChain: TechId[] = cleanTech([
      'reinforced-wall',
      'steel-plating',
      'razor-wire',
      'thick-coils',
      'electric-wire',
      'shock-net',
    ]);
    expect(techCards({})).toEqual([]);
    expect(techCards({ tech: [] })).toEqual([]);
    expect(techCards({ tech: ALL })).toEqual(THREE);
    const base = squadAt(5, 5);
    const none = startSquadHorde(base, 1, 0);
    for (const id of THREE) expect(none.cardPool).not.toContain(id);
    const some = startSquadHorde({ ...base, tech: netChain }, 1, 0);
    expect(some.cardPool).toContain('shock-net');
    expect(some.cardPool).not.toContain('tar-moat');
    // Never in the full game's offers (no card pool).
    const full = newHorde(1, { ...setup(), tech: ALL });
    full.wave = 6;
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) {
      for (const c of rollOffer(rng, full)) {
        expect(c.kind === 'upgrade' && THREE.includes(c.id)).toBe(false);
      }
    }
  });

  it('with all three researched, the share of offer slots they leave to other cards is at least 0.8 of baseline (200 offers)', () => {
    const slots = (tech: boolean, wave: number): number => {
      const s = newHorde(1, {
        ...setup(),
        cards: tech ? [...POOL, ...THREE] : POOL,
        ...(tech ? { tech: ALL } : {}),
      });
      s.wave = wave;
      const rng = createRng(21);
      let other = 0;
      let total = 0;
      for (let i = 0; i < 200; i++) {
        for (const c of rollOffer(rng, s)) {
          total++;
          if (!(c.kind === 'upgrade' && THREE.includes(c.id))) other++;
        }
      }
      return other / total;
    };
    for (const wave of [1, 3, 6, 10]) {
      expect(slots(true, wave) / slots(false, wave), `wave ${wave}`).toBeGreaterThanOrEqual(0.8);
    }
  });
});
