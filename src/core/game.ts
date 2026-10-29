// The loop between hordes (design §2): build on the base, fight a horde, carry the
// damage, payout, XP and injuries back. Pure: every function returns new state, and
// real time comes in as `now` (ms since the epoch), never read from a clock.
import { newBase, type Base, type Tier } from './base.ts';
import {
  DEFENDER_XP,
  HORDE_PAYOUT,
  MATERIALS,
  RECOVERY_MS,
  START_STOCK,
  START_TIERS,
  type Stock,
} from './data.ts';
import { baseAfter, newHorde, type DefenderSpec, type HordeState, type Injury } from './horde.ts';

/** A defender on the camp's roster: XP banked from hordes (levels come with ID-011). */
export interface RosterDefender extends DefenderSpec {
  xp: number;
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
}

// Placeholder starter roster (names are placeholders until the roster ticket).
const STARTER_ROSTER: readonly DefenderSpec[] = [
  { id: 'bob', name: 'Bob', weapon: 'pistol' },
  { id: 'jack', name: 'Jack', weapon: 'pistol' },
  { id: 'john', name: 'John', weapon: 'pistol' },
];

export function newGame(): GameState {
  return {
    hordeNumber: 1,
    base: newBase(),
    stock: { ...START_STOCK },
    tiers: [...START_TIERS],
    roster: STARTER_ROSTER.map((d) => ({ ...d, xp: 0, injuredUntil: null })),
  };
}

function finite(name: string, now: number): void {
  if (!Number.isFinite(now)) throw new RangeError(`${name}: bad time ${now}`);
}

/** Fit to defend at `now`: never injured, or rested until then (design §11). */
export function available(d: RosterDefender, now: number): boolean {
  return d.injuredUntil === null || now >= d.injuredUntil;
}

/** Clears every injury that has healed by `now`; returns `game` itself when none has. */
export function recover(game: GameState, now: number): GameState {
  finite('recover', now);
  if (!game.roster.some((d) => d.injuredUntil !== null && available(d, now))) return game;
  const g = structuredClone(game);
  for (const d of g.roster) if (available(d, now)) d.injuredUntil = null;
  return g;
}

/**
 * Scrap and Wood for a finished horde: a win pays in full; a loss pays a quarter of
 * that scaled by the wave reached, rounded down, so losing never beats winning (§2).
 */
export function hordePayout(
  h: Pick<HordeState, 'hordeNumber' | 'outcome' | 'wave' | 'waveCount'>,
): Stock {
  if (h.outcome === 'fighting') throw new RangeError('hordePayout: the horde is still on');
  const { win, lossShare } = HORDE_PAYOUT;
  const share = h.outcome === 'won' ? 1 : (lossShare * h.wave) / h.waveCount;
  const pay = (m: { base: number; perHorde: number }): number =>
    Math.floor((m.base + m.perHorde * h.hordeNumber) * share);
  return { scrap: pay(win.scrap), wood: pay(win.wood), metal: 0, concrete: 0 };
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

/**
 * When `injury` heals, for a horde that ended at `now`: `RECOVERY_MS` from the injury,
 * counted back from `now` in fight time (which stops during offers, so never early).
 */
export function injuredUntil(horde: HordeState, injury: Injury, now: number): number {
  finite('injuredUntil', now);
  return now - (horde.time - injury.at) * 1000 + RECOVERY_MS;
}

/** Horde `game.hordeNumber` on the current base, with the defenders fit at `now`; `postId` indexes `game.base.posts`. */
export function startHorde(
  game: GameState,
  seed: number,
  defenderId: string,
  postId: number,
  now: number,
): HordeState {
  finite('startHorde', now);
  const fit = game.roster.filter((d) => available(d, now));
  if (!fit.some((d) => d.id === defenderId)) {
    throw new RangeError(`startHorde: ${String(defenderId)} can't defend`);
  }
  return newHorde(seed, {
    hordeNumber: game.hordeNumber,
    roster: fit.map(({ id, name, weapon }) => ({ id, name, weapon })),
    startDefenderId: defenderId,
    base: game.base,
    startPostId: postId,
  });
}

/**
 * Back to building at `now` (when the horde ended): the fight's damage stays, the
 * payout is added, a win gives XP and moves on, and the injured rest (`injuredUntil`).
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
  for (const m of MATERIALS) g.stock[m] += payout[m];
  for (const gain of xpGains(horde)) {
    const d = g.roster.find((r) => r.id === gain.id);
    if (d) d.xp += gain.xp;
  }
  for (const i of horde.injured) {
    const d = g.roster.find((r) => r.id === i.defender.id);
    if (d) d.injuredUntil = injuredUntil(horde, i, now);
  }
  if (horde.outcome === 'won') g.hordeNumber += 1;
  return g;
}
