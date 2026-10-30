// The camp (design §11, as built ID-033): capacity and the material camp upgrades that
// add slots, dismissing, the roster floor's free recruits, and camp XP with its
// permanent level-up picks. Pure: each action returns a new game or a refusal the UI
// shows as-is; real time comes in as `now`.
import { isOwned } from './armoury.ts';
import {
  CAMP_SIZE,
  CAMP_PICK_IDS,
  CAMP_PICK_RANKS,
  CAMP_PICKS,
  CAMP_UPGRADES,
  DEFENDER_XP,
  MATERIALS,
  MAX_COUNT,
  RECOVERY_MS,
  RECRUIT_NAMES,
  type CampPickId,
  type Stock,
} from './data.ts';
import type { GameState, RosterDefender } from './game.ts';
import type { HordeState } from './horde.ts';
import type { GameResult } from './research.ts';
import { createRng, int, pick, type Rng } from './rng.ts';
import { NO_STATS } from './stats.ts';

export interface Camp {
  /** Material camp upgrades bought, each `CAMP_SIZE.perUpgrade` more slots. */
  upgrades: number;
  /** Lifetime camp XP; the camp level comes from it. */
  xp: number;
  /** The rank of each camp-level pick taken. */
  picks: Record<CampPickId, number>;
  /** Level-up offers still to pick from, oldest first. */
  offers: CampPickId[][];
  /** When the roster floor's next free recruit arrives (ms); null while it isn't running. */
  recruitAt: number | null;
  /** Free recruits so far; the next one is `recruit-<recruits + 1>`. */
  recruits: number;
}

export const NO_PICKS: Readonly<Record<CampPickId, number>> = Object.fromEntries(
  CAMP_PICK_IDS.map((id) => [id, 0]),
) as Record<CampPickId, number>;

export function newCamp(): Camp {
  return { upgrades: 0, xp: 0, picks: { ...NO_PICKS }, offers: [], recruitAt: null, recruits: 0 };
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
    return { ok: false, reason: 'Not enough materials' };
  }
  const stock = { ...game.stock };
  for (const m of MATERIALS) stock[m] -= cost[m] ?? 0;
  return {
    ok: true,
    game: { ...game, stock, camp: { ...game.camp, upgrades: game.camp.upgrades + 1 } },
  };
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
 * so the result screen and `finishHorde` agree. An offer with nothing left is dropped.
 */
export function hordeCampOffers(
  game: Pick<GameState, 'camp'>,
  h: Pick<HordeState, 'hordeNumber' | 'outcome' | 'rng'>,
): CampPickId[][] {
  const before = game.camp.xp;
  const after = campXpAfter(game, h);
  const levels = campLevelOf(after).level - campLevelOf(before).level;
  const rng = createRng(h.rng.s ^ 0x5bd1e995);
  return Array.from({ length: levels }, () => rollOffer(rng, game.camp.picks)).filter(
    (o) => o.length > 0,
  );
}

/**
 * `camp` after taking `id` from its oldest offer: its rank goes up one and the offer is
 * gone. Later offers lose any pick now at the top rank, and one left empty is dropped.
 * Refused when `id` isn't in that offer.
 */
export function campAfterPick<T extends Pick<Camp, 'picks' | 'offers'>>(
  camp: T,
  id: CampPickId,
): { ok: true; camp: T } | { ok: false; reason: string } {
  const offer = camp.offers[0];
  if (!offer) return { ok: false, reason: 'No camp pick waiting' };
  if (!offer.includes(id)) return { ok: false, reason: `${String(id)} isn't on offer` };
  const picks = { ...camp.picks, [id]: camp.picks[id] + 1 };
  const offers = camp.offers
    .slice(1)
    .map((o) => o.filter((x) => picks[x] < CAMP_PICK_RANKS))
    .filter((o) => o.length > 0);
  return { ok: true, camp: { ...camp, picks, offers } };
}

/** Takes `id` from the oldest camp-level offer (`campAfterPick`). */
export function takeCampPick(game: GameState, id: CampPickId): GameResult {
  const r = campAfterPick(game.camp, id);
  return r.ok ? { ok: true, game: { ...game, camp: r.camp } } : r;
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
/** Percent more patrol materials and Gas. */
export const lootBonus = (camp: Pick<Camp, 'picks'>): number => bonus(camp, 'foraging');

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
