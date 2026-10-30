// Patrols (design §10, as built ID-026): a party of idle defenders leaves by a gate for a
// location on the world map, searches it and comes back in real time, so a patrol
// finishes while the game is closed. Its loot is rolled from the seed it left with, so
// the result never depends on when it is settled. Pure: real time comes in as `now`.
// Risk (ID-027): party strength against the location's danger rates the trip, and the
// same seed rolls who comes back injured, who dies and whether the party is wiped out.
import { isOwned, rollWeapon, type OwnedWeapon } from './armoury.ts';
import {
  ARMOURY_CAP,
  BATTERY_IDS,
  LOCATION_IDS,
  LOCATIONS,
  MATERIALS,
  MAX_COUNT,
  PATROL,
  RARITIES,
  RARITY_ORDER,
  RECOVERY_MS,
  stockOf,
  type Battery,
  type LocationId,
  type LootEntry,
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
  location: LocationId;
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
  location: LocationId;
  weapon: OwnedWeapon;
}

/** A found weapon as the report lists it: kept in the armoury, or salvaged for Scrap. */
export interface ReportWeapon {
  base: WeaponId;
  rarity: Rarity;
  kept: boolean;
}

/** What a patrol brought back (design §10 "patrol report"), for the world map screen (ID-028). */
export interface PatrolReport {
  no: number;
  location: LocationId;
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

/** A patrol leaves by a gate: the base needs one standing (HP above 0). */
export const hasGate = (game: GameState): boolean =>
  game.base.layers.some((l) => l.slots.some((s) => s?.kind === 'gate' && s.hp > 0));

/** Total minutes out, searching and back. */
export function tripMinutes(location: LocationId): number {
  const l = LOCATIONS[location];
  return 2 * l.travel + l.search;
}

/** When patrol `p` is back (ms). */
export const patrolDue = (p: Patrol): number => p.sentAt + tripMinutes(p.location) * 60_000;

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

/** The party strength that matches `location`'s danger (design §10 Risk and reward). */
export const locationDanger = (location: LocationId): number =>
  PATROL.danger * PATROL.need * LOCATIONS[location].tier;

/** A trip's rating and odds: each member's chance to be injured or killed, and the party's to be wiped out. */
export interface PatrolRisk {
  rating: RiskRating;
  injured: number;
  dead: number;
  wipe: number;
}

/** The risk for a party of `strength` at `location`. */
export function riskOf(strength: number, location: LocationId): PatrolRisk {
  const ratio = strength / locationDanger(location);
  // The last rating starts at 0, so every strength finds one (NaN rates the worst).
  const { rating, injured, dead, wipe } =
    PATROL.risk.find((r) => ratio >= r.from) ?? PATROL.risk.at(-1)!;
  return { rating, injured, dead, wipe };
}

/** The risk `members` would run at `location`, for the risk screen (ID-028). */
export const patrolRisk = (
  members: readonly Pick<RosterDefender, 'xp' | 'stats' | 'loadout'>[],
  location: LocationId,
): PatrolRisk => riskOf(partyStrength(members), location);

/** Loot rolls past the base `PATROL.rolls`: one per `need × tier` of strength, at most `bonusRolls`. */
export function bonusRolls(strength: number, location: LocationId): number {
  const per = PATROL.need * LOCATIONS[location].tier;
  return Math.min(PATROL.bonusRolls, Math.floor(strength / per));
}

/** XP each member gets (design §10): a horde win's, times hours out, times the danger. */
export function patrolXp(location: LocationId, sentHorde: number): number {
  const hours = tripMinutes(location) / 60;
  const danger = 1 + PATROL.xpDanger * (LOCATIONS[location].tier - 1);
  return Math.floor(hordeXp(sentHorde) * hours * danger);
}

/**
 * Sends `memberIds` to `location` at `now`; refused when patrols are locked, the
 * location is hidden, the base has no standing gate, or a member isn't idle. There is
 * no limit on parties out at once. Unknown ids throw.
 */
export function sendPatrol(
  game: GameState,
  location: LocationId,
  memberIds: readonly string[],
  seed: number,
  now: number,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  if (!Number.isFinite(now)) throw new RangeError(`sendPatrol: bad time ${now}`);
  if (!Number.isInteger(seed)) throw new RangeError(`sendPatrol: bad seed ${seed}`);
  if (!LOCATION_IDS.includes(location)) {
    throw new RangeError(`sendPatrol: unknown location ${String(location)}`);
  }
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
  if (!revealedLocations(game).includes(location)) {
    return { ok: false, reason: `${LOCATIONS[location].name} isn't on the map yet` };
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

/** One roll's worth of loot, before it reaches the camp. */
interface Haul {
  stock: Stock;
  gas: number;
  batteries: Record<Battery, number>;
  weapons: { base: WeaponId; rarity: Rarity }[];
}

function pickEntry(rng: Rng, table: readonly LootEntry[]): LootEntry {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * total;
  for (const e of table) {
    if (roll < e.weight) return e;
    roll -= e.weight;
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

/** One roll on `location`'s table; a weapon's rarity comes from `tier`, the tier of the place searched. */
function rollEntry(rng: Rng, location: LocationId, tier: number, bonus: number, haul: Haul): void {
  const e = pickEntry(rng, LOCATIONS[location].loot);
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
      // A roll on another location's table; a weapon from it still comes at this tier.
      const other = pick(
        rng,
        LOCATION_IDS.filter((id) => id !== location),
      );
      rollEntry(rng, other, tier, bonus, haul);
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

/** What patrol `p` finds: `PATROL.rolls` plus its bonus rolls, from its seed. */
export function patrolLoot(p: Patrol): Haul {
  const rng = createRng(p.seed);
  const bonus = bonusRolls(p.strength, p.location);
  const haul = noHaul();
  const tier = LOCATIONS[p.location].tier;
  for (let n = PATROL.rolls + bonus; n > 0; n--) rollEntry(rng, p.location, tier, bonus, haul);
  return haul;
}

/** Who patrol `p` loses: member ids killed and injured, and whether all were killed. */
export interface PatrolOutcome {
  wiped: boolean;
  dead: string[];
  injured: string[];
}

/**
 * Rolls patrol `p`'s casualties from its seed, on a stream of their own so its loot
 * never shifts: the wipe first, then each member's death, then injury. A party that
 * loses everyone one by one is wiped out too: nobody is left to carry the loot.
 */
export function patrolOutcome(p: Patrol): PatrolOutcome {
  const rng = createRng(p.seed ^ 0x85ebca6b);
  const risk = riskOf(p.strength, p.location);
  if (chance(rng, risk.wipe)) return { wiped: true, dead: [...p.members], injured: [] };
  const dead: string[] = [];
  const injured: string[] = [];
  for (const id of p.members) {
    if (chance(rng, risk.dead)) dead.push(id);
    else if (chance(rng, risk.injured)) injured.push(id);
  }
  return { wiped: dead.length === p.members.length, dead, injured };
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
  return { wiped: false, dead, injured: [...outcome.injured, spared!] };
}

/**
 * Brings home every patrol due by `now`, oldest due first. A party that isn't wiped out
 * brings its loot into the camp (capped at `MAX_COUNT`; a weapon with no room is
 * salvaged for Scrap), picks up the weapons left where it went, and its members who
 * come back get XP; the injured rest `RECOVERY_MS` from its return. The dead leave the
 * roster and their owned weapons stay at the location. Each patrol leaves a report.
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
    const haul = outcome.wiped ? noHaul() : patrolLoot(p);
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
    const xp = outcome.wiped ? 0 : patrolXp(p.location, p.sentHorde);
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
        continue;
      }
      d.xp = Math.min(MAX_COUNT, d.xp + xp);
      if (outcome.injured.includes(id)) {
        injured.push(d.name);
        d.injuredUntil = patrolDue(p) + RECOVERY_MS;
      }
    }
    g.reports.push({
      no: p.no,
      location: p.location,
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
