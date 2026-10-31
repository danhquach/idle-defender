// Patrols (design §10, as built ID-026): a party of idle defenders leaves by a gate for a
// location on the world map, searches it and comes back in real time, so a patrol
// finishes while the game is closed. Its loot is rolled from the seed it left with, so
// the result never depends on when it is settled. Pure: real time comes in as `now`.
// Risk (ID-027): party strength against the location's danger rates the trip, and the
// same seed rolls who comes back injured, who dies and whether the party is wiped out.
// Plazas and orders (ID-029): a trip searches the ticked buildings of a place; a plaza may
// draw a big horde; the order says what the party protects when things go wrong.
import { isOwned, rollWeapon, type OwnedWeapon } from './armoury.ts';
import { lootBonus, recoveryMs, startFloor } from './camp.ts';
import {
  ARMOURY_CAP,
  BATTERY_IDS,
  buildingsOf,
  FOCUS_IDS,
  focusOf,
  isPlaza,
  LOCATION_IDS,
  LOCATIONS,
  MATERIALS,
  MAX_COUNT,
  ORDER_IDS,
  ORDERS,
  PATROL,
  PLACE_IDS,
  placeName,
  RARITIES,
  RARITY_ORDER,
  revealOf,
  stockOf,
  type Battery,
  type Focus,
  type LocationId,
  type LootEntry,
  type Order,
  type PlaceId,
  type Rarity,
  type RiskRating,
  type Stock,
  type WeaponId,
} from './data.ts';
import {
  available,
  hordeXp,
  onPatrol,
  ownedWeapons,
  type GameState,
  type RosterDefender,
} from './game.ts';
import { loadBatteries } from './power.ts';
import { chance, createRng, int, pick, type Rng } from './rng.ts';
import { levelOf } from './stats.ts';

/** A party out on patrol. */
export interface Patrol {
  /** 1 for the game's first patrol, then up by one; owned weapons it finds are `p<no>-<k>`. */
  no: number;
  /** The place it went to: a location, or a plaza. */
  location: PlaceId;
  /** The buildings ticked, in the place's order (a single location's only building is itself). */
  buildings: LocationId[];
  focus: Focus;
  order: Order;
  /** Roster ids, in the order sent. */
  members: string[];
  /** When it left (ms). */
  sentAt: number;
  /** The horde number when it left; its XP is worked out from it. */
  sentHorde: number;
  /** Party strength when it left (`partyStrength`). */
  strength: number;
  seed: number;
}

/** An owned weapon a dead member left at `location`, waiting for the next patrol there. */
export interface LeftWeapon {
  location: PlaceId;
  weapon: OwnedWeapon;
}

/** A found weapon as the report lists it: kept in the armoury, or salvaged for Scrap. */
export interface ReportWeapon {
  base: WeaponId;
  rarity: Rarity;
  kept: boolean;
}

/** How a plaza's big horde ended (ID-029): the patrol beat it, fenced it off, or was overrun. */
export type BigHorde = 'defeat' | 'fence' | 'overrun';

/** Loot the retreat dropped: what a big horde or a bad fight kept from the camp. */
export interface Lost {
  stock: Stock;
  gas: number;
  batteries: Record<Battery, number>;
  weapons: number;
}

/** What a patrol brought back (design §10 "patrol report"), for the world map screen (ID-028). */
export interface PatrolReport {
  no: number;
  location: PlaceId;
  /** The buildings ticked, and how many of them (from the first) were searched before a retreat. */
  buildings: LocationId[];
  searched: number;
  bigHorde: BigHorde | null;
  order: Order;
  focus: Focus;
  /** What the retreat dropped; all zero without one. */
  lost: Lost;
  /** Every member sent, in the order sent. */
  names: string[];
  /** Members who came back injured, and who didn't come back, by name. */
  injured: string[];
  dead: string[];
  /** The whole party was lost: no loot, no XP. */
  wiped: boolean;
  returnedAt: number;
  /** Materials, including the Scrap salvaged from weapons with no room. */
  stock: Stock;
  gas: number;
  batteries: Record<Battery, number>;
  weapons: ReportWeapon[];
  /** Weapons the dead had left at the location, picked up on this trip. */
  recovered: ReportWeapon[];
  /** XP each member who came back got. */
  xp: number;
}

/** Free to send at `now`: fit and not out on patrol. */
export const idle = (game: GameState, d: RosterDefender, now: number): boolean =>
  available(d, now) && !onPatrol(game, d.id);

/** Whether patrols can be sent yet (design §11 Start: after Horde 2). */
export const patrolsUnlocked = (game: GameState): boolean => game.hordeNumber >= PATROL.unlock;

/** Locations on the map at the game's horde number, in table order. */
export function revealedLocations(game: GameState): LocationId[] {
  return LOCATION_IDS.filter((id) => {
    const at = LOCATIONS[id].reveal;
    return at !== null && game.hordeNumber >= at;
  });
}

/** Places on the map: the revealed locations, then the revealed plazas (ID-029). */
export function revealedPlaces(game: GameState): PlaceId[] {
  return PLACE_IDS.filter((id) => {
    const at = revealOf(id);
    return at !== null && game.hordeNumber >= at;
  });
}

/** A patrol leaves by a gate: the base needs one standing (HP above 0). */
export const hasGate = (game: GameState): boolean =>
  game.base.layers.some((l) => l.slots.some((s) => s?.kind === 'gate' && s.hp > 0));

/** A trip to ticked buildings (design §10, ID-029): the longest travel, the searches added up, the highest tier. */
export interface Trip {
  /** Minutes each way, and minutes searching. */
  travel: number;
  search: number;
  tier: number;
  /** Total minutes out, searching and back. */
  minutes: number;
}

/** The trip to `buildings` of `place` (all of them by default); a single location is a place whose only building is itself. */
export function tripOf(
  place: PlaceId,
  buildings: readonly LocationId[] = buildingsOf(place),
): Trip {
  if (buildings.length === 0) throw new RangeError('tripOf: no building');
  const ls = buildings.map((b) => LOCATIONS[b]);
  const travel = Math.max(...ls.map((l) => l.travel));
  const search = ls.reduce((sum, l) => sum + l.search, 0);
  return { travel, search, tier: Math.max(...ls.map((l) => l.tier)), minutes: 2 * travel + search };
}

/** Total minutes out, searching and back. */
export const tripMinutes = (place: PlaceId, buildings?: readonly LocationId[]): number =>
  tripOf(place, buildings).minutes;

/** When patrol `p` is back (ms). */
export const patrolDue = (p: Patrol): number =>
  p.sentAt + tripMinutes(p.location, p.buildings) * 60_000;

/** One member's strength: level, the rarity power of the primary weapon, and Grit. */
export function memberStrength(d: Pick<RosterDefender, 'xp' | 'stats' | 'loadout'>): number {
  const w = d.loadout.primary;
  const rarity: Rarity = isOwned(w) ? w.rarity : 'rusty';
  return levelOf(d.xp).level + RARITIES[rarity].power + d.stats.grit;
}

/** Party strength (design §10): the members' strengths added up. */
export const partyStrength = (
  members: readonly Pick<RosterDefender, 'xp' | 'stats' | 'loadout'>[],
): number => members.reduce((sum, d) => sum + memberStrength(d), 0);

/** The party strength that matches a trip of `tier` (design §10 Risk and reward). */
export const tierDanger = (tier: number): number => PATROL.danger * PATROL.need * tier;

/** The party strength that matches `place`'s danger: its highest tier. */
export const locationDanger = (place: PlaceId): number => tierDanger(tripOf(place).tier);

/** A trip's rating and odds: each member's chance to be injured or killed, and the party's to be wiped out. */
export interface PatrolRisk {
  rating: RiskRating;
  injured: number;
  dead: number;
  wipe: number;
}

/** Death and wipe odds under `order` (ID-029): scaled by its factor, at most 1. */
function ordered(
  r: { injured: number; dead: number; wipe: number },
  order: Order,
): { injured: number; dead: number; wipe: number } {
  const f = ORDERS[order].risk;
  return { injured: r.injured, dead: Math.min(1, r.dead * f), wipe: Math.min(1, r.wipe * f) };
}

/** The `PATROL.risk` row a party of `strength` falls in on a trip of `tier`. */
function ratingRow(strength: number, tier: number): (typeof PATROL.risk)[number] {
  const ratio = strength / tierDanger(tier);
  // The last rating starts at 0, so every strength finds one (NaN rates the worst).
  return PATROL.risk.find((r) => ratio >= r.from) ?? PATROL.risk.at(-1)!;
}

/** Whether the order applies to an ordinary trip: only Dangerous and Deadly ones go wrong. */
const goesWrong = (rating: RiskRating): boolean => rating === 'dangerous' || rating === 'deadly';

/**
 * The risk for a party of `strength` at `place`'s `buildings`: on a Dangerous or Deadly
 * trip the deaths and wipe are scaled by `order` (ID-029).
 */
export function riskOf(
  strength: number,
  place: PlaceId,
  buildings?: readonly LocationId[],
  order: Order = 'balanced',
): PatrolRisk {
  const row = ratingRow(strength, tripOf(place, buildings).tier);
  const { injured, dead, wipe } = goesWrong(row.rating) ? ordered(row, order) : row;
  return { rating: row.rating, injured, dead, wipe };
}

/** The risk `members` would run at `place`, for the risk screen (ID-028). */
export const patrolRisk = (
  members: readonly Pick<RosterDefender, 'xp' | 'stats' | 'loadout'>[],
  place: PlaceId,
  buildings?: readonly LocationId[],
  order?: Order,
): PatrolRisk => riskOf(partyStrength(members), place, buildings, order);

/** Loot rolls past the base `PATROL.rolls`: one per `need × tier` of strength, at most `bonusRolls`. */
export function bonusRolls(
  strength: number,
  place: PlaceId,
  buildings?: readonly LocationId[],
): number {
  const per = PATROL.need * tripOf(place, buildings).tier;
  return Math.min(PATROL.bonusRolls, Math.floor(strength / per));
}

/** XP each member gets (design §10): a horde win's, times hours out, times the danger. */
export function patrolXp(
  place: PlaceId,
  sentHorde: number,
  buildings?: readonly LocationId[],
): number {
  const trip = tripOf(place, buildings);
  const danger = 1 + PATROL.xpDanger * (trip.tier - 1);
  return Math.floor(hordeXp(sentHorde) * (trip.minutes / 60) * danger);
}

/** A plaza's chance of a big horde (design §10, ID-029): a property of the place, never of the party; single buildings have none. */
export function bigHordeChance(place: PlaceId, buildings?: readonly LocationId[]): number {
  if (!isPlaza(place)) return 0;
  const trip = tripOf(place, buildings);
  const n = (buildings ?? buildingsOf(place)).length;
  const h = PATROL.horde;
  return Math.min(1, h.chance + h.perTier * (trip.tier - 1) + h.perBuilding * (n - 1));
}

/** The big horde's strength: 1.5 × the danger of the trip's tier. */
export const hordeStrength = (place: PlaceId, buildings?: readonly LocationId[]): number =>
  PATROL.horde.strength * tierDanger(tripOf(place, buildings).tier);

/** The odds of each way a big horde can end, for a party of `strength` against it. */
export function hordeOdds(
  strength: number,
  place: PlaceId,
  buildings?: readonly LocationId[],
): { defeat: number; fence: number; overrun: number } {
  const ratio = strength / hordeStrength(place, buildings);
  const { defeat, fence, overrun } =
    PATROL.horde.odds.find((r) => ratio >= r.from) ?? PATROL.horde.odds.at(-1)!;
  return { defeat, fence, overrun };
}

/**
 * The casualty odds when a big horde ends as `result` (ID-029), always scaled by `order`:
 * beaten, the trip's rating; fenced off, that with injuries doubled; overrun, the Deadly row.
 */
export function hordeCasualties(
  result: BigHorde,
  strength: number,
  place: PlaceId,
  buildings: readonly LocationId[] | undefined,
  order: Order,
): { injured: number; dead: number; wipe: number } {
  const row =
    result === 'overrun' ? PATROL.risk.at(-1)! : ratingRow(strength, tripOf(place, buildings).tier);
  const odds = ordered(row, order);
  return result === 'fence'
    ? { ...odds, injured: Math.min(1, odds.injured * PATROL.horde.injured) }
    : odds;
}

/** The focus options `buildings` can drop (the rest are greyed out); "Anything" always can. */
export function focusOptions(buildings: readonly LocationId[]): Focus[] {
  const drops = new Set(buildings.flatMap((b) => LOCATIONS[b].loot.map(focusOf)));
  return FOCUS_IDS.filter((f) => f === 'anything' || drops.has(f));
}

/** What a patrol is told to do (ID-029): the buildings to search, the loot to favour, and what to protect. */
export interface PatrolOptions {
  /** Default: all of a plaza's buildings, or the location itself. */
  buildings?: readonly LocationId[];
  /** Default: 'anything'. */
  focus?: Focus;
  /** Default: 'balanced'. */
  order?: Order;
}

/**
 * Sends `memberIds` to `place` at `now`; refused when patrols are locked, the place is
 * hidden, no building is ticked, a ticked building isn't in the place, the focus can't
 * drop there, the base has no standing gate, or a member isn't idle. There is no limit
 * on parties out at once. Unknown ids throw.
 */
export function sendPatrol(
  game: GameState,
  location: PlaceId,
  memberIds: readonly string[],
  seed: number,
  now: number,
  options: PatrolOptions = {},
): { ok: true; game: GameState } | { ok: false; reason: string } {
  if (!Number.isFinite(now)) throw new RangeError(`sendPatrol: bad time ${now}`);
  if (!Number.isInteger(seed)) throw new RangeError(`sendPatrol: bad seed ${seed}`);
  if (!PLACE_IDS.includes(location)) {
    throw new RangeError(`sendPatrol: unknown location ${String(location)}`);
  }
  const { focus = 'anything', order = 'balanced' } = options;
  const ticked = options.buildings ?? buildingsOf(location);
  for (const b of ticked) {
    if (!LOCATION_IDS.includes(b))
      throw new RangeError(`sendPatrol: unknown building ${String(b)}`);
  }
  if (!FOCUS_IDS.includes(focus))
    throw new RangeError(`sendPatrol: unknown focus ${String(focus)}`);
  if (!ORDER_IDS.includes(order))
    throw new RangeError(`sendPatrol: unknown order ${String(order)}`);
  const members = memberIds.map((id) => {
    const d = game.roster.find((r) => r.id === id);
    if (!d) throw new RangeError(`sendPatrol: no defender ${String(id)}`);
    return d;
  });
  if (members.length === 0) return { ok: false, reason: 'Pick someone to send' };
  if (new Set(memberIds).size !== memberIds.length) {
    throw new RangeError('sendPatrol: a defender picked twice');
  }
  if (!patrolsUnlocked(game)) return { ok: false, reason: 'Patrols open after Horde 2' };
  if (game.patrolsSent >= PATROL.max) return { ok: false, reason: 'No more patrols can be sent' };
  if (!revealedPlaces(game).includes(location)) {
    return { ok: false, reason: `${placeName(location)} isn't on the map yet` };
  }
  // Searched in the place's order, each building once.
  const buildings = buildingsOf(location).filter((b) => ticked.includes(b));
  if (ticked.some((b) => !buildings.includes(b))) {
    return { ok: false, reason: `Not every building is part of ${placeName(location)}` };
  }
  if (buildings.length === 0) return { ok: false, reason: 'Tick a building to search' };
  if (!focusOptions(buildings).includes(focus)) {
    return { ok: false, reason: `Nothing to favour: ${focus} can't be found there` };
  }
  if (!hasGate(game)) return { ok: false, reason: 'Patrols leave by a gate: build or repair one' };
  for (const d of members) {
    if (onPatrol(game, d.id)) return { ok: false, reason: `${d.name} is on patrol` };
    if (!available(d, now)) return { ok: false, reason: `${d.name} is injured` };
  }
  // A wipe must never leave the camp empty (until the roster floor, ID-033).
  if (game.roster.every((d) => onPatrol(game, d.id) || memberIds.includes(d.id))) {
    return { ok: false, reason: 'Keep one defender at the camp' };
  }
  const patrol: Patrol = {
    no: game.patrolsSent + 1,
    location,
    buildings,
    focus,
    order,
    members: [...memberIds],
    sentAt: now,
    sentHorde: game.hordeNumber,
    strength: partyStrength(members),
    seed: seed >>> 0,
  };
  return {
    ok: true,
    game: { ...game, patrols: [...game.patrols, patrol], patrolsSent: patrol.no },
  };
}

/** Loot before it reaches the camp. */
export interface Haul {
  stock: Stock;
  gas: number;
  batteries: Record<Battery, number>;
  weapons: { base: WeaponId; rarity: Rarity }[];
}

/** An entry's weight: doubled (`PATROL.focus`) when it is the loot the party favours. */
const weightOf = (e: LootEntry, focus: Focus): number =>
  focus !== 'anything' && focusOf(e) === focus ? e.weight * PATROL.focus : e.weight;

function pickEntry(rng: Rng, table: readonly LootEntry[], focus: Focus): LootEntry {
  const total = table.reduce((sum, e) => sum + weightOf(e, focus), 0);
  let roll = rng() * total;
  for (const e of table) {
    const w = weightOf(e, focus);
    if (roll < w) return e;
    roll -= w;
  }
  // Only reached through float rounding at the very top.
  return table.at(-1)!;
}

function rollRarity(rng: Rng, tier: number, bonus: number): Rarity {
  const weights = PATROL.rarity[tier - 1]!;
  const total = RARITY_ORDER.reduce((sum, r) => sum + weights[r], 0);
  let roll = rng() * total;
  let rarity = RARITY_ORDER.filter((r) => weights[r] > 0).at(-1)!;
  for (const r of RARITY_ORDER) {
    if (roll < weights[r]) {
      rarity = r;
      break;
    }
    roll -= weights[r];
  }
  // Each bonus roll's worth of strength may lift it one rarity.
  const i = RARITY_ORDER.indexOf(rarity);
  return chance(rng, PATROL.bump * bonus)
    ? RARITY_ORDER[Math.min(i + 1, RARITY_ORDER.length - 1)]!
    : rarity;
}

/** One roll on `location`'s table; a weapon's rarity comes from `tier`, the tier of the trip. */
function rollEntry(
  rng: Rng,
  location: LocationId,
  tier: number,
  bonus: number,
  focus: Focus,
  haul: Haul,
): void {
  const e = pickEntry(rng, LOCATIONS[location].loot, focus);
  switch (e.kind) {
    case 'material':
      haul.stock[e.id] += int(rng, e.min, e.max);
      return;
    case 'gas':
      haul.gas += int(rng, e.min, e.max);
      return;
    case 'battery':
      haul.batteries[e.id] += 1;
      return;
    case 'weapon':
      haul.weapons.push({
        base: pick(rng, e.bases),
        rarity: rollRarity(rng, tier, bonus),
      });
      return;
    case 'anything': {
      // A roll on another location's table, unfocused; a weapon from it still comes at this tier.
      const other = pick(
        rng,
        LOCATION_IDS.filter((id) => id !== location),
      );
      rollEntry(rng, other, tier, bonus, 'anything', haul);
      return;
    }
  }
}

const noHaul = (): Haul => ({
  stock: stockOf(),
  gas: 0,
  batteries: Object.fromEntries(BATTERY_IDS.map((b) => [b, 0])) as Record<Battery, number>,
  weapons: [],
});

/** What each ticked building of patrol `p` yields, in search order: `PATROL.rolls` plus its bonus rolls on its own table, from the seed. */
export function buildingLoots(p: Patrol): Haul[] {
  const rng = createRng(p.seed);
  const trip = tripOf(p.location, p.buildings);
  const bonus = bonusRolls(p.strength, p.location, p.buildings);
  return p.buildings.map((b) => {
    const haul = noHaul();
    for (let n = PATROL.rolls + bonus; n > 0; n--) {
      rollEntry(rng, b, trip.tier, bonus, p.focus, haul);
    }
    return haul;
  });
}

/** The hauls added up. */
function sumHauls(list: readonly Haul[]): Haul {
  const sum = noHaul();
  for (const h of list) {
    for (const m of MATERIALS) sum.stock[m] += h.stock[m];
    sum.gas += h.gas;
    for (const b of BATTERY_IDS) sum.batteries[b] += h.batteries[b];
    sum.weapons.push(...h.weapons);
  }
  return sum;
}

/** What patrol `p` finds in all its buildings, before any retreat. */
export const patrolLoot = (p: Patrol): Haul => sumHauls(buildingLoots(p));

/** How a big horde met patrol `p`: how it ended, the building (index) it hit during, and the genes a win brings. */
export interface BigHordeRoll {
  result: BigHorde;
  at: number;
  genes: number;
}

/**
 * Whether a big horde hits patrol `p`, from a stream of its own so neither the loot nor
 * the casualties shift. The chance never looks at the party; its strength only picks
 * the result. A single building rolls nothing.
 */
export function rollBigHorde(p: Patrol): BigHordeRoll | null {
  const odds = bigHordeChance(p.location, p.buildings);
  if (odds <= 0) return null;
  const rng = createRng(p.seed ^ 0xc2b2ae35);
  if (!chance(rng, odds)) return null;
  const { defeat, fence } = hordeOdds(p.strength, p.location, p.buildings);
  const roll = rng();
  const result: BigHorde = roll < defeat ? 'defeat' : roll < defeat + fence ? 'fence' : 'overrun';
  return {
    result,
    at: int(rng, 0, p.buildings.length - 1),
    genes: int(rng, PATROL.horde.genes.min, PATROL.horde.genes.max),
  };
}

/** Who patrol `p` loses, and how much of its loot comes home. */
export interface PatrolOutcome {
  /** Member ids killed and injured, and whether all were killed. */
  wiped: boolean;
  dead: string[];
  injured: string[];
  bigHorde: BigHorde | null;
  /** Buildings searched, from the first, before a retreat. */
  searched: number;
  /** The share of the searched buildings' loot that comes home (0 to 1). */
  keep: number;
  /** Mutated Genes a won big horde adds to the haul. */
  genes: number;
}

/**
 * Rolls patrol `p`'s casualties from its seed, on a stream of their own so its loot
 * never shifts: the wipe first, then each member's death, then injury. A party that
 * loses everyone one by one is wiped out too: nobody is left to carry the loot.
 *
 * Ordinary trips run at their rating's odds (the order scales a Dangerous or Deadly one).
 * A big horde (ID-029) always scales by the order: beaten, the trip's rating; fenced off,
 * that with injuries doubled; overrun, the Deadly row. When things go wrong (a retreat,
 * or a death on a Dangerous or Deadly trip) the order's share of the loot comes home;
 * half the party dead or more, or a wipe, brings none.
 */
export function patrolOutcome(p: Patrol): PatrolOutcome {
  const horde = rollBigHorde(p);
  const row = ratingRow(p.strength, tripOf(p.location, p.buildings).tier);
  let odds = goesWrong(row.rating) ? ordered(row, p.order) : row;
  let searched = p.buildings.length;
  if (horde) {
    odds = hordeCasualties(horde.result, p.strength, p.location, p.buildings, p.order);
    if (horde.result !== 'defeat') searched = horde.at;
  }
  const rng = createRng(p.seed ^ 0x85ebca6b);
  const done = (wiped: boolean, dead: string[], injured: string[]): PatrolOutcome => {
    const wrong = horde ? horde.result !== 'defeat' : goesWrong(row.rating) && dead.length > 0;
    const heavy = wiped || dead.length * 2 >= p.members.length;
    return {
      wiped,
      dead,
      injured,
      bigHorde: horde?.result ?? null,
      searched,
      keep: heavy ? 0 : wrong ? ORDERS[p.order].keep : 1,
      genes: horde?.result === 'defeat' ? horde.genes : 0,
    };
  };
  if (chance(rng, odds.wipe)) return done(true, [...p.members], []);
  const dead: string[] = [];
  const injured: string[] = [];
  for (const id of p.members) {
    if (chance(rng, odds.dead)) dead.push(id);
    else if (chance(rng, odds.injured)) injured.push(id);
  }
  return done(dead.length === p.members.length, dead, injured);
}

/**
 * `outcome` with one member spared, back injured, when it would leave nobody alive: a
 * save from before ID-027 may have every defender out at once.
 */
function spareLast(outcome: PatrolOutcome, game: GameState): PatrolOutcome {
  if (outcome.dead.length === 0 || game.roster.some((d) => !outcome.dead.includes(d.id))) {
    return outcome;
  }
  const [spared, ...dead] = outcome.dead;
  return { ...outcome, wiped: false, dead, injured: [...outcome.injured, spared!] };
}

/** `n` × `share`, down to a whole number. */
const share = (n: number, keep: number): number => Math.floor(n * keep + 1e-9);

/**
 * What comes home from `loots` under `outcome`: the buildings searched, plus a won
 * horde's genes, cut to the order's share (counts rounded down; the first weapons
 * found are the ones kept), and what the cut dropped.
 */
function cutHaul(loots: readonly Haul[], outcome: PatrolOutcome): { kept: Haul; lost: Lost } {
  const full = sumHauls(loots);
  const got = sumHauls(loots.slice(0, outcome.searched));
  full.stock.genes += outcome.genes;
  got.stock.genes += outcome.genes;
  const kept = noHaul();
  const lost: Lost = { stock: stockOf(), gas: 0, batteries: noHaul().batteries, weapons: 0 };
  for (const m of MATERIALS) {
    kept.stock[m] = share(got.stock[m], outcome.keep);
    lost.stock[m] = full.stock[m] - kept.stock[m];
  }
  kept.gas = share(got.gas, outcome.keep);
  lost.gas = full.gas - kept.gas;
  for (const b of BATTERY_IDS) {
    kept.batteries[b] = share(got.batteries[b], outcome.keep);
    lost.batteries[b] = full.batteries[b] - kept.batteries[b];
  }
  kept.weapons = got.weapons.slice(0, share(got.weapons.length, outcome.keep));
  lost.weapons = full.weapons.length - kept.weapons.length;
  return { kept, lost };
}

/**
 * Brings home every patrol due by `now`, oldest due first. A party that isn't wiped out
 * brings its loot into the camp (capped at `MAX_COUNT`; a weapon with no room is
 * salvaged for Scrap), picks up the weapons left where it went, and its members who
 * come back get XP; the injured rest `recoveryMs` from its return. The dead leave the
 * roster and their owned weapons stay at the place. Each patrol leaves a report. A
 * retreat cuts the loot but not the trip: it is back at its due time.
 * Returns `game` itself when none is due.
 */
export function settlePatrols(game: GameState, now: number): GameState {
  if (!Number.isFinite(now)) throw new RangeError(`settlePatrols: bad time ${now}`);
  const due = game.patrols
    .filter((p) => patrolDue(p) <= now)
    .sort((a, b) => patrolDue(a) - patrolDue(b) || a.no - b.no);
  if (due.length === 0) return game;
  const g = structuredClone(game);
  for (const p of due) {
    const outcome = spareLast(patrolOutcome(p), g);
    const { kept: haul, lost } = outcome.wiped
      ? { kept: noHaul(), lost: { ...noHaul(), weapons: 0 } }
      : cutHaul(buildingLoots(p), outcome);
    // Foraging (a camp-level pick, design §11): more materials and Gas, to the nearest whole.
    const more = (n: number): number => Math.round((n * (100 + lootBonus(g.camp))) / 100);
    for (const m of MATERIALS) haul.stock[m] = more(haul.stock[m]);
    haul.gas = more(haul.gas);
    // Into the armoury if there is room, else salvaged for Scrap.
    const store = (weapon: OwnedWeapon): ReportWeapon => {
      const kept = ownedWeapons(g).length < ARMOURY_CAP;
      if (kept) g.armoury.push(weapon);
      else haul.stock.scrap += RARITIES[weapon.rarity].salvage;
      return { base: weapon.base, rarity: weapon.rarity, kept };
    };
    // The affixes come from their own stream, so the haul's rolls never shift.
    const affixRng = createRng(p.seed ^ 0x9e3779b9);
    const weapons = haul.weapons.map((w, k) =>
      store(rollWeapon(affixRng, `p${p.no}-${k}`, w.base, w.rarity)),
    );
    // What the dead left here before this trip comes home with it.
    const recovered = outcome.wiped
      ? []
      : g.leftBehind.filter((l) => l.location === p.location).map((l) => store(l.weapon));
    if (!outcome.wiped) g.leftBehind = g.leftBehind.filter((l) => l.location !== p.location);
    for (const m of MATERIALS) g.stock[m] = Math.min(MAX_COUNT, g.stock[m] + haul.stock[m]);
    g.power.gas = Math.min(MAX_COUNT, g.power.gas + haul.gas);
    for (const b of BATTERY_IDS) {
      g.power.batteries[b] = Math.min(MAX_COUNT, g.power.batteries[b] + haul.batteries[b]);
    }
    const xp = outcome.wiped
      ? 0
      : Math.floor(
          patrolXp(p.location, p.sentHorde, p.buildings) *
            (outcome.bigHorde === 'defeat' ? PATROL.horde.xp : 1),
        );
    const names: string[] = [];
    const injured: string[] = [];
    const dead: string[] = [];
    for (const id of p.members) {
      const d = g.roster.find((r) => r.id === id);
      if (!d) continue;
      names.push(d.name);
      if (outcome.dead.includes(id)) {
        dead.push(d.name);
        for (const w of [d.loadout.primary, d.loadout.secondary]) {
          if (w !== null && isOwned(w)) g.leftBehind.push({ location: p.location, weapon: w });
        }
        g.roster = g.roster.filter((r) => r.id !== id);
        startFloor(g, patrolDue(p));
        continue;
      }
      d.xp = Math.min(MAX_COUNT, d.xp + xp);
      if (outcome.injured.includes(id)) {
        injured.push(d.name);
        d.injuredUntil = patrolDue(p) + recoveryMs(g.camp);
      }
    }
    g.reports.push({
      no: p.no,
      location: p.location,
      buildings: [...p.buildings],
      searched: outcome.searched,
      bigHorde: outcome.bigHorde,
      order: p.order,
      focus: p.focus,
      lost,
      names,
      injured,
      dead,
      wiped: outcome.wiped,
      returnedAt: patrolDue(p),
      stock: haul.stock,
      gas: haul.gas,
      batteries: haul.batteries,
      weapons,
      recovered,
      xp,
    });
  }
  const back = new Set(due.map((p) => p.no));
  g.patrols = g.patrols.filter((p) => !back.has(p.no));
  g.reports = g.reports.slice(-PATROL.reports);
  g.leftBehind = g.leftBehind.slice(-PATROL.left);
  return loadBatteries(g);
}
