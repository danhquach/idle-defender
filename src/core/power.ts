// The battery bank between hordes (design §7, as built ID-015): batteries load into
// it, and the generator burns Gas into it over real time. Pure: real time comes in as
// `now` (ms since the epoch), and each function returns a new game, or `game` itself
// when nothing changes.
import { BANK_CAP, BATTERIES, BATTERY_IDS, GENERATOR, START_POWER, type Battery } from './data.ts';
import type { GameState } from './game.ts';
import { pay, type GameResult } from './research.ts';

export interface Power {
  /** Charge in the bank, 0 … BANK_CAP; a fight draws it down. */
  bank: number;
  gas: number;
  /** Batteries waiting in storage, by quality. */
  batteries: Record<Battery, number>;
  /**
   * The generator, or null when not built. `at` is when the Gas burning now started
   * (ms); null while it is idle (no Gas or no room), so idle time earns nothing.
   */
  generator: { at: number | null } | null;
}

/** A new game's power: an empty bank, the starting batteries and Gas, no generator. */
export function newPower(): Power {
  const batteries = {} as Record<Battery, number>;
  for (const b of BATTERY_IDS) batteries[b] = START_POWER.batteries[b] ?? 0;
  return { bank: 0, gas: START_POWER.gas, batteries, generator: null };
}

/** Loads whole batteries into the bank, largest first, while each fits under the cap. */
export function loadBatteries(game: GameState): GameState {
  const { bank, batteries } = game.power;
  let charge = bank;
  const left = { ...batteries };
  for (const b of [...BATTERY_IDS].reverse()) {
    const fit = Math.floor((BANK_CAP - charge) / BATTERIES[b].charge);
    const n = Math.max(0, Math.min(left[b], fit));
    left[b] -= n;
    charge += n * BATTERIES[b].charge;
  }
  if (charge === bank) return game;
  return { ...game, power: { ...game.power, bank: charge, batteries: left } };
}

/**
 * Runs the generator up to `now`: each `gasMs` burns 1 Gas for `gasCharge`, while there
 * is Gas and room; it stops at the cap. Progress toward the next Gas carries over. A
 * clock set back (`now` before `at`) restarts the current Gas from `now`.
 */
export function runGenerator(game: GameState, now: number): GameState {
  if (!Number.isFinite(now)) throw new RangeError(`runGenerator: bad time ${now}`);
  const gen = game.power.generator;
  if (!gen) return game;
  const { bank, gas } = game.power;
  const room = gas > 0 && bank < BANK_CAP;
  const set = (p: Partial<Power>, at: number | null): GameState => ({
    ...game,
    power: { ...game.power, ...p, generator: { at } },
  });
  if (gen.at === null) return room ? set({}, now) : game;
  if (!room) return set({}, null);
  if (now < gen.at) return set({}, now);
  const n = Math.min(
    gas,
    Math.floor((now - gen.at) / GENERATOR.gasMs),
    Math.ceil((BANK_CAP - bank) / GENERATOR.gasCharge),
  );
  if (n === 0) return game;
  const after = { bank: Math.min(BANK_CAP, bank + n * GENERATOR.gasCharge), gas: gas - n };
  const idle = after.gas === 0 || after.bank >= BANK_CAP;
  return set(after, idle ? null : gen.at + n * GENERATOR.gasMs);
}

/**
 * Builds the camp's one generator, idle: the next runGenerator starts its clock, so a
 * build worked out ahead of the click never earns time before it.
 */
export function buildGenerator(game: GameState): GameResult {
  if (game.power.generator) return { ok: false, reason: 'The generator is already built' };
  return pay(game, GENERATOR.cost, (g) => {
    g.power.generator = { at: null };
  });
}

/** When the generator finishes its current Gas (ms), or null when it is idle or not built. */
export function nextGasAt(power: Power): number | null {
  const at = power.generator?.at;
  return at === undefined || at === null ? null : at + GENERATOR.gasMs;
}
