// Difficulty modes (ID-218, design §11): Normal, then Nightmare and Hell once the one before
// holds Horde 50. Each mode keeps its own horde (1 to 30, then Endless); the fight is as
// strong as Normal's Horde n + `offset` (the "effective horde"), and pays and drops more.
// Pure: the squad, guns, stash and Scrap are the game's, shared by every mode.
import { BOSSES, HELL_SKILLS, HORROR, type BossSkill, type HigherMode } from './data.ts';
import type { GameState } from './game.ts';
import { hordeBosses, type BossSpec } from './waves.ts';

export type { HigherMode };
export type Mode = 'normal' | HigherMode;

/** Every mode, in the order they unlock. */
export const MODE_IDS: readonly Mode[] = ['normal', 'nightmare', 'hell'];
/** The modes above Normal, in the order they unlock. */
export const HIGHER_MODES: readonly HigherMode[] = ['nightmare', 'hell'];

/** What a mode changes (ID-218; starting points, tuned by the balance pass). */
export interface ModeRules {
  name: string;
  /** Added to the mode's horde for the fight's strength, gun level, Scrap and XP. */
  offset: number;
  /** Scrap a win pays, as a multiple of Normal's. */
  scrap: number;
  /** Half-steps the gun drop's rarity band shifts up (`shiftUp`). */
  rarity: number;
  /** Skills each boss has from Normal's six (Normal's two, a higher mode's three). */
  skills: number;
  /** New Hell skills (ID-222) each boss has on top of `skills`: 0 or 1. */
  newSkills: number;
  /** Bosses a boss horde brings above Normal's count (up to `BOSSES.max` + this). */
  extraBoss: number;
  /** A tuning factor on enemy HP, on top of the effective horde's. */
  hpScale: number;
  /** A tuning factor on a boss horde's Recommended Power (ID-222). */
  recBoss: number;
}

export const MODES: Readonly<Record<Mode, ModeRules>> = {
  normal: {
    name: 'Normal',
    offset: 0,
    scrap: 1,
    rarity: 0,
    skills: 2,
    newSkills: 0,
    extraBoss: 0,
    hpScale: 1,
    recBoss: 1,
  },
  nightmare: {
    name: 'Nightmare',
    offset: 50,
    scrap: 1.5,
    rarity: 1,
    skills: 3,
    newSkills: 0,
    extraBoss: 0,
    hpScale: 1.12,
    recBoss: 1,
  },
  hell: {
    name: 'Hell',
    offset: 80,
    scrap: 2,
    rarity: 2,
    skills: 3,
    newSkills: 1,
    extraBoss: 1,
    hpScale: 1,
    recBoss: 1.2,
  },
};

/**
 * The first letter of a first clear's gun uid on each mode (`h<n>` on Normal, as ever), `n`
 * being the mode's own horde: one per mode so the uids never meet.
 */
export const FIRST_UID: Readonly<Record<Mode, string>> = { normal: 'h', nightmare: 'n', hell: 'x' };

/** The horde that must be held (beaten) on the mode before to unlock the next. */
export const MODE_UNLOCK_HORDE = 50;

/** The mode that unlocks `mode`, null for Normal. */
export const modeBefore = (mode: Mode): Mode | null =>
  mode === 'hell' ? 'nightmare' : mode === 'nightmare' ? 'normal' : null;

/** What a game's mode progress reads from. */
export type ModeProgress = Pick<GameState, 'hordeNumber' | 'mode' | 'modes'>;

/** The mode being played; Normal when none is saved. */
export const modeOf = (game: Pick<GameState, 'mode'>): Mode => game.mode ?? 'normal';

/** `mode`'s next horde (its own number, from 1); Normal's is the game's `hordeNumber`. */
export const localHorde = (game: ModeProgress, mode: Mode = modeOf(game)): number =>
  mode === 'normal' ? game.hordeNumber : (game.modes?.[mode] ?? 1);

/** The highest horde beaten on `mode`, 0 for none. */
export const beatenIn = (game: ModeProgress, mode: Mode = modeOf(game)): number =>
  localHorde(game, mode) - 1;

/** The strength of horde `local` of `mode`: the Normal horde it is as strong as. */
export const effHorde = (mode: Mode, local: number): number => local + MODES[mode].offset;

/** The mode horde a fight's strength (`HordeState.hordeNumber`) stands for. */
export const localOf = (h: { hordeNumber: number; mode?: HigherMode }): number =>
  h.hordeNumber - MODES[h.mode ?? 'normal'].offset;

/**
 * Whether `mode` is open (permanent): Normal always; each other once the mode before has
 * beaten Horde `MODE_UNLOCK_HORDE`. Read off the hordes, so older saves have it for free.
 */
export function modeUnlocked(game: ModeProgress, mode: Mode): boolean {
  const before = modeBefore(mode);
  return before === null || beatenIn(game, before) >= MODE_UNLOCK_HORDE;
}

/** What a locked `mode` asks, as the start screen says it. */
export const unlockHint = (mode: Mode): string => {
  const before = modeBefore(mode);
  return before === null ? '' : `Hold Horde ${MODE_UNLOCK_HORDE} on ${MODES[before].name}`;
};

/** The modes the player can play now, in order. */
export const openModes = (game: ModeProgress): Mode[] =>
  MODE_IDS.filter((m) => modeUnlocked(game, m));

/** `game` switched to `mode` (between fights; every mode's progress is kept); refused if locked. */
export function setMode(game: GameState, mode: Mode): GameState {
  if (!MODE_IDS.includes(mode) || !modeUnlocked(game, mode)) {
    throw new RangeError(`setMode: ${mode} is not open`);
  }
  const next = { ...game };
  delete next.mode;
  if (mode !== 'normal') next.mode = mode;
  return next;
}

/** `game` with `mode`'s horde one on (a first clear). */
export function advance(game: GameState, mode: Mode = modeOf(game)): GameState {
  if (mode === 'normal') return { ...game, hordeNumber: game.hordeNumber + 1 };
  return { ...game, modes: { ...game.modes, [mode]: localHorde(game, mode) + 1 } };
}

/**
 * The strongest horde beaten on any mode, as its effective number (0 for none): the level a
 * gun can have dropped, and what a crafted gun comes at.
 */
export function topBeaten(game: ModeProgress): number {
  return Math.max(
    0,
    ...MODE_IDS.filter((m) => beatenIn(game, m) >= 1).map((m) => effHorde(m, beatenIn(game, m))),
  );
}

/**
 * Each skill used by a horde's bosses, three to a boss, by `count` bosses (ID-218):
 * - 1 or 2 bosses: boss k keeps its `BOSSES.sets` pair and takes one skill of the set's
 *   unused third pair, so no skill repeats in the horde.
 * - 3 or more: every pair of the set is used (the 4th boss cycles back), and each boss adds
 *   the least-used skill that is not its own, so every skill is used and none more than
 *   twice, and no two bosses have the same trio.
 */
export function bossTrios(
  set: readonly (readonly [BossSkill, BossSkill])[],
  count: number,
): BossSkill[][] {
  if (count <= 2) {
    const spare = set[set.length - 1]!;
    return Array.from({ length: count }, (_, i) => [...set[i]!, spare[i]!]);
  }
  const pool = set.flat();
  const pairs = Array.from({ length: count }, (_, i) => set[i % set.length]!);
  const used = new Map<BossSkill, number>(pool.map((s) => [s, 0]));
  for (const pair of pairs) for (const s of pair) used.set(s, used.get(s)! + 1);
  const key = (skills: readonly BossSkill[]): string => [...skills].sort().join();
  const out: BossSkill[][] = [];
  for (const pair of pairs) {
    const extra = pool
      .filter((s) => !pair.includes(s) && !out.some((t) => key(t) === key([...pair, s])))
      .sort((a, b) => used.get(a)! - used.get(b)! || pool.indexOf(a) - pool.indexOf(b))[0]!;
    used.set(extra, used.get(extra)! + 1);
    out.push([...pair, extra]);
  }
  return out;
}

/**
 * The bosses and mini-boss horde `local` of `mode` brings (ID-218): Normal's as ever. In a
 * higher mode, a boss horde's count follows the mode's own horde (`local`, plus the mode's
 * `extraBoss`, up to `BOSSES.max` + that) and their strength the effective horde's, each with
 * `bossTrios`' three skills (and in Hell one of `HELL_SKILLS` on top, ID-222, rotating by
 * horde); any other horde keeps the mini-bosses of its effective number.
 */
export function modeBosses(mode: Mode, local: number): BossSpec[] {
  const eff = effHorde(mode, local);
  const base = hordeBosses(eff, true);
  const boss = base.find((b) => !b.elite);
  if (mode === 'normal' || !boss) return base;
  const count = Math.min(local / HORROR.every, BOSSES.max) + MODES[mode].extraBoss;
  const set = BOSSES.sets[(eff / HORROR.every - 1) % BOSSES.sets.length]!;
  const hell = MODES[mode].newSkills > 0;
  return bossTrios(set, count).map((trio, k) => ({
    ...boss,
    // Hell (ID-222): boss k adds one new skill, so with 3 bosses or fewer none repeats.
    skills: hell ? [...trio, HELL_SKILLS[(k + eff / HORROR.every) % HELL_SKILLS.length]!] : trio,
  }));
}
