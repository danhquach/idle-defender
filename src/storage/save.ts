// The local save (docs/design.md §12): the game between hordes, as versioned JSON in
// browser storage, written after every change. A fight in progress is never saved;
// a reload mid-horde goes back to the camp as it was before it. A save is untrusted
// on the way back in: it is size-checked, parsed, and read through an allow-list
// that builds a new game field by field, so a bad save starts a new game instead of
// crashing, and is kept aside rather than overwritten.
import {
  segmentMaxHp,
  spotOf,
  type Base,
  type BaseLayer,
  type BasePost,
  type BaseSegment,
  type BaseTrap,
  type BaseTurret,
  type PostKind,
} from '../core/base.ts';
import {
  campLevelOf,
  campSlots,
  carLimit,
  newCamp,
  NO_PICKS,
  type Camp,
  type CampOffer,
  type Survivor,
} from '../core/camp.ts';
import {
  affixCount,
  affixesFor,
  type Affix,
  type Held,
  type OwnedWeapon,
} from '../core/armoury.ts';
import {
  AFFIXES,
  ARMOURY_CAP,
  BATTERY_IDS,
  BUILDING_MATERIALS,
  CAMP_PICK_IDS,
  CAMP_PICK_RANKS,
  CAMP_SIZE,
  CAMP_UPGRADES,
  CAR,
  COLUMNS,
  HORDE_ONLY,
  HORROR,
  ITEMS,
  buildingsOf,
  FOCUS_IDS,
  isPlaza,
  LAB_LEVELS,
  LOCATION_IDS,
  MATERIALS,
  MAX_COUNT,
  MAX_CONDITION,
  ORDER_IDS,
  PATROL,
  PERK_IDS,
  PERK_LEVEL,
  PLACE_IDS,
  PLAZAS,
  START_PERK,
  POST_KINDS,
  RARITY_ORDER,
  RECOVERY_MS,
  RESEARCH,
  RESEARCH_IDS,
  revealOf,
  SEGMENTS,
  SQUAD_CAP,
  STATS,
  SURVIVOR,
  TIER_ORDER,
  TRAP_DURABILITY,
  TRAP_KINDS,
  TURRET_MOUNTS,
  FREE_WEAPONS,
  WALK_SPOTS,
  WEAPON_IDS,
  stockOf,
  type Battery,
  type FreeWeaponId,
  type ItemId,
  type LocationId,
  type Material,
  type PlaceId,
  type PerkId,
  type ResearchId,
  type Stats,
  type Stock,
  type Tier,
} from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import { capSquad } from '../core/hordeonly.ts';
import {
  focusOptions,
  partyStrength,
  tripOf,
  type BigHorde,
  type LeftWeapon,
  type Lost,
  type Patrol,
  type PatrolReport,
  type ReportWeapon,
} from '../core/patrol.ts';
import { loadoutError, loadoutFrom, type Loadout } from '../core/loadout.ts';
import { newPerkLevels, perkSlots, type PerkLevels } from '../core/perks.ts';
import { bankCap, loadBatteries, newPower, type Power } from '../core/power.ts';
import {
  entryOf,
  newQueue,
  queueLock,
  type QueueId,
  type ResearchQueue,
} from '../core/research.ts';
import { earnedPoints, isLocked, levelOf, NO_STATS, xpForLevel } from '../core/stats.ts';
import { arr, fail, int, num, obj, oneOf, text, type Obj } from './validate.ts';

export const SAVE_KEY = 'idle-defender.save';
/** Where a save that failed to load is kept, so the new game's autosave doesn't destroy it. */
export const REJECTED_KEY = 'idle-defender.save.rejected';
/**
 * 13 since the stat rework (ID-084): a v12 save's stats are Aim, Might, Tech and Grit.
 * Every point spent there (a defender's, or a survivor's waiting to join) is refunded as
 * unspent points, with a one-time note (`Save.refunded`); a patrol out keeps a strength
 * no higher than its party's today (stats no longer add to it).
 *
 * 12 since the horde-only build (ID-066): a v11 save has no reserve. Loaded into this
 * build, survivors past the squad's cap move to the reserve; every other field loads as
 * it was, hidden or not.
 *
 * 11 since research in Genes (ID-035): a v10 save has no research queue, and owns the
 * starting perk and each perk researched, at level 1.
 *
 * 10 since the car (ID-030): a v9 save's camp has no car and its patrols went on foot.
 *
 * 9 since survivors (ID-032): a v8 save's reports have no survivors waiting and its camp
 * offers are bare lists of picks, with no survivor.
 *
 * 8 since plazas and orders (ID-029): a v7 patrol searched one building with no focus and
 * the Balanced order, so it loads that way; a v7 report has no big horde, no retreat and
 * those defaults. A plaza can only appear in a v8 save.
 *
 * 7 since the camp (ID-033): a v6 save has no camp, so it gets a new one (5 slots, no camp
 * XP or picks; the roster floor's clock starts when the game next runs).
 *
 * 6 since patrol risk (ID-027): a v5 save has no weapons left on the map, and its reports
 * name no casualties.
 *
 * 5 since patrols (ID-026): a v4 save has the same shape less its patrols and reports (none
 * out, none kept). A v3 save also has only the building materials in its stock (the rest
 * start at 0), and a v2 one less its perks too.
 */
export const SAVE_VERSION = 13;
/** Rows a save's base holds, and how far down today's field they sit. */
interface Grid {
  rows: number;
  shift: number;
}
const GRID: Grid = { rows: SEGMENTS, shift: 0 };
/** A v1 save (0.4.x and older) had 5 rows; they become rows 3–7 and the new rows are empty. */
const V1_GRID: Grid = { rows: 5, shift: 3 };
/** A full save is about 2 KB; anything far bigger is not ours and is not parsed. */
export const MAX_SAVE_CHARS = 50_000;
const MAX_HORDE = 100_000;
const MAX_ROSTER = 100;
/** Latest time a save may name, in ms since the epoch (the year 2286). */
const MAX_TIME = 1e13;
/** A defender id: lowercase, safe in an `<option value>` and a lookup key (never `constructor`, the one built-in object key it could spell; ID-085). */
const ID = /^(?!constructor$)[a-z][a-z0-9-]{0,31}$/;
/** A free recruit's id and its number (design §11). */
const RECRUIT = /^recruit-([0-9]+)$/;
/** A defender name: plain letters, spaces, apostrophes and hyphens; no look-alikes or hidden marks. */
const NAME = /^[A-Za-z][A-Za-z' -]{0,23}$/;
/** Most buildings a place holds, so the most a patrol can tick. */
const MAX_BUILDINGS = Math.max(1, ...Object.values(PLAZAS).map((z) => z.buildings.length));
/** Weapons one patrol can find: a haul's rolls for each building. */
const MAX_FOUND = (PATROL.rolls + PATROL.bonusRolls) * MAX_BUILDINGS;
/**
 * An owned weapon's uid: `h` and the horde number that dropped it; `p`, the patrol number
 * that found it and its place in the haul; or a survivor's (`SURVIVOR_ID`).
 */
const UID = new RegExp(
  `^(?:h[1-9][0-9]{0,5}|p[1-9][0-9]{0,5}-(?:${Array.from({ length: MAX_FOUND }, (_, k) => k).join('|')})|s[1-9][0-9]{0,5}-[0-9]|c[1-9][0-9]{0,5})$`,
);
/** A survivor's id (design §10): `s`, the patrol and its try; or `c` and the camp level. */
const SURVIVOR_ID = /^(?:s([1-9][0-9]{0,5})-([0-9])|c([1-9][0-9]{0,5}))$/;
/** Every research queue entry: each node, and each perk's next level. */
const QUEUE_IDS: readonly QueueId[] = [
  ...RESEARCH_IDS,
  ...PERK_IDS.map((p): QueueId => `level-${p}`),
];
/** Seeds are 32-bit. */
const MAX_SEED = 0xffffffff;
/** Only a free weapon is held by id; any other is an owned item with a uid. */
const FREE_IDS: readonly FreeWeaponId[] = FREE_WEAPONS;
const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** The parts of `Storage` the save uses, so tests can pass a plain object. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface Save {
  game: GameState;
  /** When it was written, in ms since the epoch. */
  savedAt: number;
  /** Set when a 5-row (v1) base was moved onto today's taller field. */
  grew?: true;
  /** Set when spent stat points were refunded: an old save's (ID-084), or any in a locked stat. */
  refunded?: true;
}

/**
 * How a save's stats read (ID-084): `legacy` for a v12 or older save (the old four stats,
 * refunded); `refunded` is set by the readers when any spent point was given back.
 */
interface StatsRead {
  legacy: boolean;
  refunded: boolean;
}

/** The pre-ID-084 stats a v12 or older save holds. */
const LEGACY_STATS = ['aim', 'might', 'tech', 'grit'] as const;

/** The page's storage, or null where it is blocked (some private modes throw on access). */
export function browserStorage(): SaveStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function encodeSave(game: GameState, savedAt: number): string {
  return JSON.stringify({ v: SAVE_VERSION, savedAt, game });
}

/** The save in `raw`, or null if it is missing, too big, not JSON or fails any check. */
export function decodeSave(raw: unknown): Save | null {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_CHARS) return null;
  try {
    return readSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Writes `raw` (from encodeSave); false when storage refuses (full, blocked). */
export function writeRaw(storage: SaveStorage, raw: string): boolean {
  try {
    storage.setItem(SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function writeSave(storage: SaveStorage, game: GameState, savedAt: number): boolean {
  return writeRaw(storage, encodeSave(game, savedAt));
}

/**
 * The stored save, or null with `rejected` when one was there but could not be
 * read; that one is copied to REJECTED_KEY first (if it is of a sane size).
 */
export function loadSave(storage: SaveStorage): { save: Save | null; rejected: boolean } {
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { save: null, rejected: false };
  }
  if (raw === null) return { save: null, rejected: false };
  const save = decodeSave(raw);
  if (save) return { save, rejected: false };
  // Only a value that could be ours is worth keeping; a huge one would just fill storage.
  // Only the latest rejected save is kept.
  if (raw.length <= MAX_SAVE_CHARS) {
    try {
      storage.setItem(REJECTED_KEY, raw);
    } catch {
      // Storage full: the new game still starts.
    }
  }
  return { save: null, rejected: true };
}

// The readers below throw Bad on the first problem. They build new objects field by
// field and check the rules the build actions keep, so a loaded game is one the
// game itself could have reached.

function readSave(v: unknown): Save {
  const o = obj(v, ['v', 'savedAt', 'game']);
  if (![SAVE_VERSION, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].includes(o.v as number)) {
    fail('version');
  }
  const savedAt = int(o.savedAt, 0, MAX_TIME);
  const ver = o.v as number;
  const materials = ver >= 4 ? MATERIALS : BUILDING_MATERIALS;
  const patrols = ver >= 8 ? 'plazas' : ver >= 6 ? 'risk' : ver === 5 ? 'patrols' : null;
  const camp = ver >= 7 ? (ver >= 10 ? 'cars' : ver === 9 ? 'survivors' : 'camp') : null;
  const queue = ver >= 11;
  const reserve = ver >= 12;
  const stats: StatsRead = { legacy: ver < 13, refunded: false };
  const grid = ver === 1 ? V1_GRID : GRID;
  const game = readGame(o.game, savedAt, grid, materials, patrols, camp, queue, reserve, stats);
  return {
    game,
    savedAt,
    ...(ver === 1 ? { grew: true as const } : {}),
    ...(stats.refunded ? { refunded: true as const } : {}),
  };
}

function readGame(
  v: unknown,
  savedAt: number,
  grid: Grid,
  materials: readonly Material[],
  /** What the save's patrols carry: none (v4 and older), no risk yet (v5), no plazas yet (v6, v7), or all of it. */
  patrols: 'patrols' | 'risk' | 'plazas' | null,
  /** What the save's camp carries: none (v6 and older), no survivors yet (v7, v8), no car yet (v9), or all of it. */
  hasCamp: 'camp' | 'survivors' | 'cars' | null,
  /** Whether the save has the research queue and perk levels (v11). */
  hasQueue: boolean,
  /** Whether the save has the reserve (v12). */
  hasReserve: boolean,
  stats: StatsRead,
): GameState {
  const lacks = (key: string): boolean =>
    typeof v === 'object' && v !== null && !Object.hasOwn(v, key);
  // A save from before the armoury (0.4.5 and older) has none: it starts empty. One
  // from before the Lab (0.4.6 and older) has no Lab and nothing researched, and
  // keeps its tiers. One from before the battery bank (0.4.7 and older) gets a new
  // game's power. One from before perks (0.4.24 and older) gets a new game's perk.
  const old = {
    armoury: lacks('armoury'),
    lab: lacks('lab') && lacks('research'),
    power: lacks('power'),
    perks: lacks('perks'),
  };
  const o = obj(v, [
    'hordeNumber',
    'base',
    'stock',
    'tiers',
    'roster',
    ...(old.armoury ? [] : ['armoury']),
    ...(old.lab ? [] : ['lab', 'research']),
    ...(old.power ? [] : ['power']),
    ...(old.perks ? [] : ['perks']),
    ...(patrols ? ['patrols', 'patrolsSent', 'reports'] : []),
    ...(patrols === 'risk' || patrols === 'plazas' ? ['leftBehind'] : []),
    ...(hasCamp ? ['camp'] : []),
    ...(hasQueue ? ['queue', 'perkLevels'] : []),
    ...(hasReserve ? ['reserve'] : []),
  ]);
  const tiers = readTiers(o.tiers);
  const lab = old.lab ? 0 : int(o.lab, 0, LAB_LEVELS.length);
  const research = old.lab ? [] : readResearch(o.research, lab, tiers);
  const hordeNumber = int(o.hordeNumber, 1, MAX_HORDE);
  const perkLevels = hasQueue
    ? readPerkLevels(o.perkLevels, research, hordeNumber)
    : ownedLevels(research);
  const queue = hasQueue ? readQueue(o.queue, savedAt, { lab, research, perkLevels }) : newQueue();
  const patrolsSent = patrols ? int(o.patrolsSent, 0, PATROL.max) : 0;
  const roster = readRoster(o.roster, savedAt, hordeNumber, patrolsSent, 1, stats);
  const reserve = hasReserve
    ? readRoster(o.reserve, savedAt, hordeNumber, patrolsSent, 0, stats)
    : [];
  // The checks below treat the reserve as the roster it came from: one camp of people.
  const everyone = [...roster, ...reserve];
  if (new Set(everyone.map((d) => d.id)).size !== everyone.length) fail('id twice');
  const cars = hasCamp === 'cars';
  const survivors = hasCamp === 'survivors' || cars;
  const risk = patrols === 'risk' || patrols === 'plazas';
  const plazas = patrols === 'plazas';
  const out = patrols
    ? readPatrols(o.patrols, savedAt, hordeNumber, patrolsSent, everyone, plazas, cars, stats)
    : [];
  const game: GameState = {
    hordeNumber,
    base: readBase(o.base, tiers, research.includes('auto-turret'), grid),
    stock: readStock(o.stock, materials),
    tiers,
    roster: everyone,
    armoury: old.armoury
      ? []
      : arr(o.armoury, 0, ARMOURY_CAP).map((w) => readOwned(w, hordeNumber, patrolsSent)),
    lab,
    research,
    queue,
    power: old.power ? newPower() : readPower(o.power, savedAt, bankCap({ research })),
    perks: old.perks ? [START_PERK] : readPerks(o.perks, research, perkLevels),
    perkLevels,
    patrols: out,
    patrolsSent,
    reports: patrols
      ? readReports(o.reports, savedAt, patrolsSent, out, risk, plazas, survivors, stats)
      : [],
    leftBehind: risk ? readLeftBehind(o.leftBehind, hordeNumber, patrolsSent, plazas) : [],
    camp: hasCamp
      ? readCamp(o.camp, savedAt, survivors, cars, carLimit({ research }), stats)
      : newCamp(),
    reserve: [],
  };
  // Each car out is one the camp built, on one patrol at a time.
  const taken = out.flatMap((p) => (p.car === null ? [] : [p.car]));
  if (taken.some((c) => c >= game.camp.cars)) fail('car not built');
  if (new Set(taken).size !== taken.length) fail('car on two patrols');
  // The horde-only squad grows to its cap whatever the camp's slots (ID-066), and such a
  // save still loads once the full game is back.
  const room = Math.max(campSlots(game), SQUAD_CAP);
  if (game.roster.length > room) fail('more people than camp slots');
  // A free recruit's number comes from the camp's count, so the next one is always new.
  for (const d of game.roster) {
    const n = RECRUIT.exec(d.id)?.[1];
    if (n !== undefined && Number(n) > game.camp.recruits) fail('recruit not counted');
  }
  // Each owned weapon is one item, in the armoury, in one pair of hands or left on the
  // map, and the camp keeps at most ARMOURY_CAP.
  const owned = [
    ...game.armoury,
    ...game.roster.flatMap((d) => [d.loadout.primary, d.loadout.secondary]),
  ].filter((h): h is OwnedWeapon => typeof h === 'object' && h !== null);
  if (owned.length > ARMOURY_CAP) fail('too many weapons');
  // Survivors waiting to join, in patrol reports and camp offers (design §10, §11).
  const waiting = [
    ...game.reports.flatMap((r) => r.survivors),
    ...game.camp.offers.flatMap((c) => (c.survivor ? [c.survivor] : [])),
  ];
  const every = [
    ...owned,
    ...game.leftBehind.map((l) => l.weapon),
    ...waiting.map((s) => s.weapon),
  ];
  if (new Set(every.map((w) => w.uid)).size !== every.length) fail('weapon twice');
  const people = [...game.roster.map((d) => d.id), ...waiting.map((s) => s.id)];
  if (new Set(people).size !== people.length) fail('survivor twice');
  // A patrol's weapons reach the camp when it comes back, not before.
  const away = new Set(out.map((p) => p.no));
  if (every.some((w) => /^[ps]/.test(w.uid) && away.has(Number(w.uid.slice(1).split('-')[0])))) {
    fail('weapon from a patrol still out');
  }
  // A survivor (and their weapon) comes from a patrol sent or a camp level reached.
  const level = campLevelOf(game.camp.xp).level;
  for (const id of [...people, ...every.map((w) => w.uid)]) {
    const m = SURVIVOR_ID.exec(id);
    if (m && Number(m[1] ?? 0) > patrolsSent) fail('survivor from the future');
    if (m && Number(m[2] ?? 0) >= SURVIVOR.tries) fail('survivor try');
    if (m && Number(m[3] ?? 0) > level) fail('survivor from the future');
  }
  // Loading a save is between hordes: batteries waiting in storage go into the bank.
  // The horde-only build fights with a squad of at most SQUAD_CAP; the full game takes
  // the reserve back onto the roster.
  const loaded = loadBatteries(game);
  return HORDE_ONLY ? capSquad({ ...loaded, roster, reserve }) : loaded;
}

/**
 * The camp (design §11): upgrades bought, lifetime camp XP, and picks and offers no more
 * than its levels have earned, each pick within its ranks and each offer distinct picks
 * still below the top. The floor's clock never runs past a recruit's wait from the save
 * (a clock set back is cut to that).
 */
function readCamp(
  v: unknown,
  savedAt: number,
  survivors: boolean,
  cars: boolean,
  maxCars: number,
  stats: StatsRead,
): Camp {
  const o = obj(v, [
    'upgrades',
    'xp',
    'picks',
    'offers',
    'recruitAt',
    'recruits',
    ...(cars ? ['cars'] : []),
  ]);
  const xp = int(o.xp, 0, MAX_COUNT);
  const p = obj(o.picks, CAMP_PICK_IDS);
  const picks = { ...NO_PICKS };
  for (const id of CAMP_PICK_IDS) picks[id] = int(p[id], 0, CAMP_PICK_RANKS);
  const offers = arr(o.offers, 0, CAMP_PICK_IDS.length * CAMP_PICK_RANKS).map((x): CampOffer => {
    // A v7 offer is a bare list of picks.
    const c = survivors ? obj(x, ['picks', 'survivor']) : { picks: x, survivor: null };
    const survivor = c.survivor === null ? null : readSurvivor(c.survivor, 'c', stats);
    // Level 1 to the camp level their offer came with (`c<level>`), at most 5.
    if (survivor && levelOf(survivor.xp).level > Number(survivor.id.slice(1))) {
      fail('survivor level');
    }
    const offer = arr(c.picks, survivor ? 0 : 1, survivor ? 2 : 3).map((id) =>
      oneOf(id, CAMP_PICK_IDS),
    );
    if (new Set(offer).size !== offer.length) fail('pick twice in an offer');
    if (offer.some((id) => picks[id] >= CAMP_PICK_RANKS)) fail('offer at the top rank');
    return { picks: offer, survivor };
  });
  const taken = CAMP_PICK_IDS.reduce((n, id) => n + picks[id], 0);
  if (taken + offers.length > campLevelOf(xp).level - 1) fail('picks not earned');
  return {
    upgrades: int(o.upgrades, 0, CAMP_UPGRADES.length),
    xp,
    picks,
    offers,
    recruitAt:
      o.recruitAt === null
        ? null
        : Math.min(int(o.recruitAt, 0, MAX_TIME), savedAt + CAMP_SIZE.recruitMs),
    recruits: int(o.recruits, 0, MAX_COUNT),
    cars: cars ? int(o.cars, 0, maxCars) : 0,
  };
}

function readTiers(v: unknown): Tier[] {
  const tiers = arr(v, 1, TIER_ORDER.length).map((t) => oneOf(t, TIER_ORDER));
  if (new Set(tiers).size !== tiers.length) fail('tier twice');
  return tiers;
}

/**
 * Research the game could have done: known nodes, once each, in an order where each
 * one's earlier node comes first, each within `lab`'s level, and each one's tier
 * unlocked. A tier with no node behind it is allowed: a save from before the Lab
 * keeps its tiers, and must still load after it is saved again.
 */
function readResearch(v: unknown, lab: number, tiers: readonly Tier[]): ResearchId[] {
  const done: ResearchId[] = [];
  for (const x of arr(v, 0, RESEARCH_IDS.length)) {
    const id = oneOf(x, RESEARCH_IDS);
    const node = RESEARCH[id];
    if (done.includes(id)) fail('research twice');
    if (node.lab > lab) fail('research above the Lab');
    if (node.needs && !done.includes(node.needs)) fail('research out of order');
    if (node.tier && !tiers.includes(node.tier)) fail('tier not unlocked');
    done.push(id);
  }
  return done;
}

/** Equipped perks: known, once each, owned, and no more than the slots researched. */
function readPerks(
  v: unknown,
  research: readonly ResearchId[],
  levels: Readonly<PerkLevels>,
): PerkId[] {
  const perks: PerkId[] = [];
  for (const x of arr(v, 0, perkSlots({ research }))) {
    const id = oneOf(x, PERK_IDS);
    if (perks.includes(id)) fail('perk twice');
    if (levels[id] < 1) fail('perk not owned');
    perks.push(id);
  }
  return perks;
}

/** A v10 save's perk levels: the starting perk and each one researched, at level 1. */
function ownedLevels(research: readonly ResearchId[]): PerkLevels {
  const levels = newPerkLevels();
  for (const id of PERK_IDS) if ((research as readonly string[]).includes(id)) levels[id] = 1;
  return levels;
}

/**
 * Each perk's level, 0 (not owned) to the top: the starting perk and each one researched
 * owned, and no more owned besides than the boss hordes won could have given.
 */
function readPerkLevels(
  v: unknown,
  research: readonly ResearchId[],
  hordeNumber: number,
): PerkLevels {
  const o = obj(v, PERK_IDS);
  const levels = newPerkLevels();
  for (const id of PERK_IDS) levels[id] = int(o[id], 0, PERK_LEVEL.top);
  const base = ownedLevels(research);
  if (PERK_IDS.some((id) => base[id] > levels[id])) fail('researched perk not owned');
  const gifts = PERK_IDS.filter((id) => levels[id] > 0 && base[id] === 0).length;
  if (gifts > Math.floor((hordeNumber - 1) / HORROR.every)) fail('perk from no boss');
  return levels;
}

/**
 * The research queue: known entries, once each, each one the game would let be queued
 * behind the ones before it (Lab level, earlier node, perk owned, the queue's size). The
 * running one ends no later than its full time after the save (a clock set back is cut
 * to that, as rests are); an empty queue has no end.
 */
function readQueue(
  v: unknown,
  savedAt: number,
  game: Pick<GameState, 'lab' | 'research' | 'perkLevels'>,
): ResearchQueue {
  const o = obj(v, ['ids', 'endsAt']);
  const ids: QueueId[] = [];
  for (const x of arr(o.ids, 0, QUEUE_IDS.length)) {
    const id = oneOf(x, QUEUE_IDS);
    if (queueLock({ ...game, queue: { ids, endsAt: null } }, id) !== null) fail('queue entry');
    ids.push(id);
  }
  const head = ids[0];
  if (head === undefined) {
    if (o.endsAt !== null) fail('empty queue with an end');
    return newQueue();
  }
  const full = entryOf(game, head).minutes * 60_000;
  return { ids, endsAt: Math.min(int(o.endsAt, 0, MAX_TIME), savedAt + full) };
}

/** Exactly `materials`, each a whole count; any the save predates start at 0. */
function readStock(v: unknown, materials: readonly Material[]): Stock {
  const o = obj(v, materials);
  const stock = stockOf();
  for (const m of materials) stock[m] = int(o[m], 0, MAX_COUNT);
  return stock;
}

/**
 * The bank (0 to the cap), whole counts of Gas and each battery, and the generator.
 * Its clock never runs past the save: a later one (a clock set back) is cut to it.
 */
function readPower(v: unknown, savedAt: number, cap: number): Power {
  const o = obj(v, ['bank', 'gas', 'batteries', 'generator']);
  const b = obj(o.batteries, BATTERY_IDS);
  const batteries = {} as Power['batteries'];
  for (const id of BATTERY_IDS) batteries[id] = int(b[id], 0, MAX_COUNT);
  let generator: Power['generator'] = null;
  if (o.generator !== null) {
    const g = obj(o.generator, ['at']);
    generator = { at: g.at === null ? null : Math.min(int(g.at, 0, MAX_TIME), savedAt) };
  }
  return { bank: num(o.bank, 0, cap), gas: int(o.gas, 0, MAX_COUNT), batteries, generator };
}

function readBase(
  v: unknown,
  tiers: readonly Tier[],
  turretsResearched: boolean,
  grid: Grid,
): Base {
  // A base from before turrets (0.4.6 and older) has none, and one from before traps
  // (0.4.9 and older) has no traps key and loads with none. A base with traps but no
  // turrets key was never written, so its traps key is refused as unknown.
  const old = typeof v === 'object' && v !== null && !Object.hasOwn(v, 'turrets');
  const noTraps = old || (typeof v === 'object' && v !== null && !Object.hasOwn(v, 'traps'));
  const o = obj(v, ['layers', 'posts', ...(old ? [] : ['turrets']), ...(noTraps ? [] : ['traps'])]);
  const layers = arr(o.layers, 1, COLUMNS.length).map((l) => readLayer(l, tiers, grid));
  for (let i = 1; i < layers.length; i++) {
    if (layers[i]!.column <= layers[i - 1]!.column) fail('layers out of order');
  }
  // Each kind once per slot, plus a wall-walk's extra spots.
  const postSlots = POST_KINDS.length + WALK_SPOTS - 1;
  const posts = arr(o.posts, 0, COLUMNS.length * SEGMENTS * postSlots).map((p) =>
    readPost(p, grid),
  );
  for (let i = 1; i < posts.length; i++) {
    if (postOrder(posts[i - 1]!, posts[i]!) >= 0) fail('posts out of order');
  }
  for (const p of posts) {
    const layer = layers.find((l) => l.column === p.column);
    // The rules buildPost keeps: a wall-walk sits on a wall, the others behind one.
    if (p.kind === 'wall-walk' ? !layer?.slots[p.row] : !layer) fail('post with no wall');
  }
  const turrets = old
    ? []
    : arr(o.turrets, 0, COLUMNS.length * SEGMENTS * (TURRET_MOUNTS.length + WALK_SPOTS - 1)).map(
        (t) => readTurret(t, grid),
      );
  if (turrets.length > 0 && !turretsResearched) fail('turret not researched');
  for (let i = 1; i < turrets.length; i++) {
    if (turretOrder(turrets[i - 1]!, turrets[i]!) >= 0) fail('turrets out of order');
  }
  for (const t of turrets) {
    // The rules buildTurret keeps: a wall mount sits on a wall, a tower behind one, and a spot holds a post or a turret.
    const layer = layers.find((l) => l.column === t.column);
    if (t.mount === 'wall-walk' ? !layer?.slots[t.row] : !layer) fail('turret with no wall');
    if (
      posts.some(
        (p) =>
          p.kind === t.mount && p.column === t.column && p.row === t.row && spotOf(p) === spotOf(t),
      )
    ) {
      fail('turret on a post');
    }
  }
  const traps = noTraps ? [] : arr(o.traps, 0, SEGMENTS).map((t) => readTrap(t, grid));
  // The order buildTrap keeps, which also means one trap per cell.
  for (let i = 1; i < traps.length; i++) {
    if (traps[i]!.row <= traps[i - 1]!.row) fail('traps out of order');
  }
  return { layers, posts, turrets, traps };
}

function readTrap(v: unknown, grid: Grid): BaseTrap {
  const o = obj(v, ['kind', 'row', 'durability']);
  return {
    kind: oneOf(o.kind, TRAP_KINDS),
    row: int(o.row, 0, grid.rows - 1) + grid.shift,
    durability: int(o.durability, 0, TRAP_DURABILITY) + 0, // + 0 turns -0 into 0
  };
}

function readTurret(v: unknown, grid: Grid): BaseTurret {
  const keys = ['mount', 'column', 'row', 'condition'];
  const o = obj(v, hasSpot(v) ? [...keys, 'spot'] : keys);
  const mount = oneOf(o.mount, TURRET_MOUNTS);
  return {
    mount,
    column: int(o.column, 0, COLUMNS.length - 1),
    row: int(o.row, 0, grid.rows - 1) + grid.shift,
    ...readSpot(o, mount),
    condition: num(o.condition, 0, MAX_CONDITION) + 0, // + 0 turns -0 into 0
  };
}

const hasSpot = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && Object.hasOwn(v, 'spot');

/**
 * A wall-walk's spot past the first, as `spotField` writes it: spot 0 is never written,
 * and only a wall-walk has others. A post from before spots (0.4.15 and older) has none:
 * it keeps the first spot of its segment.
 */
function readSpot(o: Obj, kind: PostKind): { spot?: number } {
  if (!Object.hasOwn(o, 'spot')) return {};
  if (kind !== 'wall-walk') fail('spot off a wall');
  return { spot: int(o.spot, 1, WALK_SPOTS - 1) };
}

function readLayer(v: unknown, tiers: readonly Tier[], grid: Grid): BaseLayer {
  const o = obj(v, ['column', 'slots']);
  const read = arr(o.slots, grid.rows, grid.rows).map((s) =>
    s === null ? null : readSegment(s, tiers),
  );
  const slots = Array.from({ length: SEGMENTS }, (_, row) => read[row - grid.shift] ?? null);
  if (slots.every((s) => s === null)) fail('empty layer');
  if (slots.filter((s) => s?.kind === 'gate').length > 1) fail('two gates');
  return { column: int(o.column, 0, COLUMNS.length - 1), slots };
}

function readSegment(v: unknown, tiers: readonly Tier[]): BaseSegment {
  const o = obj(v, ['kind', 'tier', 'hp', 'maxHp']);
  const kind = oneOf(o.kind, ['wall', 'gate'] as const);
  const tier = oneOf(o.tier, TIER_ORDER);
  if (!tiers.includes(tier)) fail('locked tier');
  // Max HP comes from today's numbers, not the save, so retuning a tier never
  // refuses an older save; HP above it is cut to it.
  num(o.maxHp, 1, MAX_COUNT); // shape only; the value is not used
  const maxHp = segmentMaxHp(kind, tier);
  return { kind, tier, hp: Math.min(int(o.hp, 0, MAX_COUNT), maxHp), maxHp };
}

function readPost(v: unknown, grid: Grid): BasePost {
  const keys = ['kind', 'column', 'row'];
  const o = obj(v, hasSpot(v) ? [...keys, 'spot'] : keys);
  const kind = oneOf(o.kind, POST_KINDS);
  return {
    kind,
    column: int(o.column, 0, COLUMNS.length - 1),
    row: int(o.row, 0, grid.rows - 1) + grid.shift,
    ...readSpot(o, kind),
  };
}

/**
 * Points spent per stat: no more in all than lifetime `xp` has earned. An old save's
 * (`read.legacy`, the pre-ID-084 four) are checked the same way, then all refunded; a
 * point in a locked stat (Tinker, which no build lets a player spend) is refunded too.
 */
function readStats(v: unknown, xp: number, read: StatsRead): Stats {
  const keys: readonly string[] = read.legacy ? LEGACY_STATS : STATS;
  const o = obj(v, keys);
  let spent = 0;
  for (const k of keys) spent += int(o[k], 0, MAX_COUNT);
  if (spent > earnedPoints(xp)) fail('points not earned');
  const stats = { ...NO_STATS };
  if (read.legacy) {
    if (spent > 0) read.refunded = true;
    return stats;
  }
  for (const s of STATS) {
    const n = o[s] as number;
    if (isLocked(s)) {
      if (n > 0) read.refunded = true;
    } else stats[s] = n;
  }
  return stats;
}

/** The order buildPost keeps posts in: column, then kind, then row, then spot. */
function postOrder(a: BasePost, b: BasePost): number {
  return (
    a.column - b.column ||
    (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
    a.row - b.row ||
    spotOf(a) - spotOf(b)
  );
}

/** The order buildTurret keeps turrets in: column, then mount, then row, then spot. */
function turretOrder(a: BaseTurret, b: BaseTurret): number {
  return (
    a.column - b.column ||
    (a.mount < b.mount ? -1 : a.mount > b.mount ? 1 : 0) ||
    a.row - b.row ||
    spotOf(a) - spotOf(b)
  );
}

/** A loadout the game allows (design §6): a gun as primary, a shield only with a blade. */
function readLoadout(v: unknown, hordeNumber: number, patrolsSent: number): Loadout {
  const o = obj(v, ['primary', 'secondary', 'item']);
  const loadout: Loadout = {
    primary: readHeld(o.primary, hordeNumber, patrolsSent),
    secondary: o.secondary === null ? null : readHeld(o.secondary, hordeNumber, patrolsSent),
    item: o.item === null ? null : oneOf(o.item, ITEM_IDS),
  };
  if (loadoutError(loadout) !== null) fail('bad loadout');
  return loadout;
}

/** A free weapon by id, or an owned one. */
function readHeld(v: unknown, hordeNumber: number, patrolsSent: number): Held {
  return typeof v === 'string' ? oneOf(v, FREE_IDS) : readOwned(v, hordeNumber, patrolsSent);
}

/**
 * An owned weapon the game could have dropped: a uid from a horde already won or a
 * patrol already sent, and exactly its rarity's affixes, each one that fits the
 * weapon, once, in range.
 */
function readOwned(v: unknown, hordeNumber: number, patrolsSent: number): OwnedWeapon {
  const o = obj(v, ['uid', 'base', 'rarity', 'affixes']);
  const uid = text(o.uid, 8 + String(MAX_FOUND - 1).length, UID);
  const from = Number(uid.slice(1).split('-')[0]);
  // A survivor's camp-level weapon (`c`) is checked against the camp, once it is read.
  if (!uid.startsWith('c') && from >= (uid.startsWith('h') ? hordeNumber : patrolsSent + 1)) {
    fail('weapon from the future');
  }
  const base = oneOf(o.base, WEAPON_IDS);
  const rarity = oneOf(o.rarity, RARITY_ORDER);
  const count = affixCount(base, rarity);
  const fits = affixesFor(base);
  const affixes = arr(o.affixes, count, count).map((a): Affix => {
    const x = obj(a, ['id', 'value']);
    const id = oneOf(x.id, fits);
    return { id, value: int(x.value, AFFIXES[id].min, AFFIXES[id].max) };
  });
  if (new Set(affixes.map((a) => a.id)).size !== affixes.length) fail('affix twice');
  return { uid, base, rarity, affixes };
}

function readRoster(
  v: unknown,
  savedAt: number,
  hordeNumber: number,
  patrolsSent: number,
  /** Fewest it may hold: 1 for the roster, 0 for the reserve. */
  min: number,
  stats: StatsRead,
): RosterDefender[] {
  const list = arr(v, min, MAX_ROSTER);
  const lacks = (key: string): boolean =>
    list.every((d) => typeof d === 'object' && d !== null && !Object.hasOwn(d, key));
  // A save from before stats (0.4.1 and older) has none on any defender: all 0.
  // One from before loadouts (0.4.3 and older) has a single `weapon` on each instead.
  const old = { stats: lacks('stats'), loadout: lacks('loadout') };
  const roster = list.map((d) => readDefender(d, savedAt, hordeNumber, patrolsSent, old, stats));
  if (new Set(roster.map((d) => d.id)).size !== roster.length) fail('id twice');
  return roster;
}

const DEFENDER_KEYS = ['id', 'name', 'xp', 'injuredUntil'];

function readDefender(
  v: unknown,
  savedAt: number,
  hordeNumber: number,
  patrolsSent: number,
  old: { stats: boolean; loadout: boolean },
  read: StatsRead,
): RosterDefender {
  const keys = [...DEFENDER_KEYS, old.loadout ? 'weapon' : 'loadout'];
  const o = obj(v, old.stats ? keys : [...keys, 'stats']);
  const xp = int(o.xp, 0, MAX_COUNT);
  return {
    id: text(o.id, 32, ID),
    name: text(o.name, 24, NAME),
    loadout: old.loadout
      ? loadoutFrom(oneOf(o.weapon, FREE_IDS))
      : readLoadout(o.loadout, hordeNumber, patrolsSent),
    xp,
    stats: old.stats ? { ...NO_STATS } : readStats(o.stats, xp, read),
    // A rest never runs past RECOVERY_MS from when the game was saved; a later one (a
    // clock set back, a code from a device whose clock runs ahead) is cut to that.
    injuredUntil:
      o.injuredUntil === null
        ? null
        : Math.min(num(o.injuredUntil, 0, MAX_TIME), savedAt + RECOVERY_MS),
  };
}

/**
 * Parties out (design §10): each sent once, in order, from patrol 1 to `patrolsSent`, to
 * a location on the map, after patrols opened. Each member is on the roster, on one
 * patrol only, and was fit when it left. A start after the save (a clock set back) is cut
 * to it, as the generator's is. Its strength is never above what the party has now:
 * levels and weapons don't change while away, and stat points only grow.
 */
function readPatrols(
  v: unknown,
  savedAt: number,
  hordeNumber: number,
  patrolsSent: number,
  roster: readonly RosterDefender[],
  plazas: boolean,
  /** Whether a patrol names the car it took (v10); an older one went on foot. */
  cars: boolean,
  stats: StatsRead,
): Patrol[] {
  const seen = new Set<string>();
  const patrols = arr(v, 0, roster.length).map((x): Patrol => {
    const o = obj(x, [
      'no',
      'location',
      'members',
      'sentAt',
      'sentHorde',
      'strength',
      'seed',
      ...(plazas ? ['buildings', 'focus', 'order'] : []),
      ...(cars ? ['car'] : []),
    ]);
    const no = int(o.no, 1, patrolsSent);
    const sentHorde = int(o.sentHorde, PATROL.unlock, hordeNumber);
    const location = oneOf(o.location, plazas ? PLACE_IDS : LOCATION_IDS);
    const reveal = revealOf(location);
    if (reveal === null || reveal > sentHorde) fail('location not on the map');
    const { buildings, focus, order } = plazas
      ? readOrders(o, location)
      : {
          buildings: [location as LocationId],
          focus: 'anything' as const,
          order: 'balanced' as const,
        };
    const sentAt = Math.min(int(o.sentAt, 0, MAX_TIME), savedAt);
    const members = arr(o.members, 1, roster.length).map((m) => {
      const id = text(m, 32, ID);
      const d = roster.find((r) => r.id === id);
      if (!d) fail('patrol member not on the roster');
      if (seen.has(id)) fail('member on two patrols');
      if (d.injuredUntil !== null && d.injuredUntil > sentAt) fail('sent injured');
      seen.add(id);
      return d;
    });
    const most = partyStrength(members);
    // A v12 or older patrol's strength counted Grit, which no longer adds to it (ID-084).
    const strength = stats.legacy
      ? Math.min(num(o.strength, 0, MAX_COUNT), most)
      : num(o.strength, 0, MAX_COUNT);
    if (strength > most) fail('patrol stronger than its party');
    return {
      no,
      location,
      buildings,
      focus,
      order,
      members: members.map((d) => d.id),
      sentAt,
      sentHorde,
      strength,
      seed: int(o.seed, 0, MAX_SEED),
      car: !cars || o.car === null ? null : int(o.car, 0, CAR.limit + CAR.more - 1),
    };
  });
  for (let i = 1; i < patrols.length; i++) {
    if (patrols[i]!.no <= patrols[i - 1]!.no) fail('patrols out of order');
  }
  return patrols;
}

/**
 * A patrol's or report's buildings, focus and order (ID-029): buildings of the place,
 * each once, in its order; a focus its buildings can drop; a known order.
 */
function readOrders(
  o: Obj,
  location: PlaceId,
): { buildings: LocationId[]; focus: Patrol['focus']; order: Patrol['order'] } {
  const buildings = arr(o.buildings, 1, MAX_BUILDINGS).map((b) => oneOf(b, LOCATION_IDS));
  const inOrder = buildingsOf(location).filter((b) => buildings.includes(b));
  if (inOrder.length !== buildings.length || inOrder.some((b, i) => b !== buildings[i])) {
    fail('buildings not in the place');
  }
  const focus = oneOf(o.focus, FOCUS_IDS);
  if (!focusOptions(buildings).includes(focus)) fail('focus not found there');
  return { buildings, focus, order: oneOf(o.order, ORDER_IDS) };
}

/**
 * Weapons the dead left on the map (design §10): at most `PATROL.left`, each an owned
 * weapon at a place that has been on the map.
 */
function readLeftBehind(
  v: unknown,
  hordeNumber: number,
  patrolsSent: number,
  plazas: boolean,
): LeftWeapon[] {
  return arr(v, 0, PATROL.left).map((x): LeftWeapon => {
    const o = obj(x, ['location', 'weapon']);
    const location = oneOf(o.location, plazas ? PLACE_IDS : LOCATION_IDS);
    const reveal = revealOf(location);
    if (reveal === null || reveal > hordeNumber) fail('location not on the map');
    return { location, weapon: readOwned(o.weapon, hordeNumber, patrolsSent) };
  });
}

/**
 * A survivor waiting to join (design §10): from a patrol (`s`) or a camp level-up (`c`),
 * a plain name, the XP of a level no higher than any tier, points no more than that
 * earns, and an owned weapon whose uid is their id. Where the id comes from is checked
 * with the rest of the game.
 */
function readSurvivor(v: unknown, from: 's' | 'c', stats: StatsRead): Survivor {
  const o = obj(v, ['id', 'name', 'xp', 'stats', 'weapon']);
  const id = text(o.id, 9, SURVIVOR_ID);
  if (!id.startsWith(from)) fail('survivor id');
  const xp = int(o.xp, 0, MAX_COUNT);
  const { level } = levelOf(xp);
  if (level > SURVIVOR.campLevel || xp !== xpForLevel(level)) fail('survivor level');
  // The weapon's uid is the survivor's own, so the future checks pass it through.
  const weapon = readOwned(o.weapon, MAX_HORDE, PATROL.max);
  if (weapon.uid !== id) fail('survivor weapon');
  return { id, name: text(o.name, 24, NAME), xp, stats: readStats(o.stats, xp, stats), weapon };
}

/** How a big horde ended; only a plaza has one. */
function readBigHorde(v: unknown, location: PlaceId): BigHorde | null {
  if (v === null) return null;
  if (!isPlaza(location)) fail('big horde at a single building');
  return oneOf(v, ['defeat', 'fence', 'overrun'] as const);
}

const noLost = (): Lost => ({
  stock: stockOf(),
  gas: 0,
  batteries: Object.fromEntries(BATTERY_IDS.map((b) => [b, 0])) as Record<Battery, number>,
  weapons: 0,
});

/** What a retreat dropped, at most `found` weapons. */
function readLost(v: unknown, found: number): Lost {
  const o = obj(v, ['stock', 'gas', 'batteries', 'weapons']);
  const b = obj(o.batteries, BATTERY_IDS);
  const batteries = {} as Record<Battery, number>;
  for (const id of BATTERY_IDS) batteries[id] = int(b[id], 0, MAX_COUNT);
  return {
    stock: readStock(o.stock, MATERIALS),
    gas: int(o.gas, 0, MAX_COUNT),
    batteries,
    weapons: int(o.weapons, 0, found),
  };
}

function readReportWeapon(w: unknown): ReportWeapon {
  const x = obj(w, ['base', 'rarity', 'kept']);
  if (typeof x.kept !== 'boolean') fail('kept');
  return {
    base: oneOf(x.base, WEAPON_IDS),
    rarity: oneOf(x.rarity, RARITY_ORDER),
    kept: x.kept,
  };
}

/**
 * Patrol reports: at most `PATROL.reports`, each from a patrol sent and back, oldest
 * first. The injured and dead are members named in it, never both; a wiped-out party
 * lost every member and brought back nothing. A v5 report (`risk` false) has no
 * casualties.
 */
function readReports(
  v: unknown,
  savedAt: number,
  patrolsSent: number,
  out: readonly Patrol[],
  risk: boolean,
  plazas: boolean,
  /** Whether reports list survivors waiting (v9). */
  survivors: boolean,
  stats: StatsRead,
): PatrolReport[] {
  const reports = arr(v, 0, PATROL.reports).map((x): PatrolReport => {
    const o = obj(x, [
      'no',
      'location',
      'names',
      'returnedAt',
      'stock',
      'gas',
      'batteries',
      'weapons',
      'xp',
      ...(risk ? ['injured', 'dead', 'wiped', 'recovered'] : []),
      ...(plazas ? ['buildings', 'searched', 'bigHorde', 'order', 'focus', 'lost'] : []),
      ...(survivors ? ['survivors'] : []),
    ]);
    const no = int(o.no, 1, patrolsSent);
    if (out.some((p) => p.no === no)) fail('report from a patrol still out');
    const b = obj(o.batteries, BATTERY_IDS);
    const batteries = {} as Record<Battery, number>;
    for (const id of BATTERY_IDS) batteries[id] = int(b[id], 0, MAX_COUNT);
    const names = arr(o.names, 0, MAX_ROSTER).map((n) => text(n, 24, NAME));
    const named = (list: unknown): string[] =>
      arr(list, 0, names.length).map((n) => text(n, 24, NAME));
    const injured = risk ? named(o.injured) : [];
    const dead = risk ? named(o.dead) : [];
    // Each member is hurt or killed once at most; names may repeat, so they are counted.
    const count = (list: readonly string[], name: string) => list.filter((n) => n === name).length;
    for (const n of [...injured, ...dead]) {
      if (count(injured, n) + count(dead, n) > count(names, n)) fail('casualty not in the party');
    }
    if (risk && typeof o.wiped !== 'boolean') fail('wiped');
    const wiped = risk && o.wiped === true;
    if (wiped !== (names.length > 0 && dead.length === names.length)) fail('wipe');
    const location = oneOf(o.location, plazas ? PLACE_IDS : LOCATION_IDS);
    const { buildings, focus, order } = plazas
      ? readOrders(o, location)
      : {
          buildings: [location as LocationId],
          focus: 'anything' as const,
          order: 'balanced' as const,
        };
    const bigHorde = plazas ? readBigHorde(o.bigHorde, location) : null;
    const searched = plazas ? int(o.searched, 0, buildings.length) : 1;
    // Only a retreat searches less than every building.
    if (searched !== buildings.length && bigHorde !== 'fence' && bigHorde !== 'overrun') {
      fail('searched less without a retreat');
    }
    // A building's haul has at most `PATROL.rolls + PATROL.bonusRolls` weapons.
    const maxWeapons = (PATROL.rolls + PATROL.bonusRolls) * buildings.length;
    const lost = plazas ? readLost(o.lost, maxWeapons) : noLost();
    const report: PatrolReport = {
      no,
      location,
      buildings,
      searched,
      bigHorde,
      order,
      focus,
      lost,
      names,
      injured,
      dead,
      wiped,
      returnedAt: Math.min(int(o.returnedAt, 0, MAX_TIME), savedAt),
      stock: readStock(o.stock, MATERIALS),
      gas: int(o.gas, 0, MAX_COUNT),
      batteries,
      weapons: arr(o.weapons, 0, maxWeapons).map(readReportWeapon),
      recovered: risk ? arr(o.recovered, 0, PATROL.left).map(readReportWeapon) : [],
      xp: int(o.xp, 0, MAX_COUNT),
      survivors: survivors
        ? arr(o.survivors, 0, SURVIVOR.tries).map((x) => {
            const s = readSurvivor(x, 's', stats);
            if (!s.id.startsWith(`s${no}-`)) fail('survivor from another patrol');
            if (levelOf(s.xp).level > tripOf(location, buildings).tier) fail('survivor level');
            return s;
          })
        : [],
    };
    const found =
      report.xp > 0 ||
      report.gas > 0 ||
      report.weapons.length > 0 ||
      report.recovered.length > 0 ||
      report.survivors.length > 0 ||
      MATERIALS.some((m) => report.stock[m] > 0) ||
      BATTERY_IDS.some((id) => batteries[id] > 0);
    if (wiped && found) {
      fail('a wiped-out party brought something back');
    }
    return report;
  });
  if (new Set(reports.map((r) => r.no)).size !== reports.length) fail('report twice');
  return reports;
}
