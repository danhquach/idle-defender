// Balance: Heavy Rounds (ID-136) against the repeatable damage cards, gun by gun (see
// shared.ts). A lone survivor with one Common gun fires for a minute and a half at held,
// unkillable Shamblers, so only the cards differ: the damage dealt is the gun's sustained
// damage, reloads included. Heavy Rounds is an epic card that comes up less often, worth
// about three Sharpshooter picks after its reload cost; the cost hurts some guns more, so
// on those three Sharpshooter picks beat it and the pick is a real choice.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Held } from '../armoury.ts';
import { chooseCard } from '../cards.ts';
import { STEP } from '../data.ts';
import { newHorde, reloadIn, tick, type HordeState, type UpgradeId } from '../horde.ts';
import { createRng } from '../rng.ts';
import { enemy, setup } from '../testing.ts';

type Gun = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'lmg' | 'sniper';
const GUNS: readonly Gun[] = ['pistol', 'smg', 'rifle', 'shotgun', 'lmg', 'sniper'];
const held = (g: Gun): Held =>
  g === 'pistol' ? 'pistol' : { uid: 'h1', base: g, rarity: 'common', affixes: [] };
const SEEDS = 3;
const SECONDS = 90;
const BIG = 1e6;
/** The cards held, each picked this many times: none, Heavy Rounds, or three of a repeatable. */
const HANDS = {
  none: [],
  heavy: [['hollow-points', 1]],
  sharpshooter: [['sharpshooter', 3]],
  'rapid-fire': [['rapid-fire', 3]],
} as const satisfies Record<string, readonly (readonly [UpgradeId, number])[]>;
type Hand = keyof typeof HANDS;

/** `s` with card `id` picked `times` times, as an offer would. */
function picked(s: HordeState, id: UpgradeId, times: number): HordeState {
  let t = s;
  for (let i = 0; i < times; i++) {
    t = chooseCard({ ...t, offer: [{ kind: 'upgrade', id }] }, 0);
    t.offer = null;
  }
  return t;
}

/** A lone survivor holding gun `g` with `hand`, against six held Shamblers 200–400 px out. */
function scene(g: Gun, hand: Hand, seed: number): HordeState {
  let s = newHorde(seed, {
    ...setup(),
    roster: [{ id: 'a', name: 'A', loadout: { primary: held(g), secondary: null, item: null } }],
  });
  s.toSpawn = 0;
  s.research = ['hollow-points'];
  for (const [id, times] of HANDS[hand]) s = picked(s, id, times);
  const rng = createRng(seed * 7919);
  for (let i = 0; i < 6; i++) {
    enemy(s, {
      x: 620 + rng() * 200,
      y: 300 + rng() * 120,
      hp: BIG,
      maxHp: BIG,
      stunnedUntil: 1e9,
    });
  }
  return s;
}

/** Damage dealt in `SECONDS`, mean of the seeds; level-up offers turned down. */
function damage(g: Gun, hand: Hand): number {
  let total = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let t = scene(g, hand, seed);
    for (let i = 0; i < SECONDS / STEP && t.outcome === 'fighting'; i++) {
      t = t.offer ? { ...t, offer: null } : tick(t, STEP);
    }
    total += t.enemies.reduce((sum, e) => sum + BIG - e.hp, 0);
  }
  return total / SEEDS;
}

describe('Heavy Rounds: a trade-off for its damage (ID-136)', () => {
  /** Each hand's damage over no card's, per gun. */
  const gain = new Map<Gun, Record<Hand, number>>();
  beforeAll(() => {
    for (const g of GUNS) {
      const base = damage(g, 'none');
      gain.set(g, {
        none: 1,
        heavy: damage(g, 'heavy') / base,
        sharpshooter: damage(g, 'sharpshooter') / base,
        'rapid-fire': damage(g, 'rapid-fire') / base,
      });
    }
  }, 300_000);
  const of = (g: Gun, hand: Hand): number => gain.get(g)![hand];
  /** Every gun's gains, for a failure message. */
  const table = (): string => JSON.stringify(Object.fromEntries(gain));

  it('is worth about three Sharpshooter picks in sustained damage, on average over the guns', () => {
    const mean =
      GUNS.reduce((sum, g) => sum + of(g, 'heavy') / of(g, 'sharpshooter'), 0) / GUNS.length;
    expect(mean, table()).toBeGreaterThan(0.97);
    expect(mean, table()).toBeLessThan(1.03);
  });

  it('makes every gun stronger, by less than its ×1.38 with no reload cost', () => {
    for (const g of GUNS) {
      expect(of(g, 'heavy'), `${g} ${table()}`).toBeGreaterThan(1.25);
      expect(of(g, 'heavy'), `${g} ${table()}`).toBeLessThan(1.38);
    }
  });

  // The shotgun carries this (×1.29 against ×1.30); the sniper rifle's margin is thinner.
  it('is a real choice: three Sharpshooter or Rapid Fire picks beat it with the shotgun or sniper rifle', () => {
    const beaten = (['shotgun', 'sniper'] as const).filter(
      (g) => Math.max(of(g, 'sharpshooter'), of(g, 'rapid-fire')) > of(g, 'heavy'),
    );
    expect(beaten.length, table()).toBeGreaterThan(0);
  });

  it('the Pistol keeps the fastest reload of any gun after the cost', () => {
    const heavy = scene('pistol', 'heavy', 1);
    const plain = scene('pistol', 'none', 1);
    const d = heavy.defenders[0]!;
    const pistol = reloadIn(heavy, d, 'pistol');
    for (const g of GUNS.filter((x) => x !== 'pistol')) {
      expect(pistol, g).toBeLessThan(reloadIn(heavy, d, held(g)));
      // Faster even than another gun with no Heavy Rounds.
      expect(pistol, g).toBeLessThan(reloadIn(plain, d, held(g)));
    }
  });
});
