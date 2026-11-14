// ID-154: "Best squad" makes the squad the six fit survivors with the most Squad Power
// (`survivorPower`), keeping the slots of those who stay; "Auto" runs it on its own after a
// horde, an accepted joiner, a let-go (and, in the app, Best gun), never after a manual move.
import { describe, expect, it } from 'vitest';
import { recruit } from './camp.ts';
import { SQUAD_CAP } from './data.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import {
  answerJoin,
  autoSquad,
  bestSquad,
  finishSquadHorde,
  letGo,
  setAutoSquad,
  startSquadHorde,
  survivorPower,
  toggleSquad,
} from './hordeonly.ts';

const NOW = 1_700_000_000_000;

const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  ...extra,
});

function campGame(squad: RosterDefender[], bench: RosterDefender[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 4,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => person(from + i));
const ids = (list: readonly RosterDefender[]): string[] => list.map((d) => d.id);

describe('bestSquad (ID-154)', () => {
  it('fills open slots from the fit bench, strongest first, on the end', () => {
    const g = campGame(people(3), [person(4), person(5, { xp: 5000 }), person(6, { xp: 900 })]);
    const r = bestSquad(g);
    expect(ids(r.game.roster)).toEqual([
      'recruit-1',
      'recruit-2',
      'recruit-3',
      'recruit-5',
      'recruit-6',
      'recruit-4',
    ]);
    expect(r.game.reserve).toEqual([]);
    expect(r.moves.out).toEqual([]);
    expect(r.moves.in).toEqual([recruit(5).name, recruit(6).name, recruit(4).name]);
  });

  it('swaps the weakest out for a stronger bench survivor, in the same slot', () => {
    const squad = people(6).map((d, i) => ({ ...d, xp: i === 2 ? 0 : 5000 }));
    const g = campGame(squad, [person(7, { xp: 2000 }), person(8)]);
    const r = bestSquad(g);
    expect(ids(r.game.roster)).toEqual([
      'recruit-1',
      'recruit-2',
      'recruit-7',
      'recruit-4',
      'recruit-5',
      'recruit-6',
    ]);
    expect(ids(r.game.reserve)).toEqual(['recruit-8', 'recruit-3']);
    expect(r.moves).toEqual({ in: [recruit(7).name], out: [recruit(3).name] });
  });

  it('the squad is the top six by survivorPower', () => {
    const all = people(9).map((d, i) => ({
      ...d,
      xp: [10, 4000, 0, 900, 30000, 50, 2500, 7000, 600][i]!,
    }));
    const r = bestSquad(campGame(all.slice(0, 6), all.slice(6)));
    const top = [...all].sort((a, b) => survivorPower(b) - survivorPower(a)).slice(0, SQUAD_CAP);
    expect(new Set(ids(r.game.roster))).toEqual(new Set(ids(top)));
    expect(r.game.roster.length + r.game.reserve.length).toBe(9);
  });

  it('never picks a resting survivor, however strong', () => {
    const g = campGame(people(5), [person(6, { xp: 30000, rest: 2 })]);
    const r = bestSquad(g);
    expect(r.game).toBe(g);
    expect(r.moves).toEqual({ in: [], out: [] });
  });

  it('a tie never swaps: the squad keeps its survivor', () => {
    // Fresh recruits of one profession score the same.
    const job = recruit(1).job;
    const same = (n: number, from = 1) => people(n, from).map((d) => ({ ...d, job }));
    expect(new Set(same(8).map(survivorPower)).size).toBe(1);
    const full = campGame(same(6), same(1, 7));
    expect(bestSquad(full).game).toBe(full);
    // Between equals on the bench, the earlier one fills the open slot.
    const open = bestSquad(campGame(same(5), same(2, 6))).game;
    expect(ids(open.roster).at(-1)).toBe('recruit-6');
    expect(ids(open.reserve)).toEqual(['recruit-7']);
  });

  it('a second run moves nobody, and nobody fit leaves the camp as it is', () => {
    const g = campGame(people(4), [person(5, { xp: 5000 }), person(6), person(7, { xp: 800 })]);
    const once = bestSquad(g).game;
    expect(bestSquad(once).game).toBe(once);
    const tired = campGame([person(1, { rest: 1 })], [person(2, { rest: 2 })]);
    expect(bestSquad(tired).game).toBe(tired);
  });
});

describe('Auto best squad (ID-154)', () => {
  it('ticking runs the pick once and saves the flag; unticking drops it', () => {
    const g = campGame(people(5), [person(6)]);
    const on = setAutoSquad(g, true);
    expect(on.game.autoSquad).toBe(true);
    expect(on.game.roster).toHaveLength(6);
    const off = setAutoSquad(on.game, false);
    expect('autoSquad' in off.game).toBe(false);
    expect(off.game.roster).toEqual(on.game.roster);
  });

  it('off, autoSquad changes nothing', () => {
    const g = campGame(people(5), [person(6)]);
    expect(autoSquad(g)).toBe(g);
  });

  it('a manual move stands with Auto on', () => {
    const g = setAutoSquad(campGame(people(6), [person(7)]), true).game;
    const r = toggleSquad(g, 'recruit-1');
    expect(r.ok && ids(r.game.roster)).not.toContain('recruit-1');
  });

  it.each([
    ['a first clear', 'won', 4],
    ['a replay win', 'won', 2],
    ['a loss', 'lost', 4],
  ] as const)('runs after %s: a stronger bench survivor comes in', (_, outcome, n) => {
    const plain = campGame(people(6), [person(7, { xp: 30000 })]);
    const g = { ...plain, autoSquad: true as const };
    const h = { ...startSquadHorde(g, 3, NOW, n), outcome };
    expect(ids(finishSquadHorde(g, h).roster)).toContain('recruit-7');
    expect(ids(finishSquadHorde(plain, { ...h }).roster)).not.toContain('recruit-7');
  });

  it('a resting survivor in the squad goes to the bench and the best fit one comes in', () => {
    const g = {
      ...campGame([person(1, { rest: 1 }), ...people(5, 2)], [person(7), person(8, { xp: 9000 })]),
      autoSquad: true as const,
    };
    const r = bestSquad(g).game;
    expect(ids(r.roster)).toEqual(['recruit-8', ...ids(people(5, 2))]);
    expect(ids(r.reserve)).toEqual(['recruit-7', 'recruit-1']);
  });

  it('a weak joiner waits on the bench; a refused one moves nobody', () => {
    const strong = people(6).map((d) => ({ ...d, xp: 9000 }));
    const g = {
      ...campGame(strong.slice(0, 5), [strong[5]!]),
      joining: [person(7)],
      camp: { ...newGame('horde').camp, recruits: 7 },
      autoSquad: true as const,
    };
    // Accept puts them in the open slot, then Auto prefers the benched veteran.
    const r = answerJoin(g, 'recruit-7', true);
    expect(r.ok && r.where).toBe('bench');
    expect(r.ok && ids(r.game.roster)).toContain('recruit-6');
    const no = answerJoin(g, 'recruit-7', false);
    expect(no.ok && no.game.roster).toEqual(g.roster);
    expect(no.ok && no.game.reserve).toEqual(g.reserve);
  });

  it('runs after an accepted joiner and after a let-go', () => {
    const weak = people(6);
    const strong = person(7, { xp: 30000 });
    const g = {
      ...campGame(weak, [person(8)]),
      joining: [strong],
      camp: { ...newGame('horde').camp, recruits: 8 },
      autoSquad: true as const,
    };
    const r = answerJoin(g, 'recruit-7', true);
    expect(r.ok && r.where).toBe('squad');
    expect(r.ok && ids(r.game.roster)).toContain('recruit-7');
    // A let-go fills the open slot with the best of the bench.
    const camp = {
      ...campGame(people(6), [person(7), person(8, { xp: 9000 })]),
      autoSquad: true as const,
    };
    const gone = letGo(camp, 'recruit-1');
    expect(gone.ok && ids(gone.game.roster)).toContain('recruit-8');
  });
});
