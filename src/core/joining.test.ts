// Joining the camp (ID-150): a first clear's new survivors ask to join and wait for Accept or
// Refuse; a refused one is gone for good. Past 6 a survivor can be let go, their gun back to
// the stash; never at 6 or fewer, so the squad can always be filled.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import { SQUAD_CAP, STASH_CAP } from './data.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  acceptJoins,
  answerJoin,
  campOf,
  finishSquadHorde,
  joiners,
  joiningOf,
  letGo,
  letGoLock,
  refuseJoins,
  squadResult,
  startSquadHorde,
} from './hordeonly.ts';
import { createRng } from './rng.ts';

const NOW = 1_700_000_000_000;

const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => recruit(from + i));

/** A horde-only camp at Horde 3: `squad` in the squad, `bench` on the bench. */
function campGame(squad: RosterDefender[], bench: RosterDefender[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 3,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

/** Horde `game.hordeNumber` won with seed `seed`. */
const won = (game: GameState, seed: number): HordeState => ({
  ...startSquadHorde(game, seed, NOW),
  outcome: 'won',
});

const gun = (uid: string, power = 1) =>
  rollWeapon(createRng(power), uid, 'rifle', power > 1 ? 'relic' : 'rusty', 2);

describe('asking to join (ID-150)', () => {
  it('a first clear under 6 has one ask to join, counted, not yet in the camp', () => {
    const g = campGame(people(3));
    const next = finishSquadHorde(g, won(g, 5));
    expect(campOf(next)).toHaveLength(3);
    expect(joiningOf(next)).toEqual([recruit(4, 5)]);
    expect(next.camp.recruits).toBe(4);
    expect(squadResult(g, won(g, 5)).joined).toEqual([recruit(4, 5)]);
  });

  it('accept: onto the squad while it has room, else the bench; the ask is gone', () => {
    const g = finishSquadHorde(campGame(people(3)), won(campGame(people(3)), 5));
    const r = answerJoin(g, 'recruit-4', true);
    expect(r).toMatchObject({ ok: true, where: 'squad' });
    if (!r.ok) return;
    expect(r.game.roster.map((d) => d.id)).toEqual([
      'recruit-1',
      'recruit-2',
      'recruit-3',
      'recruit-4',
    ]);
    expect(r.game.joining).toBeUndefined();
    // A full squad: the bench.
    const full = { ...campGame(people(SQUAD_CAP)), joining: [recruit(7)] };
    full.camp.recruits = 7;
    const b = answerJoin(full, 'recruit-7', true);
    expect(b).toMatchObject({ ok: true, where: 'bench' });
    if (b.ok) expect(b.game.reserve.map((d) => d.id)).toEqual(['recruit-7']);
  });

  it('refuse: gone for good; their number is spent, so the next ask is someone new', () => {
    const start = campGame(people(3));
    const asked = finishSquadHorde(start, won(start, 5));
    const r = answerJoin(asked, 'recruit-4', false);
    expect(r).toMatchObject({ ok: true, where: null });
    if (!r.ok) return;
    expect(campOf(r.game)).toHaveLength(3);
    expect(r.game.joining).toBeUndefined();
    expect(r.game.camp.recruits).toBe(4);
    // The next first clear asks with recruit 5, never 4 again.
    const again = finishSquadHorde(r.game, won(r.game, 6));
    expect(joiningOf(again).map((d) => d.id)).toEqual(['recruit-5']);
  });

  it('two at once (past 6, seed 9): each answered on their own', () => {
    const g = campGame(people(SQUAD_CAP), people(2, 7));
    expect(joiners(g, 9)).toHaveLength(2);
    const asked = finishSquadHorde(g, won(g, 9));
    expect(joiningOf(asked).map((d) => d.id)).toEqual(['recruit-9', 'recruit-10']);
    const one = answerJoin(asked, 'recruit-10', true);
    if (!one.ok) throw new Error(one.reason);
    expect(joiningOf(one.game).map((d) => d.id)).toEqual(['recruit-9']);
    const two = answerJoin(one.game, 'recruit-9', false);
    if (!two.ok) throw new Error(two.reason);
    expect(campOf(two.game).map((d) => d.id)).toContain('recruit-10');
    expect(campOf(two.game).map((d) => d.id)).not.toContain('recruit-9');
  });

  it('leaving without answering refuses everyone; nobody waiting changes nothing', () => {
    const start = campGame(people(3));
    const asked = finishSquadHorde(start, won(start, 5));
    const left = refuseJoins(asked);
    expect(left.joining).toBeUndefined();
    expect(campOf(left)).toHaveLength(3);
    expect(refuseJoins(left)).toBe(left);
  });

  it('an ask left unanswered is turned away by the next first clear, never piled up', () => {
    const start = campGame(people(3));
    const asked = finishSquadHorde(start, won(start, 5));
    const next = finishSquadHorde(asked, won(asked, 6));
    expect(joiningOf(next).map((d) => d.id)).toEqual(['recruit-5']);
    expect(campOf(next)).toHaveLength(3);
  });

  it('refuses an unknown or hostile id, and changes nothing', () => {
    const start = campGame(people(3));
    const asked = finishSquadHorde(start, won(start, 5));
    for (const id of ['recruit-1', 'recruit-99', '__proto__', 'constructor', '']) {
      expect(answerJoin(asked, id, true).ok).toBe(false);
    }
    expect(acceptJoins(campGame(people(2)))).toEqual(campGame(people(2)));
  });

  it('a new game’s first survivor needs no answer: nobody is asking', () => {
    expect(joiningOf(newGame('horde'))).toEqual([]);
    expect(newGame('horde').roster).toHaveLength(1);
  });
});

describe('letting a survivor go (ID-150)', () => {
  it('is refused at 6 or fewer, with the reason', () => {
    for (const n of [1, 3, SQUAD_CAP]) {
      const g = campGame(people(Math.min(n, SQUAD_CAP)), people(Math.max(0, n - SQUAD_CAP), 7));
      expect(letGoLock(g)).toBe(`Needs ${SQUAD_CAP + 1}+ survivors to let one go (camp ${n})`);
      expect(letGo(g, 'recruit-1')).toEqual({ ok: false, reason: letGoLock(g) });
    }
  });

  it('past 6, a bench survivor goes for good, their gun into the stash', () => {
    const benched = { ...recruit(7), loadout: { primary: gun('h1'), secondary: null, item: null } };
    const g = campGame(people(SQUAD_CAP), [benched]);
    expect(letGoLock(g)).toBeNull();
    const r = letGo(g, 'recruit-7');
    if (!r.ok) throw new Error(r.reason);
    expect(campOf(r.game).map((d) => d.id)).not.toContain('recruit-7');
    expect(r.game.armoury.map((w) => w.uid)).toEqual(['h1']);
    expect(r.thrown).toEqual([]);
    // The camp is back at 6: nobody else can go.
    expect(letGo(r.game, 'recruit-1').ok).toBe(false);
  });

  it('a squad survivor leaves an open slot; a pistol just goes', () => {
    const g = campGame(people(SQUAD_CAP), people(1, 7));
    const r = letGo(g, 'recruit-2');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster.map((d) => d.id)).toEqual([
      'recruit-1',
      'recruit-3',
      'recruit-4',
      'recruit-5',
      'recruit-6',
    ]);
    expect(r.game.reserve.map((d) => d.id)).toEqual(['recruit-7']);
    expect(r.game.armoury).toEqual([]);
  });

  it('a full stash throws its weakest away for their gun', () => {
    const strong = gun('h9', 9);
    const benched = { ...recruit(7), loadout: { primary: strong, secondary: null, item: null } };
    const stash = Array.from({ length: STASH_CAP }, (_, i) => gun(`h${i + 10}`));
    const g = { ...campGame(people(SQUAD_CAP), [benched]), armoury: stash };
    const r = letGo(g, 'recruit-7');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.armoury).toHaveLength(STASH_CAP);
    expect(r.game.armoury).toContain(strong);
    expect(r.thrown).toHaveLength(1);
    expect(r.thrown[0]).not.toBe(strong);
  });

  it('refuses an unknown or hostile id', () => {
    const g = campGame(people(SQUAD_CAP), people(1, 7));
    for (const id of ['recruit-99', '__proto__', 'constructor', '']) {
      expect(letGo(g, id)).toEqual({ ok: false, reason: 'No such survivor' });
    }
  });
});
