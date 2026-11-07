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
  it('is version 16, and round-trips every pick of up to 2, in order', () => {
    expect(SAVE_VERSION).toBe(16);
    const picks = [
      [],
      ...SKILL_IDS.map((k) => [k]),
      ['molotov', 'flashbang'],
      ['flashbang', 'airstrike'],
    ] as GameState['skillPick'][];
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

  it('a v15 save loads with a new game’s pick, and saves again as v16', () => {
    const g = picked('airstrike');
    const v15 = { v: 15, savedAt: NOW, game: prePick(g) };
    const save = decodeSave(JSON.stringify(v15));
    expect(save?.game.skillPick).toEqual([...START_SKILLS]);
    expect(JSON.parse(encodeSave(save!.game, NOW)).v).toBe(16);
  });

  it('refuses a v15 save with a pick, and a v16 save without one', () => {
    const g = picked('molotov');
    const v15 = { v: 15, savedAt: NOW, game: { ...prePick(g), skillPick: ['molotov'] } };
    expect(decodeSave(JSON.stringify(v15))).toBeNull();
    expect(reread(g, (x) => delete x.skillPick)).toBeNull();
  });

  it('refuses hostile picks', () => {
    const g = picked('molotov');
    const bad: unknown[] = [
      // Not an array of strings.
      null,
      true,
      0,
      'molotov',
      {},
      { 0: 'molotov', length: 1 },
      [1],
      [null],
      [['molotov']],
      [{ molotov: true }],
      // Too many, or twice.
      ['molotov', 'flashbang', 'airstrike'],
      ['molotov', 'molotov'],
      new Array(10_000).fill('molotov'),
      // Unknown, prototype names, and look-alikes.
      ['nuke'],
      ['__proto__'],
      ['constructor'],
      ['toString'],
      ['Molotov'],
      [' molotov'],
      ['molotov\u200b'],
      ['\u202emolotov'],
      ['m\u043elotov'], // Cyrillic o
      ['x'.repeat(100_000)],
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
      '"skillPick":[],"__proto__":{"skillPick":["molotov"]}',
    );
    expect(raw).toContain('__proto__');
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Record<string, unknown>).skillPick).toBeUndefined();
  });
});
