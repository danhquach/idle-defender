// ID-170: a replay win has a rare chance that one survivor asks to join, and a survivor can
// take in another of the same profession for a share of their XP (the other leaves the camp,
// their gun back to the stash).
import { describe, expect, it } from 'vitest';
import { rollWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import { MAX_COUNT, SQUAD_CAP, SQUAD_JOIN, STASH_CAP, SURVIVOR_COMBINE } from './data.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  campOf,
  combinePartners,
  combineSurvivors,
  combineXp,
  finishSquadHorde,
  joiners,
  joiningOf,
  letGoLock,
  squadResult,
  startSquadHorde,
} from './hordeonly.ts';
import { createRng } from './rng.ts';
import { levelOf, xpForLevel } from './stats.ts';

const NOW = 1_700_000_000_000;

const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => recruit(from + i));

/** A horde-only camp at Horde 4: `squad` in the squad, `bench` on the bench. */
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

/** Horde `n` (a replay below 4) won with `seed`. */
const won = (game: GameState, seed: number, n = 2): HordeState => ({
  ...startSquadHorde(game, seed, NOW, n),
  outcome: 'won',
});

const gun = (uid: string, power = 1) =>
  rollWeapon(createRng(power), uid, 'rifle', power > 1 ? 'relic' : 'rusty', 2);

const as = (d: RosterDefender, job: RosterDefender['job'], xp = 0): RosterDefender => ({
  ...d,
  job,
  xp,
});

/** The first seeds from 1 whose replay roll brings someone (`hit`) or nobody. */
function seedWhere(game: GameState, hit: boolean): number {
  for (let s = 1; s < 10_000; s++) if (joiners(game, s, true).length > 0 === hit) return s;
  throw new Error('no such seed');
}

describe('a replay win can bring a survivor (ID-170)', () => {
  const g = campGame(people(SQUAD_CAP), people(1, 7));

  it('a lucky replay: one asks to join, counted; the horde number stays', () => {
    const seed = seedWhere(g, true);
    const next = finishSquadHorde(g, won(g, seed));
    expect(joiningOf(next)).toEqual([recruit(8, seed)]);
    expect(next.camp.recruits).toBe(8);
    expect(next.hordeNumber).toBe(4);
    expect(next.farm.replays).toBe(g.farm.replays + 1);
    expect(squadResult(g, won(g, seed)).joined).toEqual([recruit(8, seed)]);
  });

  it('an unlucky replay: nobody, and an offer left unanswered stands', () => {
    const seed = seedWhere(g, false);
    const asking = { ...g, joining: [recruit(8)], camp: { ...g.camp, recruits: 8 } };
    const next = finishSquadHorde(asking, won(asking, seed));
    expect(joiningOf(next)).toEqual([recruit(8)]);
    expect(next.camp.recruits).toBe(8);
  });

  it('a lucky replay turns away an offer left unanswered, as a first clear does', () => {
    const asking = { ...g, joining: [recruit(8)], camp: { ...g.camp, recruits: 8 } };
    const seed = seedWhere(asking, true);
    const next = finishSquadHorde(asking, won(asking, seed));
    expect(joiningOf(next).map((d) => d.id)).toEqual(['recruit-9']);
  });

  it('never a second, at any camp size; about SQUAD_JOIN.replay of replays', () => {
    let hits = 0;
    const small = campGame(people(2));
    for (let s = 1; s <= 4000; s++) {
      const n = joiners(g, s, true).length;
      expect(n).toBeLessThanOrEqual(1);
      hits += n;
      // Under 6 it is the same rare roll, not a sure joiner.
      expect(joiners(small, s, true)).toHaveLength(n);
    }
    expect(hits / 4000).toBeGreaterThan(SQUAD_JOIN.replay - 0.015);
    expect(hits / 4000).toBeLessThan(SQUAD_JOIN.replay + 0.015);
  });

  it('a loss, a replay past the replay limit, or a full camp brings nobody', () => {
    const seed = seedWhere(g, true);
    expect(squadResult(g, { ...won(g, seed), outcome: 'lost' }).joined).toEqual([]);
    const capped = { ...g, farm: { ...g.farm, replays: 999_999 } };
    expect(squadResult(capped, won(capped, seed)).joined).toEqual([]);
    expect(joiningOf(finishSquadHorde(capped, won(capped, seed)))).toEqual([]);
    const full = campGame(people(SQUAD_CAP), people(SQUAD_JOIN.max - SQUAD_CAP, 7));
    expect(joiners(full, seed, true)).toEqual([]);
  });

  it('first clears are unchanged: one under 6, the 15% / 20% roll past it', () => {
    expect(joiners(campGame(people(5)), 1)).toEqual([recruit(6, 1)]);
    const six = campGame(people(SQUAD_CAP), people(2, 7));
    expect(joiners(six, 9)).toEqual([recruit(9, 9), recruit(10, 9)]);
  });
});

describe('combining survivors of the same profession (ID-170)', () => {
  const camp = (bench: RosterDefender[]) =>
    campGame(
      people(SQUAD_CAP).map((d, i) => as(d, i === 0 ? 'soldier' : 'hunter', 500)),
      bench,
    );

  it('the XP: the share of theirs, at least one level from Lv 1, whole', () => {
    expect(combineXp(0)).toBe(xpForLevel(1 + SURVIVOR_COMBINE.minLevels));
    expect(combineXp(1001)).toBe(Math.floor(1001 * SURVIVOR_COMBINE.share));
    expect(combineXp(2000)).toBe(2000 * SURVIVOR_COMBINE.share);
    expect(Number.isInteger(combineXp(xpForLevel(30)))).toBe(true);
  });

  it('partners: only others of the same profession, squad or bench', () => {
    const g = camp([as(recruit(7), 'soldier'), as(recruit(8), 'chef')]);
    expect(combinePartners(g, 'recruit-1').map((d) => d.id)).toEqual(['recruit-7']);
    expect(combinePartners(g, 'recruit-8')).toEqual([]);
    expect(combinePartners(g, 'recruit-99')).toEqual([]);
  });

  it('a bench survivor joins a squad keeper: XP added, they leave, their gun to the stash', () => {
    const fed = {
      ...as(recruit(7), 'soldier', 2000),
      loadout: { primary: gun('h1'), secondary: null, item: null },
    };
    const g = camp([fed]);
    const r = combineSurvivors(g, 'recruit-1', 'recruit-7');
    if (!r.ok) throw new Error(r.reason);
    expect(r.xp).toBe(1000);
    const keeper = campOf(r.game).find((d) => d.id === 'recruit-1')!;
    expect(keeper.xp).toBe(1500);
    expect(levelOf(keeper.xp).level).toBeGreaterThan(levelOf(500).level);
    expect(keeper.loadout).toEqual(g.roster[0]!.loadout);
    expect(r.game.roster[0]!.id).toBe('recruit-1');
    expect(campOf(r.game).map((d) => d.id)).not.toContain('recruit-7');
    expect(r.game.armoury.map((w) => w.uid)).toEqual(['h1']);
    expect(r.thrown).toEqual([]);
  });

  it('a squad survivor taken in leaves their slot to the bench; the keeper keeps rest', () => {
    const keeper = { ...as(recruit(7), 'hunter', 0), rest: 1 };
    const g = camp([keeper]);
    const r = combineSurvivors(g, 'recruit-7', 'recruit-2');
    if (!r.ok) throw new Error(r.reason);
    const k = campOf(r.game).find((d) => d.id === 'recruit-7')!;
    expect(k.xp).toBe(combineXp(500));
    expect(k.rest).toBe(1);
    expect(campOf(r.game)).toHaveLength(SQUAD_CAP);
    expect(r.game.roster.map((d) => d.id)).not.toContain('recruit-2');
  });

  it('Auto off: the keeper keeps their slot, the slot left stays open; Auto on fills it', () => {
    const g = camp([as(recruit(7), 'hunter', 900)]);
    const off = combineSurvivors(g, 'recruit-3', 'recruit-2');
    if (!off.ok) throw new Error(off.reason);
    expect(off.game.roster.map((d) => d.id)).toEqual([
      'recruit-1',
      'recruit-3',
      'recruit-4',
      'recruit-5',
      'recruit-6',
    ]);
    expect(off.game.reserve.map((d) => d.id)).toEqual(['recruit-7']);
    const on = combineSurvivors({ ...g, autoSquad: true }, 'recruit-3', 'recruit-2');
    if (!on.ok) throw new Error(on.reason);
    expect(on.game.roster).toHaveLength(SQUAD_CAP);
    expect(on.game.roster.map((d) => d.id)).toContain('recruit-7');
    expect(on.game.roster.map((d) => d.id)).toContain('recruit-3');
  });

  it('a full stash throws its weakest away for their gun', () => {
    const strong = gun('h9', 9);
    const fed = {
      ...as(recruit(7), 'soldier'),
      loadout: { primary: strong, secondary: null, item: null },
    };
    const stash = Array.from({ length: STASH_CAP }, (_, i) => gun(`h${i + 10}`));
    const r = combineSurvivors({ ...camp([fed]), armoury: stash }, 'recruit-1', 'recruit-7');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.armoury).toHaveLength(STASH_CAP);
    expect(r.game.armoury).toContain(strong);
    expect(r.thrown).toHaveLength(1);
  });

  it('the keeper’s XP is capped at MAX_COUNT', () => {
    const g = camp([as(recruit(7), 'soldier', MAX_COUNT)]);
    g.roster[0] = as(g.roster[0]!, 'soldier', MAX_COUNT - 5);
    const r = combineSurvivors(g, 'recruit-1', 'recruit-7');
    if (!r.ok) throw new Error(r.reason);
    expect(campOf(r.game).find((d) => d.id === 'recruit-1')!.xp).toBe(MAX_COUNT);
  });

  it('refused: another profession, themselves, 6 or fewer, unknown or hostile ids', () => {
    const g = camp([as(recruit(7), 'chef')]);
    expect(combineSurvivors(g, 'recruit-1', 'recruit-7')).toEqual({
      ok: false,
      reason: 'Only survivors of the same profession combine',
    });
    expect(combineSurvivors(g, 'recruit-2', 'recruit-2')).toEqual({
      ok: false,
      reason: 'A survivor cannot combine with themselves',
    });
    const six = camp([]);
    expect(combineSurvivors(six, 'recruit-2', 'recruit-3')).toEqual({
      ok: false,
      reason: letGoLock(six, 'combine'),
    });
    for (const id of ['recruit-99', '__proto__', 'constructor', '']) {
      expect(combineSurvivors(g, 'recruit-1', id)).toEqual({
        ok: false,
        reason: 'No such survivor',
      });
      expect(combineSurvivors(g, id, 'recruit-1')).toEqual({
        ok: false,
        reason: 'No such survivor',
      });
    }
  });

  it('someone asking to join cannot be combined', () => {
    const g = { ...camp([as(recruit(7), 'chef')]), joining: [as(recruit(8), 'soldier')] };
    expect(combineSurvivors(g, 'recruit-1', 'recruit-8')).toEqual({
      ok: false,
      reason: 'No such survivor',
    });
  });
});
