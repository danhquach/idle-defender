// Design §8, ID-131: Kevlar Vests (survivor armour) and First Aid Kits (survivor HP
// recovery), levelled common stat cards in the horde pool.
import { describe, expect, it } from 'vitest';
import {
  UPGRADES,
  chooseCard,
  effectAt,
  eligible,
  pitch,
  rollOffer,
  survivorHurt,
} from './cards.ts';
import { createRng } from './rng.ts';
import { CARD, CARD_MAX_LEVEL, ENEMIES, SPEWER, STAT_EFFECT, STEP } from './data.ts';
import {
  cardArmour,
  cardFirstAid,
  newHorde,
  tick,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { SQUAD_CARDS } from './hordeonly.ts';
import { damageTaken, NO_STATS } from './stats.ts';
import { enemy, setup } from './testing.ts';

const SURVIVOR_CARDS = ['kevlar-vests', 'first-aid-kits'] as const satisfies readonly UpgradeId[];

/** `s` with card `id` picked from an offer `times` times, as the player would. */
function picked(s: HordeState, id: UpgradeId, times: number): HordeState {
  let t = s;
  for (let i = 0; i < times; i++) {
    t = chooseCard({ ...t, offer: [{ kind: 'upgrade', id }] }, 0);
    t.offer = null;
  }
  return t;
}

/** Horde 1 with nothing to spawn and defender a alone on the field, with `instinct` points. */
function alone(instinct = 0): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders = s.defenders.slice(0, 1);
  s.defenders[0]!.stats = { ...NO_STATS, instinct };
  return s;
}

/** HP defender a loses to one hit from a `kind` in the camp beside them, holding Kevlar at `level` (0: none). */
function hitBy(kind: 'shambler' | 'brute', level: number, instinct = 0): number {
  let s = alone(instinct);
  if (level > 0) s = picked(s, 'kevlar-vests', level);
  const a = s.defenders[0]!;
  enemy(s, { kind, x: a.x, y: a.y, hp: 1e9, maxHp: 1e9, inCamp: true });
  const before = a.hp;
  return before - tick(s, STEP).defenders[0]!.hp;
}

describe('survivor cards (ID-131)', () => {
  it('are common stat cards with levels 1, 2 and max, in the horde pool', () => {
    for (const id of SURVIVOR_CARDS) {
      expect(UPGRADES[id]).toMatchObject({
        category: 'stat',
        rarity: 'common',
        levels: CARD_MAX_LEVEL,
      });
      expect(SQUAD_CARDS).toContain(id);
    }
    expect(UPGRADES['kevlar-vests'].name).toBe('Kevlar Vests');
    expect(UPGRADES['first-aid-kits'].name).toBe('First Aid Kits');
    expect(CARD.armour).toEqual([1, 2, 3]);
    expect(CARD.firstAid).toEqual([0.005, 0.01, 0.015]);
  });

  it('level up with each pick and leave the pool at max', () => {
    for (const id of SURVIVOR_CARDS) {
      let s = newHorde(1, setup());
      s.cardPool = [...SQUAD_CARDS];
      s.defenders[0]!.hp = 1;
      for (let lv = 1; lv <= 3; lv++) {
        expect(eligible(s, id), `${id} before pick ${lv}`).toBe(true);
        s = picked(s, id, 1);
        expect(s.cardLevels[id]).toBe(lv);
      }
      expect(eligible(s, id)).toBe(false);
    }
  });

  it('are offered only once the line is in trouble: a survivor under half HP, or one injured', () => {
    for (const id of SURVIVOR_CARDS) {
      const s = newHorde(1, setup());
      const a = s.defenders[0]!;
      expect(survivorHurt(s)).toBe(false);
      expect(eligible(s, id), `${id} at full HP`).toBe(false);
      a.hp = a.maxHp / 2;
      expect(eligible(s, id), `${id} at exactly half`).toBe(false);
      a.hp = a.maxHp / 2 - 1;
      expect(eligible(s, id), `${id} under half`).toBe(true);
      a.hp = a.maxHp;
      s.injured.push({ defender: a, postId: a.postId, at: 0, offered: false, by: 'shambler' });
      expect(eligible(s, id), `${id} after an injury`).toBe(true);
      // Never in a rolled offer while the line is whole.
      const whole = newHorde(1, setup());
      for (let i = 0; i < 200; i++) {
        const offer = rollOffer(createRng(i), whole);
        expect(offer.some((c) => c.kind === 'upgrade' && c.id === id)).toBe(false);
      }
    }
  });

  it('card texts show the exact number at each level', () => {
    expect([1, 2, 3].map((n) => effectAt('kevlar-vests', n)!.value)).toEqual([
      '−1 HP',
      '−2 HP',
      '−3 HP',
    ]);
    expect(effectAt('kevlar-vests', 1)).toEqual({
      pre: 'Each hit on a survivor ',
      value: '−1 HP',
      post: '',
    });
    expect([1, 2, 3].map((n) => effectAt('first-aid-kits', n)!.value)).toEqual([
      '0.5%',
      '1%',
      '1.5%',
    ]);
    expect(effectAt('first-aid-kits', 1)).toEqual({
      pre: 'Survivors recover ',
      value: '0.5%',
      post: ' of max HP a second',
    });
    const s = picked(newHorde(1, setup()), 'kevlar-vests', 1);
    expect(pitch(s, 'kevlar-vests')).toMatchObject({
      tag: 'Lv 1 → 2',
      effect: { from: '−1 HP', to: '−2 HP' },
    });
  });

  it('add nothing when not held', () => {
    const s = newHorde(1, setup());
    expect(cardArmour(s)).toBe(0);
    expect(cardFirstAid(s)).toBe(0);
  });

  it('show up in rolled offers once a survivor is under half HP', () => {
    const s = newHorde(1, setup());
    s.bench = [];
    s.defenders[0]!.hp = 1;
    for (const id of SURVIVOR_CARDS) {
      let seen = 0;
      for (let i = 0; i < 200; i++) {
        if (rollOffer(createRng(i), s).some((c) => c.kind === 'upgrade' && c.id === id)) seen++;
      }
      expect(seen, id).toBeGreaterThan(0);
    }
  });

  it('a held card levels up only while the line is in trouble', () => {
    for (const id of SURVIVOR_CARDS) {
      const s = newHorde(1, setup());
      const a = s.defenders[0]!;
      a.hp = 1;
      const held = picked(s, id, 1);
      const b = held.defenders[0]!;
      b.hp = b.maxHp;
      expect(eligible(held, id), `${id} Lv 1, line whole`).toBe(false);
      b.hp = b.maxHp / 2 - 1;
      expect(eligible(held, id), `${id} Lv 1, line hurt`).toBe(true);
    }
  });

  it('Kevlar Vests: each level takes its armour off a hit, never under half the hit', () => {
    const shambler = ENEMIES.shambler.damage;
    expect(hitBy('shambler', 0)).toBeCloseTo(shambler, 9);
    expect(hitBy('shambler', 1)).toBeCloseTo(shambler - 1, 9);
    expect(hitBy('shambler', 2)).toBeCloseTo(shambler - 2, 9);
    // 5 − 3 = 2 is under half the hit: the floor keeps 2.5.
    expect(hitBy('shambler', 3)).toBeCloseTo(shambler * STAT_EFFECT.armourFloor, 9);
    expect(hitBy('brute', 3)).toBeCloseTo(ENEMIES.brute.damage - 3, 9);
  });

  it('Kevlar Vests takes its armour off a Spewer’s spit too', () => {
    for (const level of [0, 2, 3]) {
      let s = alone();
      if (level > 0) s = picked(s, 'kevlar-vests', level);
      const a = s.defenders[0]!;
      enemy(s, { kind: 'spewer', x: a.x + SPEWER.range - 1, y: a.y, hp: 1e9, maxHp: 1e9 });
      const t = tick(s, STEP);
      expect(t.defenders[0]!.hitBy, `Lv ${level}`).toBe('spewer');
      const spit = ENEMIES.spewer.damage;
      const want = Math.max(
        spit * STAT_EFFECT.armourFloor,
        spit - (level ? CARD.armour[level - 1]! : 0),
      );
      expect(a.hp - t.defenders[0]!.hp, `Lv ${level}`).toBeCloseTo(want, 9);
    }
  });

  it('Kevlar Vests stacks with Instinct’s armour', () => {
    const instinct = 40;
    const own = ENEMIES.brute.damage - hitBy('brute', 0, instinct);
    expect(own).toBeGreaterThan(0);
    expect(hitBy('brute', 2, instinct)).toBeCloseTo(ENEMIES.brute.damage - own - 2, 9);
    // The same sum the shared helper gives.
    const d = alone(instinct).defenders[0]!;
    expect(hitBy('brute', 2, instinct)).toBeCloseTo(damageTaken(d, ENEMIES.brute.damage, 2), 9);
  });

  it('First Aid Kits: each level heals its share of max HP a second, up to max', () => {
    for (let lv = 1; lv <= 3; lv++) {
      let s = picked(alone(), 'first-aid-kits', lv);
      const a = s.defenders[0]!;
      a.hp = a.maxHp / 2;
      for (let i = 0; i < Math.round(1 / STEP); i++) s = tick(s, STEP);
      const healed = s.defenders[0]!.hp - a.maxHp / 2;
      expect(healed, `Lv ${lv}`).toBeCloseTo(CARD.firstAid[lv - 1]! * a.maxHp, 6);
    }
    // 10 s at 1.5 HP a second would heal 15: the last 10 fill the bar and it stops there.
    let s = picked(alone(), 'first-aid-kits', 3);
    s.defenders[0]!.hp = s.defenders[0]!.maxHp - 10;
    for (let i = 0; i < 10; i++) s = tick(s, 1);
    expect(s.outcome).toBe('fighting');
    expect(s.defenders[0]!.hp).toBe(s.defenders[0]!.maxHp);
  });

  it('First Aid Kits heals every survivor on the line, not just one', () => {
    let s = picked(newHorde(1, setup()), 'first-aid-kits', 1);
    s.toSpawn = 0;
    for (const d of s.defenders) d.hp = d.maxHp - 10;
    s = tick(s, 1);
    for (const d of s.defenders) expect(d.hp, d.id).toBeGreaterThan(d.maxHp - 10);
  });

  it('First Aid Kits heals a survivor still walking to their post', () => {
    let s = picked(alone(), 'first-aid-kits', 2);
    const a = s.defenders[0]!;
    a.walking = true;
    a.x += 200;
    a.hp = a.maxHp - 20;
    s = tick(s, STEP);
    expect(s.defenders[0]!.walking).toBe(true);
    expect(s.defenders[0]!.hp).toBeCloseTo(a.hp + CARD.firstAid[1]! * a.maxHp * STEP, 9);
  });

  it('a whole squad heals nothing without the card', () => {
    let s = alone();
    s.defenders[0]!.hp = 40;
    s = tick(s, 5);
    expect(s.defenders[0]!.hp).toBe(40);
  });
});
