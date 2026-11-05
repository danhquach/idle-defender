// Design §12, as built ID-066: the save at v12 holds the reserve. A v11 save loads with its
// horde number, each survivor's level and weapon, and every hidden field as it was;
// survivors past the squad's cap go to the reserve. Hostile values are refused.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { SQUAD_CAP } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { capSquad, finishSquadHorde, startSquadHorde } from '../core/hordeonly.ts';
import { sendPatrol } from '../core/patrol.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW, preReserve } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const H = 60 * 60 * 1000;

/** A defender `id` named `name` with `xp`, a pistol unless `primary` says otherwise. */
const person = (id: string, name: string, xp: number): RosterDefender => ({
  id,
  name,
  loadout: { primary: 'pistol', secondary: null, item: null },
  xp,
  stats: { aim: 0, might: 0, tech: 0, grit: 0 },
  injuredUntil: null,
});

/**
 * A full game at Horde 3 with 8 people in a camp of 9 slots: the three starters (Bob with
 * no XP, out on patrol), five more with XP, and one carrying a rifle the horde dropped.
 */
function crowded(): GameState {
  const g = newGame();
  const extra = [
    person('ann', 'Ann', 300),
    person('cal', 'Cal', 250),
    person('dee', 'Dee', 200),
    person('eve', 'Eve', 150),
    person('fay', 'Fay', 100),
  ];
  extra[0]!.loadout.primary = { uid: 'h2', base: 'rifle', rarity: 'common', affixes: [] };
  const game: GameState = {
    ...g,
    hordeNumber: 3,
    roster: [...g.roster.map((d, i) => ({ ...d, xp: [0, 60, 40][i]! })), ...extra],
    camp: { ...g.camp, upgrades: 2 },
  };
  const r = sendPatrol(game, 'gas-station', ['bob'], 0, NOW - H);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

/** `json` written as a save of version `v`. */
const asSave = (v: number, json: unknown): string =>
  JSON.stringify({ v, savedAt: NOW, game: json });

/** `game` saved at NOW, changed by `change` as JSON, then read back. */
function reread(game: GameState, change: (g: Loose) => void = () => {}) {
  const save = JSON.parse(encodeSave(game, NOW));
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: the horde-only build (ID-066)', () => {
  it('is version 12', () => {
    expect(SAVE_VERSION).toBe(12);
  });

  it('round-trips a horde-only game, after a win adds a survivor', () => {
    const g = newGame('horde');
    const won = finishSquadHorde(g, { ...startSquadHorde(g, 1, NOW), outcome: 'won' });
    expect(won.roster).toHaveLength(2);
    expect(reread(won)?.game).toEqual(won);
  });

  it('loads a full squad of 6 though a new camp has 5 slots', () => {
    const g = newGame('horde');
    const six = {
      ...g,
      roster: Array.from({ length: SQUAD_CAP }, (_, i) => recruit(i + 1)),
      camp: { ...g.camp, recruits: SQUAD_CAP },
    };
    expect(reread(six)?.game).toEqual(six);
  });

  it('round-trips the reserve', () => {
    const g = capSquad(crowded());
    expect(g.reserve.length).toBeGreaterThan(0);
    expect(reread(g)?.game).toEqual(g);
  });

  it('a v11 save keeps its horde, each survivor’s level and weapon, and every hidden field', () => {
    const was = crowded();
    const back = decodeSave(asSave(11, preReserve(was)))!.game;
    expect(back.hordeNumber).toBe(3);
    // The 6 with the most XP fight, in roster order; Bob (no XP, on patrol) and John wait.
    expect(back.roster.map((d) => d.id)).toEqual(['jack', 'ann', 'cal', 'dee', 'eve', 'fay']);
    expect(back.reserve.map((d) => d.id)).toEqual(['bob', 'john']);
    for (const d of [...back.roster, ...back.reserve]) {
      expect(d).toEqual(was.roster.find((r) => r.id === d.id));
    }
    const hidden = (x: GameState) => ({ ...x, roster: [], reserve: [] });
    expect(hidden(back)).toEqual(hidden(was));
    expect(back.patrols[0]!.members).toEqual(['bob']);
    // Saved again, it is a v12 save that reads back the same.
    expect(reread(back)?.game).toEqual(back);
  });

  it('a v11 save within the cap loads as it was, with an empty reserve', () => {
    const g = { ...newGame(), hordeNumber: 4 };
    expect(decodeSave(asSave(11, preReserve(g)))?.game).toEqual(g);
  });

  it('a v12 save with more than 6 on the roster is capped as it loads', () => {
    const back = reread(capSquad(crowded()), (g) => {
      g.roster.push(...g.reserve);
      g.reserve = [];
    })!.game;
    expect(back.roster).toHaveLength(SQUAD_CAP);
    expect(back.reserve).toHaveLength(2);
  });

  it('refuses hostile reserves and squads', () => {
    const g = capSquad(crowded());
    const cases: [string, (x: Loose) => void][] = [
      ['no reserve', (x) => delete x.reserve],
      ['reserve not a list', (x) => (x.reserve = { 0: x.reserve[0] })],
      ['reserve of text', (x) => (x.reserve = 'bob')],
      ['reserve too long', (x) => (x.reserve = Array.from({ length: 101 }, () => x.reserve[0]))],
      // New ids, so the room check is what refuses it: 10 people in 9 slots.
      [
        'more people than the camp holds',
        (x) => x.reserve.push({ ...x.reserve[0], id: 'zed' }, { ...x.reserve[0], id: 'zoe' }),
      ],
      ['an id on the roster and the reserve', (x) => (x.reserve[0].id = x.roster[0].id)],
      ['an id twice in the reserve', (x) => x.reserve.push(x.reserve[0])],
      ['an unknown key', (x) => (x.reserve[0].extra = 1)],
      ['an unknown weapon', (x) => (x.reserve[0].loadout.primary = 'bazooka')],
      ['a bad id', (x) => (x.reserve[0].id = 'Bob<b>')],
      ['a bidi override in a name', (x) => (x.reserve[0].name = 'Bob‮evil')],
      ['a zero-width name', (x) => (x.reserve[0].name = 'Bo​b')],
      ['a look-alike name', (x) => (x.reserve[0].name = 'Вob')],
      ['an oversized name', (x) => (x.reserve[0].name = 'B'.repeat(10_000))],
      ['XP past the cap', (x) => (x.reserve[0].xp = 1e300)],
      ['no squad', (x) => (x.roster = [])],
      ['a squad of 100', (x) => (x.roster = Array.from({ length: 101 }, () => x.roster[0]))],
    ];
    for (const [name, change] of cases) expect(reread(g, change), name).toBeNull();
  });

  it('refuses a reserve in a v11 save, and prototype keys anywhere in the reserve', () => {
    const g = capSquad(crowded());
    expect(decodeSave(asSave(11, JSON.parse(JSON.stringify(g))))).toBeNull();
    const raw = encodeSave(g, NOW).replace('"reserve":[{', '"reserve":[{"__proto__":{"x":1},');
    expect(raw).toContain('__proto__');
    expect(decodeSave(raw)).toBeNull();
    const top = encodeSave(g, NOW).replace('"reserve":', '"__proto__":{"x":1},"reserve":');
    expect(decodeSave(top)).toBeNull();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
