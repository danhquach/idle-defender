import { describe, expect, it } from 'vitest';
import { buildCar, MAX_FORAGING } from './camp.ts';
import {
  buildingsOf,
  CAMP_PICK_RANKS,
  CAR,
  isPlaza,
  LOCATIONS,
  PATROL,
  PLACE_IDS,
  stockOf,
  type LocationId,
  type PlaceId,
} from './data.ts';
import { newGame, type GameState } from './game.ts';
import {
  carGas,
  focusOptions,
  freeCar,
  mostGas,
  patrolDue,
  sendPatrol,
  settlePatrols,
  tripOf,
  type Patrol,
} from './patrol.ts';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

/** A game at Horde 3 (patrols open) with a fourth defender, Dan, `cars` built and `gas` in the camp. */
function camp(cars = 1, gas = 100): GameState {
  const g = newGame();
  return {
    ...g,
    hordeNumber: PATROL.unlock,
    roster: [...g.roster, { ...g.roster[0]!, id: 'dan', name: 'Dan' }],
    power: { ...g.power, gas },
    camp: { ...g.camp, cars },
  };
}

function send(game: GameState, place: PlaceId, ids: string[], car = true, seed = 1, now = NOW) {
  const r = sendPatrol(game, place, ids, seed, now, { car });
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

/** Every non-empty set of a place's buildings, in its order. */
function tickings(place: PlaceId): LocationId[][] {
  const all = buildingsOf(place);
  const sets: LocationId[][] = [];
  for (let mask = 1; mask < 1 << all.length; mask++) {
    sets.push(all.filter((_, i) => mask & (1 << i)));
  }
  return sets;
}

describe('building the car (ID-030)', () => {
  it('costs 40 Metal, 20 Parts and 30 Scrap, and the first needs no research', () => {
    const g = { ...newGame(), stock: stockOf({ metal: 50, parts: 25, scrap: 35 }) };
    const r = buildCar(g);
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.camp.cars).toBe(1);
    expect(r.game.stock).toMatchObject({ metal: 10, parts: 5, scrap: 5 });
    expect(r.game.research).toEqual([]);
    expect(g.camp.cars).toBe(0);
  });

  it('is built once: more come from research (ID-035)', () => {
    const g = { ...newGame(), stock: stockOf({ metal: 500, parts: 500, scrap: 500 }) };
    const r = buildCar(g);
    if (!r.ok) throw new Error(r.reason);
    expect(buildCar(r.game)).toEqual({ ok: false, reason: 'More cars come with research' });
  });

  it('is refused short of materials, naming one', () => {
    const g = { ...newGame(), stock: stockOf({ metal: 40, parts: 19, scrap: 30 }) };
    expect(buildCar(g)).toEqual({ ok: false, reason: 'Not enough parts', short: true });
  });

  it('starts a new game with no car', () => {
    expect(newGame().camp.cars).toBe(0);
    expect(freeCar(newGame())).toBeNull();
  });
});

describe('a patrol by car (ID-030)', () => {
  it('halves travel each way, rounded up to whole minutes; the search is unchanged', () => {
    // The gas station: 5 each way, 5 searching.
    expect(tripOf('gas-station', undefined, true)).toEqual({
      travel: 3,
      search: 5,
      tier: 1,
      minutes: 11,
    });
    // The supermarket: 7 → 4 each way.
    expect(tripOf('supermarket', undefined, true).minutes).toBe(4 + 6 + 4);
    // Riverside: the longest travel, 20 → 10 each way, 45 searching.
    expect(tripOf('riverside', undefined, true)).toMatchObject({ travel: 10, search: 45 });
    for (const place of PLACE_IDS) {
      const foot = tripOf(place);
      const car = tripOf(place, undefined, true);
      expect(car.travel).toBe(Math.ceil(foot.travel / 2));
      expect(car.search).toBe(foot.search);
      expect(car.tier).toBe(foot.tier);
    }
  });

  it('is back after the trip by car', () => {
    const g = send(camp(), 'electronics', ['bob']);
    const p = g.patrols[0]!;
    expect(p.car).toBe(0);
    // 15 → 8 each way, 15 searching.
    expect(patrolDue(p)).toBe(NOW + 31 * MIN);
    expect(settlePatrols(g, NOW + 31 * MIN - 1).patrols).toHaveLength(1);
    expect(settlePatrols(g, NOW + 31 * MIN).patrols).toHaveLength(0);
  });

  it('goes on foot by default, and never takes the car without being asked', () => {
    const g = send(camp(), 'electronics', ['bob'], false);
    expect(g.patrols[0]!.car).toBeNull();
    expect(g.power.gas).toBe(100);
    expect(patrolDue(g.patrols[0]!)).toBe(NOW + 45 * MIN);
    expect(freeCar(g)).toBe(0);
  });

  it('pays 1 Gas per 10 minutes of the round trip by car when it leaves, rounded up', () => {
    // Electronics by car is 31 minutes: 4 Gas; it can find no Gas.
    expect(carGas('electronics')).toBe(4);
    expect(send(camp(), 'electronics', ['bob']).power.gas).toBe(96);
    // The crater by car: 80 + 160 + 80 = 320 minutes, 32 Gas.
    expect(carGas('crater')).toBe(32);
    for (const place of PLACE_IDS) {
      for (const b of tickings(place)) {
        expect(carGas(place, b)).toBeGreaterThanOrEqual(
          Math.ceil(tripOf(place, b, true).minutes / CAR.gasPer),
        );
      }
    }
  });

  it('pays at least the most Gas the trip could bring home', () => {
    // 5 rolls at most, 2 Gas each, +25% Foraging: 12.5, rounded to 13.
    expect(MAX_FORAGING).toBe(25);
    expect(mostGas('gas-station')).toBe(13);
    expect(carGas('gas-station')).toBe(13);
    expect(carGas('riverside', ['pharmacy', 'hardware'])).toBe(
      Math.ceil(tripOf('riverside', ['pharmacy', 'hardware'], true).minutes / CAR.gasPer),
    );
    expect(carGas('riverside')).toBe(13);
  });

  it('refuses without enough Gas, naming what the car needs', () => {
    const g = camp(1, 3);
    expect(sendPatrol(g, 'electronics', ['bob'], 1, NOW, { car: true })).toEqual({
      ok: false,
      reason: 'Not enough Gas: the car needs 4, the camp has 3',
    });
    // Exactly enough is enough.
    expect(send(camp(1, 4), 'electronics', ['bob']).power.gas).toBe(0);
  });

  it('refuses the car with none built', () => {
    expect(sendPatrol(camp(0), 'electronics', ['bob'], 1, NOW, { car: true })).toEqual({
      ok: false,
      reason: 'Build a car first',
    });
  });

  it('runs one patrol at a time: busy until that patrol is back, whenever it is settled', () => {
    const g = send(camp(), 'electronics', ['bob']);
    expect(freeCar(g)).toBeNull();
    expect(sendPatrol(g, 'gas-station', ['jack'], 2, NOW + MIN, { car: true })).toEqual({
      ok: false,
      reason: 'The car is out on patrol',
    });
    // Another party still goes on foot.
    expect(send(g, 'gas-station', ['jack'], false, 2, NOW + MIN).patrols).toHaveLength(2);
    // Still out a minute before it is back, free the moment it is; a late settle (the game
    // was closed) frees it too.
    expect(freeCar(settlePatrols(g, NOW + 30 * MIN))).toBeNull();
    expect(freeCar(settlePatrols(g, NOW + 31 * MIN))).toBe(0);
    const late = settlePatrols(g, NOW + 3 * 24 * 60 * MIN);
    expect(freeCar(late)).toBe(0);
    expect(
      send(late, 'gas-station', ['jack'], true, 3, NOW + 3 * 24 * 60 * MIN).patrols[0]!.car,
    ).toBe(0);
  });

  it('is never lost, even when the patrol is wiped', () => {
    // A weak party at the crater: find a seed that wipes it.
    let wiped: GameState | null = null;
    for (let seed = 1; seed < 500 && !wiped; seed++) {
      const g: GameState = {
        ...camp(),
        hordeNumber: 50,
        patrols: [
          {
            no: 1,
            location: 'crater',
            buildings: ['crater'],
            focus: 'anything',
            order: 'balanced',
            members: ['bob'],
            sentAt: NOW,
            sentHorde: PATROL.unlock,
            strength: 0,
            seed,
            car: 0,
          },
        ],
        patrolsSent: 1,
      };
      const after = settlePatrols(g, NOW + 24 * 60 * MIN);
      if (after.reports[0]!.wiped) wiped = after;
    }
    if (!wiped) throw new Error('no seed wipes the party');
    expect(wiped.camp.cars).toBe(1);
    expect(wiped.patrols).toHaveLength(0);
    expect(freeCar(wiped)).toBe(0);
  });

  it('brings the same loot as on foot: the car changes the clock and the Gas, nothing else', () => {
    const foot = send(camp(), 'gas-station', ['bob'], false, 7);
    const car = send(camp(), 'gas-station', ['bob'], true, 7);
    const a = settlePatrols(foot, NOW + 15 * MIN).reports[0]!;
    const b = settlePatrols(car, NOW + 11 * MIN).reports[0]!;
    expect({ ...b, returnedAt: 0 }).toEqual({ ...a, returnedAt: 0 });
  });
});

describe('car balance (ID-030): a car trip never brings back more Gas than it burns', () => {
  /** A strong party (every bonus roll) with Foraging at its top rank, out by car. */
  function strong(place: PlaceId, buildings: LocationId[], focus: Patrol['focus'], seed: number) {
    const g = camp();
    const p: Patrol = {
      no: 1,
      location: place,
      buildings,
      focus,
      order: 'balanced',
      members: ['bob'],
      sentAt: NOW,
      sentHorde: PATROL.unlock,
      strength: 1000,
      seed,
      car: 0,
    };
    return settlePatrols(
      {
        ...g,
        camp: { ...g.camp, picks: { ...g.camp.picks, foraging: CAMP_PICK_RANKS } },
        patrols: [p],
        patrolsSent: 1,
      },
      NOW + 24 * 60 * MIN,
    ).reports[0]!;
  }

  it('covers every location and plaza, every set of buildings, at any loot focus', () => {
    let most = 0;
    for (const place of PLACE_IDS) {
      for (const buildings of tickings(place)) {
        const burn = carGas(place, buildings);
        for (const focus of focusOptions(buildings)) {
          for (let seed = 1; seed <= 60; seed++) {
            const gas = strong(place, buildings, focus, seed).gas;
            most = Math.max(most, gas);
            expect(
              gas,
              `${place} ${buildings.join('+')} ${focus} seed ${seed}`,
            ).toBeLessThanOrEqual(burn);
          }
        }
      }
    }
    // The check is not empty: car trips do find Gas.
    expect(most).toBeGreaterThan(5);
  });

  it('bounds every roll: the most Gas a trip could find is never more than it burns', () => {
    for (const place of PLACE_IDS) {
      for (const buildings of tickings(place)) {
        // Every roll a party can make finding the most Gas any line of its table gives.
        const rolls = PATROL.rolls + PATROL.bonusRolls;
        const perRoll = (b: LocationId): number =>
          Math.max(
            0,
            ...LOCATIONS[b].loot.map((e) => (e.kind === 'gas' ? e.max : 0)),
            // The crater's "anything" may land on any other table's Gas.
            ...(LOCATIONS[b].loot.some((e) => e.kind === 'anything')
              ? Object.values(LOCATIONS).flatMap((l) =>
                  l.loot.map((e) => (e.kind === 'gas' ? e.max : 0)),
                )
              : []),
          );
        const found = buildings.reduce((sum, b) => sum + rolls * perRoll(b), 0);
        const home = Math.round((found * (100 + MAX_FORAGING)) / 100);
        expect(home, `${place} ${buildings.join('+')}`).toBeLessThanOrEqual(
          carGas(place, buildings),
        );
      }
    }
    expect(PLACE_IDS.some(isPlaza)).toBe(true);
  });
});
