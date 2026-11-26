// Themed hordes (ID-238, design §9): which theme a mode's horde brings. Pure, from the
// save's theme seed, so the same save meets the same theme at a horde, a lost horde stays
// its theme, a replay is the same one, and nothing about the pick is stored. Core RNG only.
// A save keeps only the seed and the themes cleared, and the save reader does not re-derive the
// picks (it bounds `cleared` by the themed hordes beaten), so `themeAt`'s inputs (the theme list,
// the mix, the slots, the mode order) can change freely: only the sequence players meet changes,
// and no save is refused for it. `THEME_IDS`' order is the one thing that is save format.
import { ENEMY_MIX, HORROR, THEME, THEME_IDS, THEMES, type ThemeId } from './data.ts';
import type { GameState } from './game.ts';
import { effHorde, localHorde, MODE_IDS, modeOf, type Mode } from './modes.ts';
import { createRng, pick } from './rng.ts';
import { isThemed } from './waves.ts';

/** The stream the themes are picked from: apart from every other stream (drops, joiners, rests, ...). */
export const THEME_PICK_STREAM = 0x4f1bbcdd;
/** The stream a theme's first-clear gun rolls from, XORed with the horde's seed. */
export const THEME_GUN_STREAM = 0x7a3c91b5;

/**
 * The theme of each themed horde of `mode` up to `local`, in order (the horde `THEME.from + 10 i`
 * is entry `i`): picked from the themes whose kind has appeared by that horde's strength,
 * never the one before. An entry is null only if no theme's kind has appeared yet.
 */
export function themeSequence(seed: number, mode: Mode, local: number): (ThemeId | null)[] {
  const rng = createRng(
    (seed ^ THEME_PICK_STREAM ^ Math.imul(MODE_IDS.indexOf(mode), 0x9e3779b1)) >>> 0,
  );
  const out: (ThemeId | null)[] = [];
  let before: ThemeId | null = null;
  for (let slot = THEME.from; slot <= local; slot += HORROR.every) {
    const strength = effHorde(mode, slot);
    // Every kind has appeared by Horde `THEME.from` today; the filter keeps a later retune honest.
    const open = THEME_IDS.filter((id) => (ENEMY_MIX[THEMES[id].kind]?.from ?? 0) <= strength);
    const fresh = open.filter((id) => id !== before);
    const chosen: ThemeId | null =
      open.length === 0 ? null : pick(rng, fresh.length > 0 ? fresh : open);
    out.push(chosen);
    if (chosen) before = chosen;
  }
  return out;
}

/** The theme of `mode`'s horde `local` for a theme `seed`; null when it is not a themed horde. */
export function themeAt(seed: number, mode: Mode, local: number): ThemeId | null {
  if (!isThemed(local)) return null;
  return themeSequence(seed, mode, local).at(-1) ?? null;
}

/** The theme `seed` and `mode` give each horde in `seq`'s range: `seq` from `themeSequence`. */
export const themeIn = (seq: readonly (ThemeId | null)[], local: number): ThemeId | null =>
  isThemed(local) ? (seq[(local - THEME.from) / HORROR.every] ?? null) : null;

/**
 * The theme of `game`'s horde `local` (the next new one by default) on `mode` (the one being
 * played by default); null on a horde with none. An older save has no seed: it shares sequence 0.
 */
export const themeOf = (
  game: Pick<GameState, 'themes' | 'mode' | 'modes' | 'hordeNumber'>,
  local: number = localHorde(game),
  mode: Mode = modeOf(game),
): ThemeId | null => themeAt(game.themes?.seed ?? 0, mode, local);

/** Whether `game` has beaten theme `id` (a first clear of it, or a win over it on a replay). */
export const themeCleared = (game: Pick<GameState, 'themes'>, id: ThemeId): boolean =>
  game.themes?.cleared?.includes(id) ?? false;

/**
 * `game.themes` with `id` cleared (themes in `THEME_IDS` order); the game's own object when it
 * already is, so a caller can tell nothing changed.
 */
export function withCleared(
  game: Pick<GameState, 'themes'>,
  id: ThemeId,
): NonNullable<GameState['themes']> {
  const had = game.themes ?? {};
  if (themeCleared(game, id)) return had;
  const cleared = THEME_IDS.filter((t) => t === id || had.cleared?.includes(t));
  return { ...had, cleared };
}

/**
 * How many themed hordes `game` has beaten, summed over every mode (the full game's and the
 * horde-only build's alike): the most themes a save's `cleared` can list, one per themed horde
 * beaten. A count, not a re-derivation: `themeAt` is not consulted, so a save never depends on
 * which theme a horde rolled.
 */
export function themedSlotsBeaten(game: Pick<GameState, 'mode' | 'modes' | 'hordeNumber'>): number {
  let slots = 0;
  for (const mode of MODE_IDS) {
    const beaten = localHorde(game, mode) - 1;
    if (beaten >= THEME.from) slots += Math.floor((beaten - THEME.from) / HORROR.every) + 1;
  }
  return slots;
}
