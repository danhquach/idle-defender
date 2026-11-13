// Design §8, ID-130: Aim for the Head (squad crit chance) and Hollow Points (squad crit
// damage), levelled stat cards in the horde pool.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from './armoury.ts';
import { UPGRADES, chooseCard, effectAt, eligible, pitch } from './cards.ts';
import { CARD, CARD_MAX_LEVEL, STEP } from './data.ts';
import {
  cardCrit,
  cardCritDamage,
  squadCanCrit,
  newHorde,
  tick,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { SQUAD_CARDS } from './hordeonly.ts';
import { createRng } from './rng.ts';
import { answerOffer } from './sim.ts';
import { NO_STATS } from './stats.ts';
import { enemy, setup } from './testing.ts';

const CRIT_CARDS = [
  'aim-for-the-head',
  'hollow-point-rounds',
] as const satisfies readonly UpgradeId[];

/** Horde 1 with nothing left to spawn and defender a about to fire at a tough enemy. */
function firing(seed: number, mind = 0): HordeState {
  const s = newHorde(1, setup());
  if (mind > 0) s.defenders[0]!.stats = { ...NO_STATS, mind };
  s.toSpawn = 0;
  s.rng = { s: seed };
  s.defenders[0]!.nextShotAt = 0;
  enemy(s, { hp: 1e9, maxHp: 1e9, x: 900, y: 360 });
  return s;
}

/** `s` with card `id` picked from an offer `times` times, as the player would. */
function picked(s: HordeState, id: UpgradeId, times: number): HordeState {
  let t = s;
  for (let i = 0; i < times; i++) {
    t = chooseCard({ ...t, offer: [{ kind: 'upgrade', id }] }, 0);
    t.offer = null;
  }
  return t;
}

/** Defender a's first shot's damage on each seed, holding `cards` (id → level). */
function firstShots(cards: Partial<Record<UpgradeId, number>>, seeds = 2000, mind = 0): number[] {
  const out: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    let s = firing(seed, mind);
    for (const [id, lv] of Object.entries(cards)) s = picked(s, id as UpgradeId, lv);
    const b = tick(s, STEP).bullets.find((x) => x.owner === 'a');
    if (!b) throw new Error(`seed ${seed}: no shot`);
    out.push(b.damage);
  }
  return out;
}

const plainHit = (shots: number[]): number => Math.min(...shots);
const critRate = (shots: number[]): number =>
  shots.filter((d) => d > plainHit(shots) + 1e-9).length / shots.length;

describe('crit cards (ID-130)', () => {
  it('are rare stat cards with levels 1, 2 and max, in the horde pool', () => {
    for (const id of CRIT_CARDS) {
      expect(UPGRADES[id]).toMatchObject({
        category: 'stat',
        rarity: 'rare',
        levels: CARD_MAX_LEVEL,
      });
      expect(SQUAD_CARDS).toContain(id);
    }
    expect(UPGRADES['aim-for-the-head'].name).toBe('Aim for the Head');
    expect(UPGRADES['hollow-point-rounds'].name).toBe('Hollow Points');
    expect(CARD.crit).toEqual([0.05, 0.1, 0.15]);
    expect(CARD.critDamage).toEqual([0.25, 0.5, 0.75]);
  });

  it('level up with each pick and leave the pool at max', () => {
    for (const id of CRIT_CARDS) {
      let s = newHorde(1, setup());
      s.cardPool = [...SQUAD_CARDS];
      for (let lv = 1; lv <= 3; lv++) {
        expect(eligible(s, id), `${id} before pick ${lv}`).toBe(true);
        s = picked(s, id, 1);
        expect(s.cardLevels[id]).toBe(lv);
      }
      expect(eligible(s, id)).toBe(false);
    }
  });

  it('card texts show the exact number at each level', () => {
    expect([1, 2, 3].map((n) => effectAt('aim-for-the-head', n)!.value)).toEqual([
      '+5%',
      '+10%',
      '+15%',
    ]);
    expect(effectAt('aim-for-the-head', 1)).toEqual({
      pre: 'Squad crit chance ',
      value: '+5%',
      post: '',
    });
    expect([1, 2, 3].map((n) => effectAt('hollow-point-rounds', n)!.value)).toEqual([
      '+25%',
      '+50%',
      '+75%',
    ]);
    expect(effectAt('hollow-point-rounds', 1)).toEqual({
      pre: 'Squad crit damage ',
      value: '+25%',
      post: ', added to the ×2',
    });
    const s = picked(newHorde(1, setup()), 'hollow-point-rounds', 1);
    expect(pitch(s, 'hollow-point-rounds')).toMatchObject({
      tag: 'Lv 1 → 2',
      effect: { from: '+25%', to: '+50%' },
    });
  });

  it('Hollow Points is offered only while the squad can crit', () => {
    // Plain pistol survivors with no Sharp Mind never crit.
    const s = newHorde(1, setup());
    for (const d of s.defenders) {
      d.plain = true;
      delete d.stats;
    }
    expect(squadCanCrit(s)).toBe(false);
    expect(eligible(s, 'hollow-point-rounds')).toBe(false);
    expect(eligible(s, 'aim-for-the-head')).toBe(true);
    // Any crit source puts it in: Aim for the Head, a gun with crit of its own, or Sharp Mind.
    // The Carbine, LMG, Sniper rifle and Assault Rifle have crit of their own (ID-135).
    expect(eligible(picked(s, 'aim-for-the-head', 1), 'hollow-point-rounds')).toBe(true);
    const withGun = (base: 'rifle' | 'lmg' | 'sniper' | 'assault') => {
      const x = structuredClone(s);
      x.defenders[0]!.loadout = {
        primary: rollWeapon(createRng(1), 'r1', base, 'common', 1),
        secondary: null,
        item: null,
      };
      return x;
    };
    for (const base of ['rifle', 'lmg', 'sniper', 'assault'] as const) {
      expect(eligible(withGun(base), 'hollow-point-rounds'), base).toBe(true);
    }
    const mind = structuredClone(s);
    mind.defenders[0]!.stats = { ...NO_STATS, mind: 10 };
    expect(eligible(mind, 'hollow-point-rounds')).toBe(true);
  });

  it('add nothing when not held', () => {
    const s = newHorde(1, setup());
    expect(cardCrit(s)).toBe(0);
    expect(cardCritDamage(s)).toBe(0);
  });

  it('Aim for the Head: each level adds its share of crit hits to the squad’s own', () => {
    const base = critRate(firstShots({}));
    for (let lv = 1; lv <= 3; lv++) {
      const rate = critRate(firstShots({ 'aim-for-the-head': lv }));
      // 2000 seeds: about ±1% noise.
      expect(rate - base, `Lv ${lv}`).toBeGreaterThan(CARD.crit[lv - 1]! - 0.025);
      expect(rate - base, `Lv ${lv}`).toBeLessThan(CARD.crit[lv - 1]! + 0.025);
    }
  });

  it('Hollow Points: a crit deals its share more of the hit, on top of the ×2; plain hits are unchanged', () => {
    // Aim for the Head at max so enough shots crit to read their damage.
    const ref = firstShots({ 'aim-for-the-head': 3 }, 400);
    const plain = plainHit(ref);
    const crit = Math.max(...ref);
    for (let lv = 1; lv <= 3; lv++) {
      const shots = firstShots({ 'aim-for-the-head': 3, 'hollow-point-rounds': lv }, 400);
      expect(plainHit(shots)).toBeCloseTo(plain, 9);
      expect(Math.max(...shots)).toBeCloseTo(crit + plain * CARD.critDamage[lv - 1]!, 9);
      // Every shot is a plain hit or a crit at the new multiplier.
      for (const d of shots) {
        expect(
          Math.abs(d - plain) < 1e-9 ||
            Math.abs(d - (crit + plain * CARD.critDamage[lv - 1]!)) < 1e-9,
        ).toBe(true);
      }
    }
  });

  it('the two multiply: with Sharp Mind, both at max gain more than the two gains alone added', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Sharp Mind gives a real crit of its own, so each card alone gains something.
    const shots = (cards: Partial<Record<UpgradeId, number>>) => mean(firstShots(cards, 1000, 30));
    const none = shots({});
    const aim = shots({ 'aim-for-the-head': 3 }) - none;
    const hollow = shots({ 'hollow-point-rounds': 3 }) - none;
    const both = shots({ 'aim-for-the-head': 3, 'hollow-point-rounds': 3 }) - none;
    expect(aim).toBeGreaterThan(0);
    expect(hollow).toBeGreaterThan(0);
    // Expected hit = 1 + chance × (multiplier − 1): the cross term is Aim's chance × Hollow's
    // damage (0.15 × 0.75 of a hit), well clear of 1000 seeds' noise.
    expect(both - aim - hollow).toBeGreaterThan(0.05 * plainHit(firstShots({}, 50, 30)));
  });
});

describe('the campaign scripted player and Hollow Points (ID-130)', () => {
  const offer = (): HordeState['offer'] => [
    { kind: 'upgrade', id: 'hollow-point-rounds' },
    { kind: 'upgrade', id: 'sharpshooter' },
  ];

  it('passes over Hollow Points until Aim for the Head is held', () => {
    const s = { ...newHorde(1, setup()), offer: offer() };
    expect(answerOffer(s).taken).toEqual(['sharpshooter']);
    const aimed = { ...picked(newHorde(1, setup()), 'aim-for-the-head', 1), offer: offer() };
    expect(answerOffer(aimed).taken).toContain('hollow-point-rounds');
  });

  it('takes Hollow Points when it is the only card', () => {
    const s = {
      ...newHorde(1, setup()),
      offer: [{ kind: 'upgrade', id: 'hollow-point-rounds' }] as HordeState['offer'],
    };
    expect(answerOffer(s).taken).toEqual(['hollow-point-rounds']);
  });
});
