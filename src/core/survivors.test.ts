// Design §10 Survivors and §11 Camp level, as built ID-032: survivors a patrol finds wait
// in its report until accepted or turned away, and a camp level-up offer may hold one.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from './armoury.ts';
import {
  acceptSurvivor,
  campAfterPick,
  hordeCampOffers,
  joinLock,
  rollSurvivor,
  survivorDefender,
  takeCampPick,
  turnAway,
  type CampOffer,
  type Survivor,
} from './camp.ts';
import {
  ARMOURY_CAP,
  CAMP_PICK_IDS,
  LOCATION_IDS,
  LOCATIONS,
  PATROL,
  PLAZAS,
  POINTS_PER_LEVEL,
  RECRUIT_NAMES,
  SURVIVOR,
  type LocationId,
} from './data.ts';
import { finishHorde, newGame, ownedWeapons, startHorde, type GameState } from './game.ts';
import type { HordeState } from './horde.ts';
import { isGun } from './loadout.ts';
import { createRng } from './rng.ts';
import {
  patrolDue,
  patrolLoot,
  patrolOutcome,
  patrolSurvivors,
  settlePatrols,
  type Patrol,
} from './patrol.ts';
import { levelOf, spentPoints, xpForLevel } from './stats.ts';

const NOW = 1_800_000_000_000;

const patrolAt = (location: LocationId, seed: number, patch: Partial<Patrol> = {}): Patrol => ({
  no: 7,
  location,
  buildings: [location],
  focus: 'anything',
  order: 'balanced',
  members: ['bob'],
  sentAt: NOW,
  sentHorde: PATROL.unlock,
  strength: 100,
  seed,
  ...patch,
});

/** The first seed from 1 up whose patrol to `location` finds someone. */
function finding(location: LocationId, patch: Partial<Patrol> = {}): Patrol {
  for (let seed = 1; ; seed++) {
    const p = patrolAt(location, seed, patch);
    if (patrolSurvivors(p).length > 0) return p;
  }
}

/** A new game at Horde 3 with patrol `p` out and back, its survivors waiting in the report. */
function backFrom(p: Patrol, game: GameState = newGame()): GameState {
  const g = { ...game, hordeNumber: PATROL.unlock, patrols: [p], patrolsSent: p.no };
  return settlePatrols(g, patrolDue(p));
}

const level = (s: Survivor): number => levelOf(s.xp).level;

/** `game` with its camp full: extra defenders up to every slot. */
const full = (game: GameState): GameState => ({
  ...game,
  roster: [
    ...game.roster,
    ...Array.from({ length: 5 - game.roster.length }, (_, i) => ({
      ...game.roster[0]!,
      id: `extra-${i + 1}`,
    })),
  ],
});

/** `game` with the armoury filled to the cap. */
const stuffed = (game: GameState): GameState => ({
  ...game,
  armoury: Array.from(
    { length: ARMOURY_CAP - ownedWeapons(game).length + game.armoury.length },
    (_, i): OwnedWeapon => ({
      uid: `h${i + 1}`,
      base: 'pistol',
      rarity: 'rusty',
      affixes: [],
    }),
  ),
});

describe('rolling a survivor', () => {
  it('has a name, the XP of their level, its stat points spent, and a weapon whose uid is their id', () => {
    for (let seed = 1; seed < 50; seed++) {
      const lvl = (seed % 5) + 1;
      const s = rollSurvivor(createRng(seed), 's3-1', lvl, 3);
      expect(s.id).toBe('s3-1');
      expect(RECRUIT_NAMES).toContain(s.name);
      expect(s.xp).toBe(xpForLevel(lvl));
      expect(level(s)).toBe(lvl);
      expect(spentPoints(s.stats)).toBe(POINTS_PER_LEVEL * (lvl - 1));
      expect(s.weapon.uid).toBe('s3-1');
    }
    expect(rollSurvivor(createRng(9), 'c2', 2, 2)).toEqual(rollSurvivor(createRng(9), 'c2', 2, 2));
  });

  it('joins carrying their weapon: a gun as the primary, anything else beside a pistol', () => {
    const kinds = new Set<boolean>();
    for (let seed = 1; seed < 80; seed++) {
      const s = rollSurvivor(createRng(seed), 'c3', 3, 3);
      const d = survivorDefender(s);
      kinds.add(isGun(s.weapon));
      expect(d).toMatchObject({
        id: 'c3',
        name: s.name,
        xp: s.xp,
        stats: s.stats,
        injuredUntil: null,
      });
      if (isGun(s.weapon))
        expect(d.loadout).toEqual({ primary: s.weapon, secondary: null, item: null });
      else expect(d.loadout).toEqual({ primary: 'pistol', secondary: s.weapon, item: null });
    }
    expect([...kinds].sort()).toEqual([false, true]);
  });
});

describe('survivors from patrols (design §10)', () => {
  it('finds them more often at more dangerous places', () => {
    const rate = (location: LocationId): number => {
      let found = 0;
      for (let seed = 1; seed <= 4000; seed++)
        found += patrolSurvivors(patrolAt(location, seed)).length;
      return found / 4000;
    };
    const tries = SURVIVOR.tries;
    // Each try finds one at `perTier × tier`.
    expect(rate('gas-station')).toBeCloseTo(tries * SURVIVOR.perTier * 1, 1);
    expect(rate('crater')).toBeCloseTo(tries * SURVIVOR.perTier * 5, 1);
    expect(rate('crater')).toBeGreaterThan(rate('hospital'));
    expect(rate('hospital')).toBeGreaterThan(rate('gas-station'));
  });

  it('rolls level 1 up to the tier, ids `s<patrol>-<try>`, from the seed alone', () => {
    for (const location of LOCATION_IDS) {
      const tier = LOCATIONS[location].tier;
      const levels = new Set<number>();
      for (let seed = 1; seed <= 600; seed++) {
        const p = patrolAt(location, seed);
        const found = patrolSurvivors(p);
        expect(found.length).toBeLessThanOrEqual(SURVIVOR.tries);
        for (const s of found) {
          expect(s.id).toMatch(/^s7-[01]$/);
          levels.add(level(s));
        }
        expect(patrolSurvivors(p)).toEqual(found);
      }
      expect(Math.min(...levels)).toBe(1);
      expect(Math.max(...levels)).toBe(tier);
    }
  });

  it("rolls at a plaza trip's tier: its highest ticked building", () => {
    const levels = (buildings: LocationId[]): number[] => {
      const seen: number[] = [];
      for (let seed = 1; seed <= 600; seed++) {
        const p = patrolAt('gas-station', seed, { location: 'riverside', buildings });
        seen.push(...patrolSurvivors(p).map(level));
      }
      return seen;
    };
    const tier = (b: LocationId): number => LOCATIONS[b].tier;
    const all = PLAZAS.riverside.buildings;
    const top = Math.max(...all.map(tier));
    expect(Math.max(...levels([...all]))).toBe(top);
    expect(Math.max(...levels(['gas-station']))).toBe(tier('gas-station'));
  });

  it('waits in the report taking no slot, and never shifts the loot or the casualties', () => {
    const p = finding('hospital');
    const g = backFrom(p);
    const report = g.reports.at(-1)!;
    const outcome = patrolOutcome(p);
    if (outcome.wiped) throw new Error('pick another seed');
    expect(report.survivors).toEqual(patrolSurvivors(p));
    expect(g.roster.length).toBe(newGame().roster.length - outcome.dead.length);
    // The loot of ID-026 and the casualties of ID-027 are what they were.
    expect(report.weapons.length).toBe(patrolLoot(p).weapons.length);
    expect(report.dead.length).toBe(outcome.dead.length);
  });

  it('finds the same survivors however late the patrol is settled', () => {
    const p = finding('hospital');
    const onTime = backFrom(p);
    const g = { ...newGame(), hordeNumber: PATROL.unlock, patrols: [p], patrolsSent: p.no };
    const late = settlePatrols(g, patrolDue(p) + 9 * 60 * 60 * 1000);
    expect(late.reports.at(-1)!.survivors).toEqual(onTime.reports.at(-1)!.survivors);
  });

  it('leaves with their report once PATROL.reports newer ones are in', () => {
    const p = finding('crater');
    let g = backFrom(p);
    const waiting = g.reports.at(-1)!.survivors;
    for (let n = 1; n <= PATROL.reports; n++) {
      const next = patrolAt('gas-station', 1, { no: p.no + n, sentAt: NOW + n });
      g = settlePatrols({ ...g, patrols: [next], patrolsSent: next.no }, patrolDue(next));
      const kept = g.reports.find((r) => r.no === p.no);
      if (n < PATROL.reports) expect(kept?.survivors).toEqual(waiting);
      else expect(kept).toBeUndefined();
    }
    expect(g.reports.flatMap((r) => r.survivors).map((s) => s.id)).not.toContain(waiting[0]!.id);
  });

  it('brings none back from a wipe', () => {
    for (let seed = 1; seed < 3000; seed++) {
      const p = patrolAt('crater', seed, { strength: 0 });
      if (!patrolOutcome(p).wiped) continue;
      const g = backFrom(p, {
        ...newGame(),
        roster: [...newGame().roster, { ...newGame().roster[0]!, id: 'dan' }],
      });
      expect(g.reports.at(-1)!.survivors).toEqual([]);
      return;
    }
    throw new Error('no wipe found');
  });

  it('accepting one puts them on the roster with their weapon, out of the report', () => {
    const p = finding('crater');
    const g = backFrom(p);
    const s = g.reports.at(-1)!.survivors[0]!;
    const r = acceptSurvivor(g, p.no, s.id);
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster.at(-1)).toEqual(survivorDefender(s));
    expect(r.game.reports.at(-1)!.survivors.map((x) => x.id)).not.toContain(s.id);
    expect(ownedWeapons(r.game).map((w) => w.uid)).toContain(s.id);
  });

  it('turning one away loses them for good; the rest still wait', () => {
    const p = finding('crater');
    const g = backFrom(p);
    const [s] = g.reports.at(-1)!.survivors;
    const r = turnAway(g, p.no, s!.id);
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster).toEqual(g.roster);
    expect(r.game.reports.at(-1)!.survivors).toEqual(g.reports.at(-1)!.survivors.slice(1));
  });

  it('refuses one with the camp full or no armoury room, until a slot or room is freed', () => {
    const p = finding('crater');
    const g = backFrom(p);
    const s = g.reports.at(-1)!.survivors[0]!;
    const crowded = full(g);
    expect(acceptSurvivor(crowded, p.no, s.id)).toEqual({ ok: false, reason: 'The camp is full' });
    expect(acceptSurvivor(stuffed(g), p.no, s.id)).toEqual({
      ok: false,
      reason: 'The armoury is full',
    });
    // Still waiting: free a slot and they can come in.
    expect(crowded.reports.at(-1)!.survivors).toContainEqual(s);
    expect(acceptSurvivor({ ...crowded, roster: crowded.roster.slice(0, -1) }, p.no, s.id).ok).toBe(
      true,
    );
  });

  it('throws on a report or survivor the game never offered', () => {
    const p = finding('crater');
    const g = backFrom(p);
    const s = g.reports.at(-1)!.survivors[0]!;
    expect(() => acceptSurvivor(g, 99, s.id)).toThrow(RangeError);
    expect(() => acceptSurvivor(g, p.no, 'bob')).toThrow(RangeError);
    expect(() => turnAway(g, p.no, '__proto__')).toThrow(RangeError);
    const once = turnAway(g, p.no, s.id);
    if (!once.ok) throw new Error(once.reason);
    expect(() => acceptSurvivor(once.game, p.no, s.id)).toThrow(RangeError);
  });
});

describe('a survivor in a camp level-up offer (design §11)', () => {
  /** Horde `game.hordeNumber` won from fight seed `seed`. */
  function won(game: GameState, seed: number): HordeState {
    const h = startHorde(game, seed, game.roster[0]!.id, 0, NOW);
    h.outcome = 'won';
    return h;
  }
  /** One level away (25 XP; Horde 1 pays 7). */
  const near = (game: GameState = newGame()): GameState => ({
    ...game,
    camp: { ...game.camp, xp: 25 },
  });
  /** The first fight seed whose level-up offer holds a survivor. */
  function joining(game: GameState): { h: HordeState; offer: CampOffer } {
    for (let seed = 1; ; seed++) {
      const h = won(game, seed);
      const [offer] = hordeCampOffers(game, h);
      if (offer?.survivor) return { h, offer };
    }
  }

  it('takes one of the 3 slots about 10% of the time, without changing the picks', () => {
    let seen = 0;
    const g = near();
    for (let seed = 1; seed <= 2000; seed++) {
      const h = won(g, seed);
      const [offer] = hordeCampOffers(g, h);
      if (!offer) throw new Error('no offer');
      if (offer.survivor) {
        seen += 1;
        expect(offer.picks).toHaveLength(2);
      } else expect(offer.picks).toHaveLength(3);
      for (const id of offer.picks) expect(CAMP_PICK_IDS).toContain(id);
    }
    expect(seen / 2000).toBeCloseTo(SURVIVOR.camp, 1);
  });

  it('is `c<level>`, of level 1 to the camp level, at most 5', () => {
    const levels = new Set<number>();
    for (let seed = 1; seed <= 3000; seed++) {
      const g = near();
      const [offer] = hordeCampOffers(g, won(g, seed));
      if (!offer?.survivor) continue;
      expect(offer.survivor.id).toBe('c2');
      levels.add(level(offer.survivor));
    }
    expect([...levels].sort()).toEqual([1, 2]);
    // Reaching camp level 9 (1080 XP; Horde 40 pays 105), the cap is 5.
    const high = { ...newGame(), hordeNumber: 40, camp: { ...newGame().camp, xp: 1000 } };
    const top = new Set<number>();
    for (let seed = 1; seed <= 3000; seed++) {
      for (const o of hordeCampOffers(high, won(high, seed))) {
        if (o.survivor) top.add(level(o.survivor));
      }
    }
    expect(Math.max(...top)).toBe(SURVIVOR.campLevel);
  });

  it('joins when picked: on the roster, the offer gone, no pick taken', () => {
    const g = near();
    const { h, offer } = joining(g);
    const after = finishHorde(g, h, NOW);
    expect(after.camp.offers).toEqual([offer]);
    const r = takeCampPick(after, 'join');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster.at(-1)).toEqual(survivorDefender(offer.survivor!));
    expect(r.game.camp.offers).toEqual([]);
    expect(r.game.camp.picks).toEqual(after.camp.picks);
    // The HUD walks the same choice on the camp alone.
    const hud = campAfterPick(after.camp, 'join');
    if (!hud.ok) throw new Error(hud.reason);
    expect(hud.camp).toEqual(r.game.camp);
  });

  it('is turned away by taking a pick instead', () => {
    const g = near();
    const { h, offer } = joining(g);
    const after = finishHorde(g, h, NOW);
    const r = takeCampPick(after, offer.picks[0]!);
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster).toEqual(after.roster);
    expect(r.game.camp.offers).toEqual([]);
    expect(r.game.camp.picks[offer.picks[0]!]).toBe(1);
  });

  it('needs a free slot and armoury room; a pick is still there to take', () => {
    const g = near();
    const { h } = joining(g);
    const after = full(finishHorde(g, h, NOW));
    expect(joinLock(after)).toBe('The camp is full');
    expect(takeCampPick(after, 'join')).toEqual({ ok: false, reason: 'The camp is full' });
    expect(takeCampPick(stuffed(finishHorde(g, h, NOW)), 'join')).toEqual({
      ok: false,
      reason: 'The armoury is full',
    });
  });

  it("refuses 'join' on an offer with no survivor", () => {
    const g = near();
    for (let seed = 1; ; seed++) {
      const h = won(g, seed);
      const [offer] = hordeCampOffers(g, h);
      if (offer?.survivor) continue;
      const after = finishHorde(g, h, NOW);
      expect(takeCampPick(after, 'join').ok).toBe(false);
      expect(campAfterPick(after.camp, 'join').ok).toBe(false);
      return;
    }
  });

  it("'away' turns the survivor away without a pick, and only answers an offer with one", () => {
    const s = rollSurvivor(createRng(1), 'c2', 1, 1);
    const g = {
      ...newGame(),
      camp: { ...newGame().camp, xp: 30, offers: [{ picks: [], survivor: s }] },
    };
    // Full or not, an offer of a survivor alone can always be answered.
    for (const game of [g, full(g)]) {
      const r = takeCampPick(game, 'away');
      if (!r.ok) throw new Error(r.reason);
      expect(r.game.camp.offers).toEqual([]);
      expect(r.game.camp.picks).toEqual(game.camp.picks);
      expect(r.game.roster).toEqual(game.roster);
    }
    const plain = {
      ...g,
      camp: { ...g.camp, offers: [{ picks: ['medic' as const], survivor: null }] },
    };
    expect(takeCampPick(plain, 'away').ok).toBe(false);
  });

  it('a survivor offer outlives its picks reaching the top rank', () => {
    const s = rollSurvivor(createRng(1), 'c3', 1, 1);
    const camp = {
      picks: { ...newGame().camp.picks, medic: 4 },
      offers: [
        { picks: ['medic' as const], survivor: null },
        { picks: ['medic' as const], survivor: s },
      ],
    };
    const r = campAfterPick(camp, 'medic');
    if (!r.ok) throw new Error(r.reason);
    expect(r.camp.offers).toEqual([{ picks: [], survivor: s }]);
  });
});
