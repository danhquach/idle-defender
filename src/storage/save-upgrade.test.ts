// ID-208: a gun's upgrade step in the save. It round-trips (stash, either hand's gun, the bench),
// an older save's guns load at +0 with no field, and anything but a whole number from 0 to
// `GUN_UPGRADE.max` is refused, prototype keys included.
import { describe, expect, it } from 'vitest';
import { gunStep, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { GUN_UPGRADE } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { upgradeGun } from '../core/hordeonly.ts';
import { decodeSave, encodeSave } from './save.ts';
import { NOW } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const gun = (uid: string, step?: number): OwnedWeapon => ({
  uid,
  base: 'smg',
  rarity: 'common',
  affixes: [],
  ...(step === undefined ? {} : { step }),
});

/** A camp with a stepped stash gun, a stepped held gun and a stepped bench gun. */
function camp(): GameState {
  const g = newGame('horde');
  const [a, b] = [recruit(1), recruit(2)] as const;
  return {
    ...g,
    hordeNumber: 6,
    roster: [{ ...a, loadout: { ...a.loadout, primary: gun('h2', 5) } }],
    reserve: [{ ...b, loadout: { ...b.loadout, primary: gun('h3', 1) } }],
    armoury: [gun('h1', 3), gun('h4')],
    camp: { ...g.camp, recruits: 2 },
  };
}

function reread(game: GameState, change: (g: Loose) => void = () => {}) {
  const save = JSON.parse(encodeSave(game, NOW));
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: gun upgrade steps (ID-208)', () => {
  it('round-trips the step on a stash gun, a held gun and a bench gun', () => {
    const g = camp();
    const back = reread(g);
    expect(back?.game).toEqual(g);
    expect(gunStep(back!.game.armoury[0]!)).toBe(3);
    expect(gunStep(back!.game.roster[0]!.loadout.primary)).toBe(5);
    expect(gunStep(back!.game.reserve[0]!.loadout.primary)).toBe(1);
  });

  it('round-trips a gun upgraded in play', () => {
    const g = { ...camp(), stock: { ...camp().stock, scrap: 500 } };
    const r = upgradeGun(g, 'h4');
    if (!r.ok) throw new Error('refused');
    expect(reread(r.game)?.game).toEqual(r.game);
    expect(gunStep(reread(r.game)!.game.armoury[1]!)).toBe(1);
  });

  it('writes no field for a gun that was never upgraded', () => {
    const save = JSON.parse(encodeSave(camp(), NOW));
    expect('step' in save.game.armoury[1]).toBe(false);
    expect(save.game.armoury[0].step).toBe(3);
  });

  it('an older save, whose guns have no step, loads at +0 with no field', () => {
    const g: GameState = { ...camp(), armoury: [gun('h1'), gun('h4')] };
    const back = reread(g, (x) => {
      x.roster[0].loadout.primary = { ...x.roster[0].loadout.primary };
      delete x.roster[0].loadout.primary.step;
      delete x.reserve[0].loadout.primary.step;
    });
    expect(back).not.toBeNull();
    for (const w of [
      back!.game.armoury[0]!,
      back!.game.roster[0]!.loadout.primary,
      back!.game.reserve[0]!.loadout.primary,
    ]) {
      expect(gunStep(w)).toBe(0);
      expect(Object.hasOwn(w as object, 'step')).toBe(false);
    }
  });

  it('accepts every step from 0 to the top', () => {
    for (let s = 0; s <= GUN_UPGRADE.max; s++) {
      expect(
        reread(camp(), (x) => (x.armoury[1].step = s)),
        `step ${s}`,
      ).not.toBeNull();
    }
  });

  it('refuses hostile steps: whole, 0 to the top, numbers only', () => {
    const hostile: unknown[] = [
      -1,
      GUN_UPGRADE.max + 1,
      6,
      1.5,
      0.1 + 0.2,
      1e9,
      1e300,
      -1e300,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER,
      null, // what JSON makes of NaN
      '3',
      '+3',
      ' 3',
      '',
      true,
      false,
      [3],
      [],
      {},
      { valueOf: 3 },
      { toString: 3 },
      { constructor: 3 },
    ];
    for (const v of hostile) {
      for (const where of [
        (x: Loose, val: unknown) => (x.armoury[1].step = val),
        (x: Loose, val: unknown) => (x.roster[0].loadout.primary.step = val),
        (x: Loose, val: unknown) => (x.reserve[0].loadout.primary.step = val),
      ]) {
        expect(
          reread(camp(), (x) => where(x, v)),
          `step ${JSON.stringify(v)}`,
        ).toBeNull();
      }
    }
  });

  it('refuses NaN and Infinity as they arrive in the text', () => {
    const text = encodeSave(camp(), NOW).replace('"step":3', '"step":NaN');
    expect(decodeSave(text)).toBeNull();
    expect(decodeSave(encodeSave(camp(), NOW).replace('"step":3', '"step":1e999'))).toBeNull();
  });

  it('refuses prototype-pollution keys on a weapon, and leaves the prototype alone', () => {
    const raw = encodeSave(camp(), NOW).replace('"step":3', '"step":3,"__proto__":{"step":5}');
    expect(decodeSave(raw)).toBeNull();
    for (const key of ['constructor', 'prototype', 'steps', 'Step', 'step ', 'uid2']) {
      expect(
        reread(camp(), (x) => (x.armoury[0][key] = 1)),
        key,
      ).toBeNull();
    }
    expect(({} as Loose).step).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'step')).toBe(false);
  });

  it('refuses a second step key smuggled in after the first (the later one wins, and is checked)', () => {
    // A duplicate key (the later wins in JSON.parse) cannot smuggle a second value past the check.
    const raw = encodeSave(camp(), NOW).replace('"step":3', '"step":3,"step":9');
    expect(decodeSave(raw)).toBeNull();
  });
});
