// ID-210: the card pick's Reroll, Skip and Ban (design §8): counts per horde, Skip's +1
// reroll, a ban for the rest of the horde, seeded, and graceful when the pool runs short.
import { describe, expect, it } from 'vitest';
import {
  banCard,
  banLock,
  bansLeft,
  chooseCard,
  eligible,
  rerollLock,
  rerollOffer,
  rerollsLeft,
  rollOffer,
  skipOffer,
  UPGRADE_IDS,
} from './cards.ts';
import { BAN, REROLL } from './data.ts';
import { newHorde, type HordeState, type UpgradeId } from './horde.ts';
import { answerOffer } from './sim.ts';
import { createRng } from './rng.ts';
import { setup } from './testing.ts';

/** The survivors a horde keeps in reserve: recruit cards come from them. */
const BENCH = newHorde(1, setup()).bench;

/** A horde with an offer open, rolled from `seed`; an empty bench, so only upgrades show. */
function offered(seed = 3, extra: Partial<HordeState> = {}): HordeState {
  const s = { ...newHorde(1, setup()), bench: [], ...extra };
  s.rng = { s: seed };
  s.offer = rollOffer(createRng(seed), s);
  return s;
}

const ids = (s: HordeState): UpgradeId[] =>
  (s.offer ?? []).flatMap((c) => (c.kind === 'upgrade' ? [c.id] : []));

describe('the counts', () => {
  it('are 3 rerolls, a free skip worth +1 reroll, and 1 ban a horde', () => {
    expect(REROLL.perHorde).toBe(3);
    expect(REROLL.perSkip).toBe(1);
    expect(BAN.perHorde).toBe(1);
  });

  it('start full on every new horde: nothing carries over', () => {
    let s = offered();
    s = rerollOffer(rerollOffer(s));
    s = banCard(s, 0);
    expect(rerollsLeft(s)).toBe(1);
    expect(bansLeft(s)).toBe(0);
    const next = newHorde(2, setup());
    expect(rerollsLeft(next)).toBe(3);
    expect(bansLeft(next)).toBe(1);
    expect(next.banned).toEqual([]);
  });
});

describe('Reroll', () => {
  it('deals a new offer, spends one, is pure and refuses at 0', () => {
    const s = offered();
    expect(rerollLock(s)).toBeNull();
    const a = rerollOffer(s);
    expect(a.offer).toHaveLength(3);
    expect(rerollsLeft(a)).toBe(2);
    expect(rerollsLeft(s)).toBe(3); // the input is untouched
    const c = rerollOffer(rerollOffer(a));
    expect(rerollsLeft(c)).toBe(0);
    expect(rerollLock(c)).toBe('No rerolls left');
    expect(() => rerollOffer(c)).toThrow(RangeError);
  });

  it('needs an open offer', () => {
    expect(rerollLock({ ...offered(), offer: null })).toBe('No offer to reroll');
  });

  it('adds Second Look’s rerolls to the 3 (a level-3 perk: 2 a wave)', () => {
    const base = offered();
    const look = { ...base, perks: ['second-look' as const], perkLevels: { 'second-look': 3 } };
    expect(rerollsLeft(look)).toBe(3 + 2);
    expect(rerollsLeft({ ...look, wave: 3 })).toBe(3 + 6);
    const used = rerollOffer(look);
    expect(rerollsLeft(used)).toBe(4);
  });

  it('never offers a card that cannot be taken, or one twice', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = offered(seed);
      for (let i = 0; i < 3; i++) {
        s = rerollOffer(s);
        const shown = ids(s);
        expect(new Set(shown).size).toBe(shown.length);
        for (const id of shown) expect(eligible(s, id), `${id} seed ${seed}`).toBe(true);
      }
    }
  });
});

describe('Skip', () => {
  it('takes no card, closes the pick and gives +1 reroll, unlimited', () => {
    let s = offered();
    const taken = [...s.taken];
    for (let i = 1; i <= 5; i++) {
      s = skipOffer(s);
      expect(s.offer).toBeNull();
      expect(s.taken).toEqual(taken);
      expect(rerollsLeft(s)).toBe(3 + i);
      s = { ...s, offer: rollOffer(createRng(i), s) };
    }
  });

  it('adds to what is left after rerolls were spent', () => {
    let s = rerollOffer(rerollOffer(offered()));
    s = skipOffer(s);
    expect(rerollsLeft(s)).toBe(2);
  });

  it('refuses with no offer open', () => {
    expect(() => skipOffer({ ...offered(), offer: null })).toThrow(RangeError);
  });

  it('opens the next pick when more XP is banked, as taking a card does', () => {
    const s = offered();
    s.xp = 1e9;
    const next = skipOffer(s);
    expect(next.offer).not.toBeNull();
    expect(next.level).toBe(s.level + 1);
  });
});

describe('Ban', () => {
  it('removes the card, fills its slot with another and keeps the pick open', () => {
    const s = offered();
    const gone = ids(s)[1]!;
    const a = banCard(s, 1);
    expect(a.offer).toHaveLength(3);
    expect(ids(a)).not.toContain(gone);
    expect(a.offer![0]).toEqual(s.offer![0]);
    expect(a.offer![2]).toEqual(s.offer![2]);
    expect(a.banned).toEqual([gone]);
    expect(bansLeft(a)).toBe(0);
    expect(bansLeft(s)).toBe(1); // pure
    expect(new Set(ids(a)).size).toBe(ids(a).length);
  });

  it('is refused at 0, with no offer, or on a bad index', () => {
    const a = banCard(offered(), 0);
    expect(banLock(a, 0)).toBe('No bans left');
    expect(() => banCard(a, 0)).toThrow(RangeError);
    expect(banLock({ ...offered(), offer: null }, 0)).toBe('No offer to ban from');
    expect(banLock(offered(), 7)).toBe('No such card');
    expect(() => banCard(offered(), -1)).toThrow(RangeError);
  });

  it('keeps the card out of every later offer this horde, rerolls and level-ups included', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = offered(seed);
      const gone = ids(s)[0]!;
      let a = banCard(s, 0);
      for (let i = 0; i < 3; i++) {
        a = rerollOffer(a);
        expect(ids(a)).not.toContain(gone);
      }
      a = skipOffer(a);
      for (let i = 0; i < 20; i++) {
        expect(
          rollOffer(createRng(seed * 100 + i), a).flatMap((c) =>
            c.kind === 'upgrade' ? [c.id] : [],
          ),
        ).not.toContain(gone);
      }
      expect(eligible(a, gone)).toBe(false);
    }
  });

  it('cannot ban a recruit', () => {
    const s = offered(3, { bench: BENCH });
    s.offer = [
      { kind: 'recruit', defender: BENCH[0]! },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'rapid-fire' },
    ];
    expect(banLock(s, 0)).toBe('A survivor can’t be banned');
    expect(() => banCard(s, 0)).toThrow(RangeError);
    expect(banLock(s, 1)).toBeNull();
  });

  it('never replaces with a second recruit', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = offered(seed, { bench: BENCH });
      s.offer = [
        { kind: 'recruit', defender: BENCH[0]! },
        ...rollOffer(createRng(seed), s)
          .filter((c) => c.kind === 'upgrade')
          .slice(0, 2),
      ];
      const a = banCard(s, 1);
      expect(a.offer!.filter((c) => c.kind === 'recruit')).toHaveLength(1);
    }
  });
});

describe('a short pool', () => {
  const pool: UpgradeId[] = ['sharpshooter', 'rapid-fire', 'long-sight'];

  it('banning with no card left to fill the slot offers fewer cards, never a crash', () => {
    const s = offered(5, { cardPool: pool });
    expect(s.offer).toHaveLength(3);
    const a = banCard(s, 0);
    expect(a.offer).toHaveLength(2);
    const r = rerollOffer(a);
    expect(r.offer).toHaveLength(2);
    expect(ids(r)).not.toContain(a.banned[0]);
  });

  it('a pool of one: banning it leaves an empty pick that Skip can still close', () => {
    const s = offered(5, { cardPool: ['sharpshooter'] });
    expect(s.offer).toHaveLength(1);
    const a = banCard(s, 0);
    expect(a.offer).toEqual([]);
    expect(rerollOffer(a).offer).toEqual([]);
    expect(skipOffer(a).offer).toBeNull();
  });

  it('a level-up with nothing left to offer opens an empty pick', () => {
    const s = offered(5, { cardPool: ['sharpshooter'] });
    const a = banCard(s, 0);
    expect(rollOffer(createRng(1), a)).toEqual([]);
  });
});

describe('seeded', () => {
  it('same seed, same choices, same cards', () => {
    const play = (seed: number): string => {
      let s = offered(seed);
      s = rerollOffer(s);
      s = banCard(s, 2);
      s = rerollOffer(s);
      s = skipOffer({ ...s, xp: 1e9 });
      s = rerollOffer(s);
      return JSON.stringify([s.offer, s.banned, s.rng]);
    };
    expect(play(9)).toBe(play(9));
    const all = new Set([1, 2, 3, 4, 5, 6].map(play));
    expect(all.size).toBeGreaterThan(1);
  });

  it('takes no random numbers until a button is used', () => {
    const s = offered(11);
    const before = { ...s.rng };
    const picked = chooseCard(s, 0);
    // Taking a card with no XP banked draws nothing.
    expect(picked.rng).toEqual(before);
    // A skip with no XP banked draws nothing either.
    expect(skipOffer(s).rng).toEqual(before);
    // A reroll does, and only then.
    expect(rerollOffer(s).rng).not.toEqual(before);
  });

  it('the offer rolled with nothing banned is the one rolled before bans existed', () => {
    // Bans only shrink the pool: with none, the rolls are identical to the plain pool's.
    const s = newHorde(1, setup());
    const plain = rollOffer(createRng(21), s);
    const filtered = rollOffer(createRng(21), { ...s, banned: [] });
    expect(filtered).toEqual(plain);
    expect(UPGRADE_IDS.length).toBeGreaterThan(5);
  });
});

describe('the scripted player', () => {
  it('skips an empty pick, and answers a pick of cards as before', () => {
    const empty = banCard(offered(5, { cardPool: ['sharpshooter'] }), 0);
    expect(empty.offer).toEqual([]);
    const after = answerOffer(empty);
    expect(after.offer).toBeNull();
    expect(after.skips).toBe(1);
    const s = offered(7);
    const done = answerOffer(s);
    expect(done.offer).toBeNull();
    expect(done.skips).toBe(0);
    expect(done.rerolls).toBe(0);
    expect(done.taken).toHaveLength(1);
  });
});
