// Design §12, as built ID-179: save version 23. Bought slots (`slots`) are saved only once
// any is bought: `squad` and `stash` purchase counts, whole numbers in range, nothing else.
// Anything else loads with none bought and copies nothing; the squad is cut to the cap the
// loaded slots give, and a stash past the cap is kept as it is; the Scrap balance is the
// stock's `scrap`.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { SQUAD_CAP, STASH_CAP } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { squadCap, stashCap } from '../core/hordeonly.ts';
import { decodeSave, encodeSave, MAX_OWNED, SAVE_VERSION } from './save.ts';
import { NOW } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const gun = (i: number): OwnedWeapon => ({
  uid: `h${i + 1}`,
  base: 'smg',
  rarity: 'common',
  affixes: [],
});

function camp(n: number, stash = 0, slots?: GameState['slots']): GameState {
  const g = newGame('horde');
  const all = Array.from({ length: n }, (_, i) => recruit(i + 1));
  return {
    ...g,
    hordeNumber: stash + 2,
    roster: all.slice(0, squadCap({ slots })),
    reserve: all.slice(squadCap({ slots })),
    armoury: Array.from({ length: stash }, (_, i) => gun(i)),
    camp: { ...g.camp, recruits: n },
    ...(slots ? { slots } : {}),
  };
}

function reread(game: GameState, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: bought slots and Scrap (ID-179)', () => {
  it('is version 26, and the owned-weapon cap fits 80 in the stash and every pair of hands', () => {
    expect(SAVE_VERSION).toBe(27);
    expect(MAX_OWNED).toBeGreaterThanOrEqual(80 + 2 * 40);
  });

  it('round-trips the slots and the Scrap balance; none bought writes no field', () => {
    const g = { ...camp(8, 3, { squad: 2, stash: 1 }) };
    g.stock = { ...g.stock, scrap: 4321 };
    const back = reread(g);
    expect(back?.game.slots).toEqual({ squad: 2, stash: 1 });
    expect(back?.game.stock.scrap).toBe(4321);
    expect(back?.game).toEqual(g);
    expect('slots' in JSON.parse(encodeSave(camp(8), NOW)).game).toBe(false);
    expect('slots' in reread(camp(8))!.game).toBe(false);
  });

  it('a full 80-gun stash and a squad of 8 round-trip', () => {
    const g = camp(10, 80, { squad: 2, stash: 4 });
    const back = reread(g);
    expect(back?.game.armoury).toHaveLength(80);
    expect(back?.game.roster).toHaveLength(8);
  });

  it.each([
    ['text', { squad: '1', stash: 0 }],
    ['a fraction', { squad: 0.5, stash: 0 }],
    ['negative', { squad: -1, stash: 0 }],
    ['past the slots there are', { squad: 3, stash: 0 }],
    ['past the stash slots', { squad: 0, stash: 5 }],
    ['huge', { squad: 1e308, stash: 1e308 }],
    ['NaN (JSON writes null)', { squad: NaN, stash: 0 }],
    ['null', { squad: null, stash: 1 }],
    ['an extra key', { squad: 1, stash: 1, extra: 1 }],
    ['a missing key', { squad: 1 }],
    ['a __proto__ key', JSON.parse('{"__proto__":{"polluted":true},"squad":1,"stash":1}')],
    ['an array', [1, 1]],
    ['a number', 7],
    ['text instead of an object', 'squad'],
    ['null instead of an object', null],
    ['a long text', 'x'.repeat(5000)],
    ['a Cyrillic look-alike key', { squad: 1, ['st' + String.fromCharCode(0x0430) + 'sh']: 1 }],
    ['a Kelvin-sign key', { squad: 1, stash: 1, [String.fromCharCode(0x212a)]: 1 }],
    ['bidi in a key', { squad: 1, [String.fromCharCode(0x202e) + 'stash']: 1 }],
  ])('%s loads with no slots bought, the rest of the save intact', (_, value) => {
    const g = camp(8, 3);
    const back = reread(g, (j) => {
      j.slots = value;
    });
    expect(back).not.toBeNull();
    expect('slots' in back!.game).toBe(false);
    expect(squadCap(back!.game)).toBe(SQUAD_CAP);
    expect(back!.game.armoury).toEqual(g.armoury);
    expect(({} as Loose).polluted).toBeUndefined();
  });

  it('all zero loads as none bought', () => {
    const back = reread(camp(8), (j) => {
      j.slots = { squad: 0, stash: 0 };
    });
    expect('slots' in back!.game).toBe(false);
  });

  it('a v22 or older save has none, and refuses the key (it never wrote one)', () => {
    expect(reread(camp(8), () => {}, 22)).not.toBeNull();
    expect(reread(camp(8), (j) => (j.slots = { squad: 1, stash: 1 }), 22)).toBeNull();
  });

  it('a stash past the loaded cap is kept as it is, never trimmed', () => {
    // 60 guns saved with 2 stash purchases; the field is then dropped as hostile.
    const g = camp(8, 60, { squad: 0, stash: 2 });
    expect(stashCap(g)).toBe(60);
    const back = reread(g, (j) => {
      j.slots = 'bad';
    });
    expect(stashCap(back!.game)).toBe(STASH_CAP);
    expect(back!.game.armoury).toHaveLength(60);
  });

  it('the squad is cut to the loaded squad cap, the rest going to the bench', () => {
    const g = camp(8, 0, { squad: 2, stash: 0 });
    expect(g.roster).toHaveLength(8);
    const back = reread(g, (j) => {
      j.slots = { squad: 0, stash: 0 };
    });
    expect(back!.game.roster).toHaveLength(SQUAD_CAP);
    expect(back!.game.reserve).toHaveLength(2);
  });
});
