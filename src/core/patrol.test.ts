import { describe, expect, it } from 'vitest';
import {
  ARMOURY_CAP,
  buildingsOf,
  LOCATION_IDS,
  LOCATIONS,
  MATERIALS,
  MAX_COUNT,
  ORDERS,
  PATROL,
  PLACE_IDS,
  PLAZAS,
  RARITY_ORDER,
  stockOf,
  RECOVERY_MS,
  WEAPONS,
  type LocationId,
  type PlaceId,
} from './data.ts';
import { equip, hordeXp, newGame, startHorde, type GameState } from './game.ts';
import {
  bigHordeChance,
  bonusRolls,
  buildingLoots,
  focusOptions,
  hasGate,
  hordeCasualties,
  hordeOdds,
  hordeStrength,
  idle,
  locationDanger,
  memberStrength,
  partyStrength,
  patrolDue,
  patrolLoot,
  patrolOutcome,
  patrolRisk,
  patrolXp,
  patrolsUnlocked,
  revealedLocations,
  revealedPlaces,
  riskOf,
  rollBigHorde,
  sendPatrol,
  settlePatrols,
  tripMinutes,
  tripOf,
  type Patrol,
} from './patrol.ts';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

/** A new game at Horde 3, when patrols open. */
const ready = (patch: Partial<GameState> = {}): GameState => ({
  ...newGame(),
  hordeNumber: PATROL.unlock,
  ...patch,
});

/** `game` with `ids` given enough Grit to rate Safe anywhere, so loot tests lose no one. */
const tough = (game: GameState, ...ids: string[]): GameState => ({
  ...game,
  roster: game.roster.map((d) =>
    ids.includes(d.id) ? { ...d, stats: { ...d.stats, grit: 40 } } : d,
  ),
});

/** `game` with a fourth defender, Dan, so three can be out with one left at the camp. */
const withDan = (game: GameState): GameState => ({
  ...game,
  roster: [...game.roster, { ...game.roster[0]!, id: 'dan', name: 'Dan' }],
});

function sent(game: GameState, location: PlaceId, ids: string[], seed = 1, now = NOW) {
  const r = sendPatrol(game, location, ids, seed, now);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

const patrolAt = (location: PlaceId, patch: Partial<Patrol> = {}): Patrol => ({
  no: 1,
  location,
  buildings: [...buildingsOf(location)],
  focus: 'anything',
  order: 'balanced',
  members: ['bob'],
  sentAt: NOW,
  sentHorde: PATROL.unlock,
  strength: 1.8,
  seed: 1,
  ...patch,
});

describe('locations (design §10)', () => {
  it('has the ten single-building locations, 15 minutes to 8 hours out and back', () => {
    expect(LOCATION_IDS).toHaveLength(10);
    const trips = Object.fromEntries(LOCATION_IDS.map((id) => [id, tripMinutes(id)]));
    expect(trips).toEqual({
      'gas-station': 15,
      supermarket: 20,
      electronics: 45,
      hardware: 60,
      pharmacy: 60,
      construction: 120,
      police: 120,
      hospital: 180,
      military: 240,
      crater: 480,
    });
    expect(LOCATION_IDS.map((id) => LOCATIONS[id].tier)).toEqual([1, 1, 2, 2, 2, 3, 3, 4, 4, 5]);
  });

  it('has loot tables of real things with positive weights', () => {
    for (const id of LOCATION_IDS) {
      for (const e of LOCATIONS[id].loot) {
        expect(e.weight, id).toBeGreaterThan(0);
        if (e.kind === 'material') {
          expect(MATERIALS).toContain(e.id);
          expect(e.min).toBeGreaterThan(0);
          expect(e.max).toBeGreaterThanOrEqual(e.min);
        }
        if (e.kind === 'weapon') for (const b of e.bases) expect(Object.keys(WEAPONS)).toContain(b);
      }
    }
  });

  it('reveals the gas station, supermarket and electronics store first, then hardware after Horde 3 and the pharmacy after Horde 5', () => {
    expect(revealedLocations(newGame())).toEqual(['gas-station', 'supermarket', 'electronics']);
    expect(revealedLocations(ready({ hordeNumber: 4 }))).toContain('hardware');
    expect(revealedLocations(ready({ hordeNumber: 5 }))).not.toContain('pharmacy');
    expect(revealedLocations(ready({ hordeNumber: 6 }))).toEqual([
      'gas-station',
      'supermarket',
      'electronics',
      'hardware',
      'pharmacy',
    ]);
    // The rest wait for research (ID-035).
    expect(revealedLocations(ready({ hordeNumber: 100_000 }))).toHaveLength(5);
  });
});

describe('sending a patrol', () => {
  it('opens after Horde 2', () => {
    expect(patrolsUnlocked(ready({ hordeNumber: 2 }))).toBe(false);
    expect(sendPatrol(ready({ hordeNumber: 2 }), 'gas-station', ['bob'], 1, NOW)).toEqual({
      ok: false,
      reason: 'Patrols open after Horde 2',
    });
    expect(patrolsUnlocked(ready())).toBe(true);
  });

  it('records the party, time, horde, strength and seed, and numbers each patrol', () => {
    const g = sent(withDan(ready()), 'gas-station', ['bob', 'jack'], 42);
    expect(g.patrols).toEqual([
      {
        no: 1,
        location: 'gas-station',
        buildings: ['gas-station'],
        focus: 'anything',
        order: 'balanced',
        members: ['bob', 'jack'],
        sentAt: NOW,
        sentHorde: PATROL.unlock,
        strength: partyStrength(g.roster.slice(0, 2)),
        seed: 42,
      },
    ]);
    expect(g.patrolsSent).toBe(1);
    expect(sent(g, 'supermarket', ['john']).patrols.map((p) => p.no)).toEqual([1, 2]);
  });

  it('has no limit on parties at once', () => {
    let g = withDan(ready());
    for (const id of ['bob', 'jack', 'john']) g = sent(g, 'gas-station', [id]);
    expect(g.patrols).toHaveLength(3);
    expect(g.roster.filter((d) => idle(g, d, NOW)).map((d) => d.id)).toEqual(['dan']);
  });

  it('keeps one defender at the camp, so a wipe never empties it (ID-027)', () => {
    const keep = { ok: false, reason: 'Keep one defender at the camp' };
    expect(sendPatrol(ready(), 'gas-station', ['bob', 'jack', 'john'], 1, NOW)).toEqual(keep);
    const two = sent(ready(), 'gas-station', ['bob', 'jack']);
    expect(sendPatrol(two, 'supermarket', ['john'], 1, NOW)).toEqual(keep);
    // An injured defender at home is still at the camp: the fit ones may all go.
    const hurt = ready();
    hurt.roster[2] = { ...hurt.roster[2]!, injuredUntil: NOW + MIN };
    expect(sendPatrol(hurt, 'gas-station', ['bob', 'jack'], 1, NOW).ok).toBe(true);
  });

  it('refuses a hidden location, no standing gate, an injured member or one already out', () => {
    expect(sendPatrol(ready(), 'hardware', ['bob'], 1, NOW)).toEqual({
      ok: false,
      reason: "Hardware store isn't on the map yet",
    });
    expect(sendPatrol(ready(), 'crater', ['bob'], 1, NOW).ok).toBe(false);
    const g = ready();
    const noGate = structuredClone(g);
    for (const l of noGate.base.layers) for (const s of l.slots) if (s?.kind === 'gate') s.hp = 0;
    expect(hasGate(g)).toBe(true);
    expect(hasGate(noGate)).toBe(false);
    expect(sendPatrol(noGate, 'gas-station', ['bob'], 1, NOW)).toEqual({
      ok: false,
      reason: 'Patrols leave by a gate: build or repair one',
    });
    const hurt = structuredClone(g);
    hurt.roster[0]!.injuredUntil = NOW + 1;
    expect(sendPatrol(hurt, 'gas-station', ['bob'], 1, NOW)).toEqual({
      ok: false,
      reason: 'Bob is injured',
    });
    // Rested by now, though not yet cleared: free to go.
    expect(sendPatrol(hurt, 'gas-station', ['bob'], 1, NOW + 1).ok).toBe(true);
    const out = sent(g, 'gas-station', ['bob']);
    expect(sendPatrol(out, 'supermarket', ['jack', 'bob'], 1, NOW)).toEqual({
      ok: false,
      reason: 'Bob is on patrol',
    });
    expect(sendPatrol(g, 'gas-station', [], 1, NOW).ok).toBe(false);
    // Past the last patrol number a weapon uid can hold.
    expect(sendPatrol({ ...g, patrolsSent: PATROL.max }, 'gas-station', ['bob'], 1, NOW)).toEqual({
      ok: false,
      reason: 'No more patrols can be sent',
    });
  });

  it('throws on ids the game never offers', () => {
    expect(() => sendPatrol(ready(), 'gas-station', ['nobody'], 1, NOW)).toThrow(RangeError);
    expect(() => sendPatrol(ready(), 'mall' as LocationId, ['bob'], 1, NOW)).toThrow(RangeError);
    expect(() => sendPatrol(ready(), 'gas-station', ['bob', 'bob'], 1, NOW)).toThrow(RangeError);
    expect(() => sendPatrol(ready(), 'gas-station', ['bob'], 1, NaN)).toThrow(RangeError);
    expect(() => sendPatrol(ready(), 'gas-station', ['bob'], 1.5, NOW)).toThrow(RangeError);
  });

  it('keeps a party out of a horde and its weapons out of reach', () => {
    const g = sent(ready(), 'gas-station', ['bob']);
    expect(() => startHorde(g, 1, 'bob', 0, NOW)).toThrow(RangeError);
    const h = startHorde(g, 1, 'jack', 0, NOW);
    expect([...h.defenders, ...h.bench].map((d) => d.id)).not.toContain('bob');
    expect(equip(g, 'bob', { primary: 'pistol', secondary: 'knife', item: null })).toEqual({
      ok: false,
      reason: 'Bob is on patrol',
    });
  });
});

describe('patrol timer and offline progress', () => {
  it('is due after travel out, the search and travel back', () => {
    const g = sent(ready(), 'electronics', ['bob']);
    expect(patrolDue(g.patrols[0]!)).toBe(NOW + 45 * MIN);
  });

  it('settles only patrols that are due, and returns the same game when none is', () => {
    let g = sent(tough(ready(), 'bob', 'jack'), 'gas-station', ['bob'], 2);
    g = sent(g, 'electronics', ['jack']);
    expect(settlePatrols(g, NOW + 15 * MIN - 1)).toBe(g);
    const half = settlePatrols(g, NOW + 15 * MIN);
    expect(half.patrols.map((p) => p.location)).toEqual(['electronics']);
    expect(half.reports.map((r) => r.location)).toEqual(['gas-station']);
    expect(idle(half, half.roster[0]!, NOW)).toBe(true);
    const all = settlePatrols(half, NOW + 45 * MIN);
    expect(all.patrols).toEqual([]);
    expect(all.reports.map((r) => r.no)).toEqual([1, 2]);
  });

  it('gives the same result however late it is settled (the game was closed)', () => {
    const g = sent(withDan(ready()), 'electronics', ['bob', 'jack'], 7);
    const due = NOW + 45 * MIN;
    const soon = settlePatrols(g, due);
    const days = settlePatrols(g, due + 3 * 24 * 60 * MIN);
    expect(days).toEqual(soon);
    // Settled one at a time or together, two patrols land the same.
    let two = sent(g, 'gas-station', ['john'], 9);
    const together = settlePatrols(two, due);
    two = settlePatrols(settlePatrols(two, NOW + 15 * MIN), due);
    expect(two).toEqual(together);
  });

  it('settles oldest due first, whatever order they were sent in', () => {
    let g = sent(ready(), 'electronics', ['bob']);
    g = sent(g, 'gas-station', ['jack']);
    expect(settlePatrols(g, NOW + 45 * MIN).reports.map((r) => r.location)).toEqual([
      'gas-station',
      'electronics',
    ]);
  });

  it('waits when the clock runs behind the send time', () => {
    const g = sent(ready(), 'gas-station', ['bob']);
    expect(settlePatrols(g, NOW - 60 * MIN)).toBe(g);
    expect(() => settlePatrols(g, NaN)).toThrow(RangeError);
  });
});

describe('loot', () => {
  it('lands in the camp and in the report: materials, Gas, batteries and weapons', () => {
    const g = sent(tough(ready(), 'bob', 'jack'), 'gas-station', ['bob', 'jack'], 3);
    const haul = patrolLoot(g.patrols[0]!);
    const back = settlePatrols(g, NOW + 15 * MIN);
    const r = back.reports[0]!;
    for (const m of MATERIALS) expect(back.stock[m]).toBe(g.stock[m] + r.stock[m]);
    expect(back.power.gas).toBe(g.power.gas + haul.gas);
    expect(r.gas).toBe(haul.gas);
    expect(r.batteries).toEqual(haul.batteries);
    expect(r.names).toEqual(['Bob', 'Jack']);
    expect(r.returnedAt).toBe(NOW + 15 * MIN);
  });

  it('rolls the same loot from the same seed, and different loot from others', () => {
    const p = patrolAt('electronics');
    expect(patrolLoot(p)).toEqual(patrolLoot({ ...p }));
    const hauls = new Set(
      Array.from({ length: 20 }, (_, seed) => JSON.stringify(patrolLoot({ ...p, seed }))),
    );
    expect(hauls.size).toBeGreaterThan(5);
  });

  it('only drops what the location can drop', () => {
    for (let seed = 0; seed < 300; seed++) {
      const h = patrolLoot(patrolAt('pharmacy', { seed }));
      for (const m of MATERIALS) {
        if (m !== 'medicine' && m !== 'chemicals') expect(h.stock[m]).toBe(0);
      }
      expect(h.gas).toBe(0);
      expect(h.weapons).toEqual([]);
    }
  });

  it("finds the police station's weapons, and never a Rusty one at the crater", () => {
    const police = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      for (const w of patrolLoot(patrolAt('police', { seed, sentHorde: 3 })).weapons) {
        police.add(w.base);
      }
    }
    expect([...police].sort()).toEqual(['pistol', 'shotgun', 'smg']);
    for (let seed = 0; seed < 300; seed++) {
      for (const w of patrolLoot(patrolAt('crater', { seed })).weapons) {
        expect(w.rarity).not.toBe('rusty');
      }
    }
  });

  it("rolls another location's table for the crater's 'Anything'", () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const h = patrolLoot(patrolAt('crater', { seed }));
      for (const m of MATERIALS) if (h.stock[m] > 0) found.add(m);
      if (h.gas > 0) found.add('gas');
    }
    // Food and Gas are on no crater line.
    expect(found).toContain('food');
    expect(found).toContain('gas');
  });

  it('adds a roll per `need × tier` of strength, two at most', () => {
    expect(bonusRolls(2.9, 'gas-station')).toBe(0);
    expect(bonusRolls(3, 'gas-station')).toBe(1);
    expect(bonusRolls(6, 'gas-station')).toBe(2);
    expect(bonusRolls(100, 'gas-station')).toBe(PATROL.bonusRolls);
    expect(bonusRolls(6, 'electronics')).toBe(1);
    expect(bonusRolls(14.9, 'crater')).toBe(0);
    // More rolls bring more back on average.
    const total = (strength: number) => {
      let n = 0;
      for (let seed = 0; seed < 200; seed++) {
        n += patrolLoot(patrolAt('supermarket', { seed, strength })).stock.food;
      }
      return n;
    };
    expect(total(10)).toBeGreaterThan(total(0) * 1.4);
  });

  it('lifts found weapons a rarity more often with a stronger party', () => {
    const mean = (strength: number) => {
      let sum = 0;
      let n = 0;
      for (let seed = 0; seed < 300; seed++) {
        for (const w of patrolLoot(patrolAt('police', { seed, strength })).weapons) {
          sum += RARITY_ORDER.indexOf(w.rarity);
          n += 1;
        }
      }
      return sum / n;
    };
    expect(mean(99)).toBeGreaterThan(mean(0) + 0.2);
  });

  it('works out strength from level, weapon rarity and Grit', () => {
    const bob = newGame().roster[0]!;
    expect(memberStrength(bob)).toBeCloseTo(1.8); // level 1, a Rusty pistol
    expect(memberStrength({ ...bob, stats: { ...bob.stats, grit: 2 } })).toBeCloseTo(3.8);
    const relic = {
      ...bob,
      loadout: {
        primary: { uid: 'h1', base: 'rifle' as const, rarity: 'relic' as const, affixes: [] },
        secondary: null,
        item: null,
      },
    };
    expect(memberStrength(relic)).toBeCloseTo(2.5);
  });

  it('keeps found weapons as `p<no>-<k>`, and salvages them for Scrap with a full armoury', () => {
    // The police station waits for research; place the patrol there by hand.
    const g = ready({ patrols: [patrolAt('police', { seed: 5, strength: 30 })], patrolsSent: 1 });
    const haul = patrolLoot(g.patrols[0]!);
    expect(haul.weapons.length).toBeGreaterThan(0);
    const back = settlePatrols(g, NOW + 120 * MIN);
    expect(back.armoury.map((w) => w.uid)).toEqual(haul.weapons.map((_, k) => `p1-${k}`));
    expect(back.reports[0]!.weapons.every((w) => w.kept)).toBe(true);
    const full = ready({
      patrols: g.patrols,
      patrolsSent: 1,
      armoury: Array.from({ length: ARMOURY_CAP }, (_, i) => ({
        uid: `h${i + 1}`,
        base: 'pistol' as const,
        rarity: 'rusty' as const,
        affixes: [],
      })),
    });
    const salvaged = settlePatrols(full, NOW + 120 * MIN);
    expect(salvaged.armoury).toHaveLength(ARMOURY_CAP);
    expect(salvaged.reports[0]!.weapons.every((w) => !w.kept)).toBe(true);
    expect(salvaged.stock.scrap).toBeGreaterThan(full.stock.scrap);
  });

  it('caps every count at MAX_COUNT', () => {
    const g = sent(ready(), 'supermarket', ['bob']);
    g.stock.food = MAX_COUNT;
    expect(settlePatrols(g, NOW + 20 * MIN).stock.food).toBe(MAX_COUNT);
  });

  it('keeps the latest reports only', () => {
    let g = tough(ready(), 'bob');
    for (let i = 0; i < PATROL.reports + 3; i++) {
      g = settlePatrols(
        sent(g, 'gas-station', ['bob'], i, NOW + i * 15 * MIN),
        NOW + (i + 1) * 15 * MIN,
      );
      // A Safe trip may still hurt him; he is rested for the next one.
      g = { ...g, roster: g.roster.map((d) => ({ ...d, injuredUntil: null })) };
    }
    expect(g.reports).toHaveLength(PATROL.reports);
    expect(g.reports.at(-1)!.no).toBe(PATROL.reports + 3);
  });
});

describe('patrol XP', () => {
  it("pays a horde win's XP per hour out, times the danger (3× at tier 5)", () => {
    expect(patrolXp('gas-station', 3)).toBe(Math.floor(hordeXp(3) * 0.25));
    expect(patrolXp('hardware', 4)).toBe(hordeXp(4) * 1.5);
    expect(patrolXp('crater', 10)).toBe(hordeXp(10) * 8 * 3);
  });

  it('goes to each member who comes back, from the horde number they left at', () => {
    const g = sent(ready(), 'electronics', ['bob', 'jack']);
    const later = { ...g, hordeNumber: 9 };
    const back = settlePatrols(later, NOW + 45 * MIN);
    const xp = patrolXp('electronics', PATROL.unlock);
    expect(back.roster.map((d) => d.xp)).toEqual([xp, xp, 0]);
    expect(back.reports[0]!.xp).toBe(xp);
  });
});

/** The first seed from 1 whose outcome for `p` passes `test`. */
function seedWhere(p: Patrol, test: (o: ReturnType<typeof patrolOutcome>) => boolean): number {
  for (let seed = 1; seed < 10_000; seed++) if (test(patrolOutcome({ ...p, seed }))) return seed;
  throw new Error('no such seed');
}

/** Bob carrying two owned weapons: a gun and a blade. */
const GUN = { uid: 'h1', base: 'pistol' as const, rarity: 'rusty' as const, affixes: [] };
const BLADE = { uid: 'h2', base: 'knife' as const, rarity: 'rusty' as const, affixes: [] };
const armed = (game: GameState): GameState => ({
  ...game,
  roster: game.roster.map((d) =>
    d.id === 'bob' ? { ...d, loadout: { primary: GUN, secondary: BLADE, item: null } } : d,
  ),
});

describe('patrol risk (ID-027)', () => {
  it("rates party strength against the location's danger, 6 per tier", () => {
    expect(LOCATION_IDS.map(locationDanger)).toEqual(
      LOCATION_IDS.map((id) => 6 * LOCATIONS[id].tier),
    );
    const at = (strength: number) => riskOf(strength, 'gas-station').rating;
    expect([6, 5.99, 3.6, 3.59, 1.8, 1.79, 0].map(at)).toEqual([
      'safe',
      'risky',
      'risky',
      'dangerous',
      'dangerous',
      'deadly',
      'deadly',
    ]);
    expect(riskOf(1e9, 'crater')).toEqual({ rating: 'safe', injured: 0.05, dead: 0, wipe: 0 });
    expect(riskOf(0, 'crater')).toEqual({ rating: 'deadly', injured: 0.4, dead: 0.2, wipe: 0.2 });
  });

  it('shows a party its risk before it leaves', () => {
    const g = ready();
    const party = g.roster.slice(0, 2);
    expect(patrolRisk(party, 'electronics')).toEqual(riskOf(partyStrength(party), 'electronics'));
    // A starting pair rates Risky at the gas station and Dangerous at the hardware store.
    expect(patrolRisk(party, 'gas-station').rating).toBe('risky');
    expect(patrolRisk(party, 'hardware').rating).toBe('dangerous');
  });

  it('rolls casualties at the odds of each rating', () => {
    const N = 4000;
    for (const r of PATROL.risk) {
      const strength = r.from * locationDanger('hardware');
      const party = ['a', 'b', 'c'];
      let wipes = 0;
      let dead = 0;
      let injured = 0;
      let rolled = 0;
      for (let seed = 0; seed < N; seed++) {
        const o = patrolOutcome(patrolAt('hardware', { members: party, strength, seed }));
        if (o.wiped && o.dead.length === party.length && o.injured.length === 0) wipes++;
        if (o.injured.some((id) => o.dead.includes(id))) throw new Error('injured and dead');
        dead += o.dead.length;
        injured += o.injured.length;
        rolled += o.wiped ? 0 : party.length;
      }
      // A wipe is rolled first; one by one, all three dying counts as one too.
      expect(wipes / N, r.rating).toBeGreaterThanOrEqual(r.wipe - 0.02);
      expect(wipes / N, r.rating).toBeLessThanOrEqual(r.wipe + r.dead ** 3 + 0.02);
      const lost = dead - wipes * party.length;
      expect(lost / rolled, r.rating).toBeCloseTo(r.dead * (1 - r.dead ** 2), 1);
      expect(injured / rolled, r.rating).toBeCloseTo((1 - r.dead) * r.injured, 1);
    }
  });

  it('never kills anyone on a Safe trip', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const o = patrolOutcome(patrolAt('crater', { members: ['a', 'b'], strength: 999, seed }));
      expect(o.dead).toEqual([]);
      expect(o.wiped).toBe(false);
    }
  });

  it("rolls casualties on their own stream: a light loss keeps the order's share of the ID-026 loot", () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack', 'john'], strength: 1 });
    const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 1);
    const back = settlePatrols(
      ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }),
      NOW + 60 * MIN,
    );
    const haul = patrolLoot({ ...p, seed });
    // Balanced keeps 40% of each count, rounded down; the first weapons found stay.
    for (const m of MATERIALS) {
      expect(back.reports[0]!.stock[m], m).toBe(Math.floor(haul.stock[m] * 0.4));
    }
    expect(back.reports[0]!.weapons).toHaveLength(Math.floor(haul.weapons.length * 0.4));
    expect(patrolOutcome({ ...p, seed })).toEqual(patrolOutcome({ ...p, seed }));
  });

  it('brings the loot of a party that lost nobody whole, on a Dangerous trip too', () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 1 });
    const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 0);
    const back = settlePatrols(
      ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }),
      NOW + 60 * MIN,
    );
    const haul = patrolLoot({ ...p, seed });
    expect(back.reports[0]!.stock).toEqual(haul.stock);
    expect(back.reports[0]!.weapons.map(({ base, rarity }) => ({ base, rarity }))).toEqual(
      haul.weapons,
    );
  });

  it('sends the injured home to rest from the return, with their XP', () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 1 });
    const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 0 && o.injured.length > 0);
    const g = ready({ patrols: [{ ...p, seed }], patrolsSent: 1 });
    const back = settlePatrols(g, NOW + 9 * 60 * MIN);
    const o = patrolOutcome({ ...p, seed });
    const due = patrolDue(p);
    for (const d of back.roster.filter((x) => o.injured.includes(x.id))) {
      expect(d.injuredUntil).toBe(due + RECOVERY_MS);
      expect(d.xp).toBe(patrolXp('electronics', PATROL.unlock));
      expect(sendPatrol(back, 'gas-station', [d.id], 1, due + RECOVERY_MS - 1)).toEqual({
        ok: false,
        reason: `${d.name} is injured`,
      });
    }
    expect(back.reports[0]!.injured).toEqual(
      g.roster.filter((d) => o.injured.includes(d.id)).map((d) => d.name),
    );
    expect(back.reports[0]!.dead).toEqual([]);
  });

  it('loses the dead for good and leaves their owned weapons where they fell', () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 1 });
    const seed = seedWhere(
      p,
      (o) => !o.wiped && o.dead.includes('bob') && !o.dead.includes('jack'),
    );
    const g = armed(ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }));
    const back = settlePatrols(g, NOW + 60 * MIN);
    expect(back.roster.map((d) => d.id)).toEqual(['jack', 'john']);
    expect(back.leftBehind).toEqual([
      { location: 'electronics', weapon: GUN },
      { location: 'electronics', weapon: BLADE },
    ]);
    expect(back.armoury).not.toContainEqual(GUN);
    const r = back.reports[0]!;
    expect(r).toMatchObject({ names: ['Bob', 'Jack'], dead: ['Bob'], wiped: false, recovered: [] });
    // The survivor still brings the loot home.
    expect(r.xp).toBe(patrolXp('electronics', PATROL.unlock));
    // A free weapon is just gone.
    const plain = settlePatrols(
      ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }),
      NOW + 60 * MIN,
    );
    expect(plain.leftBehind).toEqual([]);
  });

  it('brings home what the dead left with the next party there, and nothing from elsewhere', () => {
    const left = [
      { location: 'electronics' as const, weapon: GUN },
      { location: 'gas-station' as const, weapon: BLADE },
    ];
    const p = patrolAt('electronics', { members: ['jack'], strength: 999 });
    const g = ready({ patrols: [p], patrolsSent: 1, leftBehind: left });
    const back = settlePatrols(g, NOW + 60 * MIN);
    expect(back.armoury[0]).toEqual(GUN);
    expect(back.reports[0]!.recovered).toEqual([{ base: 'pistol', rarity: 'rusty', kept: true }]);
    expect(back.leftBehind).toEqual([left[1]]);
    // With a full armoury it is salvaged for Scrap, as a found weapon is.
    const full = ready({
      patrols: [p],
      patrolsSent: 1,
      leftBehind: left,
      armoury: Array.from({ length: ARMOURY_CAP }, (_, i) => ({ ...GUN, uid: `h${i + 10}` })),
    });
    const salvaged = settlePatrols(full, NOW + 60 * MIN);
    expect(salvaged.reports[0]!.recovered).toEqual([
      { base: 'pistol', rarity: 'rusty', kept: false },
    ]);
    expect(salvaged.leftBehind).toEqual([left[1]]);
    expect(salvaged.stock.scrap).toBeGreaterThan(back.stock.scrap);
  });

  it("doesn't carry home its own dead's weapons on the same trip", () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 1 });
    const seed = seedWhere(
      p,
      (o) => !o.wiped && o.dead.includes('bob') && !o.dead.includes('jack'),
    );
    const back = settlePatrols(
      armed(ready({ patrols: [{ ...p, seed }], patrolsSent: 1 })),
      NOW + 60 * MIN,
    );
    expect(back.reports[0]!.recovered).toEqual([]);
    expect(back.leftBehind).toHaveLength(2);
  });

  it('brings back nothing from a wipe and leaves every weapon there', () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 0 });
    const seed = seedWhere(p, (o) => o.wiped);
    const left = { location: 'electronics' as const, weapon: { ...GUN, uid: 'h9' } };
    const g = armed(ready({ patrols: [{ ...p, seed }], patrolsSent: 1, leftBehind: [left] }));
    const back = settlePatrols(g, NOW + 60 * MIN);
    expect(back.roster.map((d) => d.id)).toEqual(['john']);
    expect(back.stock).toEqual(g.stock);
    expect(back.power.gas).toBe(g.power.gas);
    expect(back.armoury).toEqual([]);
    expect(back.leftBehind.map((l) => l.weapon.uid)).toEqual(['h9', 'h1', 'h2']);
    expect(back.reports[0]).toMatchObject({
      names: ['Bob', 'Jack'],
      dead: ['Bob', 'Jack'],
      injured: [],
      wiped: true,
      weapons: [],
      recovered: [],
      xp: 0,
    });
  });

  it('keeps at most PATROL.left weapons waiting on the map, the latest', () => {
    const many = Array.from({ length: PATROL.left }, (_, i) => ({
      location: 'gas-station' as const,
      weapon: { ...GUN, uid: `h${i + 10}` },
    }));
    const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 0 });
    const seed = seedWhere(p, (o) => o.wiped);
    const g = armed(ready({ patrols: [{ ...p, seed }], patrolsSent: 1, leftBehind: many }));
    const back = settlePatrols(g, NOW + 60 * MIN);
    expect(back.leftBehind).toHaveLength(PATROL.left);
    expect(back.leftBehind.at(-1)!.weapon).toEqual(BLADE);
    expect(back.leftBehind[0]!.weapon.uid).toBe('h12');
  });

  it('spares one member when a wipe would leave nobody alive (a save from before ID-027)', () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack', 'john'], strength: 0 });
    const seed = seedWhere(p, (o) => o.wiped);
    const back = settlePatrols(
      ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }),
      NOW + 60 * MIN,
    );
    expect(back.roster.map((d) => d.id)).toEqual(['bob']);
    expect(back.roster[0]!.injuredUntil).toBe(patrolDue(p) + RECOVERY_MS);
    expect(back.reports[0]).toMatchObject({
      dead: ['Jack', 'John'],
      injured: ['Bob'],
      wiped: false,
    });
    expect(back.reports[0]!.xp).toBe(patrolXp('electronics', PATROL.unlock));
  });
});

const ALL = ['gas-station', 'pharmacy', 'hardware'] as const;
const H = 60 * MIN;
/** Whole counts kept of `n` under a share, as the core rounds them. */
const kept = (n: number, keep: number) => Math.floor(n * keep + 1e-9);

describe('plazas (ID-029)', () => {
  it('has Riverside Plaza from Horde 6 and the Strip mall from Horde 3, of buildings that exist', () => {
    expect(PLAZAS.riverside).toMatchObject({ reveal: 6, buildings: ALL });
    expect(PLAZAS['strip-mall']).toMatchObject({
      reveal: 3,
      buildings: ['supermarket', 'electronics'],
    });
    for (const z of Object.values(PLAZAS))
      for (const b of z.buildings) expect(LOCATIONS[b]).toBeDefined();
    expect(revealedPlaces(newGame())).toEqual(['gas-station', 'supermarket', 'electronics']);
    expect(revealedPlaces(ready())).toEqual([
      'gas-station',
      'supermarket',
      'electronics',
      'strip-mall',
    ]);
    expect(revealedPlaces(ready({ hordeNumber: 6 }))).toEqual([
      ...revealedLocations(ready({ hordeNumber: 6 })),
      'riverside',
      'strip-mall',
    ]);
    // Locations alone are unchanged.
    expect(revealedLocations(ready({ hordeNumber: 6 }))).toHaveLength(5);
  });

  it('works a trip out as the longest travel, the searches added up and the highest tier (D2)', () => {
    expect(tripOf('riverside')).toEqual({ travel: 20, search: 45, tier: 2, minutes: 85 });
    expect(tripOf('strip-mall')).toEqual({ travel: 15, search: 21, tier: 2, minutes: 51 });
    expect(tripOf('riverside', ['gas-station'])).toEqual({
      travel: 5,
      search: 5,
      tier: 1,
      minutes: 15,
    });
    expect(tripOf('riverside', ['gas-station', 'pharmacy'])).toEqual({
      travel: 20,
      search: 25,
      tier: 2,
      minutes: 65,
    });
    // A single location is a place whose only building is itself.
    for (const id of LOCATION_IDS) expect(tripOf(id)).toEqual(tripOf(id, [id]));
    expect(tripMinutes('gas-station')).toBe(15);
    expect(() => tripOf('riverside', [])).toThrow();
    // The patrol is back at its ticked trip's time.
    const p = patrolAt('riverside', { buildings: ['gas-station', 'pharmacy'] });
    expect(patrolDue(p)).toBe(NOW + 65 * MIN);
    expect(locationDanger('riverside')).toBe(12);
  });

  it('sends to a plaza with every building, in its order, and keeps the orders given', () => {
    const g = ready({ hordeNumber: 6 });
    const all = sent(g, 'riverside', ['bob']);
    expect(all.patrols[0]).toMatchObject({
      location: 'riverside',
      buildings: ALL,
      focus: 'anything',
      order: 'balanced',
    });
    const some = sent(g, 'riverside', ['bob'], 1, NOW);
    expect(some.patrols[0]!.buildings).toEqual(ALL);
    const r = sendPatrol(g, 'riverside', ['bob'], 1, NOW, {
      buildings: ['hardware', 'gas-station', 'hardware'],
      focus: 'gas',
      order: 'loot',
    });
    if (!r.ok) throw new Error(r.reason);
    // Searched in the plaza's order, each once.
    expect(r.game.patrols[0]).toMatchObject({
      buildings: ['gas-station', 'hardware'],
      focus: 'gas',
      order: 'loot',
    });
  });

  it('refuses no building, a building from elsewhere, a focus nothing ticked can drop and a hidden plaza', () => {
    const g = ready({ hordeNumber: 6 });
    const go = (options: Parameters<typeof sendPatrol>[5], place: PlaceId = 'riverside') =>
      sendPatrol(g, place, ['bob'], 1, NOW, options);
    expect(go({ buildings: [] })).toEqual({ ok: false, reason: 'Tick a building to search' });
    expect(go({ buildings: ['supermarket'] }).ok).toBe(false);
    expect(go({ buildings: ['gas-station', 'electronics'] }).ok).toBe(false);
    // A single location's only building is itself.
    expect(go({ buildings: ['pharmacy'] }, 'gas-station').ok).toBe(false);
    expect(go({ buildings: ['gas-station'] }, 'gas-station').ok).toBe(true);
    // No ticked building drops it: the hardware store has no Gas.
    expect(go({ buildings: ['pharmacy'], focus: 'gas' }).ok).toBe(false);
    expect(go({ buildings: ['pharmacy'], focus: 'medicine' }).ok).toBe(true);
    expect(go({ focus: 'weapons' }).ok).toBe(true); // the hardware store's toolkit
    expect(go({ focus: 'weapons' }, 'strip-mall').ok).toBe(false);
    expect(go({ focus: 'gas' }, 'supermarket').ok).toBe(false);
    expect(sendPatrol(ready(), 'riverside', ['bob'], 1, NOW)).toEqual({
      ok: false,
      reason: "Riverside Plaza isn't on the map yet",
    });
  });

  it('throws for ids the game never offers', () => {
    const g = ready({ hordeNumber: 6 });
    const bad = (o: object, place = 'riverside') =>
      expect(() => sendPatrol(g, place as PlaceId, ['bob'], 1, NOW, o)).toThrow(RangeError);
    bad({ buildings: ['mall'] });
    bad({ focus: 'gold' });
    bad({ order: 'run' });
    bad({}, 'plaza');
    bad({ buildings: ['__proto__'] });
  });
});

describe('big horde chance and odds (D3, D4)', () => {
  it('is 10% + 5% per tier above 1 + 5% per building after the first, never for a single building', () => {
    expect(bigHordeChance('riverside')).toBeCloseTo(0.25);
    expect(bigHordeChance('strip-mall')).toBeCloseTo(0.2);
    expect(bigHordeChance('strip-mall', ['supermarket'])).toBeCloseTo(0.1); // tier 1, one building
    expect(bigHordeChance('strip-mall', ['electronics'])).toBeCloseTo(0.15);
    expect(bigHordeChance('riverside', ['gas-station', 'pharmacy'])).toBeCloseTo(0.2);
    for (const id of LOCATION_IDS) expect(bigHordeChance(id)).toBe(0);
  });

  it('never looks at the party: the same seeds hit whatever its strength', () => {
    const hits = (strength: number) =>
      Array.from(
        { length: 4000 },
        (_, seed) => rollBigHorde(patrolAt('riverside', { strength, seed })) !== null,
      );
    const weak = hits(0);
    expect(hits(5)).toEqual(weak);
    expect(hits(999)).toEqual(weak);
    expect(weak.filter(Boolean).length / 4000).toBeCloseTo(0.25, 1);
    // A single building rolls nothing, and its outcome never mentions one.
    expect(rollBigHorde(patrolAt('hardware', { seed: 3 }))).toBeNull();
    expect(patrolOutcome(patrolAt('hardware', { seed: 3 })).bigHorde).toBeNull();
  });

  it('rates the party against 1.5 x the trip danger and reads the odds off the table', () => {
    expect(hordeStrength('riverside')).toBe(18);
    expect(hordeStrength('riverside', ['gas-station'])).toBe(9);
    const at = (ratio: number) => hordeOdds(ratio * 18, 'riverside');
    expect(at(2)).toEqual({ defeat: 0.7, fence: 0.25, overrun: 0.05 });
    expect(at(1)).toEqual({ defeat: 0.7, fence: 0.25, overrun: 0.05 });
    expect(at(0.99)).toEqual({ defeat: 0.35, fence: 0.45, overrun: 0.2 });
    expect(at(0.6)).toEqual({ defeat: 0.35, fence: 0.45, overrun: 0.2 });
    expect(at(0.59)).toEqual({ defeat: 0.1, fence: 0.4, overrun: 0.5 });
    expect(at(0.3)).toEqual({ defeat: 0.1, fence: 0.4, overrun: 0.5 });
    expect(at(0.29)).toEqual({ defeat: 0, fence: 0.25, overrun: 0.75 });
    expect(at(0)).toEqual({ defeat: 0, fence: 0.25, overrun: 0.75 });
    for (const row of PATROL.horde.odds)
      expect(row.defeat + row.fence + row.overrun).toBeCloseTo(1);
  });

  it('rolls the result at those odds', () => {
    const N = 20_000;
    for (const row of PATROL.horde.odds) {
      const strength = row.from * hordeStrength('riverside');
      const count = { defeat: 0, fence: 0, overrun: 0 };
      let hits = 0;
      for (let seed = 0; seed < N; seed++) {
        const r = rollBigHorde(patrolAt('riverside', { strength, seed }));
        if (!r) continue;
        hits++;
        count[r.result]++;
        expect(r.at).toBeGreaterThanOrEqual(0);
        expect(r.at).toBeLessThan(3);
        expect(r.genes).toBeGreaterThanOrEqual(1);
        expect(r.genes).toBeLessThanOrEqual(2);
      }
      for (const k of ['defeat', 'fence', 'overrun'] as const) {
        expect(count[k] / hits, `${row.from} ${k}`).toBeCloseTo(row[k], 1);
      }
    }
  });

  it('never shifts the loot or the casualty streams, and a late settle comes out the same', () => {
    // The plaza's hardware store rolls what the hardware store does from the same seed.
    for (let seed = 0; seed < 50; seed++) {
      expect(patrolLoot(patrolAt('riverside', { buildings: ['hardware'], seed }))).toEqual(
        patrolLoot(patrolAt('hardware', { seed })),
      );
    }
    // Several buildings roll one after the other from one seed.
    const p = patrolAt('riverside', { seed: 9 });
    const loots = buildingLoots(p);
    expect(loots).toHaveLength(3);
    expect(buildingLoots({ ...p, buildings: ['gas-station'] })[0]).toEqual(loots[0]);
    const seed = seedWhere(p, (o) => o.bigHorde === 'fence' && !o.wiped);
    const g = ready({
      hordeNumber: 6,
      patrols: [{ ...p, seed, members: ['bob', 'jack'] }],
      patrolsSent: 1,
    });
    const due = patrolDue(g.patrols[0]!);
    expect(settlePatrols(g, due + 9 * H)).toEqual(settlePatrols(g, due));
  });
});

describe('loot focus (ID-029)', () => {
  it('lists what the ticked buildings can drop, "Anything" first and the crater\'s "anything" never', () => {
    expect(focusOptions(['gas-station'])).toEqual([
      'anything',
      'scrap',
      'food',
      'gas',
      'batteries',
    ]);
    expect(focusOptions(ALL)).toEqual([
      'anything',
      'scrap',
      'wood',
      'metal',
      'food',
      'medicine',
      'chemicals',
      'gas',
      'batteries',
      'weapons',
    ]);
    expect(focusOptions(['crater'])).toEqual(['anything', 'genes', 'weapons']);
    expect(focusOptions(['pharmacy'])).not.toContain('gas');
  });

  it('doubles the weight of the focused loot', () => {
    // Gas is 30 of 90 at the gas station; favoured it is 60 of 120, so 1.5x the rolls.
    const gas = (focus: Patrol['focus']) => {
      let total = 0;
      for (let seed = 0; seed < 4000; seed++) {
        total += patrolLoot(patrolAt('gas-station', { seed, focus, strength: 0 })).gas;
      }
      return total;
    };
    expect(gas('gas') / gas('anything')).toBeCloseTo(1.5, 1);
    // A focus with nothing to favour changes nothing.
    for (let seed = 0; seed < 30; seed++) {
      expect(patrolLoot(patrolAt('gas-station', { seed, focus: 'medicine' }))).toEqual(
        patrolLoot(patrolAt('gas-station', { seed })),
      );
    }
  });
});

describe('orders (D5)', () => {
  it('keeps 80% / 40% / 0% of the loot and scales deaths and wipes x1.25 / x1 / x0.5 on a Deadly trip', () => {
    expect(ORDERS.loot).toMatchObject({ keep: 0.8, risk: 1.25 });
    expect(ORDERS.balanced).toMatchObject({ keep: 0.4, risk: 1 });
    expect(ORDERS.people).toMatchObject({ keep: 0, risk: 0.5 });
    expect(riskOf(0, 'hardware', undefined, 'loot')).toEqual({
      rating: 'deadly',
      injured: 0.4,
      dead: 0.25,
      wipe: 0.25,
    });
    expect(riskOf(0, 'hardware')).toEqual({ rating: 'deadly', injured: 0.4, dead: 0.2, wipe: 0.2 });
    expect(riskOf(0, 'hardware', undefined, 'people')).toEqual({
      rating: 'deadly',
      injured: 0.4,
      dead: 0.1,
      wipe: 0.1,
    });
  });

  it('scales a Dangerous trip too, and no Safe or Risky one', () => {
    const dangerous = 0.3 * locationDanger('hardware');
    expect(riskOf(dangerous, 'hardware', undefined, 'loot')).toMatchObject({
      dead: 0.125,
      wipe: 0.0625,
    });
    expect(riskOf(dangerous, 'hardware', undefined, 'people')).toMatchObject({
      dead: 0.05,
      wipe: 0.025,
    });
    for (const strength of [locationDanger('hardware'), 0.6 * locationDanger('hardware')]) {
      for (const order of ['loot', 'balanced', 'people'] as const) {
        expect(riskOf(strength, 'hardware', undefined, order)).toEqual(
          riskOf(strength, 'hardware'),
        );
      }
    }
    expect(patrolRisk([], 'hardware', undefined, 'loot')).toEqual(
      riskOf(0, 'hardware', undefined, 'loot'),
    );
  });

  it("cuts the loot of a Dangerous trip that lost someone to the order's share, rounded down", () => {
    for (const order of ['loot', 'balanced', 'people'] as const) {
      const p = patrolAt('electronics', { members: ['bob', 'jack', 'john'], strength: 1, order });
      const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 1);
      const back = settlePatrols(ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }), NOW + H);
      const haul = patrolLoot({ ...p, seed });
      const r = back.reports[0]!;
      for (const m of MATERIALS)
        expect(r.stock[m], `${order} ${m}`).toBe(kept(haul.stock[m], ORDERS[order].keep));
      expect(r.weapons).toHaveLength(kept(haul.weapons.length, ORDERS[order].keep));
      // What the cut dropped is reported.
      for (const m of MATERIALS) expect(r.lost.stock[m] + r.stock[m]).toBe(haul.stock[m]);
      expect(r.lost.weapons + r.weapons.length).toBe(haul.weapons.length);
    }
  });

  it('keeps all of the loot when nobody died, whatever the order', () => {
    for (const order of ['loot', 'people'] as const) {
      const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 1, order });
      const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 0);
      const back = settlePatrols(ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }), NOW + H);
      expect(back.reports[0]!.stock).toEqual(patrolLoot({ ...p, seed }).stock);
      expect(back.reports[0]!.lost.weapons).toBe(0);
    }
  });

  it('brings no loot when half the party or more is dead, or all of it, whatever the order', () => {
    for (const order of ['loot', 'balanced', 'people'] as const) {
      const two = patrolAt('electronics', { members: ['bob', 'jack'], strength: 1, order });
      const half = seedWhere(two, (o) => !o.wiped && o.dead.length === 1);
      let back = settlePatrols(
        ready({ patrols: [{ ...two, seed: half }], patrolsSent: 1 }),
        NOW + H,
      );
      expect(back.reports[0]!.stock).toEqual(stockOf());
      expect(back.reports[0]!.weapons).toEqual([]);
      expect(back.reports[0]!.xp).toBeGreaterThan(0); // the survivor still earns it
      const wipe = seedWhere(two, (o) => o.wiped);
      back = settlePatrols(ready({ patrols: [{ ...two, seed: wipe }], patrolsSent: 1 }), NOW + H);
      expect(back.reports[0]).toMatchObject({ wiped: true, xp: 0 });
      expect(back.stock).toEqual(ready().stock);
    }
  });

  it("does not cut a Risky trip's loot for a light loss, since only a Dangerous or Deadly one goes wrong", () => {
    // A Risky death of one in three is light: no cut, since a Risky trip never goes wrong.
    const p = patrolAt('gas-station', { members: ['bob', 'jack', 'john'], strength: 3.6 });
    const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 1);
    const back = settlePatrols(ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }), NOW + H);
    expect(back.reports[0]!.stock).toEqual(patrolLoot({ ...p, seed }).stock);
  });
});

describe('big horde results (D4)', () => {
  /** A Safe trip to Riverside, so only the horde can hurt, with party strength `ratio` of the horde's. */
  const plaza = (ratio: number, patch: Partial<Patrol> = {}): Patrol =>
    patrolAt('riverside', {
      members: ['bob', 'jack'],
      strength: ratio * hordeStrength('riverside'),
      sentHorde: 6,
      ...patch,
    });
  const settle = (p: Patrol) =>
    settlePatrols(ready({ hordeNumber: 6, patrols: [p], patrolsSent: 1 }), patrolDue(p));

  it("works out each result's casualties from the trip rating, doubling injuries when fenced off, and the Deadly row when overrun", () => {
    const strong = 999;
    const c = (
      r: 'defeat' | 'fence' | 'overrun',
      order: 'loot' | 'balanced' | 'people' = 'balanced',
    ) => hordeCasualties(r, strong, 'riverside', undefined, order);
    expect(c('defeat')).toEqual({ injured: 0.05, dead: 0, wipe: 0 });
    expect(c('fence')).toEqual({ injured: 0.1, dead: 0, wipe: 0 });
    expect(c('overrun')).toEqual({ injured: 0.4, dead: 0.2, wipe: 0.2 });
    // On any big horde the order applies, Safe trip or not.
    expect(c('overrun', 'loot')).toEqual({ injured: 0.4, dead: 0.25, wipe: 0.25 });
    expect(c('overrun', 'people')).toEqual({ injured: 0.4, dead: 0.1, wipe: 0.1 });
    // A weaker party's beaten horde is rated as its trip is.
    const deadly = hordeCasualties('defeat', 0, 'riverside', undefined, 'loot');
    expect(deadly).toEqual({ injured: 0.4, dead: 0.25, wipe: 0.25 });
    expect(hordeCasualties('fence', 0, 'riverside', undefined, 'balanced').injured).toBe(0.8);
  });

  it('beaten: searches every building, +50% XP and 1-2 Mutated Genes', () => {
    const p = plaza(1);
    const seed = seedWhere(p, (o) => o.bigHorde === 'defeat' && !o.wiped && o.dead.length === 0);
    const back = settle({ ...p, seed });
    const r = back.reports[0]!;
    expect(r).toMatchObject({ bigHorde: 'defeat', searched: 3, buildings: ALL });
    expect(r.stock.genes).toBeGreaterThanOrEqual(1);
    expect(r.stock.genes).toBeLessThanOrEqual(2);
    expect(r.xp).toBe(Math.floor(patrolXp('riverside', 6) * 1.5));
    const haul = patrolLoot({ ...p, seed });
    expect(r.stock).toEqual({ ...haul.stock, genes: r.stock.genes });
    expect(back.stock.genes).toBe(r.stock.genes);
    expect(r.lost.weapons).toBe(0);
  });

  it("fenced off: keeps the loot of the buildings before the horde, cut to the order's share, and the trip still ends on time", () => {
    for (const order of ['loot', 'balanced', 'people'] as const) {
      const p = plaza(0.8, { order });
      const seed = seedWhere(
        p,
        (o) => o.bigHorde === 'fence' && o.searched === 2 && !o.wiped && o.dead.length === 0,
      );
      const r = settle({ ...p, seed }).reports[0]!;
      expect(r).toMatchObject({ bigHorde: 'fence', searched: 2, order });
      const loots = buildingLoots({ ...p, seed });
      const before = loots.slice(0, 2);
      for (const m of MATERIALS) {
        const found = before.reduce((n, l) => n + l.stock[m], 0);
        const all = loots.reduce((n, l) => n + l.stock[m], 0);
        // Nobody died (the seed is pinned so), so this is the fence's cut alone.
        expect(r.stock[m], `${order} ${m}`).toBe(kept(found, ORDERS[order].keep));
        expect(r.lost.stock[m]).toBe(all - kept(found, ORDERS[order].keep));
      }
      expect(r.returnedAt).toBe(patrolDue(p));
    }
  });

  it('fenced off before the first building: nothing found, nothing kept', () => {
    const p = plaza(0.8);
    const seed = seedWhere(p, (o) => o.bigHorde === 'fence' && o.searched === 0 && !o.wiped);
    const r = settle({ ...p, seed }).reports[0]!;
    expect(r.searched).toBe(0);
    expect(r.stock).toEqual(stockOf());
    expect(r.weapons).toEqual([]);
    expect(r.xp).toBe(patrolXp('riverside', 6));
  });

  it('overrun: loot of the buildings before the horde, cut by the order, at the Deadly row', () => {
    const p = plaza(0, { members: ['bob', 'jack', 'john'] });
    const seed = seedWhere(
      p,
      (o) => o.bigHorde === 'overrun' && o.searched === 2 && !o.wiped && o.dead.length === 0,
    );
    const r = settle({ ...p, seed }).reports[0]!;
    expect(r).toMatchObject({ bigHorde: 'overrun', searched: 2 });
    const loots = buildingLoots({ ...p, seed });
    for (const m of MATERIALS) {
      const found = loots[0]!.stock[m] + loots[1]!.stock[m];
      expect(r.stock[m], m).toBe(kept(found, 0.4));
    }
    // The wipe runs at the Deadly row's 20% over 6000 seeds.
    let rolled = 0;
    let wipes = 0;
    const N = 6000;
    for (let sd = 0; sd < N; sd++) {
      const o = patrolOutcome({ ...p, seed: sd });
      if (o.bigHorde !== 'overrun') continue;
      rolled++;
      if (o.wiped) wipes++;
    }
    expect(wipes / rolled).toBeCloseTo(0.2, 1);
  });

  it('a big horde that kills half the party or more brings no loot, the genes included', () => {
    const p = plaza(0, { members: ['bob', 'jack'] });
    const seed = seedWhere(p, (o) => o.bigHorde === 'overrun' && !o.wiped && o.dead.length === 1);
    const r = settle({ ...p, seed }).reports[0]!;
    expect(r.stock).toEqual(stockOf());
    expect(r.weapons).toEqual([]);
    const beaten = plaza(0.3, { members: ['bob', 'jack'] });
    const s2 = seedWhere(beaten, (o) => o.bigHorde === 'defeat' && !o.wiped && o.dead.length === 1);
    const r2 = settle({ ...beaten, seed: s2 }).reports[0]!;
    expect(r2.stock.genes).toBe(0);
    expect(r2.lost.stock.genes).toBeGreaterThanOrEqual(1);
  });

  it('a wipe in a big horde brings nothing', () => {
    const p = plaza(0, { members: ['bob', 'jack'] });
    const seed = seedWhere(p, (o) => o.bigHorde !== null && o.wiped);
    const r = settle({ ...p, seed }).reports[0]!;
    expect(r).toMatchObject({ wiped: true, xp: 0, weapons: [] });
    expect(r.stock).toEqual(stockOf());
  });

  it('is not a thing for a single building, whatever the party', () => {
    for (let seed = 0; seed < 500; seed++) {
      const o = patrolOutcome(
        patrolAt('hardware', { seed, strength: 0, members: ['a', 'b', 'c'] }),
      );
      expect(o.bigHorde).toBeNull();
      expect(o.searched).toBe(1);
      expect(o.genes).toBe(0);
    }
  });

  it('brings home what the fallen left at a plaza, with the next party there', () => {
    const left = [{ location: 'riverside' as const, weapon: GUN }];
    const p = plaza(2, { members: ['jack'] });
    const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 0);
    const back = settlePatrols(
      ready({ hordeNumber: 6, patrols: [{ ...p, seed }], patrolsSent: 1, leftBehind: left }),
      patrolDue(p),
    );
    expect(back.reports[0]!.recovered).toEqual([{ base: 'pistol', rarity: 'rusty', kept: true }]);
    expect(back.leftBehind).toEqual([]);
    expect(PLACE_IDS).toContain('riverside');
  });
});

describe('single-building loot is the loot of before ID-029 (golden)', () => {
  // Hauls worked out by origin/main's patrolLoot (0.4.36) for these seeds.
  const zero = stockOf();
  const none = { makeshift: 0, standard: 0, 'high-capacity': 0, military: 0 };
  const cases: [PlaceId, number, number, object][] = [
    [
      'gas-station',
      12345,
      3.6,
      {
        stock: { ...zero, scrap: 4, food: 2 },
        gas: 0,
        batteries: { ...none, makeshift: 2 },
        weapons: [],
      },
    ],
    [
      'hardware',
      777,
      9,
      { stock: { ...zero, wood: 21, metal: 7 }, gas: 0, batteries: none, weapons: [] },
    ],
    [
      'crater',
      4242,
      40,
      {
        stock: { ...zero, genes: 11 },
        gas: 0,
        batteries: none,
        weapons: [
          { base: 'smg', rarity: 'relic' },
          { base: 'smg', rarity: 'prototype' },
          { base: 'lmg', rarity: 'prototype' },
        ],
      },
    ],
    [
      'police',
      31,
      12,
      {
        stock: zero,
        gas: 0,
        batteries: none,
        weapons: [
          { base: 'smg', rarity: 'prototype' },
          { base: 'shotgun', rarity: 'rusty' },
          { base: 'shotgun', rarity: 'common' },
          { base: 'shotgun', rarity: 'prototype' },
        ],
      },
    ],
  ];
  it.each(cases)('%s, seed %i, strength %f', (place, seed, strength, haul) => {
    expect(patrolLoot(patrolAt(place, { seed, strength }))).toEqual(haul);
  });
});
