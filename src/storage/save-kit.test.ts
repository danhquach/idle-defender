// ID-284: save version 28. The starting pick `kit` (written only with a pick) and the 15 new
// `tech` ids. Everything in it is untrusted: the reader never refuses the save for `kit`, keeps
// only an exact card id of the slot whose unlock is researched, and reads anything else as none.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { TECH_IDS, type TechId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { exportCode, importCode } from './code.ts';
import { NOW } from './testing.ts';

// Hostile saves are built loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const camp = (extra: Partial<GameState> = {}): GameState => {
  const g = newGame('horde');
  return { ...g, roster: [recruit(1)], camp: { ...g.camp, recruits: 1 }, ...extra };
};

function reread(game: GameState, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

const TECH_BOTH: TechId[] = ['incendiary-rounds', 'frag-grenades'];
/** The saved game with its `kit` replaced by `value`, over `tech`. */
const withKit = (value: unknown, tech: TechId[] = TECH_BOTH, v = SAVE_VERSION) =>
  reread(camp({ tech }), (g) => (g.kit = value), v);

/** What a load must always give: a save, and a clean prototype; returns the kit read. */
function expectClean(value: unknown, tech: TechId[] = TECH_BOTH): unknown {
  const before = Object.getOwnPropertyNames(Object.prototype).sort();
  const loaded = withKit(value, tech);
  expect(loaded).not.toBeNull();
  expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
  expect(({} as Loose).polluted).toBeUndefined();
  const kit = loaded!.game.kit;
  // Re-encoding gives the canonical key, or none.
  expect(JSON.parse(encodeSave(loaded!.game, NOW)).game.kit).toEqual(kit);
  return kit;
}

describe('save: the starting pick (ID-284)', () => {
  it('is version 28; a game with no pick writes no key, and loads as before', () => {
    expect(SAVE_VERSION).toBe(28);
    const g = camp();
    expect('kit' in JSON.parse(encodeSave(g, NOW)).game).toBe(false);
    expect(reread(g)!.game).toEqual(g);
  });

  it('round-trips a pick, and the 15 new nodes, in table order', () => {
    const g = camp({
      tech: ['incendiary-rounds', 'incendiary-rounds-mk2', 'frag-grenades'],
      kit: { ammo: 'incendiary-rounds', throwable: 'frag-grenades' },
    });
    expect(reread(g)!.game).toEqual(g);
    expect(reread(camp({ tech: [...TECH_IDS] }))!.game.tech).toEqual([...TECH_IDS]);
    const one = camp({ tech: ['shock-rounds'], kit: { ammo: 'shock-rounds' } });
    expect(reread(one)!.game).toEqual(one);
    expect(reread(one)!.game.kit).toEqual({ ammo: 'shock-rounds' });
  });

  it('rides the backup code too', () => {
    const g = camp({ tech: ['flashbang'], kit: { throwable: 'flashbang' } });
    const got = importCode(exportCode(encodeSave(g, NOW)));
    expect(got.ok && got.save.game.kit).toEqual({ throwable: 'flashbang' });
  });

  it('a pick whose unlock is not researched is dropped, the other slot kept', () => {
    expect(expectClean({ ammo: 'shock-rounds', throwable: 'frag-grenades' })).toEqual({
      throwable: 'frag-grenades',
    });
    expect(expectClean({ ammo: 'incendiary-rounds' }, [])).toBeUndefined();
    // A Mk is not an unlock: its card still needs its own node.
    expect(expectClean({ ammo: 'incendiary-rounds' }, ['incendiary-rounds-mk2'])).toBeUndefined();
  });

  it('a Mk without its unlock is dropped from tech (and with it the pick)', () => {
    const loaded = reread(
      camp({
        tech: ['incendiary-rounds-mk2', 'frag-grenades-mk3'],
        kit: { ammo: 'incendiary-rounds' },
      }),
    );
    expect(loaded!.game.tech).toBeUndefined();
    expect(loaded!.game.kit).toBeUndefined();
    const part = reread(camp({ tech: ['incendiary-rounds', 'incendiary-rounds-mk3'] }));
    expect(part!.game.tech).toEqual(['incendiary-rounds']);
  });

  it('a card of the other slot, or not a kit card at all, is none', () => {
    expect(expectClean({ ammo: 'frag-grenades' })).toBeUndefined();
    expect(expectClean({ throwable: 'incendiary-rounds' })).toBeUndefined();
    expect(expectClean({ ammo: 'hollow-points' }, [...TECH_IDS])).toBeUndefined();
    expect(expectClean({ ammo: 'wall-machine-gun' }, [...TECH_IDS])).toBeUndefined();
    expect(expectClean({ ammo: 'incendiary-rounds-mk2' }, [...TECH_IDS])).toBeUndefined();
  });

  it('a v27 save carrying the key is refused; one without it loads', () => {
    const old = reread(camp({ tech: ['razor-wire'] }), () => {}, 27);
    expect(old).not.toBeNull();
    expect(old!.game.kit).toBeUndefined();
    expect(old!.game.tech).toEqual(['razor-wire']);
    expect(withKit({ ammo: 'incendiary-rounds' }, TECH_BOTH, 27)).toBeNull();
    expect(withKit({}, TECH_BOTH, 26)).toBeNull();
    expect(withKit({}, TECH_BOTH, 25)).toBeNull();
  });

  it('hostile kit values read as none and never refuse the save', () => {
    const hostile: unknown[] = [
      null,
      7,
      true,
      'incendiary-rounds',
      ['incendiary-rounds'],
      [{ ammo: 'incendiary-rounds' }],
      {},
      { ammo: 7 },
      { ammo: null },
      { ammo: ['incendiary-rounds'] },
      { ammo: { id: 'incendiary-rounds' } },
      { extra: 1 },
      { ammo: 'incendiary-rounds', extra: 1 },
      { ammo: 'incendiary-rounds', constructor: 'x' },
      { ammo: 'x'.repeat(40000) },
      { 0: 'incendiary-rounds', length: 1 },
    ];
    for (const v of hostile)
      expect(expectClean(v), JSON.stringify(v)?.slice(0, 40)).toBeUndefined();
  });

  it('__proto__ and constructor keys do nothing', () => {
    const raw = encodeSave(camp({ tech: TECH_BOTH }), NOW).replace(
      '"game":{',
      '"game":{"kit":{"__proto__":{"polluted":1},"ammo":"incendiary-rounds"},',
    );
    const loaded = decodeSave(raw);
    expect(loaded).not.toBeNull();
    expect(loaded!.game.kit).toBeUndefined();
    expect(({} as Loose).polluted).toBeUndefined();
    const ctor = encodeSave(camp({ tech: TECH_BOTH }), NOW).replace(
      '"game":{',
      '"game":{"kit":{"constructor":{"prototype":{"polluted":1}}},',
    );
    expect(decodeSave(ctor)!.game.kit).toBeUndefined();
    expect(({} as Loose).polluted).toBeUndefined();
    // A key named __proto__ beside the pick on the game itself is refused or ignored, never merged.
    decodeSave(encodeSave(camp(), NOW).replace('"game":{', '"game":{"__proto__":{"polluted":1},'));
    expect(({} as Loose).polluted).toBeUndefined();
  });

  it('bidi, zero-width, invisible and look-alike spellings are not the card', () => {
    const lookalikes = [
      'Incendiary-Rounds',
      ' incendiary-rounds',
      'incendiary-rounds ',
      'incendiary\u{2011}rounds',
      'incendiary-rounds\u{200b}',
      'incendiary-rounds\u{200d}',
      'incen\u{200d}diary-rounds',
      '\u{202e}incendiary-rounds',
      'incendiary-rounds\u{202c}',
      'incendiary-r\u{43e}unds',
      '\u{ff49}ncendiary-rounds',
      'incendiary-rounds\u{0}',
      'incendiary-rounds\n',
    ];
    for (const id of lookalikes) {
      expect(expectClean({ ammo: id }), JSON.stringify(id)).toBeUndefined();
      expect(expectClean({ throwable: id }), JSON.stringify(id)).toBeUndefined();
    }
    const flash = ['flash\u{200b}bang', 'Flashbang', 'flashbang\u{202e}', 'flashb\u{430}ng'];
    for (const id of flash) expect(expectClean({ throwable: id }, ['flashbang'])).toBeUndefined();
    expect(expectClean({ throwable: 'flashbang' }, ['flashbang'])).toEqual({
      throwable: 'flashbang',
    });
  });

  it('is byte-stable: save, load, save again gives the same text', () => {
    const g = camp({
      tech: ['shock-rounds', 'shock-rounds-mk2', 'molotov'],
      kit: { ammo: 'shock-rounds', throwable: 'molotov' },
    });
    const first = encodeSave(g, NOW);
    expect(encodeSave(decodeSave(first)!.game, NOW)).toBe(first);
  });
});
