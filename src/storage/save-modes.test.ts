// ID-218: save version 24. Difficulty modes: `mode` (an allow-list) and `modes` (each higher
// mode's horde, a bounded whole number), both written only when set. A mode's progress needs
// the mode before it past Horde 50; a first clear's uid (`n<k>`, `x<k>`) names a horde of its
// mode already beaten; a gun's level is held to the highest horde beaten on any mode.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
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
  it('is version 24, and Normal writes neither field', () => {
    expect(SAVE_VERSION).toBe(24);
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
    // Nightmare 31 beaten 30: effective 70.
    const nm = camp({ hordeNumber: 60, modes: { nightmare: 31 } });
    expect(lv(70, nm)).not.toBeNull();
    expect(lv(71, nm)).toBeNull();
    // Hell 20 beaten 19: effective 99.
    const hell = camp({ hordeNumber: 60, modes: { nightmare: 51, hell: 20 } });
    expect(lv(99, hell)).not.toBeNull();
    expect(lv(100, hell)).toBeNull();
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
