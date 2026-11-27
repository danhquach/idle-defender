// Design §12, as built ID-154: save version 21 (23 since ID-179). "Auto" best squad (`autoSquad`) is saved
// only while ticked. Exactly `true` turns it on; any other value, hostile or not, loads with
// it off and copies nothing; an older save has it off.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { SQUAD_CAP } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { bestSquad, setAutoSquad } from '../core/hordeonly.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function camp(n: number): GameState {
  const g = newGame('horde');
  const all = Array.from({ length: n }, (_, i) => recruit(i + 1));
  return {
    ...g,
    hordeNumber: 4,
    roster: all.slice(0, SQUAD_CAP),
    reserve: all.slice(SQUAD_CAP),
    camp: { ...g.camp, recruits: n },
  };
}

function reread(game: GameState, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: Auto best squad (ID-154)', () => {
  it('is version 26', () => {
    expect(SAVE_VERSION).toBe(27);
  });

  it('round-trips on; off writes no field', () => {
    const on = setAutoSquad(camp(8), true).game;
    expect(reread(on)?.game.autoSquad).toBe(true);
    expect(reread(on)?.game).toEqual(on);
    const off = camp(8);
    expect('autoSquad' in JSON.parse(encodeSave(off, NOW)).game).toBe(false);
    expect('autoSquad' in reread(off)!.game).toBe(false);
  });

  it.each([
    ['false', false],
    ['the text "true"', 'true'],
    ['1', 1],
    ['null', null],
    ['a __proto__ object', JSON.parse('{"__proto__":{"polluted":true},"on":true}')],
    ['an array', [true]],
    ['a long text', 'x'.repeat(1000)],
    ['look-alike text', 'tru' + String.fromCharCode(0x435)],
    ['bidi text', String.fromCharCode(0x202e) + 'true'],
  ])('%s loads with Auto off and the rest of the save intact', (_, value) => {
    const g = camp(8);
    const back = reread(g, (j) => {
      j.autoSquad = value;
    });
    expect(back).not.toBeNull();
    expect('autoSquad' in back!.game).toBe(false);
    expect(back!.game.roster).toEqual(g.roster);
    expect(({} as Loose).polluted).toBeUndefined();
  });

  it('a v20 save has it off, and refuses the key (it never wrote one)', () => {
    expect('autoSquad' in reread(camp(8), () => {}, 20)!.game).toBe(false);
    expect(reread(camp(8), (j) => (j.autoSquad = true), 20)).toBeNull();
  });

  it('loading never runs the pick: a squad picked by hand stays', () => {
    // Auto on, with a veteran left on the bench by hand.
    const g = camp(8);
    const hand: GameState = {
      ...g,
      reserve: [{ ...g.reserve[0]!, xp: 30000 }, ...g.reserve.slice(1)],
      autoSquad: true,
    };
    // The pick would change it, so a load that ran it would show.
    expect(bestSquad(hand).game).not.toBe(hand);
    expect(reread(hand)?.game.roster).toEqual(hand.roster);
  });
});
