// The world map and its patrols (ID-219): areas drawn from the core RNG, a team's risk from
// its power against the danger, real-time trips that a clock change never shortens, and a
// report rolled from the patrol's seed that pays exactly once.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import {
  AREA_IDS,
  DANGER_IDS,
  DANGERS,
  INJURY_REST,
  MAP_PATROL,
  MAX_COUNT,
  STASH_CAP,
  type AreaId,
  type Danger,
} from './data.ts';
import { hordeXp, newGame, onMapPatrol, type GameState, type RosterDefender } from './game.ts';
import { setSquadSize } from './debug.ts';
import {
  atCamp,
  benchXpGains,
  bestGuns,
  bestSquad,
  combinePartners,
  combineSurvivors,
  equipGun,
  paramedicPoints,
  squadRests,
  fillSquad,
  finishSquadHorde,
  letGo,
  settleSquad,
  startSquadHorde,
  swapBench,
  toggleSquad,
} from './hordeonly.ts';
import { createRng } from './rng.ts';
import {
  bestHorde,
  clockCheck,
  dropChance,
  injuryChance,
  isBack,
  newMap,
  patrolAt,
  patrolOf,
  patrolReport,
  patrolXp,
  sendMapPatrol,
  sendRefusal,
  takeReport,
  teamPower,
  teamRatio,
  teamRating,
  teamRisk,
  timeLeft,
  tripMs,
  withMap,
  type MapPatrol,
} from './scout.ts';
import { levelOf, xpForLevel } from './stats.ts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  ...extra,
});

/** A horde-only camp at Horde `horde` with `squad` and `bench`, and a map from seed 7. */
function camp(squad: RosterDefender[], bench: RosterDefender[], horde = 11): GameState {
  const g = newGame('horde');
  return withMap(
    {
      ...g,
      hordeNumber: horde,
      roster: squad,
      reserve: bench,
      camp: { ...g.camp, recruits: squad.length + bench.length },
    },
    7,
  );
}

/** The map's area of `danger`, put there for the test (the map keeps each kind once). */
function withArea(game: GameState, kind: AreaId, danger: Danger): GameState {
  const map = game.map!;
  const areas = map.areas.some((a) => a.kind === kind)
    ? map.areas.map((a) => (a.kind === kind ? { kind, danger } : a))
    : [{ kind, danger }, ...map.areas.slice(1)];
  return { ...game, map: { ...map, areas } };
}

/** Sends `ids` to `kind` (made `danger`) at NOW with `seed`; throws on a refusal. */
function sent(game: GameState, kind: AreaId, danger: Danger, ids: string[], seed = 1): GameState {
  const r = sendMapPatrol(withArea(game, kind, danger), kind, ids, seed, NOW);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

const squad = (): RosterDefender[] => [person(1)];
const bench = (n: number, extra: Partial<RosterDefender> = {}): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => person(2 + i, extra));
const ids = (list: readonly RosterDefender[]): string[] => list.map((d) => d.id);

describe('the map (ID-219)', () => {
  it('draws 4 areas, each kind once, from the seed alone', () => {
    for (let seed = 0; seed < 40; seed++) {
      const m = newMap(seed);
      expect(m.areas).toHaveLength(MAP_PATROL.areas);
      expect(new Set(m.areas.map((a) => a.kind)).size).toBe(MAP_PATROL.areas);
      for (const a of m.areas) {
        expect(AREA_IDS).toContain(a.kind);
        expect(DANGER_IDS).toContain(a.danger);
      }
      expect(newMap(seed)).toEqual(m);
      expect(m.patrols).toEqual([]);
    }
  });

  it('keeps a map it already has', () => {
    const g = camp(squad(), bench(1));
    expect(withMap(g, 99)).toBe(g);
  });

  it('draws every kind and danger over many seeds', () => {
    const kinds = new Set<string>();
    const dangers = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      for (const a of newMap(seed).areas) {
        kinds.add(a.kind);
        dangers.add(a.danger);
      }
    }
    expect(kinds.size).toBe(AREA_IDS.length);
    expect(dangers.size).toBe(DANGER_IDS.length);
  });
});

describe('team strength and risk (ID-219)', () => {
  const g = camp(squad(), bench(4));
  const risk = (team: RosterDefender[], danger: Danger = 'dangerous'): number =>
    teamRisk(g, team, danger).injury;

  it('each extra member lowers every member’s injury chance', () => {
    const team = bench(4);
    for (let n = 1; n < 4; n++) {
      expect(risk(team.slice(0, n + 1))).toBeLessThan(risk(team.slice(0, n)));
    }
  });

  it('a higher level lowers it', () => {
    const low = person(2);
    const high = person(2, { xp: xpForLevel(20) });
    expect(risk([high])).toBeLessThan(risk([low]));
  });

  it('a better gun lowers it', () => {
    const gun = rollWeapon(createRng(3), 'h9', 'rifle', 'relic', 10);
    const armed = person(2, { loadout: { primary: gun, secondary: null, item: null } });
    expect(risk([armed])).toBeLessThan(risk([person(2)]));
  });

  it('a lone level 1 survivor in a Dangerous area is a gamble; a strong full team is close to safe', () => {
    expect(risk([person(2)])).toBeGreaterThan(0.5);
    const gun = (k: number) => rollWeapon(createRng(k), `h${k}`, 'rifle', 'relic', 11);
    const strong = [2, 3, 4, 5].map((no) =>
      person(no, {
        xp: xpForLevel(25),
        loadout: { primary: gun(no), secondary: null, item: null },
      }),
    );
    expect(risk(strong)).toBeLessThan(0.1);
  });

  it('the rating follows the ratio: Safe, Risky, Dangerous', () => {
    expect(teamRating(MAP_PATROL.safeAt)).toBe('safe');
    expect(teamRating(MAP_PATROL.riskyAt)).toBe('risky');
    expect(teamRating(MAP_PATROL.riskyAt - 0.01)).toBe('dangerous');
    expect(teamRating(0)).toBe('dangerous');
  });

  it('the injury chance falls, and a roll’s chance rises, with the ratio', () => {
    expect(injuryChance(0)).toBe(MAP_PATROL.injury);
    for (const r of [0.25, 0.5, 1, 2, 4]) {
      expect(injuryChance(r)).toBeLessThan(injuryChance(r / 2));
      expect(dropChance('safe', r)).toBeGreaterThanOrEqual(dropChance('safe', r / 2));
    }
    for (const d of DANGER_IDS) {
      expect(dropChance(d, 0)).toBe(DANGERS[d].drop);
      expect(dropChance(d, 100)).toBeLessThanOrEqual(MAP_PATROL.dropMax);
    }
  });

  it('team power counts every member', () => {
    const team = bench(3);
    expect(teamPower(team)).toBeGreaterThan(teamPower(team.slice(0, 2)));
    expect(teamRatio(-5, 'safe', 3)).toBe(0);
  });
});

describe('sending a patrol (ID-219)', () => {
  const b = bench(5);
  const g = camp(squad(), b);
  const area = g.map!.areas[0]!;

  it('sends 1 to 4 bench survivors, fixing the trip, the power and the best horde', () => {
    const r = sendMapPatrol(g, area.kind, ids(b.slice(0, 3)), 42, NOW + 0.7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = patrolAt(r.game, area.kind)!;
    expect(p.members).toEqual(ids(b.slice(0, 3)));
    expect(p.sentAt).toBe(NOW);
    expect(p.backAt).toBe(NOW + tripMs(area.danger));
    expect(p.danger).toBe(area.danger);
    expect(p.best).toBe(bestHorde(g));
    expect(p.power).toBe(teamPower(b.slice(0, 3)));
    expect(p.no).toBe(1);
    for (const d of b.slice(0, 3)) expect(onMapPatrol(r.game, d.id)).toBe(true);
    expect(onMapPatrol(r.game, b[3]!.id)).toBe(false);
  });

  it('refuses 0 or 5+ members, a pick twice, the squad, a stranger, the resting', () => {
    expect(sendRefusal(g, area.kind, [])).toBe('Pick someone to send');
    expect(sendRefusal(g, area.kind, ids(b))).toMatch(/At most 4/);
    expect(sendRefusal(g, area.kind, [b[0]!.id, b[0]!.id])).toBe('Someone is picked twice');
    expect(sendRefusal(g, area.kind, ['recruit-1'])).toBe('Squad survivors stay to defend');
    expect(sendRefusal(g, area.kind, ['nobody'])).toBe('Pick survivors from the camp');
    const tired = camp(squad(), [person(2, { rest: 1 })]);
    expect(sendRefusal(tired, tired.map!.areas[0]!.kind, ['recruit-2'])).toMatch(/resting/);
  });

  it('one patrol per area, several areas at once, a member on one patrol only', () => {
    const one = sent(g, area.kind, area.danger, [b[0]!.id]);
    expect(sendRefusal(one, area.kind, [b[1]!.id])).toMatch(/already out/);
    expect(sendRefusal(one, one.map!.areas[1]!.kind, [b[0]!.id])).toMatch(/on patrol/);
    const two = sendMapPatrol(one, one.map!.areas[1]!.kind, [b[1]!.id], 2, NOW);
    expect(two.ok).toBe(true);
    if (two.ok) expect(two.game.map!.patrols.map((p) => p.no)).toEqual([1, 2]);
  });

  it('refuses an area not on the map', () => {
    const off = AREA_IDS.find((k) => !g.map!.areas.some((a) => a.kind === k))!;
    expect(sendRefusal(g, off, [b[0]!.id])).toBe('That area is not on the map');
  });

  it('throws on a bad time or seed', () => {
    expect(() => sendMapPatrol(g, area.kind, [b[0]!.id], 1, Number.NaN)).toThrow(RangeError);
    expect(() => sendMapPatrol(g, area.kind, [b[0]!.id], 1.5, NOW)).toThrow(RangeError);
  });
});

describe('time on the map (ID-219)', () => {
  const p: MapPatrol = {
    no: 1,
    area: 'police',
    danger: 'risky',
    members: ['recruit-2'],
    sentAt: NOW,
    backAt: NOW + 60 * MIN,
    seed: 1,
    best: 5,
    power: 10,
  };

  it('counts down in real time, back at the trip’s end', () => {
    expect(timeLeft(p, NOW)).toBe(60 * MIN);
    expect(timeLeft(p, NOW + 18 * MIN)).toBe(42 * MIN);
    expect(timeLeft(p, NOW + 60 * MIN - 1)).toBe(1);
    expect(isBack(p, NOW + 60 * MIN - 1)).toBe(false);
    expect(timeLeft(p, NOW + 60 * MIN)).toBe(0);
    expect(isBack(p, NOW + 60 * MIN)).toBe(true);
    expect(timeLeft(p, NOW + 900 * MIN)).toBe(0);
  });

  it('a clock run backwards counts as 0: never more than the trip, never back early', () => {
    expect(timeLeft(p, NOW - 500 * MIN)).toBe(60 * MIN);
    expect(isBack(p, NOW - 500 * MIN)).toBe(false);
  });

  it('a patrol that left after now (the clock set back) starts its trip again from now', () => {
    const g = sent(camp(squad(), bench(1)), 'police', 'risky', ['recruit-2']);
    const back = clockCheck(g, NOW - 30 * MIN);
    const q = back.map!.patrols[0]!;
    expect(q.sentAt).toBe(NOW - 30 * MIN);
    expect(q.backAt - q.sentAt).toBe(60 * MIN);
    expect(clockCheck(g, NOW + 5 * MIN)).toBe(g);
  });

  it('trip times by danger: 30 min, 1 h, 2 h', () => {
    expect(DANGER_IDS.map(tripMs)).toEqual([30 * MIN, 60 * MIN, 120 * MIN]);
  });
});

describe('the patrol report (ID-219)', () => {
  const back = NOW + 200 * MIN;

  it('each member rolls once: finds never pass the team size, and a bigger team finds more', () => {
    const mean = (n: number): number => {
      let total = 0;
      for (let seed = 0; seed < 200; seed++) {
        const g = sent(
          camp(squad(), bench(4)),
          'hardware',
          'risky',
          ids(bench(4)).slice(0, n),
          seed,
        );
        const r = patrolReport(g, g.map!.patrols[0]!);
        expect(r.finds).toBeLessThanOrEqual(n);
        expect(r.members).toHaveLength(n);
        total += r.finds;
      }
      return total / 200;
    };
    expect(mean(4)).toBeGreaterThan(mean(1) * 3);
  });

  it('a stronger team rolls with better odds', () => {
    const finds = (team: RosterDefender[]): number => {
      let total = 0;
      for (let seed = 0; seed < 300; seed++) {
        const g = sent(camp(squad(), team), 'hardware', 'safe', ids(team).slice(0, 1), seed);
        total += patrolReport(g, g.map!.patrols[0]!).finds;
      }
      return total;
    };
    const gun = rollWeapon(createRng(5), 'h9', 'rifle', 'relic', 11);
    const strong = [
      person(2, { xp: xpForLevel(30), loadout: { primary: gun, secondary: null, item: null } }),
    ];
    expect(finds(strong)).toBeGreaterThan(finds([person(2)]));
  });

  it('XP by danger: 25%, 50%, 100% of a win’s at the best horde, injured or not', () => {
    const best = 10;
    expect(patrolXp('safe', best)).toBe(Math.floor(hordeXp(best) * 0.25));
    expect(patrolXp('risky', best)).toBe(Math.floor(hordeXp(best) * 0.5));
    expect(patrolXp('dangerous', best)).toBe(hordeXp(best));
    for (let seed = 0; seed < 30; seed++) {
      const g = sent(camp(squad(), bench(4)), 'police', 'dangerous', ids(bench(4)), seed);
      const p = g.map!.patrols[0]!;
      for (const m of patrolReport(g, p).members) expect(m.xp).toBe(patrolXp('dangerous', p.best));
    }
  });

  it('the same patrol always brings the same report', () => {
    const g = sent(camp(squad(), bench(4)), 'military', 'dangerous', ids(bench(4)), 77);
    const p = g.map!.patrols[0]!;
    expect(patrolReport(g, p)).toEqual(patrolReport(structuredClone(g), p));
  });

  it('pays once: XP, rest for the injured, loot in, a new area in its place', () => {
    for (let seed = 0; seed < 40; seed++) {
      const g = sent(camp(squad(), bench(4)), 'pharmacy', 'dangerous', ids(bench(4)), seed);
      const r = patrolReport(g, g.map!.patrols[0]!);
      const t = takeReport(g, 'pharmacy', back);
      expect(t.ok).toBe(true);
      if (!t.ok) return;
      expect(t.report).toEqual(r);
      const out = t.game;
      for (const m of r.members) {
        const d = out.reserve.find((x) => x.id === m.id) ?? out.roster.find((x) => x.id === m.id)!;
        expect(d.xp).toBe(m.xp);
        expect(d.rest ?? 0).toBe(m.injured ? INJURY_REST.downed : 0);
        expect(onMapPatrol(out, m.id)).toBe(false);
      }
      expect(out.medicine ?? 0).toBe(r.medicine);
      expect(out.stock.scrap).toBe(g.stock.scrap + r.scrap + r.salvage);
      expect(out.map!.patrols).toEqual([]);
      expect(out.map!.areas.some((a) => a.kind === 'pharmacy')).toBe(false);
      expect(new Set(out.map!.areas.map((a) => a.kind)).size).toBe(MAP_PATROL.areas);
      expect(out.map!.drawn).toBe(g.map!.drawn + 1);
      // A second OK finds no patrol: it never pays twice.
      expect(takeReport(out, 'pharmacy', back).ok).toBe(false);
    }
  });

  it('is refused before the patrol is back', () => {
    const g = sent(camp(squad(), bench(1)), 'police', 'safe', ['recruit-2']);
    expect(takeReport(g, 'police', NOW + 29 * MIN)).toEqual({
      ok: false,
      reason: 'The patrol is not back yet',
    });
    expect(takeReport(g, 'hospital', back).ok).toBe(false);
  });

  it('a level-up from patrol XP shows on the report', () => {
    const near = xpForLevel(3) - 1;
    const g = sent(camp(squad(), [person(2, { xp: near })]), 'police', 'dangerous', ['recruit-2']);
    const m = patrolReport(g, g.map!.patrols[0]!).members[0]!;
    expect(m.levels).toBeGreaterThan(0);
    expect(m.level).toBe(levelOf(near + m.xp).level);
  });

  it('guns go in the stash, the weakest thrown away and salvaged when full; Medicine is capped', () => {
    let seen = false;
    for (let seed = 0; seed < 80 && !seen; seed++) {
      const base = camp(squad(), bench(4));
      const full = {
        ...base,
        armoury: Array.from({ length: STASH_CAP }, (_, k) =>
          rollWeapon(createRng(k), `h${k + 1}`, 'pistol', 'common', 1),
        ),
        medicine: MAP_PATROL.medicineMax - 1,
      };
      const g = sent(full, 'police', 'dangerous', ids(bench(4)), seed);
      const t = takeReport(g, 'police', back);
      if (!t.ok) throw new Error(t.reason);
      expect(t.game.armoury.length).toBeLessThanOrEqual(STASH_CAP);
      expect(t.game.medicine ?? 0).toBeLessThanOrEqual(MAP_PATROL.medicineMax);
      if (t.report.weapons.length > 0) {
        seen = true;
        expect(t.report.thrown).toHaveLength(t.report.weapons.length);
        expect(t.report.salvage).toBeGreaterThan(0);
        for (const w of t.report.weapons) expect(w.uid).toMatch(/^m1-\d+$/);
      }
    }
    expect(seen).toBe(true);
  });

  it('XP stays at MAX_COUNT at most', () => {
    const g = sent(camp(squad(), [person(2, { xp: MAX_COUNT })]), 'police', 'safe', ['recruit-2']);
    const t = takeReport(g, 'police', back);
    expect(t.ok && t.game.reserve.find((d) => d.id === 'recruit-2')!.xp).toBe(MAX_COUNT);
  });
});

describe('a member on patrol is away (ID-219)', () => {
  const b = bench(3);
  const g = sent(camp(squad(), b), 'police', 'risky', [b[0]!.id, b[1]!.id]);
  const away = b[0]!.id;

  it('can’t join the squad, swap in, or be picked by Best squad or a fill', () => {
    expect(toggleSquad(g, away)).toEqual({ ok: false, reason: `${b[0]!.name} is on patrol` });
    expect(swapBench(g).map((d) => d.id)).toEqual([b[2]!.id]);
    expect(bestSquad(g).game.roster.some((d) => d.id === away)).toBe(false);
    const empty = { ...g, roster: [], reserve: [...g.reserve, ...g.roster] };
    expect(fillSquad(empty).roster.some((d) => d.id === away)).toBe(false);
    expect(settleSquad(empty).roster.some((d) => d.id === away)).toBe(false);
  });

  it('can’t be let go or combined while out', () => {
    const big = sent(
      camp(
        bench(6, {}).map((d, i) => ({ ...d, id: `recruit-${20 + i}` })),
        b,
      ),
      'police',
      'risky',
      [away],
    );
    expect(letGo(big, away)).toEqual({ ok: false, reason: `${b[0]!.name} is on patrol` });
    const keeper = big.reserve.find((d) => d.id !== away && d.job === b[0]!.job);
    if (keeper) expect(combineSurvivors(big, keeper.id, away).ok).toBe(false);
  });

  it('earns no bench share for a horde fought while away', () => {
    const h = startSquadHorde(g, 1, NOW);
    h.outcome = 'won';
    const gains = benchXpGains(g, h, [{ xp: 100 }]);
    expect(gains.map((x) => x.id)).toEqual([b[2]!.id]);
    const next = finishSquadHorde(g, h);
    expect(next.reserve.find((d) => d.id === away)!.xp).toBe(0);
    expect(patrolOf(next, away)).not.toBeNull();
  });
});

describe('review fixes: away means away (ID-219)', () => {
  const won = (g: GameState, downed: string[] = [], seed = 1) => {
    const h = startSquadHorde(g, seed, NOW);
    h.outcome = 'won';
    for (const id of downed) {
      const i = h.defenders.findIndex((d) => d.id === id);
      const d = h.defenders[i]!;
      h.defenders.splice(i, 1);
      h.injured.push({
        defender: { id: d.id, name: d.name, loadout: d.loadout },
        postId: d.postId,
        at: 0,
        offered: false,
        by: null,
      });
    }
    return h;
  };

  it('a Paramedic out on patrol patches nobody up', () => {
    const medic = person(2, { job: 'paramedic', xp: xpForLevel(40) });
    const home = camp([person(1)], [medic]);
    expect(paramedicPoints(atCamp(home))).toBeGreaterThan(0);
    const out = sent(home, 'police', 'safe', [medic.id]);
    expect(paramedicPoints(atCamp(out))).toBe(0);
    for (let seed = 0; seed < 40; seed++) {
      const rests = squadRests(out, won(out, ['recruit-1'], seed));
      expect(rests).toEqual([{ id: 'recruit-1', name: person(1).name, rest: INJURY_REST.downed }]);
    }
  });

  it('a gun goes nowhere while its holder is out', () => {
    const gun = rollWeapon(createRng(2), 'h3', 'rifle', 'relic', 5);
    const holder = person(2, { loadout: { primary: gun, secondary: null, item: null } });
    const g = sent(camp([person(1)], [holder]), 'police', 'safe', [holder.id]);
    expect(equipGun(g, holder.id, 'pistol')).toEqual({
      ok: false,
      reason: `${holder.name} is on patrol`,
    });
    const after = bestGuns(g).game;
    expect(after.reserve.find((d) => d.id === holder.id)!.loadout.primary).toEqual(gun);
    expect(after.roster[0]!.loadout.primary).not.toEqual(gun);
  });

  it('nobody out is offered to Combine, either way', () => {
    const a = person(2, { job: 'hunter' });
    const b = person(3, { job: 'hunter' });
    const g = sent(camp([person(1)], [a, b]), 'police', 'safe', [b.id]);
    expect(combinePartners(g, a.id)).toEqual([]);
    expect(combinePartners(g, b.id)).toEqual([]);
  });

  it('a whole horde with a member out: no swap-in, no XP, back as they left', () => {
    const b = bench(2);
    const g = sent(camp([person(1)], b), 'police', 'risky', [b[0]!.id]);
    const h = startSquadHorde(g, 3, NOW);
    expect((h.subs ?? []).map((s) => s.id)).toEqual([b[1]!.id]);
    expect(h.defenders.some((d) => d.id === b[0]!.id)).toBe(false);
    h.outcome = 'won';
    const next = finishSquadHorde(g, h);
    const away = next.reserve.find((d) => d.id === b[0]!.id)!;
    expect(away.xp).toBe(0);
    expect(onMapPatrol(next, away.id)).toBe(true);
    expect(next.roster.some((d) => d.id === away.id)).toBe(false);
  });

  it('with only those out fit, the shortest rest wakes, never a member out', () => {
    const out = person(2);
    const g0 = sent(camp([], [person(1, { rest: 1 }), out]), 'police', 'safe', [out.id]);
    const s = settleSquad(g0);
    expect(s.roster.map((d) => d.id)).toEqual(['recruit-1']);
    expect(s.roster[0]!.rest ?? 0).toBe(0);
  });

  it('a report taken with Auto on puts the camp back in its best order', () => {
    const strong = person(2, { xp: xpForLevel(30) });
    const g = {
      ...sent(camp([person(1)], [strong]), 'police', 'safe', [strong.id]),
      autoSquad: true as const,
    };
    const t = takeReport(g, 'police', NOW + 31 * MIN);
    if (!t.ok) throw new Error(t.reason);
    const back = t.report.members[0]!;
    const inSquad = t.game.roster.some((d) => d.id === strong.id);
    expect(inSquad).toBe(!back.injured);
  });

  it('the debug squad size never puts a member out into the squad', () => {
    const g = sent(camp([person(1)], bench(3)), 'police', 'safe', ['recruit-2']);
    const r = setSquadSize(g, 4, 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.game.roster.some((d) => d.id === 'recruit-2')).toBe(false);
  });

  it('Medicine the store can’t take is not shown as found', () => {
    for (let seed = 0; seed < 60; seed++) {
      const g = sent(
        { ...camp([person(1)], bench(4)), medicine: MAP_PATROL.medicineMax - 1 },
        'hospital',
        'dangerous',
        ids(bench(4)),
        seed,
      );
      const r = patrolReport(g, g.map!.patrols[0]!);
      expect(r.medicine).toBeLessThanOrEqual(1);
    }
  });
});

describe('review fixes: time running backwards counts as 0 (ID-219)', () => {
  it('a clock set back mid-trip keeps exactly the time left', () => {
    const g = sent(camp([person(1)], bench(1)), 'police', 'risky', ['recruit-2']);
    // 20 min in, the clock goes back 10 min: 40 min still to go, not 50.
    const seen = NOW + 20 * MIN;
    const now = NOW + 10 * MIN;
    const c = clockCheck(g, now, seen);
    const p = c.map!.patrols[0]!;
    expect(timeLeft(p, now)).toBe(40 * MIN);
    expect(p.backAt - p.sentAt).toBe(60 * MIN);
    // Made up for once: the next check from there moves nothing.
    expect(clockCheck(c, now + 1000, now)).toBe(c);
  });

  it('a clock set back past the start keeps the time left too', () => {
    const g = sent(camp([person(1)], bench(1)), 'police', 'risky', ['recruit-2']);
    const c = clockCheck(g, NOW - 100 * MIN, NOW + 30 * MIN);
    expect(timeLeft(c.map!.patrols[0]!, NOW - 100 * MIN)).toBe(30 * MIN);
  });

  it('never moves a trip for a clock running forward', () => {
    const g = sent(camp([person(1)], bench(1)), 'police', 'risky', ['recruit-2']);
    expect(clockCheck(g, NOW + 5 * MIN, NOW + 2 * MIN)).toBe(g);
  });
});
