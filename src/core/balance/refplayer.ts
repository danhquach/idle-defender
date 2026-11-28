// The reference player (ID-265): the Research Center nodes a player who spends 65% of the Scrap
// they have earned on research owns at a horde, for the balance tests to play with. A balance
// fixture, never imported by game code. Deterministic, no RNG: the schedule is a closed form of
// the horde, not a played campaign.
import {
  START_STOCK,
  SQUAD_SLOT_COSTS,
  STASH_SLOT,
  TECH,
  TECH_IDS,
  TECH_TABS,
  type TechId,
} from '../data.ts';
import { winScrap } from '../hordeonly.ts';
import { effHorde, MODE_IDS, MODE_UNLOCK_HORDE, type Mode } from '../modes.ts';

/** The share of the Scrap earned that the reference player spends on research. */
export const REF_SHARE = 0.65;
/** A player who spends less: the stuck guard's 40%. */
export const REF_SHARE_LOW = 0.4;

/**
 * Scrap earned in all, as a multiple of the first clears' pay (replays, farming and salvage on
 * top), by the Normal horde reached: the floor of the worst-luck campaigns the scripted player
 * played to Horde 50 (5 seeds, no Scrap spent; the lowest seed's stock over start stock plus
 * first clears: 1.06 at Horde 20, 1.30 at 30, 1.37 at 40, 1.43 at 50, where the 5 seeds had
 * 9,580 to 12,135 against 6,675). Linear between the points, held at 1.06 below Horde 20 and at
 * 1.43 above 50 (Nightmare and Hell): extrapolated there, and conservative, as Nightmare's
 * replays pay x1.5 and Hell's x2.
 */
export const REF_EARNED_FLOOR: readonly (readonly [number, number])[] = [
  [20, 1.06],
  [30, 1.3],
  [40, 1.37],
  [50, 1.43],
];

/** `REF_EARNED_FLOOR` at horde `n` (a higher mode counts as past Normal 50). */
export function refEarnedFactor(n: number): number {
  const first = REF_EARNED_FLOOR[0]!;
  const last = REF_EARNED_FLOOR[REF_EARNED_FLOOR.length - 1]!;
  if (n <= first[0]) return first[1];
  if (n >= last[0]) return last[1];
  for (let i = 1; i < REF_EARNED_FLOOR.length; i++) {
    const [n1, f1] = REF_EARNED_FLOOR[i]!;
    const [n0, f0] = REF_EARNED_FLOOR[i - 1]!;
    if (n <= n1) return f0 + ((f1 - f0) * (n - n0)) / (n1 - n0);
  }
  return last[1];
}

/** Every slot purchase, paid first: the two squad slots and the four stash slots (3,100). */
export const REF_SLOTS_COST =
  SQUAD_SLOT_COSTS.reduce((sum, c) => sum + c, 0) + STASH_SLOT.costs.reduce((sum, c) => sum + c, 0);

/**
 * The Scrap the reference player has earned before fighting horde `n` of `mode`: the start
 * stock, plus `refEarnedFactor` times the first clears' pay of every horde before it (Normal
 * 1 to 50, then Nightmare, then Hell, each at its mode's pay). Never falls as `n` or the mode
 * rises (the factor only rises).
 */
export function refEarned(mode: Mode, n: number): number {
  let firstClears = 0;
  for (const m of MODE_IDS) {
    const last = m === mode ? n - 1 : MODE_UNLOCK_HORDE;
    for (let k = 1; k <= last; k++) firstClears += winScrap(effHorde(m, k), m);
    if (m === mode) break;
  }
  return (
    START_STOCK.scrap + refEarnedFactor(mode === 'normal' ? n : MODE_UNLOCK_HORDE) * firstClears
  );
}

/**
 * The nodes the reference player may buy (ID-284): those of the four Upgrades branches. It picks
 * no starting card, so an unlock would do nothing; leaving the 15 ammo and throwable nodes out
 * keeps its schedule, and every fixture from Normal 38, as it was.
 */
export const REF_NODES: readonly TechId[] = TECH_IDS.filter((id) =>
  (TECH_TABS.upgrades as readonly string[]).includes(TECH[id].branch),
);

/**
 * The nodes the reference player owns at horde `n` of `mode`: all slot purchases come out of
 * the Scrap earned first, then `share` of what is left buys the cheapest open node of `REF_NODES` again and
 * again (ties in `TECH_IDS` order, a node's parents owned first) until the next costs more
 * than is left. In `TECH_IDS` order.
 */
export function refTech(mode: Mode, n: number, share: number = REF_SHARE): TechId[] {
  let left = share * Math.max(0, refEarned(mode, n) - REF_SLOTS_COST);
  const owned = new Set<TechId>();
  for (;;) {
    let best: TechId | undefined;
    for (const id of REF_NODES) {
      if (owned.has(id) || !TECH[id].needs.every((need) => owned.has(need))) continue;
      if (best === undefined || TECH[id].cost < TECH[best].cost) best = id;
    }
    if (best === undefined || TECH[best].cost > left) break;
    left -= TECH[best].cost;
    owned.add(best);
  }
  return REF_NODES.filter((id) => owned.has(id));
}
