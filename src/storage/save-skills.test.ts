// ID-100: the horde-only skill pick in the save. It goes through the allow-list and is
// checked on load: an array of at most 2 known skills, each once; prototype keys,
// oversized, look-alike and mistyped values are refused. A v15 save loads with a new
// game's pick.
import { describe, expect, it } from 'vitest';
import { SKILL_IDS, START_SKILLS } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW, prePick } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const picked = (...pick: GameState['skillPick']): GameState => ({
  ...newGame('horde'),
  skillPick: pick,
});

function reread(game: GameState, change: (g: Loose) => void = () => {}) {
  const save = JSON.parse(encodeSave(game, NOW));
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: the skill pick (ID-100)', () => {
  it('is version 17, and round-trips every pick', () => {
    expect(SAVE_VERSION).toBe(17);
    const picks = [[], ...SKILL_IDS.map((k) => [k])] as GameState['skillPick'][];
    for (const p of picks) {
      const g = picked(...p);
      expect(decodeSave(encodeSave(g, NOW))?.game).toEqual(g);
    }
  });

  it('the pick saved is the pick the next fight starts with', () => {
    const back = decodeSave(encodeSave(picked('airstrike'), NOW))!.game;
    const s = startSquadHorde(back, 1, NOW);
    expect(s.skills).toEqual(['airstrike']);
    expect(s.freeSkills).toEqual({ power: 2 });
  });

  it('a v15 save loads with a new game’s pick, and saves again as the current version', () => {
    const g = picked('airstrike');
    const v15 = { v: 15, savedAt: NOW, game: prePick(g) };
    const save = decodeSave(JSON.stringify(v15));
    expect(save?.game.skillPick).toEqual([...START_SKILLS]);
    expect(JSON.parse(encodeSave(save!.game, NOW)).v).toBe(SAVE_VERSION);
  });

  it('refuses a v15 save with a pick, and a v16 save without one', () => {
    const g = picked('airstrike');
    const v15 = { v: 15, savedAt: NOW, game: { ...prePick(g), skillPick: ['airstrike'] } };
    expect(decodeSave(JSON.stringify(v15))).toBeNull();
    expect(reread(g, (x) => delete x.skillPick)).toBeNull();
  });

  it('refuses hostile picks', () => {
    const g = picked('airstrike');
    const bad: unknown[] = [
      // Not an array of strings.
      null,
      true,
      0,
      'airstrike',
      {},
      { 0: 'airstrike', length: 1 },
      [1],
      [null],
      [['airstrike']],
      [{ airstrike: true }],
      // Too many, or twice.
      ['airstrike', 'airstrike', 'airstrike'],
      ['airstrike', 'airstrike'],
      new Array(10_000).fill('airstrike'),
      new Array(10_000).fill('flashbang'),
      // Unknown, prototype names, and look-alikes.
      ['nuke'],
      ['__proto__'],
      ['constructor'],
      ['toString'],
      ['Airstrike'],
      [' airstrike'],
      ['airstrike​'],
      ['‮airstrike'],
      ['airstrіke'], // Cyrillic i
      ['x'.repeat(100_000)],
      // The retired skills with something else: still refused.
      ['flashbang', 'nuke'],
      ['molotov', '__proto__'],
      ['flashbang', 1],
      ['molotov', null],
      ['flashbang', ['molotov']],
      ['flashbang​'],
      ['Molotov'],
      ['molotov', 'airstrike', 'airstrike'],
      // Too many once the retired ones are counted: the cap is on what is read, not kept.
      ['flashbang', 'molotov', 'airstrike'],
      ['flashbang', 'molotov', 'flashbang', 'molotov'],
      ['molotov', 'molotov', 'molotov'],
      new Array(10_000).fill('molotov'),
      // Look-alikes of a retired id are unknown ids, not retired ones.
      ['molotov\u200b'],
      ['\u202emolotov'],
      [' molotov'],
      ['Molotov'],
      ['m\u043elotov'], // Cyrillic o
      // Non-strings, and prototype names, beside a retired id.
      ['molotov', 1],
      ['molotov', null],
      ['molotov', {}],
      ['molotov', ['airstrike']],
      ['__proto__'],
      ['molotov', '__proto__'],
    ];
    for (const v of bad) {
      expect(
        reread(g, (x) => (x.skillPick = v)),
        JSON.stringify(v).slice(0, 40),
      ).toBeNull();
    }
  });

  it('refuses a pick smuggled in through the prototype, and leaves Object.prototype alone', () => {
    const raw = encodeSave(picked(), NOW).replace(
      '"skillPick":[]',
      '"skillPick":[],"__proto__":{"skillPick":["airstrike"]}',
    );
    expect(raw).toContain('__proto__');
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Record<string, unknown>).skillPick).toBeUndefined();
  });
});

describe('save: the retired Flashbang and Molotov skills (ID-139)', () => {
  const researched = (pick: unknown[], research: string[] = []) =>
    reread({ ...picked(), lab: 2 }, (x) => {
      x.skillPick = pick;
      x.research = research;
    });

  it('drops them from a pick, keeping what is left', () => {
    expect(researched(['flashbang', 'airstrike'], ['airstrike'])?.game.skillPick).toEqual([
      'airstrike',
    ]);
    expect(researched(['airstrike', 'molotov'], ['airstrike'])?.game.skillPick).toEqual([
      'airstrike',
    ]);
    expect(researched(['airstrike'], ['airstrike'])?.game.skillPick).toEqual(['airstrike']);
  });

  it('a pick they leave empty falls back to the Airstrike if it is researched, else stays empty', () => {
    for (const pick of [['flashbang'], ['molotov'], ['molotov', 'flashbang']]) {
      expect(researched(pick, ['airstrike'])?.game.skillPick, pick.join()).toEqual(['airstrike']);
      expect(researched(pick, [])?.game.skillPick, pick.join()).toEqual([]);
    }
  });

  it('a retired id beside the Airstrike leaves it once, with no duplicate', () => {
    for (const pick of [
      ['molotov', 'airstrike'],
      ['airstrike', 'molotov'],
      ['flashbang', 'airstrike'],
    ]) {
      expect(researched(pick, ['airstrike'])?.game.skillPick, pick.join()).toEqual(['airstrike']);
      // Not researched: the Airstrike the pick holds stays, as before.
      expect(researched(pick, [])?.game.skillPick, pick.join()).toEqual(['airstrike']);
    }
  });

  it('a pick that was empty stays empty, even with the Airstrike researched', () => {
    expect(researched([], ['airstrike'])?.game.skillPick).toEqual([]);
  });

  it('a retired id twice is dropped, not a duplicate pick', () => {
    expect(researched(['flashbang', 'flashbang'], ['airstrike'])?.game.skillPick).toEqual([
      'airstrike',
    ]);
    // What was refused as "a skill twice" before (the old case) now loads.
    expect(researched(['molotov', 'molotov'])?.game.skillPick).toEqual([]);
    expect(researched(['molotov', 'molotov'], ['airstrike'])?.game.skillPick).toEqual([
      'airstrike',
    ]);
    // A real duplicate is still refused.
    expect(researched(['airstrike', 'airstrike'], ['airstrike'])).toBeNull();
  });

  it('a retired id never survives a load, and the save is current afterwards', () => {
    const back = researched(['flashbang', 'molotov'], ['airstrike']);
    expect(back).not.toBeNull();
    expect(JSON.parse(encodeSave(back!.game, NOW)).game.skillPick).toEqual(['airstrike']);
    expect(SAVE_VERSION).toBe(17); // ID-139 bumped nothing; 17 is ID-146's
  });
});
