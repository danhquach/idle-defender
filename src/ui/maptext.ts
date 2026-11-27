// The world map's words (ID-219): the button's label, countdowns, drops and a report's lines,
// as plain text. Shared by the top bar's World map button (`hud.ts`) and the World map
// tab (`mapview.ts`). Pure: the time comes in as `now`.
import { DANGERS, type AreaLoot, type Danger } from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { areaDrops, backPatrols, timeLeft, type MapPatrol } from '../core/scout.ts';
import { AREA_NAME, DANGER_NAME } from './text/index.ts';

/** Each loot kind as a card names it. */
export const LOOT_NAME: Readonly<Record<AreaLoot, string>> = {
  weapon: 'Weapons',
  blueprint: 'Blueprints',
  scrap: 'Scrap',
  medicine: 'Medicine',
};

/** How many patrols are out: "1 patrol out", "2 patrols out"; null for none. */
export function patrolsOut(n: number): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? 'patrol' : 'patrols'} out`;
}

/**
 * The top bar's World map button: "World map", or with patrols out "World map · 2 out", as
 * its name; `out` for its badge; `ready` when a report waits.
 */
export function mapButton(
  game: Pick<GameState, 'map'>,
  now: number,
): { label: string; out: number; ready: boolean } {
  const out = game.map?.patrols.length ?? 0;
  return {
    label: out > 0 ? `World map · ${out} out` : 'World map',
    out,
    ready: backPatrols(game, now).length > 0,
  };
}

/** A span of ms as a countdown: "1 h 12 m", "42 m", then "42 s" under a minute. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${rest} m` : `${h} h`;
}

/** A patrol's time on its World map card and Roster block: "Back in 1 h 12 m", or "Back · report ready". */
export const patrolTime = (p: MapPatrol, now: number): string =>
  now >= p.backAt ? 'Back · report ready' : `Back in ${countdown(timeLeft(p, now))}`;

/** A trip's length: "30 min", "1 h", "2 h". */
export function tripText(danger: Danger): string {
  const m = DANGERS[danger].minutes;
  return m < 60 ? `${m} min` : `${m / 60} h`;
}

/** A chance as a whole percent, never 0 or 100 for odds that are neither: "18%", "<1%". */
export function pct(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  const n = Math.round(p * 100);
  return n < 1 ? '<1%' : n > 99 ? '>99%' : `${n}%`;
}

/** Why a survivor out on a World map patrol (ID-219) can't change guns. */
export const MAP_GUN_AWAY = 'On patrol: their gun went with them.';

/** The patrols out, as the Roster's blocks and the Inventory's Bench tab show them (ID-234): the soonest back first. */
export const patrolsShown = (game: Pick<GameState, 'map'>): MapPatrol[] =>
  [...(game.map?.patrols ?? [])].sort((a, b) => a.backAt - b.backAt || a.no - b.no);

/** A patrol's name on the Roster (ID-234): "Patrol 3 · Pharmacy". */
export const patrolName = (p: Pick<MapPatrol, 'no' | 'area'>): string =>
  `Patrol ${p.no} · ${AREA_NAME[p.area]}`;

/**
 * A patrol's mission on the Roster (ID-234), in the World map card's words: its tag
 * "Risky · 1 h", then what it finds, "Finds Medicine, Scrap".
 */
export function patrolMission(p: Pick<MapPatrol, 'area' | 'danger'>): string {
  const finds = areaDrops({ kind: p.area, danger: p.danger }).map((d) => LOOT_NAME[d.loot]);
  return `${DANGER_NAME[p.danger]} · ${tripText(p.danger)} · Finds ${finds.join(', ')}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A countdown in words, for a screen reader: "42 minutes", "1 hour 5 minutes", "1 second". */
export function countdownWords(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return plural(s, 'second');
  const m = Math.ceil(s / 60);
  if (m < 60) return plural(m, 'minute');
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${plural(h, 'hour')} ${plural(rest, 'minute')}` : plural(h, 'hour');
}

/** A patrol block's name for a screen reader (ID-234): "Patrol 3, Pharmacy, back in 42 minutes". */
export const patrolGroupLabel = (p: MapPatrol, now: number): string =>
  `Patrol ${p.no}, ${AREA_NAME[p.area]}, ${
    now >= p.backAt ? 'back, report ready' : `back in ${countdownWords(timeLeft(p, now))}`
  }`;
