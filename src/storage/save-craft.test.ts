// ID-209: blueprints and the guns crafted so far in the save. `craft` is written only once a
// blueprint has dropped: `blueprints` (a count, 1 to `BLUEPRINT.cap`, per known gun type) and
// `made` (guns crafted). A crafted gun's uid is `f<n>`, n at most `made`. Old saves load with
// none; anything else a hostile file could hold is refused, prototype keys included.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { BLUEPRINT, CRAFT_MADE_MAX } from '../core/data.ts';
import { BLUEPRINT_GUNS } from '../core/craft.ts';
import { newGame, type GameState } from '../core/game.ts';
import { craftGun } from '../core/hordeonly.ts';
import { decodeSave, encodeSave } from './save.ts';
import { NOW } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const base = BLUEPRINT_GUNS[0]!;
const other = BLUEPRINT_GUNS[1]!;

function camp(extra: Partial<GameState> = {}): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 9,
    roster: [recruit(1), recruit(2)],
    camp: { ...g.camp, recruits: 2 },
    stock: { ...g.stock, scrap: 500 },
    ...extra,
  };
}

const withCraft = (): GameState =>
  camp({ craft: { blueprints: { [base]: 3, [other]: 1 }, made: 2 } });

/** The save of `game`, changed by `change`, read back. */
function reread(game: GameState, change: (g: Loose) => void = () => {}, v?: number) {
  const save = JSON.parse(encodeSave(game, NOW));
  if (v !== undefined) save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: blueprints (ID-209)', () => {
  it('round-trips the counts and the guns made; none writes no field', () => {
    const g = withCraft();
    expect(reread(g)?.game).toEqual(g);
    expect(reread(g)?.game.craft).toEqual({ blueprints: { [base]: 3, [other]: 1 }, made: 2 });
    expect('craft' in JSON.parse(encodeSave(camp(), NOW)).game).toBe(false);
    expect(reread(camp())?.game.craft).toBeUndefined();
  });

  it('an old save has none and loads', () => {
    for (const v of [23, 22]) {
      const r = reread(
        camp(),
        (g) => {
          delete g.slots;
        },
        v,
      );
      expect(r, `v${v}`).not.toBeNull();
      expect(r?.game.craft).toBeUndefined();
    }
  });

  it('an older save version holding craft is refused', () => {
    expect(reread(withCraft(), () => {}, 22)).toBeNull();
  });

  it('a crafted gun round-trips with its uid, counted by `made`', () => {
    const g = camp({ craft: { blueprints: { [base]: 1 }, made: 0 } });
    const r = craftGun(g, base, 120);
    if (!r.ok) throw new Error(r.code);
    expect(r.weapon.uid).toBe('f1');
    expect(reread(r.game)?.game).toEqual(r.game);
  });

  it('a crafted gun whose number is past the guns made is refused', () => {
    const f = (n: number): OwnedWeapon => ({
      uid: `f${n}`,
      base: 'smg',
      rarity: 'common',
      affixes: [],
      level: 1,
    });
    const g = camp({ craft: { blueprints: { [base]: 1 }, made: 2 }, armoury: [f(1), f(2)] });
    expect(reread(g)).not.toBeNull();
    expect(reread({ ...g, armoury: [f(1), f(3)] })).toBeNull();
    expect(reread({ ...g, armoury: [f(1), f(1)] })).toBeNull();
    // No craft at all: no crafted gun.
    expect(reread(camp({ armoury: [f(1)] }))).toBeNull();
  });

  it('accepts the biggest honest values: the cap of every type, the most guns made', () => {
    const all = Object.fromEntries(BLUEPRINT_GUNS.map((b) => [b, BLUEPRINT.cap]));
    const g = camp({ craft: { blueprints: all, made: CRAFT_MADE_MAX } });
    expect(reread(g)?.game.craft).toEqual({ blueprints: all, made: CRAFT_MADE_MAX });
  });

  const bad: [string, (g: Loose) => void][] = [
    ['an array', (g) => (g.craft = [])],
    ['null', (g) => (g.craft = null)],
    ['text', (g) => (g.craft = 'x')],
    ['a number', (g) => (g.craft = 1)],
    ['an empty object', (g) => (g.craft = {})],
    ['no made', (g) => delete g.craft.made],
    ['no blueprints', (g) => delete g.craft.blueprints],
    ['an extra key', (g) => (g.craft.extra = 1)],
    ['made text', (g) => (g.craft.made = '2')],
    ['made a fraction', (g) => (g.craft.made = 1.5)],
    ['made negative', (g) => (g.craft.made = -1)],
    ['made huge', (g) => (g.craft.made = 1e308)],
    ['made past the most', (g) => (g.craft.made = CRAFT_MADE_MAX + 1)],
    ['made null (NaN)', (g) => (g.craft.made = null)],
    ['blueprints an array', (g) => (g.craft.blueprints = [])],
    ['blueprints text', (g) => (g.craft.blueprints = 'smg')],
    ['blueprints null', (g) => (g.craft.blueprints = null)],
    ['an unknown gun type', (g) => (g.craft.blueprints.railgun = 1)],
    ['the free pistol', (g) => (g.craft.blueprints.pistol = 1)],
    ['a knife (no gun)', (g) => (g.craft.blueprints.knife = 1)],
    ['a look-alike key', (g) => (g.craft.blueprints[`${base} `] = 1)],
    ['a count of 0', (g) => (g.craft.blueprints[base] = 0)],
    ['a negative count', (g) => (g.craft.blueprints[base] = -1)],
    ['a count past the cap', (g) => (g.craft.blueprints[base] = BLUEPRINT.cap + 1)],
    ['a huge count', (g) => (g.craft.blueprints[base] = 1e308)],
    ['a fractional count', (g) => (g.craft.blueprints[base] = 1.5)],
    ['a text count', (g) => (g.craft.blueprints[base] = '3')],
    ['a null count (NaN)', (g) => (g.craft.blueprints[base] = null)],
    ['an object count', (g) => (g.craft.blueprints[base] = { n: 1 })],
    ['a boolean count', (g) => (g.craft.blueprints[base] = true)],
    [
      'nothing at all (no blueprints, none made)',
      (g) => {
        g.craft.blueprints = {};
        g.craft.made = 0;
      },
    ],
  ];
  it.each(bad)('refuses %s', (_name, change) => {
    expect(reread(withCraft(), change)).toBeNull();
  });

  it('refuses a __proto__ key and never pollutes the prototype', () => {
    const raw = JSON.parse(encodeSave(withCraft(), NOW));
    const text = JSON.stringify(raw).replace(
      '"blueprints":{',
      '"blueprints":{"__proto__":{"polluted":1},',
    );
    expect(decodeSave(text)).toBeNull();
    const other2 = JSON.stringify(raw).replace('"craft":{', '"craft":{"__proto__":{"polluted":1},');
    expect(decodeSave(other2)).toBeNull();
    expect(({} as Loose).polluted).toBeUndefined();
  });

  it('refuses constructor and prototype keys too', () => {
    for (const key of ['constructor', 'prototype', 'toString', 'hasOwnProperty']) {
      expect(
        reread(withCraft(), (g) => (g.craft.blueprints[key] = 1)),
        key,
      ).toBeNull();
    }
  });

  it('copies nothing it does not name: a read game holds plain numbers only', () => {
    const r = reread(withCraft())!;
    expect(Object.getPrototypeOf(r.game.craft!.blueprints)).toBe(Object.prototype);
    expect(Object.keys(r.game.craft!).sort()).toEqual(['blueprints', 'made']);
  });
});

describe('save: hostile crafted-gun uids and blueprint keys (ID-209)', () => {
  const crafted = (uid: string): OwnedWeapon => ({
    uid,
    base: 'smg',
    rarity: 'common',
    affixes: [],
    level: 1,
  });
  const holding = (uid: string): GameState =>
    camp({
      craft: { blueprints: { [base]: 1 }, made: CRAFT_MADE_MAX },
      armoury: [crafted(uid)],
    });

  it('accepts honest crafted uids: f1 and the highest', () => {
    expect(reread(holding('f1'))).not.toBeNull();
    expect(reread(holding(`f${CRAFT_MADE_MAX}`))).not.toBeNull();
  });

  it.each([
    ['f0', 'f0'],
    ['a leading zero', 'f01'],
    ['one past the most', `f${CRAFT_MADE_MAX + 1}`],
    ['a bonus suffix', 'f1-1'],
    ['no number', 'f'],
    ['a capital F', 'F1'],
    ['a trailing space', 'f1 '],
    ['a trailing newline', 'f1\n'],
    ['a fullwidth digit', 'f\uff11'],
    ['an Arabic-Indic digit', 'f\u0661'],
    ['a Cyrillic look-alike prefix', '\u0493' + '1'],
    ['a zero-width space', 'f\u200b1'],
    ['a bidi override', '\u202e1f'],
    ['a negative number', 'f-1'],
    ['an exponent', 'f1e3'],
    ['a plus sign', 'f+1'],
  ])('refuses a malformed crafted uid: %s', (_name, uid) => {
    expect(reread(holding(uid))).toBeNull();
  });

  it('refuses a crafted uid held twice, and one with no craft key at all', () => {
    const twice = camp({
      craft: { blueprints: { [base]: 1 }, made: 5 },
      armoury: [crafted('f2'), crafted('f2')],
    });
    expect(reread(twice)).toBeNull();
    expect(reread(camp({ armoury: [crafted('f1')] }))).toBeNull();
  });

  it.each([
    ['a Cyrillic look-alike s (U+0455) in smg', '\u0455mg'],
    ['smg with a zero-width space (U+200B)', 'smg\u200b'],
    ['a zero-width space inside', 's\u200bmg'],
    ['a bidi override (U+202E) before gms', '\u202egms'],
    ['a fullwidth look-alike', '\uff53\uff4d\uff47'],
    ['a trailing space', 'smg '],
    ['a different case', 'SMG'],
    ['a combining mark', 'smg\u0301'],
    ['a null character', 'smg\u0000'],
  ])('refuses a blueprint key that is %s', (_name, key) => {
    expect(reread(withCraft(), (g) => (g.craft.blueprints[key] = 1))).toBeNull();
    expect(
      reread(withCraft(), (g) => {
        g.craft.blueprints = { [key]: 1 };
      }),
    ).toBeNull();
  });
});
