// The horde-only build (ID-066, design §2, §11): one loop, fight a horde → result screen
// → next horde. The squad all start on the wall, a win adds XP and one survivor up to the
// cap, a loss replays the same horde with everyone back and the wall full. The rest of
// the game's state rides along untouched, so the full game can come back later.
import {
  bestDrop,
  firstClearWeights,
  gunLevel,
  gunPower,
  isOwned,
  replayWeights,
  rollSquadGun,
  rollUpgrade,
  rollWeapon,
  type Held,
  type OwnedWeapon,
} from './armoury.ts';
import { squadBase } from './base.ts';
import { recruit } from './camp.ts';
import { UPGRADE_IDS, UPGRADES, type CardCategory } from './cards.ts';
import {
  COLUMNS,
  COMBINE_COUNT,
  FARM,
  FIELD,
  MAX_COUNT,
  RARITY_ORDER,
  SQUAD_CAP,
  SQUAD_EARLY_HP,
  SQUAD_HP_GROWTH,
  SQUAD_LINE,
  SQUAD_SPAWN_X,
  SQUAD_XP_RATE,
  STASH_CAP,
  START_PERK,
  WEAPONS,
  type Rarity,
  type WeaponId,
} from './data.ts';
import {
  equip,
  hordeXp,
  levelGains,
  xpGains,
  type GameState,
  type LevelGain,
  type RosterDefender,
} from './game.ts';
import { newHorde, standing, type DefenderSpec, type HordeState, type UpgradeId } from './horde.ts';
import { isGun } from './loadout.ts';
import { createRng } from './rng.ts';

/** The card categories a horde-only fight offers (ID-066); anything else stays out. */
export const SQUAD_CARD_CATEGORIES: readonly CardCategory[] = ['stat', 'behaviour', 'barrier'];

/**
 * The cards a horde-only fight offers: stat, behaviour and barrier cards. Power cards (no
 * turrets) are out; recruit cards never come, as the whole squad starts on the field.
 */
export const SQUAD_CARDS: readonly UpgradeId[] = UPGRADE_IDS.filter((id) =>
  SQUAD_CARD_CATEGORIES.includes(UPGRADES[id].category),
);

/**
 * Enemy HP's factor in horde-only Horde `n` (ID-066): `SQUAD_HP_GROWTH.early` per horde
 * until the squad reaches its cap, `late` after; Hordes 1–3 eased by `SQUAD_EARLY_HP` (ID-097).
 */
export function squadHpScale(n: number): number {
  const early = Math.min(n, SQUAD_CAP) - 1;
  const late = Math.max(0, n - SQUAD_CAP);
  const ease = SQUAD_EARLY_HP[n - 1] ?? 1;
  return ease * SQUAD_HP_GROWTH.early ** early * SQUAD_HP_GROWTH.late ** late;
}

/** The one perk a horde-only fight runs, always on at level 1 (no perk screen). */
export const SQUAD_PERKS = [START_PERK] as const;

/**
 * A roster defender as the squad fights: plain (no profession), their primary gun only
 * (the pistol if they somehow have none), no secondary or item. The roster keeps its loadout.
 */
export function squadSpec(d: RosterDefender): DefenderSpec {
  const primary = isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';
  return {
    id: d.id,
    name: d.name,
    loadout: { primary, secondary: null, item: null },
    stats: { ...d.stats },
    plain: true,
  };
}

/** The squad that fights the next horde: the roster, at most `SQUAD_CAP`, in join order. */
export const squadOf = (game: Pick<GameState, 'roster'>): RosterDefender[] =>
  game.roster.slice(0, SQUAD_CAP);

/**
 * The firing line's slots (ID-068), top to bottom: `SQUAD_CAP` of them on the ground
 * `SQUAD_LINE.offset` behind the wall, each in the middle of its even share of the wall.
 */
export const SQUAD_SLOTS: readonly { x: number; y: number }[] = Array.from(
  { length: SQUAD_CAP },
  (_, i) => ({ x: COLUMNS[0]! + SQUAD_LINE.offset, y: ((i + 0.5) * FIELD.height) / SQUAD_CAP }),
);

/**
 * Horde `game.hordeNumber` for the whole squad on the firing line behind a fresh
 * horde-only wall (full HP), each survivor in their slot in join order
 * (`SQUAD_LINE.order`), with enemies spawning at `SQUAD_SPAWN_X`, at `now`. No towers,
 * turrets or traps; no injuries or patrols hold anyone back, and no research, cash,
 * skills or bank come in.
 */
export function startSquadHorde(
  game: GameState,
  seed: number,
  now: number,
  /** The horde to fight (ID-098): the next new one, or any already beaten. */
  hordeNumber: number = game.hordeNumber,
): HordeState {
  if (!Number.isFinite(now)) throw new RangeError(`startSquadHorde: bad time ${now}`);
  if (!Number.isInteger(hordeNumber) || hordeNumber < 1 || hordeNumber > game.hordeNumber) {
    throw new RangeError(`startSquadHorde: horde ${hordeNumber} is not open`);
  }
  const squad = squadOf(game).map(squadSpec);
  const first = squad[0];
  if (!first) throw new RangeError('startSquadHorde: nobody in the squad');
  const base = squadBase();
  const postOf = (i: number): number => base.posts.length + SQUAD_LINE.order[i]!;
  const s = newHorde(seed, {
    hordeNumber,
    roster: squad,
    startDefenderId: first.id,
    base,
    startPostId: postOf(0),
    bank: 0,
    startedAt: now,
    skills: [],
    perks: SQUAD_PERKS,
    perkLevels: { [START_PERK]: 1 },
    research: [],
    cashRate: 0,
    startCash: 0,
    cards: SQUAD_CARDS,
    hpScale: squadHpScale(hordeNumber),
    xpRate: SQUAD_XP_RATE,
    line: SQUAD_SLOTS,
    spawnX: SQUAD_SPAWN_X,
    harder: true,
  });
  // The rest of the squad take their slots too: nobody waits on the bench.
  squad.slice(1).forEach((spec, k) => {
    const post = s.posts[postOf(k + 1)]!;
    post.defenderId = spec.id;
    s.defenders.push(standing(spec, post, 0));
    s.tookPart.push(spec.id);
  });
  s.bench = [];
  return s;
}

/** The survivor a win adds (ID-066): the next free recruit, or null with the squad full. */
export function joiner(game: Pick<GameState, 'roster' | 'camp'>): RosterDefender | null {
  if (game.roster.length >= SQUAD_CAP || game.camp.recruits >= MAX_COUNT) return null;
  return recruit(game.camp.recruits + 1);
}

/** The highest horde beaten (ID-098): every horde up to it counts as beaten, 0 for none. */
export const highestBeaten = (game: Pick<GameState, 'hordeNumber'>): number => game.hordeNumber - 1;

/** Whether horde `n` is a replay of one already beaten (ID-098), not the next new one. */
export const isReplay = (game: Pick<GameState, 'hordeNumber'>, n: number): boolean =>
  n < game.hordeNumber;

function checkFinished(name: string, game: GameState, horde: HordeState): void {
  if (horde.outcome === 'fighting') throw new RangeError(`${name}: the horde is still on`);
  if (horde.hordeNumber < 1 || horde.hordeNumber > game.hordeNumber) {
    throw new RangeError(`${name}: horde ${horde.hordeNumber} is not this game's`);
  }
}

/**
 * Each survivor's XP from horde `horde` (ID-066, ID-098): a win's full, half for a replay
 * more than `FARM.farOff` hordes below the highest beaten; a loss `FARM.lossXp` of a win's
 * for each share of the waves cleared (0 cleared → 0). Rounded down.
 */
export function squadXpGains(game: GameState, horde: HordeState): ReturnType<typeof xpGains> {
  const full = xpGains({ ...horde, outcome: 'won' });
  const far = highestBeaten(game) - horde.hordeNumber > FARM.farOff;
  // A loss pays its share of what a win of this horde would (halved far down too).
  const win = far ? FARM.farXp : 1;
  const share =
    horde.outcome === 'won' ? win : (win * FARM.lossXp * (horde.wave - 1)) / horde.waveCount;
  // From the unrounded XP, so a share never rounds twice.
  const each = Math.floor(hordeXp(horde.hordeNumber) * (horde.xpRate ?? 1) * share);
  return full.map((g) => ({ ...g, xp: each }));
}

/**
 * Back from horde `horde` (ID-066, ID-098): every survivor who fought gets its XP
 * (`squadXpGains`, a loss's too). A win puts its drop in the stash (the weakest thrown away
 * when full). A first clear also adds a survivor while the squad is under the cap and
 * moves on to the next horde; a replay counts toward the bad-luck guarantee. A loss
 * changes nothing else, and every fight's wall starts full. No base damage, payout,
 * injury or camp XP.
 */
export function finishSquadHorde(game: GameState, horde: HordeState): GameState {
  checkFinished('finishSquadHorde', game, horde);
  const gains = squadXpGains(game, horde);
  if (horde.outcome !== 'won' && gains.every((x) => x.xp === 0)) return game;
  const g = structuredClone(game);
  for (const gain of gains) {
    const d = g.roster.find((r) => r.id === gain.id);
    // Capped where a save reads it, so a win never leaves a save that won't load.
    if (d) d.xp = Math.min(MAX_COUNT, d.xp + gain.xp);
  }
  if (horde.outcome !== 'won') return g;
  const drop = squadDrop(game, horde);
  // Past `FARM.maxReplays` a replay drops nothing and the count stays (its XP is paid).
  if (!drop) return g;
  g.armoury = [...g.armoury, drop.weapon].filter((w) => w.uid !== drop.thrown?.uid);
  if (drop.kind === 'first') {
    const joined = joiner(game);
    if (joined) {
      g.roster.push(joined);
      g.camp.recruits += 1;
    }
    g.hordeNumber += 1;
    return g;
  }
  g.farm = {
    replays: game.farm.replays + 1,
    badLuck: drop.upgrade
      ? 0
      : drop.noUpgrades
        ? game.farm.badLuck
        : Math.min(FARM.guarantee, game.farm.badLuck + 1),
  };
  return g;
}

/** What a horde-only result screen reads off a finished horde. */
export interface SquadResult {
  /** Each survivor's XP and levels; a loss's small share too (ID-098). */
  gains: LevelGain[];
  /** The survivor joining for the next horde; null on a loss, a replay or with the squad full. */
  joined: RosterDefender | null;
  /** The weapon the win drops, and what the stash throws away for it; null on a loss. */
  drop: SquadDrop | null;
}

export function squadResult(game: GameState, horde: HordeState): SquadResult {
  checkFinished('squadResult', game, horde);
  const won = horde.outcome === 'won';
  return {
    gains: levelGains(game, horde, squadXpGains(game, horde)),
    joined: won && !isReplay(game, horde.hordeNumber) ? joiner(game) : null,
    drop: squadDrop(game, horde),
  };
}

/** Which kind of drop a win gave (ID-098), as its tile says. */
export type DropKind = 'first' | 'replay' | 'guaranteed';

/** A horde-only win's weapon (ID-067, ID-098), and the stash's weakest it pushed out, if any. */
export interface SquadDrop {
  weapon: OwnedWeapon;
  /** Thrown away for room: the weakest of the full stash and the drop (maybe the drop itself). */
  thrown: OwnedWeapon | null;
  kind: DropKind;
  /** It hits harder than the weakest gun a squad survivor holds (`weakestHeld`). */
  upgrade: boolean;
  /** A replay where no gun this horde can drop beats the weakest held: farm a higher horde. */
  noUpgrades: boolean;
  /**
   * With `noUpgrades`: the lowest horde above this one whose drop could beat the weakest
   * held (a replay's band, or the next new horde's first clear) within `FARM.search`
   * hordes, or null if none can.
   */
  farmFrom: number | null;
}

/**
 * The weakest gun a squad survivor holds (ID-098), by `gunPower`: their one gun, the free
 * pistol included (a survivor with no gun fights with the pistol).
 */
export function weakestHeld(game: Pick<GameState, 'roster'>): Held {
  return (
    squadOf(game)
      .map((d) => squadSpec(d).loadout.primary)
      .reduce<Held | null>((a, b) => (a === null || gunPower(b) < gunPower(a) ? b : a), null) ??
    'pistol'
  );
}

/**
 * The lowest horde from `from` up to the next new one whose drop could beat `beat` dmg/s
 * (ID-098): a beaten horde's replay band with the bad-luck count, the new one's first
 * clear. Null when none can.
 */
function upgradeFrom(
  game: Pick<GameState, 'hordeNumber' | 'farm'>,
  from: number,
  beat: number,
): number | null {
  for (let n = from; n <= Math.min(game.hordeNumber, from + FARM.search - 1); n++) {
    const weights = isReplay(game, n) ? replayWeights(n, game.farm.badLuck) : firstClearWeights(n);
    if (bestDrop(weights, n) > beat) return n;
  }
  return null;
}

/** The stream a horde's drop rolls from: its seed's own, so the fight never moves it. */
const DROP_STREAM = 0x5bd1e995;

/**
 * The weapon horde `horde` drops into `game`'s stash (ID-067, ID-098), or null on a loss.
 * Rolled from the horde's seed alone, so the same seed drops the same weapon at any game
 * speed and however the fight went. Its gun level is the horde number.
 *
 * A first clear (uid `h<n>`) rolls `firstClearWeights`. A replay (uid `r<k>`, the k-th
 * replay win) rolls `replayWeights` with the bad-luck count, or, with the count at
 * `FARM.guarantee`, a sure upgrade (`rollUpgrade`) unless no gun here could be one.
 *
 * With the stash at `STASH_CAP` (or past it, from an older save) the weakest of the stash
 * and the drop by `gunPower` is thrown away (a blade or tool an older save left there
 * first); a tie throws the later one, so a duplicate drop goes rather than the one kept.
 */
export function squadDrop(
  game: Pick<GameState, 'armoury' | 'roster' | 'hordeNumber' | 'farm'>,
  horde: Pick<HordeState, 'outcome' | 'seed' | 'hordeNumber'>,
): SquadDrop | null {
  if (horde.outcome !== 'won') return null;
  if (isReplay(game, horde.hordeNumber) && game.farm.replays >= FARM.maxReplays) return null;
  const n = horde.hordeNumber;
  const rng = createRng(horde.seed ^ DROP_STREAM);
  const weakest = weakestHeld(game);
  const beat = gunPower(weakest);
  let weapon: OwnedWeapon;
  let kind: DropKind = 'first';
  let noUpgrades = false;
  if (!isReplay(game, n)) {
    weapon = rollSquadGun(rng, `h${n}`, firstClearWeights(n), n);
  } else {
    const uid = `r${game.farm.replays + 1}`;
    const weights = replayWeights(n, game.farm.badLuck);
    noUpgrades = bestDrop(weights, n) <= beat;
    const sure =
      game.farm.badLuck >= FARM.guarantee && !noUpgrades
        ? rollUpgrade(rng, uid, weights, n, beat, isOwned(weakest) ? weakest.rarity : 'common')
        : null;
    kind = sure ? 'guaranteed' : 'replay';
    weapon = sure ?? rollSquadGun(rng, uid, weights, n);
  }
  const drop = {
    weapon,
    kind,
    upgrade: gunPower(weapon) > beat,
    noUpgrades,
    farmFrom: noUpgrades ? upgradeFrom(game, n + 1, beat) : null,
  };
  if (game.armoury.length < STASH_CAP) return { ...drop, thrown: null };
  // A blade or tool from an older save is no use to a survivor: it counts as the weakest.
  const power = (w: OwnedWeapon): number => (isGun(w) ? gunPower(w) : 0);
  let thrown = weapon;
  for (const w of [...game.armoury, weapon]) if (power(w) <= power(thrown)) thrown = w;
  return { ...drop, thrown };
}

/** What a survivor's gun picker can choose: the free pistol, or a stash weapon's uid. */
export type GunChoice = 'pistol' | string;

/**
 * Gives survivor `defenderId` gun `choice` as their primary (ID-067, between hordes): the
 * free pistol or a stash weapon, by uid. The gun they had goes to the stash (a pistol,
 * free and unlimited, just goes). Their secondary and item stay as they were. Refused when
 * the stash has no such weapon, or when a gun would go into a full stash for the pistol.
 */
export function equipGun(
  game: GameState,
  defenderId: string,
  choice: GunChoice,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  const me = game.roster.find((d) => d.id === defenderId);
  if (!me) return { ok: false, reason: 'No such survivor' };
  const had = me.loadout.primary;
  if (choice === 'pistol') {
    if (!isOwned(had)) return { ok: true, game };
    if (game.armoury.length >= STASH_CAP) {
      return { ok: false, reason: `The stash is full (${STASH_CAP}/${STASH_CAP})` };
    }
    return equip(game, me.id, { ...me.loadout, primary: 'pistol' });
  }
  if (isOwned(had) && had.uid === choice) return { ok: true, game };
  const gun = game.armoury.find((w) => w.uid === choice);
  if (!gun || !isGun(gun)) return { ok: false, reason: 'That gun is not in the stash' };
  return equip(game, me.id, { ...me.loadout, primary: gun });
}

/** The rarity a combine of `rarity` guns makes (ID-091), or null for Relic, the top. */
export const nextRarity = (rarity: Rarity): Rarity | null =>
  RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1] ?? null;

/** One base weapon at one rarity in the stash, as the Combine list shows it (ID-091). */
export interface CombineSet {
  base: WeaponId;
  rarity: Rarity;
  /** Every stash gun of this kind, weakest first: a combine uses up the first `COMBINE_COUNT`. */
  guns: OwnedWeapon[];
  /** What a combine makes; null for Relic, which combines no further. */
  next: Rarity | null;
}

/**
 * The stash's guns by base weapon and rarity (ID-091), in `WEAPONS` then rarity order. Each
 * set's guns are weakest first by `gunPower` (ties in stash order), so a combine keeps the
 * best. A blade or tool an older save left in the stash is no gun and is left out.
 */
export function combineSets(game: Pick<GameState, 'armoury'>): CombineSet[] {
  const sets: CombineSet[] = [];
  for (const base of Object.keys(WEAPONS) as WeaponId[]) {
    for (const rarity of RARITY_ORDER) {
      const guns = game.armoury
        .filter((w) => w.base === base && w.rarity === rarity && isGun(w))
        .map((w) => ({ w, power: gunPower(w) }))
        .sort((a, b) => a.power - b.power)
        .map(({ w }) => w);
      if (guns.length > 0) sets.push({ base, rarity, guns, next: nextRarity(rarity) });
    }
  }
  return sets;
}

/** FNV-1a: a combine's seed from its inputs, so the same guns always roll the same affixes. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Combines the stash guns `uids` into one gun of the next rarity (ID-091, between hordes):
 * exactly `COMBINE_COUNT` guns, all in the stash (a survivor's must go back first, and the
 * free pistol never combines), of one base weapon and one rarity below Relic. The new gun
 * rolls its rarity's affixes as a drop does, seeded from the inputs alone, so the same save
 * and the same picks give the same gun. The inputs are used up, and the new gun takes the
 * first input's uid (in sorted order), so it stays unique and a save reads it as before.
 * Free; 3 in and 1 out, so a full stash never refuses it.
 */
export function combineGuns(
  game: GameState,
  uids: readonly string[],
): { ok: true; game: GameState; weapon: OwnedWeapon } | { ok: false; reason: string } {
  if (uids.includes('pistol')) return { ok: false, reason: 'The free pistol can’t be combined' };
  if (uids.length !== COMBINE_COUNT || new Set(uids).size !== uids.length) {
    return { ok: false, reason: `Combining takes ${COMBINE_COUNT} different guns` };
  }
  const guns: OwnedWeapon[] = [];
  for (const uid of uids) {
    const gun = game.armoury.find((w) => w.uid === uid);
    if (gun) {
      guns.push(gun);
      continue;
    }
    const holder = [...game.roster, ...game.reserve].find((d) =>
      [d.loadout.primary, d.loadout.secondary].some((h) => isOwned(h) && h.uid === uid),
    );
    return {
      ok: false,
      reason: holder
        ? `${holder.name} holds that gun: put it back in the stash first`
        : 'That gun is not in the stash',
    };
  }
  const [first] = guns as [OwnedWeapon, ...OwnedWeapon[]];
  if (!guns.every(isGun)) return { ok: false, reason: 'Only guns can be combined' };
  if (guns.some((g) => g.base !== first.base)) {
    return { ok: false, reason: 'Combining takes guns of one kind' };
  }
  if (guns.some((g) => g.rarity !== first.rarity)) {
    return { ok: false, reason: 'Combining takes guns of one rarity' };
  }
  const next = nextRarity(first.rarity);
  if (!next) return { ok: false, reason: 'A Relic gun is the best there is: it can’t be combined' };
  const sorted = [...uids].sort();
  const rng = createRng(hash(`${first.base}:${first.rarity}:${sorted.join(',')}`));
  // The new gun takes the highest level of the three (ID-098).
  const level = Math.max(...guns.map(gunLevel));
  const weapon = rollWeapon(rng, sorted[0]!, first.base, next, level > 1 ? level : undefined);
  const used = new Set(uids);
  return {
    ok: true,
    game: { ...game, armoury: [...game.armoury.filter((w) => !used.has(w.uid)), weapon] },
    weapon,
  };
}

/**
 * `game` with at most `SQUAD_CAP` on the roster (ID-066): the rest go to the reserve. The
 * squad is the highest XP (ties to roster order), kept in roster order; the reserve keeps
 * what it had, then the rest in roster order. Returns `game` itself with nothing to move.
 */
export function capSquad(game: GameState): GameState {
  if (game.roster.length <= SQUAD_CAP) return game;
  const keep = new Set(
    game.roster
      .map((d, i) => ({ d, i }))
      .sort((a, b) => b.d.xp - a.d.xp || a.i - b.i)
      .slice(0, SQUAD_CAP)
      .map(({ d }) => d.id),
  );
  return {
    ...game,
    roster: game.roster.filter((d) => keep.has(d.id)),
    reserve: [...game.reserve, ...game.roster.filter((d) => !keep.has(d.id))],
  };
}
