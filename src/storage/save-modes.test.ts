// ID-218: save version 24. Difficulty modes: `mode` (an allow-list) and `modes` (each higher
// mode's horde, a bounded whole number), both written only when set. A mode's progress needs
// the mode before it past Horde 50; a first clear's uid (`n<k>`, `x<k>`) names a horde of its
// mode already beaten; a gun's level is held to the highest horde beaten on any mode.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { MODE_CARDS } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { modeCards } from '../core/hordeonly.ts';
import { MODES, modeOf } from '../core/modes.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const gun = (uid: string, level?: number): OwnedWeapon => ({
  uid,
  base: 'smg',
  rarity: 'common',
  affixes: [],
  ...(level === undefined ? {} : { level }),
});

/** A camp past Horde 50 on Normal (Nightmare open), with `extra` on top. */
function camp(extra: Partial<GameState> = {}): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 51,
    roster: [recruit(1)],
    camp: { ...g.camp, recruits: 1 },
    ...extra,
  };
}

function reread(game: GameState, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: difficulty modes (ID-218)', () => {
  it('is version 26, and Normal writes neither field', () => {
    expect(SAVE_VERSION).toBe(26);
    const json = JSON.parse(encodeSave(camp(), NOW)).game;
    expect('mode' in json).toBe(false);
    expect('modes' in json).toBe(false);
    expect(reread(camp())!.game).toEqual(camp());
  });

  it('round-trips the mode and each mode’s horde', () => {
    const g = camp({ mode: 'nightmare', modes: { nightmare: 12 } });
    const back = reread(g)!.game;
    expect(back.mode).toBe('nightmare');
    expect(back.modes).toEqual({ nightmare: 12 });
    expect(back).toEqual(g);
    const hell = camp({ mode: 'hell', modes: { nightmare: 51, hell: 3 } });
    expect(reread(hell)!.game).toEqual(hell);
    // Switched to a mode never played: the mode alone.
    expect(reread(camp({ mode: 'nightmare' }))!.game.mode).toBe('nightmare');
    // Played but switched back to Normal: the progress alone.
    expect(reread(camp({ modes: { nightmare: 5 } }))!.game).toEqual(
      camp({ modes: { nightmare: 5 } }),
    );
  });

  // No old-save fixture in storage/testing.ts: a pre-v24 save has neither key and Normal writes
  // neither, so rereading a Normal game as v23 is the old save.
  it('a v23 or older save loads as Normal, and never has the fields', () => {
    const old = reread(camp(), () => {}, 23)!.game;
    expect(old.mode).toBeUndefined();
    expect(old.modes).toBeUndefined();
    expect(reread(camp({ mode: 'nightmare' }), () => {}, 23)).toBeNull();
    expect(reread(camp({ modes: { nightmare: 2 } }), () => {}, 23)).toBeNull();
  });

  it('refuses a mode that is not on the allow-list, look-alikes and hidden marks included', () => {
    for (const mode of [
      'Nightmare',
      ' nightmare',
      'nightmare ',
      'normal',
      'hell\u200B',
      'nightmare\u202E',
      '\uFF4Eightmare',
      'nightm\u0430re', // a Cyrillic a
      '__proto__',
      'constructor',
      'toString',
      '',
      'x'.repeat(100_000),
      5,
      null,
      true,
      ['nightmare'],
      { toString: 'nightmare' },
    ]) {
      expect(
        reread(camp({ mode: 'nightmare' }), (g) => (g.mode = mode)),
        `${JSON.stringify(mode)?.slice(0, 40)}`,
      ).toBeNull();
    }
  });

  it('refuses hordes that are not whole numbers from 1 up to the bound', () => {
    const bad = [
      0,
      -1,
      -5,
      1.5,
      0.1,
      1e9,
      100_001,
      Number.MAX_SAFE_INTEGER,
      '5',
      null,
      true,
      [],
      {},
    ];
    for (const n of bad) {
      expect(
        reread(camp(), (g) => (g.modes = { nightmare: n })),
        `${String(n)}`,
      ).toBeNull();
    }
    expect(reread(camp(), (g) => (g.modes = { nightmare: 100_000 }))).not.toBeNull();
    expect(reread(camp(), (g) => (g.modes = { nightmare: 1 }))).not.toBeNull();
  });

  it('refuses modes that is not a plain object of the two known keys', () => {
    for (const modes of [
      {},
      [],
      [3],
      'nightmare',
      7,
      null,
      { normal: 3 },
      { nightmare: 3, extra: 1 },
      { constructor: 3 },
      { toString: 3 },
      { 'nightmare\u200B': 3 },
    ]) {
      expect(
        reread(camp(), (g) => (g.modes = modes)),
        JSON.stringify(modes),
      ).toBeNull();
    }
  });

  it('refuses prototype keys, and does not pollute', () => {
    const raw = JSON.stringify({
      v: SAVE_VERSION,
      savedAt: NOW,
      game: { ...JSON.parse(encodeSave(camp(), NOW)).game, modes: '__MODES__' },
    });
    for (const body of [
      '{"__proto__":{"nightmare":3}}',
      '{"nightmare":3,"__proto__":{"polluted":1}}',
      '{"nightmare":3,"constructor":{"prototype":{"polluted":1}}}',
    ]) {
      expect(decodeSave(raw.replace('"__MODES__"', body))).toBeNull();
    }
    expect(({} as Loose).polluted).toBeUndefined();
    expect(({} as Loose).nightmare).toBeUndefined();
    // The game's own `mode` key is a plain data key: a prototype object there is refused too.
    const proto = raw.replace('"modes":"__MODES__"', '"mode":{"__proto__":{"x":1}}');
    expect(decodeSave(proto)).toBeNull();
  });

  it('refuses progress on a mode that is not open, and a mode in play that is not open', () => {
    // Nightmare progress with Normal at 50 or less.
    for (const n of [1, 2, 20, 50]) {
      const g = camp({ hordeNumber: n });
      expect(
        reread(g, (x) => (x.modes = { nightmare: 2 })),
        `normal ${n}`,
      ).toBeNull();
      expect(
        reread(g, (x) => (x.mode = 'nightmare')),
        `mode at normal ${n}`,
      ).toBeNull();
    }
    expect(reread(camp({ hordeNumber: 51 }), (x) => (x.modes = { nightmare: 2 }))).not.toBeNull();
    // Hell without Nightmare past 50.
    for (const nm of [undefined, 1, 30, 50]) {
      const modes = { ...(nm ? { nightmare: nm } : {}), hell: 2 };
      expect(
        reread(camp({ hordeNumber: 500 }), (x) => (x.modes = modes)),
        `nm ${nm}`,
      ).toBeNull();
    }
    expect(
      reread(camp({ hordeNumber: 500 }), (x) => (x.modes = { nightmare: 51, hell: 2 })),
    ).not.toBeNull();
    // Hell in play with Nightmare at 50.
    const g = camp({ hordeNumber: 500, modes: { nightmare: 50 } });
    expect(reread(g, (x) => (x.mode = 'hell'))).toBeNull();
    expect(reread(g, (x) => (x.modes = { nightmare: 51 }))).not.toBeNull();
  });

  it('a first clear’s uid names a horde of its mode already beaten', () => {
    const base = camp({ modes: { nightmare: 6 } });
    const at = (uid: string, modes?: GameState['modes']) =>
      reread({ ...base, ...(modes ? { modes } : {}), armoury: [gun(uid, 41)] });
    expect(at('n5')).not.toBeNull();
    expect(at('n5-1')).not.toBeNull();
    expect(at('n6')).toBeNull();
    expect(at('n99')).toBeNull();
    // No Nightmare progress at all: no Nightmare drop.
    expect(reread({ ...camp(), armoury: [gun('n1')] })).toBeNull();
    // Hell's own horde, not Nightmare's.
    expect(at('x1')).toBeNull();
    expect(at('x1', { nightmare: 51, hell: 2 })).not.toBeNull();
    expect(at('x2', { nightmare: 51, hell: 2 })).toBeNull();
    // A uid that is not a plain number, or is oversized.
    for (const uid of [
      'n0',
      'n05',
      'n-1',
      'n1.5',
      'n1e3',
      `n${'9'.repeat(40)}`,
      'n',
      'x',
      'N5',
      'n5\u200B',
    ]) {
      expect(at(uid), uid).toBeNull();
    }
  });

  it('holds a gun’s level to the highest horde beaten on any mode', () => {
    const lv = (level: number, g: GameState) => reread({ ...g, armoury: [gun('h1', level)] });
    const normal = camp({ hordeNumber: 60 });
    expect(lv(59, normal)).not.toBeNull();
    expect(lv(60, normal)).toBeNull();
    // Nightmare 31 beaten 30: effective 80.
    const nm = camp({ hordeNumber: 60, modes: { nightmare: 31 } });
    expect(lv(80, nm)).not.toBeNull();
    expect(lv(81, nm)).toBeNull();
    // Hell 30 beaten 29: effective 129 (over Nightmare 51 beaten 50: effective 100).
    const hell = camp({ hordeNumber: 60, modes: { nightmare: 51, hell: 30 } });
    expect(lv(129, hell)).not.toBeNull();
    expect(lv(130, hell)).toBeNull();
    // The top Hell horde a save can hold (ID-225): its effective number bounds the level, and
    // the reader's own cap (MAX_HORDE + the Hell offset) sits one above it.
    const top = camp({ hordeNumber: 60, modes: { nightmare: 51, hell: 100_000 } });
    expect(lv(100_000 + MODES.hell.offset - 1, top)).not.toBeNull();
    expect(lv(100_000 + MODES.hell.offset, top)).toBeNull();
    expect(lv(100_000 + MODES.hell.offset + 1, top)).toBeNull();
    // Well past any bound.
    expect(lv(1e9, hell)).toBeNull();
    expect(lv(100_000_000, nm)).toBeNull();
  });

  it('copies only the named keys: the loaded game has no stray field', () => {
    const back = reread(camp({ modes: { nightmare: 5 } }))!.game;
    expect(Object.keys(back.modes!)).toEqual(['nightmare']);
    expect(Object.getPrototypeOf(back.modes)).toBe(Object.prototype);
  });
});

// ID-222: the mode reward cards are not saved; they are read off the saved `modes`, so the
// hostile tests go at that derivation: whatever a save says, a card comes only from a
// validated mode horde.
describe('save: mode cards derive from the saved modes (ID-222)', () => {
  const ids = new Set<string>(MODE_CARDS);
  const hostile = [
    0,
    -1,
    1.5,
    1e9,
    100_001,
    Number.MAX_SAFE_INTEGER,
    '31',
    null,
    true,
    [],
    {},
    NaN,
  ];

  it('a loaded save’s cards are a subset of MODE_UNLOCKS, and none on Normal', () => {
    const g = camp({ mode: 'hell', modes: { nightmare: 51, hell: 31 } });
    const back = reread(g)!.game;
    expect(modeCards(back)).toEqual([...MODE_CARDS]);
    for (const c of modeCards(back)) expect(ids.has(c)).toBe(true);
    const normal = reread(camp({ modes: { nightmare: 51, hell: 31 } }))!.game;
    expect(modeOf(normal)).toBe('normal');
    expect(modeCards(normal)).toEqual([]);
  });

  it('refuses a mode horde that is not a bounded whole number, so no card comes of it', () => {
    for (const n of hostile) {
      for (const key of ['nightmare', 'hell'] as const) {
        const modes = key === 'hell' ? { nightmare: 51, hell: n } : { nightmare: n };
        expect(
          reread(camp(), (g) => (g.modes = modes)),
          `${key} ${String(n)}`,
        ).toBeNull();
      }
    }
    // The bounds themselves are fine, and 1e9 is not.
    expect(reread(camp(), (g) => (g.modes = { nightmare: 100_000 }))).not.toBeNull();
  });

  it('refuses unknown, prototype and look-alike keys, and nothing is polluted', () => {
    for (const key of [
      '__proto__',
      'constructor',
      'prototype',
      'toString',
      'gas-masks',
      'normal',
      'hell\u200B',
    ]) {
      const raw = JSON.stringify({
        v: SAVE_VERSION,
        savedAt: NOW,
        game: { ...JSON.parse(encodeSave(camp(), NOW)).game, modes: '__M__' },
      }).replace('"__M__"', `{"nightmare":51,${JSON.stringify(key)}:31}`);
      expect(decodeSave(raw), key).toBeNull();
    }
    expect(({} as Loose).hell).toBeUndefined();
    expect(({} as Loose)['gas-masks']).toBeUndefined();
    // A card list written by hand has nowhere to go: the save refuses unknown game fields.
    for (const field of ['modeCards', 'cards', 'unlocks']) {
      expect(
        reread(camp({ modes: { nightmare: 11 } }), (g) => (g[field] = ['adrenaline-rush'])),
        field,
      ).toBeNull();
    }
  });

  it('Hell without Nightmare past 50 is refused, so there is no Hell card', () => {
    for (const nm of [undefined, 1, 30, 50]) {
      const modes = { ...(nm ? { nightmare: nm } : {}), hell: 31 };
      expect(
        reread(camp(), (g) => (g.modes = modes)),
        `nightmare ${String(nm)}`,
      ).toBeNull();
    }
    const ok = reread(camp({ mode: 'hell', modes: { nightmare: 51, hell: 11 } }))!.game;
    expect(modeCards(ok)).toContain('gas-masks');
  });

  it('Hell past 30 has Adrenaline, never the removed Tranq Darts (ID-245)', () => {
    const cards = modeCards(
      reread(camp({ mode: 'hell', modes: { nightmare: 51, hell: 31 } }))!.game,
    ) as string[];
    expect(cards).toContain('adrenaline-rush');
    expect(cards).not.toContain('tranq-darts');
    expect(cards).toHaveLength(MODE_CARDS.length);
  });

  it('a card is there from a saved first clear and does not move on a second one', () => {
    const after = (n: number) =>
      modeCards(reread(camp({ mode: 'nightmare', modes: { nightmare: n } }))!.game);
    expect(after(10)).toEqual([]);
    expect(after(11)).toEqual(['suppressing-fire']);
    expect(after(12)).toEqual(['suppressing-fire']);
    expect(after(30)).toEqual(['suppressing-fire', 'cauterise']);
  });
});
