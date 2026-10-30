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
  affixCount,
  affixesFor,
  type Affix,
  type Held,
  type OwnedWeapon,
} from '../core/armoury.ts';
import {
  AFFIXES,
  ARMOURY_CAP,
  BANK_CAP,
  BATTERY_IDS,
  BUILDING_MATERIALS,
  COLUMNS,
  ITEMS,
  LAB_LEVELS,
  LOCATION_IDS,
  LOCATIONS,
  MATERIALS,
  MAX_COUNT,
  MAX_CONDITION,
  PATROL,
  PERK_IDS,
  START_PERK,
  POST_KINDS,
  RARITY_ORDER,
  RECOVERY_MS,
  RESEARCH,
  RESEARCH_IDS,
  SEGMENTS,
  STATS,
  TIER_ORDER,
  TRAP_DURABILITY,
  TRAP_KINDS,
  TURRET_MOUNTS,
  FREE_WEAPONS,
  WALK_SPOTS,
  WEAPONS,
  stockOf,
  type Battery,
  type FreeWeaponId,
  type ItemId,
  type Material,
  type PerkId,
  type ResearchId,
  type Stats,
  type Stock,
  type Tier,
  type WeaponId,
} from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import {
  partyStrength,
  type LeftWeapon,
  type Patrol,
  type PatrolReport,
  type ReportWeapon,
} from '../core/patrol.ts';
import { loadoutError, loadoutFrom, type Loadout } from '../core/loadout.ts';
import { perkSlots, unlockedPerks } from '../core/perks.ts';
import { loadBatteries, newPower, type Power } from '../core/power.ts';
import { earnedPoints, NO_STATS, spentPoints } from '../core/stats.ts';
import { arr, fail, int, num, obj, oneOf, text, type Obj } from './validate.ts';

export const SAVE_KEY = 'idle-defender.save';
/** Where a save that failed to load is kept, so the new game's autosave doesn't destroy it. */
export const REJECTED_KEY = 'idle-defender.save.rejected';
/**
 * 6 since patrol risk (ID-027): a v5 save has no weapons left on the map, and its reports
 * name no casualties.
 *
 * 5 since patrols (ID-026): a v4 save has the same shape less its patrols and reports (none
 * out, none kept). A v3 save also has only the building materials in its stock (the rest
 * start at 0), and a v2 one less its perks too.
 */
export const SAVE_VERSION = 6;
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
/** A defender id: lowercase, safe in an `<option value>` and a lookup key. */
const ID = /^[a-z][a-z0-9-]{0,31}$/;
/** A defender name: plain letters, spaces, apostrophes and hyphens; no look-alikes or hidden marks. */
const NAME = /^[A-Za-z][A-Za-z' -]{0,23}$/;
/** An owned weapon's uid: `h` and the horde number that dropped it, or `p`, the patrol number that found it and its place in the haul. */
const UID = /^(?:h[1-9][0-9]{0,5}|p[1-9][0-9]{0,5}-[0-9])$/;
/** Seeds are 32-bit. */
const MAX_SEED = 0xffffffff;
const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
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
}

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
  if (![SAVE_VERSION, 5, 4, 3, 2, 1].includes(o.v as number)) fail('version');
  const savedAt = int(o.savedAt, 0, MAX_TIME);
  const materials = o.v === SAVE_VERSION || o.v === 5 || o.v === 4 ? MATERIALS : BUILDING_MATERIALS;
  const patrols = o.v === SAVE_VERSION ? 'risk' : o.v === 5 ? 'patrols' : null;
  if (o.v === 1) {
    return { game: readGame(o.game, savedAt, V1_GRID, materials, patrols), savedAt, grew: true };
  }
  return { game: readGame(o.game, savedAt, GRID, materials, patrols), savedAt };
}

function readGame(
  v: unknown,
  savedAt: number,
  grid: Grid,
  materials: readonly Material[],
  /** What the save's patrols carry: none (v4 and older), no risk yet (v5), or all of it. */
  patrols: 'patrols' | 'risk' | null,
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
    ...(patrols === 'risk' ? ['leftBehind'] : []),
  ]);
  const tiers = readTiers(o.tiers);
  const lab = old.lab ? 0 : int(o.lab, 0, LAB_LEVELS.length);
  const research = old.lab ? [] : readResearch(o.research, lab, tiers);
  const hordeNumber = int(o.hordeNumber, 1, MAX_HORDE);
  const patrolsSent = patrols ? int(o.patrolsSent, 0, PATROL.max) : 0;
  const roster = readRoster(o.roster, savedAt, hordeNumber, patrolsSent);
  const out = patrols ? readPatrols(o.patrols, savedAt, hordeNumber, patrolsSent, roster) : [];
  const game: GameState = {
    hordeNumber,
    base: readBase(o.base, tiers, research.includes('auto-turret'), grid),
    stock: readStock(o.stock, materials),
    tiers,
    roster,
    armoury: old.armoury
      ? []
      : arr(o.armoury, 0, ARMOURY_CAP).map((w) => readOwned(w, hordeNumber, patrolsSent)),
    lab,
    research,
    power: old.power ? newPower() : readPower(o.power, savedAt),
    perks: old.perks ? [START_PERK] : readPerks(o.perks, research),
    patrols: out,
    patrolsSent,
    reports: patrols ? readReports(o.reports, savedAt, patrolsSent, out, patrols === 'risk') : [],
    leftBehind: patrols === 'risk' ? readLeftBehind(o.leftBehind, hordeNumber, patrolsSent) : [],
  };
  // Each owned weapon is one item, in the armoury, in one pair of hands or left on the
  // map, and the camp keeps at most ARMOURY_CAP.
  const owned = [
    ...game.armoury,
    ...game.roster.flatMap((d) => [d.loadout.primary, d.loadout.secondary]),
  ].filter((h): h is OwnedWeapon => typeof h === 'object' && h !== null);
  if (owned.length > ARMOURY_CAP) fail('too many weapons');
  const every = [...owned, ...game.leftBehind.map((l) => l.weapon)];
  if (new Set(every.map((w) => w.uid)).size !== every.length) fail('weapon twice');
  // A patrol's weapons reach the camp when it comes back, not before.
  const away = new Set(out.map((p) => p.no));
  if (every.some((w) => w.uid.startsWith('p') && away.has(Number(w.uid.slice(1).split('-')[0])))) {
    fail('weapon from a patrol still out');
  }
  // Loading a save is between hordes: batteries waiting in storage go into the bank.
  return loadBatteries(game);
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

/** Equipped perks: known, once each, unlocked, and no more than the slots researched. */
function readPerks(v: unknown, research: readonly ResearchId[]): PerkId[] {
  const unlocked = unlockedPerks({ research });
  const perks: PerkId[] = [];
  for (const x of arr(v, 0, perkSlots({ research }))) {
    const id = oneOf(x, PERK_IDS);
    if (perks.includes(id)) fail('perk twice');
    if (!unlocked.includes(id)) fail('perk not unlocked');
    perks.push(id);
  }
  return perks;
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
function readPower(v: unknown, savedAt: number): Power {
  const o = obj(v, ['bank', 'gas', 'batteries', 'generator']);
  const b = obj(o.batteries, BATTERY_IDS);
  const batteries = {} as Power['batteries'];
  for (const id of BATTERY_IDS) batteries[id] = int(b[id], 0, MAX_COUNT);
  let generator: Power['generator'] = null;
  if (o.generator !== null) {
    const g = obj(o.generator, ['at']);
    generator = { at: g.at === null ? null : Math.min(int(g.at, 0, MAX_TIME), savedAt) };
  }
  return { bank: num(o.bank, 0, BANK_CAP), gas: int(o.gas, 0, MAX_COUNT), batteries, generator };
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

/** Points spent per stat: no more in all than lifetime `xp` has earned. */
function readStats(v: unknown, xp: number): Stats {
  const o = obj(v, STATS);
  const stats = { ...NO_STATS };
  for (const s of STATS) stats[s] = int(o[s], 0, MAX_COUNT);
  if (spentPoints(stats) > earnedPoints(xp)) fail('points not earned');
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
  const uid = text(o.uid, 9, UID);
  const from = Number(uid.slice(1).split('-')[0]);
  if (from >= (uid.startsWith('h') ? hordeNumber : patrolsSent + 1)) fail('weapon from the future');
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
): RosterDefender[] {
  const list = arr(v, 1, MAX_ROSTER);
  const lacks = (key: string): boolean =>
    list.every((d) => typeof d === 'object' && d !== null && !Object.hasOwn(d, key));
  // A save from before stats (0.4.1 and older) has none on any defender: all 0.
  // One from before loadouts (0.4.3 and older) has a single `weapon` on each instead.
  const old = { stats: lacks('stats'), loadout: lacks('loadout') };
  const roster = list.map((d) => readDefender(d, savedAt, hordeNumber, patrolsSent, old));
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
    stats: old.stats ? { ...NO_STATS } : readStats(o.stats, xp),
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
): Patrol[] {
  const seen = new Set<string>();
  const patrols = arr(v, 0, roster.length).map((x): Patrol => {
    const o = obj(x, ['no', 'location', 'members', 'sentAt', 'sentHorde', 'strength', 'seed']);
    const no = int(o.no, 1, patrolsSent);
    const sentHorde = int(o.sentHorde, PATROL.unlock, hordeNumber);
    const location = oneOf(o.location, LOCATION_IDS);
    const reveal = LOCATIONS[location].reveal;
    if (reveal === null || reveal > sentHorde) fail('location not on the map');
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
    const strength = num(o.strength, 0, MAX_COUNT);
    if (strength > partyStrength(members)) fail('patrol stronger than its party');
    return {
      no,
      location,
      members: members.map((d) => d.id),
      sentAt,
      sentHorde,
      strength,
      seed: int(o.seed, 0, MAX_SEED),
    };
  });
  for (let i = 1; i < patrols.length; i++) {
    if (patrols[i]!.no <= patrols[i - 1]!.no) fail('patrols out of order');
  }
  return patrols;
}

/**
 * Weapons the dead left on the map (design §10): at most `PATROL.left`, each an owned
 * weapon at a location that has been on the map.
 */
function readLeftBehind(v: unknown, hordeNumber: number, patrolsSent: number): LeftWeapon[] {
  return arr(v, 0, PATROL.left).map((x): LeftWeapon => {
    const o = obj(x, ['location', 'weapon']);
    const location = oneOf(o.location, LOCATION_IDS);
    const reveal = LOCATIONS[location].reveal;
    if (reveal === null || reveal > hordeNumber) fail('location not on the map');
    return { location, weapon: readOwned(o.weapon, hordeNumber, patrolsSent) };
  });
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
    const report: PatrolReport = {
      no,
      location: oneOf(o.location, LOCATION_IDS),
      names,
      injured,
      dead,
      wiped,
      returnedAt: Math.min(int(o.returnedAt, 0, MAX_TIME), savedAt),
      stock: readStock(o.stock, MATERIALS),
      gas: int(o.gas, 0, MAX_COUNT),
      batteries,
      weapons: arr(o.weapons, 0, PATROL.rolls + PATROL.bonusRolls).map(readReportWeapon),
      recovered: risk ? arr(o.recovered, 0, PATROL.left).map(readReportWeapon) : [],
      xp: int(o.xp, 0, MAX_COUNT),
    };
    const found =
      report.xp > 0 ||
      report.gas > 0 ||
      report.weapons.length > 0 ||
      report.recovered.length > 0 ||
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
