// The bench and rest (ID-147, ID-155): the camp grows past the squad's 6 by a seeded chance,
// the squad is picked from it, and a survivor downed in a won fight rests a horde unless the
// camp's Paramedics patch them up, counted down per horde played.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import { INJURY_REST, MAX_COUNT, PATCH_UP, SQUAD_CAP, SQUAD_JOIN, STASH_CAP } from './data.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  acceptJoins,
  campOf,
  equipGun,
  fillSquad,
  finishSquadHorde,
  isFit,
  joiners,
  paramedicPoints,
  patchUpChance,
  patchUpHp,
  restLabel,
  settleSquad,
  squadOf,
  squadRests,
  squadResult,
  startSquadHorde,
  toggleSquad,
} from './hordeonly.ts';
import { createRng } from './rng.ts';
import { xpForLevel } from './stats.ts';

const NOW = 1_700_000_000_000;

const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  ...extra,
});

/** A horde-only camp at Horde `horde`: `squad` in the squad, `bench` on the bench. */
function campGame(squad: RosterDefender[], bench: RosterDefender[] = [], horde = 3): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

/** `n` survivors, recruits `from`…`from + n − 1`. */
const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => person(from + i));

/**
 * Horde `game.hordeNumber` with `seed`, ended as `outcome`: each survivor in `hp` ended at
 * that share of max HP, or was downed ('down').
 */
function ended(
  game: GameState,
  hp: Record<string, number | 'down'> = {},
  outcome: 'won' | 'lost' = 'won',
  seed = 1,
): HordeState {
  const h = startSquadHorde(game, seed, NOW);
  h.outcome = outcome;
  for (const [id, v] of Object.entries(hp)) {
    const i = h.defenders.findIndex((d) => d.id === id);
    const d = h.defenders[i]!;
    if (v === 'down') {
      h.defenders.splice(i, 1);
      h.injured.push({
        defender: { id: d.id, name: d.name, loadout: d.loadout },
        postId: d.postId,
        at: 0,
        offered: false,
        by: null,
      });
    } else d.hp = d.maxHp * v;
  }
  return h;
}

describe('new survivors past 6 (ID-147)', () => {
  it('under 6, every first clear adds exactly one, whatever the seed', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(joiners(campGame(people(5)), seed)).toEqual([recruit(6, seed)]);
    }
  });

  it('at 6 and past it: none, one or two by the seed alone (seeds 1, 8, 9)', () => {
    const g = campGame(people(6), people(3, 7));
    expect(joiners(g, 1)).toEqual([]);
    expect(joiners(g, 8)).toEqual([recruit(10, 8)]);
    expect(joiners(g, 9)).toEqual([recruit(10, 9), recruit(11, 9)]);
    // The same seed always gives the same joiners.
    expect(joiners(g, 9)).toEqual(joiners(g, 9));
  });

  it('joins at about SQUAD_JOIN.chance, and a second at about SQUAD_JOIN.second of those', () => {
    const g = campGame(people(6));
    const counts = Array.from({ length: 2000 }, (_, seed) => joiners(g, seed).length);
    const any = counts.filter((k) => k > 0).length / counts.length;
    const two = counts.filter((k) => k === 2).length / counts.filter((k) => k > 0).length;
    expect(any).toBeGreaterThan(SQUAD_JOIN.chance - 0.03);
    expect(any).toBeLessThan(SQUAD_JOIN.chance + 0.03);
    expect(two).toBeGreaterThan(SQUAD_JOIN.second - 0.07);
    expect(two).toBeLessThan(SQUAD_JOIN.second + 0.07);
  });

  it('never grows the camp past SQUAD_JOIN.max, nor the recruit count past its cap', () => {
    const full = campGame(people(6), people(SQUAD_JOIN.max - 6, 7));
    const near = campGame(people(6), people(SQUAD_JOIN.max - 7, 7));
    for (let seed = 0; seed < 300; seed++) {
      expect(joiners(full, seed)).toEqual([]);
      expect(joiners(near, seed).length).toBeLessThanOrEqual(1);
    }
    const capped = { ...campGame(people(6)), camp: { ...newGame().camp, recruits: MAX_COUNT } };
    expect(joiners(capped, 9)).toEqual([]);
  });

  it('a first clear past 6 puts a joiner on the bench while the squad is full', () => {
    const g = campGame(people(6), people(1, 7));
    const next = acceptJoins(finishSquadHorde(g, ended(g, {}, 'won', 8)));
    expect(next.roster.map((d) => d.id)).toEqual(g.roster.map((d) => d.id));
    expect(next.reserve.map((d) => d.id)).toEqual(['recruit-7', 'recruit-8']);
    expect(next.camp.recruits).toBe(8);
    expect(squadResult(g, ended(g, {}, 'won', 8)).joined.map((d) => d.id)).toEqual(['recruit-8']);
  });

  it('a loss adds nobody, lucky seed or not; a replay rolls its own rarer chance (ID-170)', () => {
    const g = campGame(people(6), [], 4);
    const replay = { ...ended(g, {}, 'won', 9), hordeNumber: 2 };
    // Seed 9 brings two on a first clear but nobody on a replay.
    expect(joiners(g, 9, true)).toEqual([]);
    expect(squadResult(g, replay).joined).toEqual([]);
    expect(campOf(finishSquadHorde(g, replay))).toHaveLength(6);
    expect(squadResult(g, ended(g, {}, 'lost', 9)).joined).toEqual([]);
  });
});

describe('rest after a fight (ID-147, ID-155)', () => {
  const six = () => campGame(people(6), people(2, 7));

  it('a won fight: only the downed rest, 1 horde; anyone standing, at any HP, none', () => {
    const g = six();
    const h = ended(g, {
      'recruit-1': 'down',
      'recruit-2': 0.2,
      'recruit-3': 0.01,
      'recruit-4': 1,
    });
    expect(squadRests(g, h)).toEqual([
      { id: 'recruit-1', name: recruit(1).name, rest: INJURY_REST.downed },
    ]);
    expect(INJURY_REST.downed).toBe(1);
    expect(INJURY_REST.downed).toBeLessThanOrEqual(INJURY_REST.max);
  });

  it('a lost fight rests nobody: everyone is down by then', () => {
    const g = six();
    const h = ended(g, Object.fromEntries(g.roster.map((d) => [d.id, 'down'])), 'lost');
    expect(squadRests(g, h)).toEqual([]);
    const next = finishSquadHorde(g, h);
    expect(campOf(next).every(isFit)).toBe(true);
    expect(squadOf(next)).toHaveLength(SQUAD_CAP);
  });

  it('the downed leave the squad for the bench; the badly hurt stay; the slot stays open', () => {
    const g = six();
    const next = finishSquadHorde(g, ended(g, { 'recruit-1': 'down', 'recruit-2': 0.1 }));
    expect(next.roster.map((d) => d.id)).toEqual([
      'recruit-2',
      'recruit-3',
      'recruit-4',
      'recruit-5',
      'recruit-6',
    ]);
    expect(next.reserve.map((d) => [d.id, d.rest])).toEqual([
      ['recruit-7', undefined],
      ['recruit-8', undefined],
      ['recruit-1', 1],
    ]);
    // The one who ended at 10% fights the next horde at full HP.
    expect(campOf(next).find((d) => d.id === 'recruit-2')!.startHp).toBeUndefined();
    // The next horde is fought by the squad alone, not the bench.
    expect(startSquadHorde(next, 2, NOW).tookPart.sort()).toEqual(next.roster.map((d) => d.id));
  });

  it('rest counts down one per horde played, won or lost, then the survivor is fit', () => {
    let g = finishSquadHorde(six(), ended(six(), { 'recruit-1': 'down' }));
    const restOf1 = (x: GameState) => campOf(x).find((d) => d.id === 'recruit-1')!.rest;
    expect(restOf1(g)).toBe(1);
    g = finishSquadHorde(g, ended(g, {}, 'lost'));
    expect(restOf1(g)).toBeUndefined();
    // Their slot stayed open (nobody filled it), so they can take it back.
    expect(squadOf(g)).toHaveLength(SQUAD_CAP - 1);
    expect(toggleSquad(g, 'recruit-1').ok).toBe(true);
  });
});

describe('Paramedics patch up the downed (ID-155)', () => {
  const medic = (no: number, level = 1, extra: Partial<RosterDefender> = {}) =>
    person(no, { job: 'paramedic', xp: xpForLevel(level), ...extra });

  it('points: 20 at level 1, 30 at level 21, never 40', () => {
    expect(paramedicPoints([medic(1)])).toBe(PATCH_UP.base);
    expect(paramedicPoints([medic(1)])).toBe(20);
    expect(paramedicPoints([medic(1, 21)])).toBeCloseTo(30, 10);
    const high = paramedicPoints([medic(1, 100_000)]);
    expect(high).toBeGreaterThan(39.9);
    expect(high).toBeLessThan(40);
    // Anyone else adds nothing.
    expect(paramedicPoints(people(6))).toBe(0);
  });

  it('chance: none 0%, one at Lv 1 20%, four 80%, six still 80%', () => {
    const chanceOf = (n: number) =>
      patchUpChance(paramedicPoints(Array.from({ length: n }, (_, i) => medic(i + 1))));
    expect(chanceOf(0)).toBe(0);
    expect(chanceOf(1)).toBeCloseTo(0.2, 10);
    expect(chanceOf(4)).toBeCloseTo(0.8, 10);
    expect(chanceOf(6)).toBeCloseTo(PATCH_UP.chance, 10);
  });

  it('every Paramedic in the camp counts: the downed one, the bench, the resting', () => {
    const g = campGame(
      [medic(1), ...people(5, 2)],
      [medic(7), medic(8, 1, { rest: 1 }), ...people(1, 9)],
    );
    expect(paramedicPoints(campOf(g))).toBe(60);
  });

  it('starting HP: 80 points 50%, 90 55%, 140 80%, 200 still 80%', () => {
    expect(patchUpHp(80)).toBeCloseTo(0.5, 10);
    expect(patchUpHp(20)).toBeCloseTo(PATCH_UP.hp, 10);
    expect(patchUpHp(90)).toBeCloseTo(0.55, 10);
    expect(patchUpHp(140)).toBeCloseTo(0.8, 10);
    expect(patchUpHp(200)).toBeCloseTo(PATCH_UP.hpCap, 10);
  });

  /** Recruit-1 downed in a won Horde 3 with `seed`, in a camp with `medics` Lv 1 Paramedics on the bench. */
  function downed(medics: number, seed: number) {
    const bench = Array.from({ length: medics }, (_, i) => medic(7 + i));
    const g = campGame(people(6), [...bench, ...people(2, 20)]);
    const h = { ...ended(g, { 'recruit-1': 'down' }), seed };
    return { g, h, r: squadRests(g, h).find((x) => x.id === 'recruit-1')! };
  }

  it('each downed survivor rolls the camp’s chance: never with none, about 80% with four', () => {
    for (let seed = 0; seed < 100; seed++) expect(downed(0, seed).r.rest).toBe(1);
    const rolls = Array.from({ length: 400 }, (_, seed) => downed(4, seed).r);
    const share = rolls.filter((r) => r.rest === 0).length / rolls.length;
    expect(share).toBeGreaterThan(0.74);
    expect(share).toBeLessThan(0.86);
    for (const r of rolls) {
      if (r.rest === 0) expect(r.startHp).toBeCloseTo(PATCH_UP.hp, 10);
      else expect(r.startHp).toBeUndefined();
    }
  });

  it('the roll is seeded: the same camp and horde give the same outcome', () => {
    for (let seed = 0; seed < 20; seed++) {
      const a = downed(2, seed);
      const b = downed(2, seed);
      expect(squadRests(a.g, a.h)).toEqual(squadRests(b.g, b.h));
    }
  });

  it('a patched-up survivor fights the next horde at reduced HP, then at full HP', () => {
    const seed = Array.from({ length: 50 }, (_, s) => s).find((s) => downed(4, s).r.rest === 0)!;
    const { g, h } = downed(4, seed);
    const next = finishSquadHorde(g, h);
    const one = campOf(next).find((d) => d.id === 'recruit-1')!;
    expect([one.rest, one.startHp]).toEqual([undefined, PATCH_UP.hp]);
    expect(isFit(one)).toBe(true);
    expect(squadOf(next).some((d) => d.id === 'recruit-1')).toBe(true);
    const r = squadResult(g, h);
    expect(r.patched).toEqual([{ id: 'recruit-1', name: one.name, startHp: PATCH_UP.hp }]);
    expect(r.rests.some((x) => x.id === 'recruit-1')).toBe(false);
    // The next fight: half HP, out of their full max.
    const fight = startSquadHorde(next, 5, NOW);
    const f = fight.defenders.find((d) => d.id === 'recruit-1')!;
    expect(f.hp).toBe(Math.round(f.maxHp * PATCH_UP.hp));
    expect(f.hp).toBeLessThan(f.maxHp);
    // Played, won or lost: full HP again.
    fight.outcome = 'lost';
    const after = finishSquadHorde(next, fight);
    expect(campOf(after).find((d) => d.id === 'recruit-1')!.startHp).toBeUndefined();
  });
});

describe('a win that downs everyone (ID-147)', () => {
  it('the first in camp order wakes at once and fights; the result leaves them out of the rests', () => {
    const g = campGame(people(6));
    const h = ended(g, Object.fromEntries(g.roster.map((d) => [d.id, 'down'])));
    const next = finishSquadHorde(g, h);
    expect(next.roster.map((d) => [d.id, d.rest])).toEqual([['recruit-1', undefined]]);
    expect(next.reserve.every((d) => d.rest === 1)).toBe(true);
    const r = squadResult(g, h);
    expect(r.rests.map((x) => x.id)).toEqual(people(5, 2).map((d) => d.id));
    expect(r.next).toEqual(next);
  });
});

describe('picking the squad (ID-147)', () => {
  it('moves a fit survivor between the squad and the bench, in pick order', () => {
    const g = campGame(people(5), people(2, 6));
    const added = toggleSquad(g, 'recruit-7');
    expect(added.ok && added.game.roster.map((d) => d.id).at(-1)).toBe('recruit-7');
    const benched = toggleSquad(g, 'recruit-2');
    expect(benched.ok && benched.game.reserve.map((d) => d.id)).toEqual([
      'recruit-6',
      'recruit-7',
      'recruit-2',
    ]);
  });

  it('refuses the resting, a full squad, the last in the squad and a stranger', () => {
    const resting = person(7, { rest: 1 });
    const g = campGame(people(6), [resting, person(8)]);
    expect(toggleSquad(g, 'recruit-7')).toEqual({ ok: false, reason: restLabel(1) });
    expect(restLabel(1)).toBe('Resting: 1 horde');
    expect(toggleSquad(g, 'recruit-8')).toEqual({
      ok: false,
      reason: `The squad is full (${SQUAD_CAP}/${SQUAD_CAP}): unmark one first`,
    });
    expect(toggleSquad(campGame(people(1), people(1, 2)), 'recruit-1').ok).toBe(false);
    expect(toggleSquad(g, 'nobody')).toEqual({ ok: false, reason: 'No such survivor' });
  });

  it('the field never holds more than 6, however big the camp', () => {
    const g = campGame(people(6), people(30, 7));
    expect(startSquadHorde(g, 1, NOW).defenders).toHaveLength(SQUAD_CAP);
  });

  it('fillSquad takes the fittest bench by XP, resting left out', () => {
    const bench = [person(7, { xp: 10 }), person(8, { xp: 90, rest: 1 }), person(9, { xp: 50 })];
    const g = fillSquad(campGame(people(4), bench));
    expect(g.roster.map((d) => d.id)).toEqual([
      'recruit-1',
      'recruit-2',
      'recruit-3',
      'recruit-4',
      'recruit-9',
      'recruit-7',
    ]);
    expect(g.reserve.map((d) => d.id)).toEqual(['recruit-8']);
    const full = campGame(people(6), people(1, 7));
    expect(fillSquad(full)).toBe(full);
  });
});

describe('the game never locks up (ID-147)', () => {
  it('with nobody fit, the shortest rest ends at once and that survivor takes the empty squad', () => {
    const g = campGame(
      [],
      [person(1, { rest: 2 }), person(2, { rest: 1 }), person(3, { rest: 1 })],
    );
    const s = settleSquad(g);
    expect(s.roster.map((d) => [d.id, d.rest])).toEqual([['recruit-2', undefined]]);
    expect(s.reserve.map((d) => [d.id, d.rest])).toEqual([
      ['recruit-1', 2],
      ['recruit-3', 1],
    ]);
    expect(startSquadHorde(s, 1, NOW).defenders.map((d) => d.id)).toEqual(['recruit-2']);
  });

  it('an empty squad with fit survivors on the bench is filled from it', () => {
    const s = settleSquad(campGame([], [person(1, { rest: 1 }), person(2), person(3)]));
    expect(s.roster.map((d) => d.id)).toEqual(['recruit-2', 'recruit-3']);
  });

  it('someone resting in the squad is benched; a settled camp is left as it is', () => {
    const s = settleSquad(campGame([person(1, { rest: 1 }), person(2)]));
    expect(s.roster.map((d) => d.id)).toEqual(['recruit-2']);
    expect(s.reserve.map((d) => d.id)).toEqual(['recruit-1']);
    expect(settleSquad(s)).toBe(s);
  });
});

describe('a bench survivor’s gun (ID-147)', () => {
  const rifle = rollWeapon(createRng(3), 'h1', 'rifle', 'military');

  it('goes to the stash for the pistol, and a stash gun can go to them', () => {
    const g = campGame(people(1), [
      person(2, { loadout: { primary: rifle, secondary: null, item: null } }),
    ]);
    const r = equipGun(g, 'recruit-2', 'pistol');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.reserve[0]!.loadout.primary).toBe('pistol');
    expect(r.game.armoury.map((w) => w.uid)).toEqual(['h1']);
    expect(r.game.roster).toBe(g.roster);
    const back = equipGun(r.game, 'recruit-2', 'h1');
    expect(back.ok && back.game.reserve[0]!.loadout.primary).toEqual(rifle);
    expect(equipGun(g, 'recruit-1', 'pistol')).toEqual({ ok: true, game: g });
  });

  it('is refused into a full stash, as a squad survivor’s is', () => {
    const stash = Array.from({ length: STASH_CAP }, (_, i) =>
      rollWeapon(createRng(i), `h${i + 2}`, 'smg', 'common'),
    );
    const g = {
      ...campGame(
        people(1),
        [person(2, { loadout: { primary: rifle, secondary: null, item: null } })],
        60,
      ),
      armoury: stash,
    };
    expect(equipGun(g, 'recruit-2', 'pistol').ok).toBe(false);
  });
});
