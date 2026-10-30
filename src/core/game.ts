// The loop between hordes (design §2): build on the base, fight a horde, carry the
// damage, payout, XP and injuries back. Pure: every function returns new state, and
// real time comes in as `now` (ms since the epoch), never read from a clock.
import { heldName, isOwned, rollDrop, type Held, type OwnedWeapon } from './armoury.ts';
import { newBase, type Base, type Tier } from './base.ts';
import {
  ARMOURY_CAP,
  BANK_CAP,
  DEFENDER_XP,
  FIND,
  GAS_PER_WIN,
  GENES,
  HORDE_PAYOUT,
  MATERIALS,
  MAX_COUNT,
  RECOVERY_MS,
  SKILL_IDS,
  START_PERK,
  START_STOCK,
  START_TIERS,
  ITEMS,
  RARITIES,
  FREE_WEAPONS,
  type PerkId,
  type ResearchId,
  type Stat,
  type Stats,
  type Stock,
  stockOf,
} from './data.ts';
import { baseAfter, newHorde, type DefenderSpec, type HordeState, type Injury } from './horde.ts';
import { loadoutError, type Loadout } from './loadout.ts';
import type { Patrol, PatrolReport } from './patrol.ts';
import { loadBatteries, newPower, runGenerator, type Power } from './power.ts';
import { chance, pick, rngFrom } from './rng.ts';
import { earnedPoints, levelOf, NO_STATS, spend } from './stats.ts';

/** A defender on the camp's roster: lifetime XP (the level comes from it) and the stat points spent. */
export interface RosterDefender extends DefenderSpec {
  xp: number;
  stats: Stats;
  /** Injured until this time (ms); null when fit. */
  injuredUntil: number | null;
}

export interface GameState {
  /** The next horde to fight. */
  hordeNumber: number;
  base: Base;
  stock: Stock;
  tiers: Tier[];
  roster: RosterDefender[];
  /** Owned weapons no defender carries (design §6 Gear). */
  armoury: OwnedWeapon[];
  /** Research Lab level; 0 = not built (design §11). */
  lab: number;
  /** Research nodes done, in the order researched. */
  research: ResearchId[];
  /** The battery bank, batteries, Gas and generator (design §7). */
  power: Power;
  /** Commander perks equipped, one per perk slot (design §5). */
  perks: PerkId[];
  /** Parties out on patrol (design §10), in the order sent. */
  patrols: Patrol[];
  /** Patrols sent so far; the next one is number `patrolsSent + 1`. */
  patrolsSent: number;
  /** The latest patrol reports, oldest first. */
  reports: PatrolReport[];
}

// The starter roster: one per profession, each with a pistol (design §6, §11).
const STARTER_ROSTER: readonly DefenderSpec[] = [
  { id: 'bob', name: 'Bob', loadout: { primary: 'pistol', secondary: null, item: null } },
  { id: 'jack', name: 'Jack', loadout: { primary: 'pistol', secondary: 'knife', item: null } },
  { id: 'john', name: 'John', loadout: { primary: 'pistol', secondary: 'toolkit', item: null } },
];

export function newGame(): GameState {
  return loadBatteries({
    hordeNumber: 1,
    base: newBase(),
    stock: { ...START_STOCK },
    tiers: [...START_TIERS],
    roster: STARTER_ROSTER.map((d) => ({
      ...d,
      loadout: { ...d.loadout },
      xp: 0,
      stats: { ...NO_STATS },
      injuredUntil: null,
    })),
    armoury: [],
    lab: 0,
    research: [],
    power: newPower(),
    perks: [START_PERK],
    patrols: [],
    patrolsSent: 0,
    reports: [],
  });
}

function finite(name: string, now: number): void {
  if (!Number.isFinite(now)) throw new RangeError(`${name}: bad time ${now}`);
}

/** Fit to defend at `now`: never injured, or rested until then (design §11). */
export function available(d: RosterDefender, now: number): boolean {
  return d.injuredUntil === null || now >= d.injuredUntil;
}

/** Whether defender `id` is out on a patrol. */
export const onPatrol = (game: Pick<GameState, 'patrols'>, id: string): boolean =>
  game.patrols.some((p) => p.members.includes(id));

/** Clears every injury that has healed by `now`; returns `game` itself when none has. */
export function recover(game: GameState, now: number): GameState {
  finite('recover', now);
  if (!game.roster.some((d) => d.injuredUntil !== null && available(d, now))) return game;
  const g = structuredClone(game);
  for (const d of g.roster) if (available(d, now)) d.injuredUntil = null;
  return g;
}

/**
 * Scrap, Wood and Mutated Genes for a finished horde: a win pays in full; a loss pays a
 * quarter of the Scrap and Wood scaled by the wave reached, rounded down, so losing
 * never beats winning, and no Genes (§2).
 */
export function hordePayout(
  h: Pick<HordeState, 'hordeNumber' | 'outcome' | 'wave' | 'waveCount' | 'mutantKills' | 'boss'>,
): Stock {
  if (h.outcome === 'fighting') throw new RangeError('hordePayout: the horde is still on');
  const { win, lossShare } = HORDE_PAYOUT;
  const share = h.outcome === 'won' ? 1 : (lossShare * h.wave) / h.waveCount;
  const pay = (m: { base: number; perHorde: number }): number =>
    Math.floor((m.base + m.perHorde * h.hordeNumber) * share);
  return stockOf({ scrap: pay(win.scrap), wood: pay(win.wood), genes: hordeGenes(h) });
}

/** Mutated Genes horde `h` pays (design §4, §11): a win only, more for mutants and a boss. */
export function hordeGenes(
  h: Pick<HordeState, 'hordeNumber' | 'outcome' | 'mutantKills' | 'boss'>,
): number {
  if (h.outcome !== 'won') return 0;
  return (
    GENES.base +
    Math.floor(h.hordeNumber / GENES.every) +
    Math.floor(h.mutantKills / GENES.perMutants) +
    (h.boss ? GENES.boss : 0)
  );
}

/** A win's material find: what it is and how many. */
export interface Find {
  material: (typeof FIND.materials)[number];
  amount: number;
}

/**
 * The materials horde `h` finds (design §4), or null (most wins, every loss). Rolled
 * from where the fight's RNG ended, after the weapon drop's roll so those odds don't
 * move, so the result screen and `finishHorde` agree.
 */
export function hordeFind(h: Pick<HordeState, 'hordeNumber' | 'outcome' | 'rng'>): Find | null {
  if (h.outcome !== 'won') return null;
  const rng = rngFrom({ ...h.rng });
  rollDrop(rng, h.hordeNumber);
  if (!chance(rng, FIND.chance)) return null;
  return {
    material: pick(rng, FIND.materials),
    amount: FIND.base + Math.floor(h.hordeNumber / FIND.every),
  };
}

/** Defender XP each defender who took part gets for winning horde `hordeNumber`. */
export function hordeXp(hordeNumber: number): number {
  return DEFENDER_XP.base + DEFENDER_XP.perHorde * hordeNumber;
}

/** XP per defender who took part, in join order, and whether they were injured; none on a loss. */
export function xpGains(
  h: HordeState,
): { id: string; name: string; xp: number; injured: boolean }[] {
  if (h.outcome !== 'won') return [];
  const everyone = [...h.defenders, ...h.bench, ...h.injured.map((i) => i.defender)];
  return h.tookPart.map((id) => ({
    id,
    name: everyone.find((d) => d.id === id)!.name,
    xp: hordeXp(h.hordeNumber),
    injured: h.injured.some((i) => i.defender.id === id),
  }));
}

/** A win's XP line for one defender: the gain, the level after it and the stat points it brought. */
export interface LevelGain {
  id: string;
  name: string;
  xp: number;
  injured: boolean;
  level: number;
  /** XP into `level`, and what `level` costs. */
  into: number;
  next: number;
  /** Levels gained by this win. */
  levels: number;
  points: number;
}

/** `xpGains` against the roster of `game` (the game the horde was fought from): the levels each gain brings. */
export function levelGains(game: GameState, h: HordeState): LevelGain[] {
  return xpGains(h).map((g) => {
    const before = game.roster.find((d) => d.id === g.id)?.xp ?? 0;
    const was = levelOf(before).level;
    const now = levelOf(before + g.xp);
    return {
      ...g,
      level: now.level,
      into: now.into,
      next: now.next,
      levels: now.level - was,
      points: earnedPoints(before + g.xp) - earnedPoints(before),
    };
  });
}

/** Puts one stat point of `defenderId` into `stat`; refused with none left. */
export function spendPoint(
  game: GameState,
  defenderId: string,
  stat: Stat,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  const i = game.roster.findIndex((d) => d.id === defenderId);
  if (i < 0) throw new RangeError(`spendPoint: no defender ${String(defenderId)}`);
  const r = spend(game.roster[i]!, stat);
  if (!r.ok) return r;
  const roster = [...game.roster];
  roster[i] = r.defender;
  return { ok: true, game: { ...game, roster } };
}

/** The owned weapons defender `d` carries. */
const carried = (d: Pick<RosterDefender, 'loadout'>): OwnedWeapon[] =>
  [d.loadout.primary, d.loadout.secondary].filter(isOwned);

/** Every owned weapon: the armoury's, then each defender's in roster order. */
export function ownedWeapons(game: GameState): OwnedWeapon[] {
  return [...game.armoury, ...game.roster.flatMap(carried)];
}

/** Who carries owned weapon `uid`, or null when it is in the armoury (or unknown). */
export function carrierOf(game: GameState, uid: string): RosterDefender | null {
  return game.roster.find((d) => carried(d).some((w) => w.uid === uid)) ?? null;
}

/**
 * Gives `defenderId` the loadout `loadout` (design §6: free, any time between hordes,
 * injured or not); refused when the game doesn't allow it. An owned weapon is named by
 * its uid and comes out of the armoury; one it replaces goes back. Unknown ids throw.
 */
export function equip(
  game: GameState,
  defenderId: string,
  loadout: Loadout,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  const i = game.roster.findIndex((d) => d.id === defenderId);
  if (i < 0) throw new RangeError(`equip: no defender ${String(defenderId)}`);
  const me = game.roster[i]!;
  // A patrol takes its weapons with it (design §10).
  if (onPatrol(game, me.id)) return { ok: false, reason: `${me.name} is on patrol` };
  const known = (id: string | null, table: object): boolean =>
    id === null || Object.hasOwn(table, id);
  const owned = [...game.armoury, ...carried(me)];
  // An owned weapon is looked up by uid, so its numbers always come from the game, not the caller.
  const resolve = (h: Held | null): Held | null | undefined =>
    isOwned(h)
      ? (owned.find((w) => w.uid === h.uid) ?? ownedWeapons(game).find((w) => w.uid === h.uid))
      : h === null || (FREE_WEAPONS as readonly string[]).includes(h)
        ? h
        : undefined;
  const primary = resolve(loadout.primary);
  const secondary = resolve(loadout.secondary);
  if (
    primary === null ||
    primary === undefined ||
    secondary === undefined ||
    !known(loadout.item, ITEMS)
  ) {
    throw new RangeError(`equip: unknown loadout ${JSON.stringify(loadout)}`);
  }
  for (const h of [primary, secondary]) {
    if (!isOwned(h)) continue;
    const by = carrierOf(game, h.uid);
    if (by && by.id !== me.id)
      return { ok: false, reason: `${by.name} carries the ${heldName(h)}` };
  }
  if (isOwned(primary) && isOwned(secondary) && primary.uid === secondary.uid) {
    return { ok: false, reason: "One weapon can't fill two slots" };
  }
  const next: Loadout = { primary, secondary, item: loadout.item };
  const reason = loadoutError(next);
  if (reason !== null) return { ok: false, reason };
  const holding = new Set(carried({ loadout: next }).map((w) => w.uid));
  const roster = [...game.roster];
  roster[i] = { ...me, loadout: next };
  const armoury = owned.filter((w) => !holding.has(w.uid));
  return { ok: true, game: { ...game, roster, armoury } };
}

/** A win's weapon drop: the weapon, and whether it fits in the armoury or was salvaged for `scrap`. */
export interface Drop {
  weapon: OwnedWeapon;
  kept: boolean;
  /** Scrap it was salvaged for; 0 when kept. */
  scrap: number;
}

/**
 * The weapon horde `h` drops for `game` (design §4), or null: a win only, rolled from
 * where the fight's RNG ended, so the result screen and `finishHorde` agree. With
 * `ARMOURY_CAP` owned weapons already it is salvaged for Scrap.
 */
export function hordeDrop(game: GameState, h: HordeState): Drop | null {
  if (h.outcome !== 'won') return null;
  const weapon = rollDrop(rngFrom({ ...h.rng }), h.hordeNumber);
  if (!weapon) return null;
  const kept = ownedWeapons(game).length < ARMOURY_CAP;
  return { weapon, kept, scrap: kept ? 0 : RARITIES[weapon.rarity].salvage };
}

/**
 * When `injury` heals, for a horde that ended at `now`: `RECOVERY_MS` from the injury,
 * counted back from `now` in fight time (which stops during offers, so never early).
 */
export function injuredUntil(horde: HordeState, injury: Injury, now: number): number {
  finite('injuredUntil', now);
  return now - (horde.time - injury.at) * 1000 + RECOVERY_MS;
}

/** Horde `game.hordeNumber` on the current base, with the defenders fit and home at `now`; `postId` indexes `game.base.posts`. */
export function startHorde(
  game: GameState,
  seed: number,
  defenderId: string,
  postId: number,
  now: number,
): HordeState {
  finite('startHorde', now);
  const fit = game.roster.filter((d) => available(d, now) && !onPatrol(game, d.id));
  if (!fit.some((d) => d.id === defenderId)) {
    throw new RangeError(`startHorde: ${String(defenderId)} can't defend`);
  }
  return newHorde(seed, {
    hordeNumber: game.hordeNumber,
    roster: fit.map(({ id, name, loadout, stats }) => ({
      id,
      name,
      loadout: { ...loadout },
      stats: { ...stats },
    })),
    startDefenderId: defenderId,
    base: game.base,
    startPostId: postId,
    bank: game.power.bank,
    startedAt: now,
    skills: SKILL_IDS.filter((id) => game.research.includes(id)),
    perks: game.perks,
  });
}

/**
 * Back to building at `now` (when the horde ended): the fight's damage stays, the
 * payout is added, a win gives XP and maybe a weapon or a find and moves on, and the injured
 * rest (`injuredUntil`). The bank keeps the charge left; the generator's clock skips
 * the fight, then it runs to `now` and batteries load.
 */
export function finishHorde(game: GameState, horde: HordeState, now: number): GameState {
  finite('finishHorde', now);
  if (horde.outcome === 'fighting') throw new RangeError('finishHorde: the horde is still on');
  if (horde.hordeNumber !== game.hordeNumber) {
    throw new RangeError(`finishHorde: horde ${horde.hordeNumber} is not this game's`);
  }
  const payout = hordePayout(horde);
  const g = structuredClone(game);
  g.base = baseAfter(game.base, horde);
  const drop = hordeDrop(game, horde);
  if (drop?.kept) g.armoury.push(drop.weapon);
  else if (drop) payout.scrap += drop.scrap;
  const find = hordeFind(horde);
  if (find) payout[find.material] += find.amount;
  // Capped where a save reads it, so a win never leaves a save that won't load.
  for (const m of MATERIALS) g.stock[m] = Math.min(MAX_COUNT, g.stock[m] + payout[m]);
  for (const gain of xpGains(horde)) {
    const d = g.roster.find((r) => r.id === gain.id);
    if (d) d.xp += gain.xp;
  }
  for (const i of horde.injured) {
    const d = g.roster.find((r) => r.id === i.defender.id);
    if (d) d.injuredUntil = injuredUntil(horde, i, now);
  }
  if (horde.outcome === 'won') {
    g.hordeNumber += 1;
    // Capped where a save reads it, so a win never leaves a save that won't load.
    g.power.gas = Math.min(MAX_COUNT, g.power.gas + GAS_PER_WIN);
  }
  g.power.bank = Math.min(BANK_CAP, Math.max(0, horde.energy));
  const gen = g.power.generator;
  if (gen && gen.at !== null) gen.at = Math.min(now, gen.at + Math.max(0, now - horde.startedAt));
  return loadBatteries(runGenerator(g, now));
}
