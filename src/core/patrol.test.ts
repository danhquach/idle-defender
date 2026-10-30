import { describe, expect, it } from 'vitest';
import {
  ARMOURY_CAP,
  LOCATION_IDS,
  LOCATIONS,
  MATERIALS,
  MAX_COUNT,
  PATROL,
  RARITY_ORDER,
  RECOVERY_MS,
  WEAPONS,
  type LocationId,
} from './data.ts';
import { equip, hordeXp, newGame, startHorde, type GameState } from './game.ts';
import {
  bonusRolls,
  hasGate,
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
  riskOf,
  sendPatrol,
  settlePatrols,
  tripMinutes,
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

function sent(game: GameState, location: LocationId, ids: string[], seed = 1, now = NOW) {
  const r = sendPatrol(game, location, ids, seed, now);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

const patrolAt = (location: LocationId, patch: Partial<Patrol> = {}): Patrol => ({
  no: 1,
  location,
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

  it('rolls casualties on their own stream: the survivors bring the loot of ID-026', () => {
    const p = patrolAt('electronics', { members: ['bob', 'jack'], strength: 1 });
    const seed = seedWhere(p, (o) => !o.wiped && o.dead.length === 1);
    const back = settlePatrols(
      ready({ patrols: [{ ...p, seed }], patrolsSent: 1 }),
      NOW + 60 * MIN,
    );
    const haul = patrolLoot({ ...p, seed });
    expect(back.reports[0]!.stock).toEqual(haul.stock);
    expect(back.reports[0]!.weapons.map(({ base, rarity }) => ({ base, rarity }))).toEqual(
      haul.weapons,
    );
    expect(patrolOutcome({ ...p, seed })).toEqual(patrolOutcome({ ...p, seed }));
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
