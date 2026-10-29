// The local save (docs/design.md §12): the game between hordes, as versioned JSON in
// browser storage, written after every change. A fight in progress is never saved;
// a reload mid-horde goes back to the camp as it was before it. A save is untrusted
// on the way back in: it is size-checked, parsed, and read through an allow-list
// that builds a new game field by field, so a bad save starts a new game instead of
// crashing, and is kept aside rather than overwritten.
import {
  segmentMaxHp,
  type Base,
  type BaseLayer,
  type BasePost,
  type BaseSegment,
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
  COLUMNS,
  ITEMS,
  MATERIALS,
  POST_KINDS,
  RARITY_ORDER,
  RECOVERY_MS,
  SEGMENTS,
  STATS,
  TIER_ORDER,
  WEAPONS,
  type ItemId,
  type Stats,
  type Stock,
  type Tier,
  type WeaponId,
} from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import { loadoutError, loadoutFrom, type Loadout } from '../core/loadout.ts';
import { earnedPoints, NO_STATS, spentPoints } from '../core/stats.ts';
import { arr, fail, int, num, obj, oneOf, text } from './validate.ts';

export const SAVE_KEY = 'idle-defender.save';
/** Where a save that failed to load is kept, so the new game's autosave doesn't destroy it. */
export const REJECTED_KEY = 'idle-defender.save.rejected';
export const SAVE_VERSION = 1;
/** A full save is about 2 KB; anything far bigger is not ours and is not parsed. */
export const MAX_SAVE_CHARS = 50_000;
/** Far past anything a game reaches; keeps every count a safe integer. */
const MAX_COUNT = 1e12;
const MAX_HORDE = 100_000;
const MAX_ROSTER = 100;
/** Latest time a save may name, in ms since the epoch (the year 2286). */
const MAX_TIME = 1e13;
/** A defender id: lowercase, safe in an `<option value>` and a lookup key. */
const ID = /^[a-z][a-z0-9-]{0,31}$/;
/** A defender name: plain letters, spaces, apostrophes and hyphens; no look-alikes or hidden marks. */
const NAME = /^[A-Za-z][A-Za-z' -]{0,23}$/;
/** An owned weapon's uid: `h` and the horde number that dropped it. */
const UID = /^h[1-9][0-9]{0,5}$/;
const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** The parts of `Storage` the save uses, so tests can pass a plain object. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface Save {
  game: GameState;
  /** When it was written, in ms since the epoch. */
  savedAt: number;
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
  if (o.v !== SAVE_VERSION) fail('version');
  const savedAt = int(o.savedAt, 0, MAX_TIME);
  return { game: readGame(o.game, savedAt), savedAt };
}

function readGame(v: unknown, savedAt: number): GameState {
  // A save from before the armoury (0.4.5 and older) has none: it starts empty.
  const old = typeof v === 'object' && v !== null && !Object.hasOwn(v, 'armoury');
  const o = obj(v, [
    'hordeNumber',
    'base',
    'stock',
    'tiers',
    'roster',
    ...(old ? [] : ['armoury']),
  ]);
  const tiers = readTiers(o.tiers);
  const hordeNumber = int(o.hordeNumber, 1, MAX_HORDE);
  const game: GameState = {
    hordeNumber,
    base: readBase(o.base, tiers),
    stock: readStock(o.stock),
    tiers,
    roster: readRoster(o.roster, savedAt, hordeNumber),
    armoury: old ? [] : arr(o.armoury, 0, ARMOURY_CAP).map((w) => readOwned(w, hordeNumber)),
  };
  // Each owned weapon is one item, in the armoury or in one pair of hands, and the camp keeps at most ARMOURY_CAP.
  const owned = [
    ...game.armoury,
    ...game.roster.flatMap((d) => [d.loadout.primary, d.loadout.secondary]),
  ].filter((h): h is OwnedWeapon => typeof h === 'object' && h !== null);
  if (owned.length > ARMOURY_CAP) fail('too many weapons');
  if (new Set(owned.map((w) => w.uid)).size !== owned.length) fail('weapon twice');
  return game;
}

function readTiers(v: unknown): Tier[] {
  const tiers = arr(v, 1, TIER_ORDER.length).map((t) => oneOf(t, TIER_ORDER));
  if (new Set(tiers).size !== tiers.length) fail('tier twice');
  return tiers;
}

function readStock(v: unknown): Stock {
  const o = obj(v, MATERIALS);
  return {
    scrap: int(o.scrap, 0, MAX_COUNT),
    wood: int(o.wood, 0, MAX_COUNT),
    metal: int(o.metal, 0, MAX_COUNT),
    concrete: int(o.concrete, 0, MAX_COUNT),
  };
}

function readBase(v: unknown, tiers: readonly Tier[]): Base {
  const o = obj(v, ['layers', 'posts']);
  const layers = arr(o.layers, 1, COLUMNS.length).map((l) => readLayer(l, tiers));
  for (let i = 1; i < layers.length; i++) {
    if (layers[i]!.column <= layers[i - 1]!.column) fail('layers out of order');
  }
  const posts = arr(o.posts, 0, COLUMNS.length * SEGMENTS * POST_KINDS.length).map(readPost);
  for (let i = 1; i < posts.length; i++) {
    if (postOrder(posts[i - 1]!, posts[i]!) >= 0) fail('posts out of order');
  }
  for (const p of posts) {
    const layer = layers.find((l) => l.column === p.column);
    // The rules buildPost keeps: a wall-walk sits on a wall, the others behind one.
    if (p.kind === 'wall-walk' ? !layer?.slots[p.row] : !layer) fail('post with no wall');
  }
  return { layers, posts };
}

function readLayer(v: unknown, tiers: readonly Tier[]): BaseLayer {
  const o = obj(v, ['column', 'slots']);
  const slots = arr(o.slots, SEGMENTS, SEGMENTS).map((s) =>
    s === null ? null : readSegment(s, tiers),
  );
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

function readPost(v: unknown): BasePost {
  const o = obj(v, ['kind', 'column', 'row']);
  return {
    kind: oneOf(o.kind, POST_KINDS),
    column: int(o.column, 0, COLUMNS.length - 1),
    row: int(o.row, 0, SEGMENTS - 1),
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

/** The order buildPost keeps posts in: column, then kind, then row. */
function postOrder(a: BasePost, b: BasePost): number {
  return a.column - b.column || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || a.row - b.row;
}

/** A loadout the game allows (design §6): a gun as primary, a shield only with a blade. */
function readLoadout(v: unknown, hordeNumber: number): Loadout {
  const o = obj(v, ['primary', 'secondary', 'item']);
  const loadout: Loadout = {
    primary: readHeld(o.primary, hordeNumber),
    secondary: o.secondary === null ? null : readHeld(o.secondary, hordeNumber),
    item: o.item === null ? null : oneOf(o.item, ITEM_IDS),
  };
  if (loadoutError(loadout) !== null) fail('bad loadout');
  return loadout;
}

/** A free weapon by id, or an owned one. */
function readHeld(v: unknown, hordeNumber: number): Held {
  return typeof v === 'string' ? oneOf(v, WEAPON_IDS) : readOwned(v, hordeNumber);
}

/**
 * An owned weapon the game could have dropped: a uid from a horde already won, and
 * exactly its rarity's affixes, each one that fits the weapon, once, in range.
 */
function readOwned(v: unknown, hordeNumber: number): OwnedWeapon {
  const o = obj(v, ['uid', 'base', 'rarity', 'affixes']);
  const uid = text(o.uid, 7, UID);
  if (Number(uid.slice(1)) >= hordeNumber) fail('weapon from the future');
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

function readRoster(v: unknown, savedAt: number, hordeNumber: number): RosterDefender[] {
  const list = arr(v, 1, MAX_ROSTER);
  const lacks = (key: string): boolean =>
    list.every((d) => typeof d === 'object' && d !== null && !Object.hasOwn(d, key));
  // A save from before stats (0.4.1 and older) has none on any defender: all 0.
  // One from before loadouts (0.4.3 and older) has a single `weapon` on each instead.
  const old = { stats: lacks('stats'), loadout: lacks('loadout') };
  const roster = list.map((d) => readDefender(d, savedAt, hordeNumber, old));
  if (new Set(roster.map((d) => d.id)).size !== roster.length) fail('id twice');
  return roster;
}

const DEFENDER_KEYS = ['id', 'name', 'xp', 'injuredUntil'];

function readDefender(
  v: unknown,
  savedAt: number,
  hordeNumber: number,
  old: { stats: boolean; loadout: boolean },
): RosterDefender {
  const keys = [...DEFENDER_KEYS, old.loadout ? 'weapon' : 'loadout'];
  const o = obj(v, old.stats ? keys : [...keys, 'stats']);
  const xp = int(o.xp, 0, MAX_COUNT);
  return {
    id: text(o.id, 32, ID),
    name: text(o.name, 24, NAME),
    loadout: old.loadout
      ? loadoutFrom(oneOf(o.weapon, WEAPON_IDS))
      : readLoadout(o.loadout, hordeNumber),
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
