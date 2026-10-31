// The camp (design §11, as built ID-033): capacity and the material camp upgrades that
// add slots, dismissing, the roster floor's free recruits, camp XP with its permanent
// level-up picks, and Food and Medicine cutting an injury's rest (ID-031). Survivors
// (ID-032) ask to join from a patrol report or a camp level-up offer. Pure: each
// action returns a new game or a refusal the UI shows as-is; real time comes in as `now`.
import { isOwned, rollWeapon, tierRarity, type OwnedWeapon } from './armoury.ts';
import {
  ARMOURY_CAP,
  CAMP_SIZE,
  CAMP_PICK_IDS,
  CAMP_PICK_RANKS,
  CAMP_PICKS,
  CAMP_UPGRADES,
  CAR,
  DEFENDER_XP,
  MATERIALS,
  MAX_COUNT,
  POINTS_PER_LEVEL,
  RECOVERY_MS,
  RECRUIT_NAMES,
  STATS,
  SURVIVOR,
  TREATMENT_MS,
  WEAPON_IDS,
  type CampPickId,
  type Stats,
  type Stock,
} from './data.ts';
import { ownedWeapons, type GameState, type RosterDefender } from './game.ts';
import type { HordeState } from './horde.ts';
import { isGun } from './loadout.ts';
import { pay, type GameResult } from './research.ts';
import { chance, createRng, int, pick, type Rng } from './rng.ts';
import { NO_STATS, xpForLevel } from './stats.ts';

/**
 * Someone who wants to join the camp (design §10 Survivors), rolled once and shown as
 * is. Their id is their roster id once they join and their weapon's uid: `s<patrol>-<k>`
 * from a patrol, `c<camp level>` from a camp level-up.
 */
export interface Survivor {
  id: string;
  name: string;
  xp: number;
  stats: Stats;
  weapon: OwnedWeapon;
}

/** A camp level-up's offer: up to 3 picks, or 2 and a survivor (design §11 Camp level). */
export interface CampOffer {
  picks: CampPickId[];
  survivor: Survivor | null;
}

/**
 * What a camp level-up offer can be answered with: a pick, letting the survivor join, or
 * turning them away (a pick does that too; on its own it answers an offer with no picks left).
 */
export type CampChoice = CampPickId | 'join' | 'away';

export interface Camp {
  /** Material camp upgrades bought, each `CAMP_SIZE.perUpgrade` more slots. */
  upgrades: number;
  /** Lifetime camp XP; the camp level comes from it. */
  xp: number;
  /** The rank of each camp-level pick taken. */
  picks: Record<CampPickId, number>;
  /** Level-up offers still to pick from, oldest first. */
  offers: CampOffer[];
  /** When the roster floor's next free recruit arrives (ms); null while it isn't running. */
  recruitAt: number | null;
  /** Free recruits so far; the next one is `recruit-<recruits + 1>`. */
  recruits: number;
  /** Cars built (design §10 Vehicle, ID-030); a patrol names the one it took by index. */
  cars: number;
}

export const NO_PICKS: Readonly<Record<CampPickId, number>> = Object.fromEntries(
  CAMP_PICK_IDS.map((id) => [id, 0]),
) as Record<CampPickId, number>;

export function newCamp(): Camp {
  return {
    upgrades: 0,
    xp: 0,
    picks: { ...NO_PICKS },
    offers: [],
    recruitAt: null,
    recruits: 0,
    cars: 0,
  };
}

/** People the camp holds: every defender counts, wherever they are. */
export const campSlots = (game: Pick<GameState, 'camp'>): number =>
  CAMP_SIZE.slots + CAMP_SIZE.perUpgrade * game.camp.upgrades;

/** What the next camp upgrade costs, or null when every one is built. */
export const campUpgradeCost = (game: Pick<GameState, 'camp'>): Partial<Stock> | null =>
  CAMP_UPGRADES[game.camp.upgrades] ?? null;

/** Buys the next camp upgrade: `CAMP_SIZE.perUpgrade` more slots. */
export function upgradeCamp(game: GameState): GameResult {
  const cost = campUpgradeCost(game);
  if (!cost) return { ok: false, reason: 'The camp is as big as it gets' };
  if (MATERIALS.some((m) => game.stock[m] < (cost[m] ?? 0))) {
    return { ok: false, reason: 'Not enough materials', short: true };
  }
  const stock = { ...game.stock };
  for (const m of MATERIALS) stock[m] -= cost[m] ?? 0;
  return {
    ok: true,
    game: { ...game, stock, camp: { ...game.camp, upgrades: game.camp.upgrades + 1 } },
  };
}

/** Builds a car (design §10 Vehicle): the first needs no research; more come from it (ID-035). */
export function buildCar(game: GameState): GameResult {
  if (game.camp.cars >= CAR.limit) return { ok: false, reason: 'More cars come with research' };
  return pay(game, CAR.cost, (g) => {
    g.camp.cars += 1;
  });
}

/** Why defender `id` can't be dismissed, or null when they can. */
export function dismissLock(game: GameState, id: string): string | null {
  const d = game.roster.find((r) => r.id === id);
  if (!d) throw new RangeError(`dismiss: no defender ${String(id)}`);
  if (game.roster.length <= CAMP_SIZE.floor) {
    return `Not while ${CAMP_SIZE.floor} or fewer are alive`;
  }
  if (game.patrols.some((p) => p.members.includes(id))) return `${d.name} is on patrol`;
  return null;
}

/**
 * Dismisses defender `id` for good (design §11) to free a slot. Their owned weapons go
 * to the armoury, which always has room: a carried weapon already counts towards it.
 */
export function dismiss(game: GameState, id: string): GameResult {
  const reason = dismissLock(game, id);
  if (reason !== null) return { ok: false, reason };
  const d = game.roster.find((r) => r.id === id)!;
  const kept = [d.loadout.primary, d.loadout.secondary].filter(isOwned);
  return {
    ok: true,
    game: {
      ...game,
      roster: game.roster.filter((r) => r.id !== id),
      armoury: [...game.armoury, ...kept],
    },
  };
}

/** The camp level for lifetime camp `xp`, the XP into it, and what it costs. */
export function campLevelOf(xp: number): { level: number; into: number; next: number } {
  if (!(xp >= 0 && xp <= MAX_COUNT)) throw new RangeError(`campLevelOf: bad xp ${xp}`);
  let level = 1;
  let spent = 0;
  while (spent + CAMP_SIZE.levelXp * level <= xp) {
    spent += CAMP_SIZE.levelXp * level;
    level += 1;
  }
  return { level, into: xp - spent, next: CAMP_SIZE.levelXp * level };
}

/** Camp XP for horde `h`: half a win's defender XP, rounded down; none on a loss. */
export function campXpFor(h: Pick<HordeState, 'hordeNumber' | 'outcome'>): number {
  if (h.outcome !== 'won') return 0;
  return Math.floor((DEFENDER_XP.base + DEFENDER_XP.perHorde * h.hordeNumber) / 2);
}

/** Camp XP after horde `h`, capped where a save reads it. */
export const campXpAfter = (
  game: Pick<GameState, 'camp'>,
  h: Pick<HordeState, 'hordeNumber' | 'outcome'>,
): number => Math.min(MAX_COUNT, game.camp.xp + campXpFor(h));

/** Up to 3 different picks not yet at the top rank. */
function rollOffer(rng: Rng, ranks: Readonly<Record<CampPickId, number>>): CampPickId[] {
  const pool = CAMP_PICK_IDS.filter((id) => ranks[id] < CAMP_PICK_RANKS);
  const offer: CampPickId[] = [];
  while (offer.length < 3 && pool.length > 0)
    offer.push(pool.splice(int(rng, 0, pool.length - 1), 1)[0]!);
  return offer;
}

/**
 * The offers horde `h` adds for `game` (the game it was fought from): one per camp level
 * its camp XP gains, rolled from where the fight's RNG ended on a stream of their own,
 * so the result screen and `finishHorde` agree. Each has a `SURVIVOR.camp` chance that a
 * survivor takes one of its 3 slots, rolled on another stream so the picks never shift.
 * An offer with nothing left is dropped.
 */
export function hordeCampOffers(
  game: Pick<GameState, 'camp'>,
  h: Pick<HordeState, 'hordeNumber' | 'outcome' | 'rng'>,
): CampOffer[] {
  const before = campLevelOf(game.camp.xp).level;
  const levels = campLevelOf(campXpAfter(game, h)).level - before;
  const rng = createRng(h.rng.s ^ 0x5bd1e995);
  const join = createRng(h.rng.s ^ 0x27d4eb2f);
  return Array.from({ length: levels }, (_, i): CampOffer => {
    const picks = rollOffer(rng, game.camp.picks);
    if (!chance(join, SURVIVOR.camp)) return { picks, survivor: null };
    const level = before + i + 1;
    const rank = int(join, 1, Math.min(level, SURVIVOR.campLevel));
    return { picks: picks.slice(0, 2), survivor: rollSurvivor(join, `c${level}`, rank, rank) };
  }).filter((o) => o.picks.length > 0 || o.survivor !== null);
}

/**
 * `camp` after answering its oldest offer with `choice`: a pick's rank goes up one, or
 * the survivor is let in (`takeCampPick` adds them) or turned away, and the offer is
 * gone; picking turns the survivor away too. Later offers lose any pick now at the top rank, and one left
 * with nothing is dropped. Refused when `choice` isn't in that offer.
 */
export function campAfterPick<T extends Pick<Camp, 'picks' | 'offers'>>(
  camp: T,
  choice: CampChoice,
): { ok: true; camp: T } | { ok: false; reason: string } {
  const offer = camp.offers[0];
  if (!offer) return { ok: false, reason: 'No camp pick waiting' };
  const answer = choice === 'join' || choice === 'away';
  if (answer ? offer.survivor === null : !offer.picks.includes(choice)) {
    return { ok: false, reason: `${String(choice)} isn't on offer` };
  }
  const picks = answer ? camp.picks : { ...camp.picks, [choice]: camp.picks[choice] + 1 };
  const offers = camp.offers
    .slice(1)
    .map((o) => ({ ...o, picks: o.picks.filter((x) => picks[x] < CAMP_PICK_RANKS) }))
    .filter((o) => o.picks.length > 0 || o.survivor !== null);
  return { ok: true, camp: { ...camp, picks, offers } };
}

/**
 * Answers the oldest camp-level offer (`campAfterPick`). Letting its survivor join needs
 * room for them (`joinLock`).
 */
export function takeCampPick(game: GameState, choice: CampChoice): GameResult {
  const survivor = game.camp.offers[0]?.survivor ?? null;
  if (choice === 'join' && survivor !== null) {
    const lock = joinLock(game);
    if (lock !== null) return { ok: false, reason: lock };
  }
  const r = campAfterPick(game.camp, choice);
  if (!r.ok) return r;
  const roster = choice === 'join' ? [...game.roster, survivorDefender(survivor!)] : game.roster;
  return { ok: true, game: { ...game, roster, camp: r.camp } };
}

/**
 * Survivor `id` of `level` (design §10): a name, the XP of that level with its stat
 * points rolled across the stats, and any weapon at a tier-`tier` place's rarity.
 */
export function rollSurvivor(rng: Rng, id: string, level: number, tier: number): Survivor {
  const name = pick(rng, RECRUIT_NAMES);
  const stats = { ...NO_STATS };
  for (let n = POINTS_PER_LEVEL * (level - 1); n > 0; n--) stats[pick(rng, STATS)] += 1;
  const base = pick(rng, WEAPON_IDS);
  const weapon = rollWeapon(rng, id, base, tierRarity(rng, tier));
  return { id, name, xp: xpForLevel(level), stats, weapon };
}

/** Survivor `s` on the roster: fit, carrying their weapon (a pistol too if it isn't a gun). */
export function survivorDefender(s: Survivor): RosterDefender {
  const w = s.weapon;
  return {
    id: s.id,
    name: s.name,
    loadout: isGun(w)
      ? { primary: w, secondary: null, item: null }
      : { primary: 'pistol', secondary: w, item: null },
    xp: s.xp,
    stats: { ...s.stats },
    injuredUntil: null,
  };
}

/** Room left for people: free camp slots, and armoury room for the weapons they carry. */
export interface Room {
  people: number;
  weapons: number;
}

export const roomOf = (game: GameState): Room => ({
  people: campSlots(game) - game.roster.length,
  weapons: ARMOURY_CAP - ownedWeapons(game).length,
});

/** Why a survivor can't join with `room` left, or null when they can. */
export function roomLock(room: Room): string | null {
  if (room.people < 1) return 'The camp is full';
  if (room.weapons < 1) return 'The armoury is full';
  return null;
}

/** Why a survivor can't join now, or null when they can: a camp slot and armoury room for their weapon. */
export const joinLock = (game: GameState): string | null => roomLock(roomOf(game));

/** Report `no`'s undecided survivor `id`; unknown ones throw. */
function waiting(game: GameState, no: number, id: string): Survivor {
  const s = game.reports.find((r) => r.no === no)?.survivors.find((x) => x.id === id);
  if (!s) throw new RangeError(`no survivor ${String(id)} in report ${String(no)}`);
  return s;
}

/** `game` with survivor `id` gone from report `no`. */
const withoutSurvivor = (game: GameState, no: number, id: string): GameState => ({
  ...game,
  reports: game.reports.map((r) =>
    r.no === no ? { ...r, survivors: r.survivors.filter((x) => x.id !== id) } : r,
  ),
});

/** Lets patrol report `no`'s survivor `id` join the camp (design §10); refused without room (`joinLock`). */
export function acceptSurvivor(game: GameState, no: number, id: string): GameResult {
  const s = waiting(game, no, id);
  const lock = joinLock(game);
  if (lock !== null) return { ok: false, reason: lock };
  const g = withoutSurvivor(game, no, id);
  return { ok: true, game: { ...g, roster: [...g.roster, survivorDefender(s)] } };
}

/** Turns patrol report `no`'s survivor `id` away: they are gone for good. */
export function turnAway(game: GameState, no: number, id: string): GameResult {
  waiting(game, no, id);
  return { ok: true, game: withoutSurvivor(game, no, id) };
}

/** What the picks taken add up to (design §11 Camp level). */
const bonus = (camp: Pick<Camp, 'picks'>, id: CampPickId): number =>
  camp.picks[id] * CAMP_PICKS[id].per;

/** Kill-cash factor in a horde. */
export const cashRate = (camp: Pick<Camp, 'picks'>): number => 1 + bonus(camp, 'scavenging') / 100;
/** Cash a horde starts with. */
export const startCash = (camp: Pick<Camp, 'picks'>): number => bonus(camp, 'stockpile');
/** Percent off every repair. */
export const repairOff = (camp: Pick<Camp, 'picks'>): number => bonus(camp, 'salvage');
/** How long an injury rests, in ms. */
export const recoveryMs = (camp: Pick<Camp, 'picks'>): number =>
  (RECOVERY_MS * (100 - bonus(camp, 'medic'))) / 100;
/** What an injured defender can use up to rest less (design §11 Recovery). */
export type Treatment = keyof typeof TREATMENT_MS;

/**
 * Uses one `item` on defender `id`, injured at `now` (design §11 Recovery): it is used
 * up and cuts `TREATMENT_MS[item]` off the rest; a cut past `now` heals them at once.
 */
export function treat(game: GameState, id: string, item: Treatment, now: number): GameResult {
  if (!Number.isFinite(now)) throw new RangeError(`treat: bad time ${now}`);
  const d = game.roster.find((r) => r.id === id);
  if (!d) throw new RangeError(`treat: no defender ${String(id)}`);
  if (!Object.hasOwn(TREATMENT_MS, item)) throw new RangeError(`treat: no item ${String(item)}`);
  if (d.injuredUntil === null || now >= d.injuredUntil) {
    return { ok: false, reason: `${d.name} isn't injured` };
  }
  if (game.stock[item] < 1) return { ok: false, reason: `No ${item} left`, short: true };
  const until = d.injuredUntil - TREATMENT_MS[item];
  return {
    ok: true,
    game: {
      ...game,
      stock: { ...game.stock, [item]: game.stock[item] - 1 },
      roster: game.roster.map((r) =>
        r.id === id ? { ...r, injuredUntil: until > now ? until : null } : r,
      ),
    },
  };
}

/** Percent more patrol materials and Gas. */
export const lootBonus = (camp: Pick<Camp, 'picks'>): number => bonus(camp, 'foraging');
/** Foraging's bonus at its top rank (the most a patrol's materials and Gas can grow). */
export const MAX_FORAGING = CAMP_PICK_RANKS * CAMP_PICKS.foraging.per;

/**
 * Below the roster floor with a slot free: the floor's recruits keep coming, until the
 * count reaches the cap a save reads it at.
 */
const belowFloor = (game: Pick<GameState, 'camp' | 'roster'>): boolean =>
  game.roster.length < CAMP_SIZE.floor &&
  game.roster.length < campSlots(game) &&
  game.camp.recruits < MAX_COUNT;

/** Starts the roster floor's clock at `at` (a death on patrol) if it should run and isn't. Mutates `g`. */
export function startFloor(g: GameState, at: number): void {
  if (g.camp.recruitAt === null && belowFloor(g)) g.camp.recruitAt = at + CAMP_SIZE.recruitMs;
}

/** Free recruit number `no`: level 1, a Rusty pistol, a name from `RECRUIT_NAMES`. */
export function recruit(no: number): RosterDefender {
  return {
    id: `recruit-${no}`,
    name: pick(createRng(Math.imul(no, 0x9e3779b1)), RECRUIT_NAMES),
    loadout: { primary: 'pistol', secondary: null, item: null },
    xp: 0,
    stats: { ...NO_STATS },
    injuredUntil: null,
  };
}

/**
 * The roster floor at `now` (design §11): while fewer than `CAMP_SIZE.floor` defenders are
 * alive and a slot is free, a free recruit arrives every `CAMP_SIZE.recruitMs`, caught up
 * for time the game was closed. The clock starts now when it should run and isn't, and
 * stops at the floor. Returns `game` itself when nothing changes.
 */
export function recruitArrivals(game: GameState, now: number): GameState {
  if (!Number.isFinite(now)) throw new RangeError(`recruitArrivals: bad time ${now}`);
  const at = game.camp.recruitAt;
  if (!belowFloor(game)) {
    return at === null ? game : { ...game, camp: { ...game.camp, recruitAt: null } };
  }
  if (at !== null && at > now) return game;
  const g = structuredClone(game);
  if (at === null) {
    g.camp.recruitAt = now + CAMP_SIZE.recruitMs;
    return g;
  }
  while (g.camp.recruitAt !== null && g.camp.recruitAt <= now) {
    g.camp.recruits += 1;
    g.roster.push(recruit(g.camp.recruits));
    g.camp.recruitAt = belowFloor(g) ? g.camp.recruitAt + CAMP_SIZE.recruitMs : null;
  }
  return g;
}
