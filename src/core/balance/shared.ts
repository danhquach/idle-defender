// Balance tests (design §16): the starting numbers in data.ts, played by the
// scripted player in sim.ts, still meet the design's targets. A retune that breaks
// one fails here; `npm run balance` shows the full table.
// One file per target group, so Vitest plays them on separate workers at once.
// Fixtures shared by those files; never imported by game code.
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { skipOffer } from '../cards.ts';
import {
  STEP,
  SQUAD_CAP,
  SQUAD_HP_GROWTH,
  SQUAD_SLOT_COSTS,
  type EnemyKind,
  type GunBase,
  type Rarity,
  type ThemeId,
} from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { tickInPlace, type HordeState } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { effHorde, localHorde, modeOf, type HigherMode, type Mode } from '../modes.ts';
import { createRng } from '../rng.ts';
import { playSquadHorde, type HordeRun } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { xpForLevel } from '../stats.ts';
import { themeAt } from '../themes.ts';
import { REF_SHARE, refTech } from './refplayer.ts';
import { xpToNext } from '../waves.ts';

export const SEEDS = 20;

/** Horde `n` on the starting base with a fresh roster. */
export const bareGame = (n: number) => ({ ...newGame(), hordeNumber: n });

/**
 * The card tests' close fight (ID-163): `startSquadHorde`, but Horde 4 as it stood before
 * ID-163 (enemy HP at the bare growth, no preview elite). Those tests measure a card's worth
 * in a close fight a few fresh survivors can win, not Horde 4's own difficulty, which the
 * horde-only campaign test covers; the harder Horde 4 left them nothing to win.
 */
export function cardFight(game: GameState, seed: number): HordeState {
  const s = startSquadHorde(game, seed, 0);
  if (game.hordeNumber !== 4) return s;
  // Horde 4 before ID-163: ×1 on three steps of growth, and no elite.
  s.hpScale = SQUAD_HP_GROWTH.early ** 3;
  s.bosses = s.bosses.filter((b) => !b.elite);
  return s;
}

export const winRate = (runs: HordeRun[]): number =>
  runs.filter((r) => r.outcome === 'won').length / runs.length;

/**
 * Horde `n`'s expected squad (size and levels), each with a Rifle of `rarity` (Military by
 * default) at `gunLevel` (ID-098).
 */
export function squadAt(n: number, gunLevel: number, rarity: Rarity = 'military'): GameState {
  const size = Math.min(n, SQUAD_CAP);
  const g = newGame('horde');
  g.roster = Array.from({ length: size }, (_, i) => ({
    ...recruit(i + 1),
    xp: xpForLevel(Math.min(25, 1 + n)),
    loadout: {
      primary: rollWeapon(createRng(i + 7), `h${i + 1}`, 'rifle', rarity, gunLevel),
      secondary: null,
      item: null,
    },
  }));
  g.camp.recruits = size;
  g.hordeNumber = n;
  return g;
}

/** Survivors the expected squad has in the mode tests: every slot bought. */
const SIZE = SQUAD_CAP + SQUAD_SLOT_COSTS.length;

/** The expected squad at Normal Horde `n`: `SIZE` survivors, each a Military Rifle at `level`. */
export function squad(n: number, level: number): GameState {
  const g = newGame('horde');
  const roster = Array.from({ length: SIZE }, (_, i) => ({
    ...recruit(i + 1),
    xp: xpForLevel(25),
    loadout: {
      primary: rollWeapon(createRng(i + 7), `h${i + 1}`, 'rifle', 'military', level),
      secondary: null,
      item: null,
    },
  }));
  return {
    ...g,
    hordeNumber: n,
    roster,
    slots: { squad: SQUAD_SLOT_COSTS.length, stash: 0 },
    camp: { ...g.camp, recruits: SIZE },
  };
}

/**
 * `squad`'s survivors with the guns `bases` hand round (survivor i takes `bases[i % length]`),
 * each a Military one at `level` (ID-237). One class of gun is one base; the mix is four.
 */
export function gunSquad(n: number, level: number, bases: readonly GunBase[]): GameState {
  const g = squad(n, level);
  const roster = g.roster.map((d, i) => ({
    ...d,
    loadout: {
      ...d.loadout,
      primary: rollWeapon(
        createRng(i + 7),
        `h${i + 1}`,
        bases[i % bases.length]!,
        'military',
        level,
      ),
    },
  }));
  return { ...g, roster };
}

/** The mixed squad (ID-237): 2 LMG (Light), 2 Carbine (Medium), 2 Sniper rifle (Heavy), 2 Pump Shotgun (Spread). */
export const mixedSquad = (n: number, level: number): GameState =>
  gunSquad(n, level, ['lmg', 'rifle', 'sniper', 'shotgun']);

/** `game` playing `mode` from its Horde `local`. */
export const inMode = (game: GameState, mode: HigherMode, local = 1): GameState => ({
  ...game,
  mode,
  modes: { ...game.modes, [mode]: local },
});

/**
 * `game` as the reference player plays it (ID-265): with the Research Center nodes they own at
 * horde `n` of the game's mode (the next new one by default), 65% of the Scrap earned spent on
 * research (`refplayer.ts`). `game` itself while they own none (Normal below Horde 30), so those
 * fights are the ones they always were. Nothing is bought: no Scrap comes off.
 */
export function withRef(
  game: GameState,
  n: number = localHorde(game),
  share: number = REF_SHARE,
): GameState {
  const tech = refTech(modeOf(game), n, share);
  return tech.length > 0 ? { ...game, tech } : game;
}

/** Fights won out of `seeds` at horde `n` (the game's own mode's), by `game`'s squad. */
export const wins = (game: GameState, n: number, seeds: number): number => {
  let won = 0;
  for (let s = 1; s <= seeds; s++) {
    if (playSquadHorde(game, s * 101, undefined, undefined, n).outcome === 'won') won++;
  }
  return won;
};

/**
 * The lowest gun level in `from`..400 whose squad, given by `game(level)`, wins horde `n` on
 * most of 5 seeds (`wins` is non-decreasing in the level, so it bisects).
 */
export function holdFrom(game: (level: number) => GameState, n: number, from = 1): number {
  let lo = from;
  let hi = 400;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wins(game(mid), n, 5) >= 3) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The lowest gun level whose squad, with the reference player's research, holds Normal Horde 50: most of 5 seeds won. */
export const holdLevel = (): number => holdFrom((level) => withRef(squad(50, level)), 50);

/** The expected squad of `mode`'s horde `n` (a Normal one at Horde `n`) at gun `level`, unresearched. */
export function squadIn(mode: Mode, n: number, level: number): GameState {
  if (mode === 'normal') return squad(n, level);
  const g = inMode(squad(mode === 'nightmare' ? 51 : 200, level), mode, n);
  if (mode === 'hell') g.modes = { nightmare: 51, hell: n };
  return g;
}

/** The lowest gun level whose expected squad has at least `share` of horde `n`'s Recommended Power. */
export function levelAbove(mode: Mode, n: number, share: number): number {
  const target = recommendedPower(effHorde(mode, n), mode, SIZE) * share;
  for (let level = 1; level <= 400; level++) {
    if (squadPower(squadIn(mode, n, level)) >= target) return level;
  }
  throw new Error(`no squad reaches ${share} of ${mode} ${n}`);
}

/** The expected squad of `mode` whose Squad Power is at least `share` of horde `n`'s Recommended Power. */
export const squadAbove = (mode: Mode, n: number, share: number): GameState =>
  squadIn(mode, n, levelAbove(mode, n, share));

/**
 * `game` with a theme seed (ID-238) under which `mode`'s horde `local` is theme `theme`: the
 * lowest such seed, so a test can force a theme through the game's own rules.
 */
export function withTheme(game: GameState, mode: Mode, local: number, theme: ThemeId): GameState {
  for (let seed = 1; seed < 5000; seed++) {
    if (themeAt(seed, mode, local) === theme) return { ...game, themes: { seed } };
  }
  throw new Error(`no seed gives ${theme} at ${mode} ${local}`);
}

/** What `watchFight` saw of one fight. */
export interface Watched {
  outcome: HordeState['outcome'];
  /** Every enemy that came, but bosses and mini-bosses: its max HP when first seen, summed. */
  hp: number;
  /** The fight's XP in all, as the level and what is banked say it. */
  xp: number;
  /** Most enemies on the field at once. */
  peak: number;
  /** The fight level the squad reached: one card offer for each level gained. */
  level: number;
  /** The wave's non-boss enemies by wave number and kind. */
  kinds: Map<number, Partial<Record<EnemyKind, number>>>;
}

/**
 * Plays horde `local` of `game`'s mode step by step with no cards taken (so use a squad that
 * wins whatever it faces), looking at the field after every step so no enemy is missed. With
 * `noTheme` the horde is the plain one of its number (ID-238).
 */
export function watchFight(game: GameState, seed: number, local: number, noTheme = false): Watched {
  let s = startSquadHorde(game, seed, 0, local, noTheme);
  const out: Watched = { outcome: 'fighting', hp: 0, xp: 0, peak: 0, level: 1, kinds: new Map() };
  let seen = 0;
  while (s.outcome === 'fighting') {
    if (s.time > 3000) throw new RangeError('watchFight: the horde never ended');
    s = s.offer ? skipOffer(s) : tickInPlace(s, STEP);
    out.peak = Math.max(out.peak, s.enemies.length);
    for (const e of s.enemies) {
      if (e.id < seen) continue;
      if (e.horror || e.elite) continue;
      out.hp += e.maxHp;
      const wave = out.kinds.get(e.wave ?? 0) ?? {};
      wave[e.kind] = (wave[e.kind] ?? 0) + 1;
      out.kinds.set(e.wave ?? 0, wave);
    }
    seen = s.nextEnemyId;
  }
  out.outcome = s.outcome;
  out.level = s.level;
  out.xp = s.xp;
  for (let l = 1; l < s.level; l++) out.xp += xpToNext(l);
  return out;
}
