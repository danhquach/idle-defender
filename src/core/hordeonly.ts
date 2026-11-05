// The horde-only build (ID-066, design §2, §11): one loop, fight a horde → result screen
// → next horde. The squad all start on the wall, a win adds XP and one survivor up to the
// cap, a loss replays the same horde with everyone back and the wall full. The rest of
// the game's state rides along untouched, so the full game can come back later.
import { squadBase } from './base.ts';
import { recruit } from './camp.ts';
import { UPGRADE_IDS, UPGRADES, type CardCategory } from './cards.ts';
import {
  MAX_COUNT,
  SQUAD_CAP,
  SQUAD_HP_GROWTH,
  SQUAD_TOWERS,
  SQUAD_XP_RATE,
  START_PERK,
} from './data.ts';
import {
  levelGains,
  xpGains,
  type GameState,
  type LevelGain,
  type RosterDefender,
} from './game.ts';
import { newHorde, standing, type DefenderSpec, type HordeState, type UpgradeId } from './horde.ts';
import { isGun } from './loadout.ts';

/** The card categories a horde-only fight offers (ID-066); anything else stays out. */
export const SQUAD_CARD_CATEGORIES: readonly CardCategory[] = ['stat', 'behaviour', 'barrier'];

/**
 * The cards a horde-only fight offers: stat, behaviour and barrier cards, less Cleave (no
 * blades or tools). Power cards (no turrets) are out; recruit cards never come, as the
 * whole squad starts on the field.
 */
export const SQUAD_CARDS: readonly UpgradeId[] = UPGRADE_IDS.filter(
  (id) => SQUAD_CARD_CATEGORIES.includes(UPGRADES[id].category) && id !== 'cleave',
);

/**
 * Enemy HP's factor in horde-only Horde `n` (ID-066): `SQUAD_HP_GROWTH.early` per horde
 * until the squad reaches its cap, `late` after.
 */
export function squadHpScale(n: number): number {
  const early = Math.min(n, SQUAD_CAP) - 1;
  const late = Math.max(0, n - SQUAD_CAP);
  return SQUAD_HP_GROWTH.early ** early * SQUAD_HP_GROWTH.late ** late;
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
 * Horde `game.hordeNumber` for the whole squad, each on their tower from the middle out,
 * on a fresh horde-only base (a full wall), at `now`. No injuries or patrols hold anyone
 * back, and no research, cash, skills or bank come in.
 */
export function startSquadHorde(game: GameState, seed: number, now: number): HordeState {
  if (!Number.isFinite(now)) throw new RangeError(`startSquadHorde: bad time ${now}`);
  const squad = squadOf(game).map(squadSpec);
  const first = squad[0];
  if (!first) throw new RangeError('startSquadHorde: nobody in the squad');
  const base = squadBase();
  const postOf = (i: number): number => base.posts.findIndex((p) => p.row === SQUAD_TOWERS[i]);
  const s = newHorde(seed, {
    hordeNumber: game.hordeNumber,
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
    hpScale: squadHpScale(game.hordeNumber),
    xpRate: SQUAD_XP_RATE,
  });
  // The rest of the squad take their towers too: nobody waits on the bench.
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

/**
 * Back from horde `horde`: a win gives every survivor who fought the horde's XP, adds a
 * survivor while the squad is under the cap, and moves on to the next horde. A loss
 * gives nothing and changes nothing: the same horde is played again with everyone, and
 * every fight's wall starts full. No base damage, payout, drop, injury or camp XP.
 */
export function finishSquadHorde(game: GameState, horde: HordeState): GameState {
  if (horde.outcome === 'fighting') throw new RangeError('finishSquadHorde: the horde is still on');
  if (horde.hordeNumber !== game.hordeNumber) {
    throw new RangeError(`finishSquadHorde: horde ${horde.hordeNumber} is not this game's`);
  }
  if (horde.outcome !== 'won') return game;
  const g = structuredClone(game);
  for (const gain of xpGains(horde)) {
    const d = g.roster.find((r) => r.id === gain.id);
    // Capped where a save reads it, so a win never leaves a save that won't load.
    if (d) d.xp = Math.min(MAX_COUNT, d.xp + gain.xp);
  }
  const joined = joiner(game);
  if (joined) {
    g.roster.push(joined);
    g.camp.recruits += 1;
  }
  g.hordeNumber += 1;
  return g;
}

/** What a horde-only result screen reads off a finished horde. */
export interface SquadResult {
  gains: LevelGain[];
  /** The survivor joining for the next horde; null on a loss or with the squad full. */
  joined: RosterDefender | null;
}

export function squadResult(game: GameState, horde: HordeState): SquadResult {
  if (horde.outcome === 'fighting') throw new RangeError('squadResult: the horde is still on');
  const won = horde.outcome === 'won';
  return { gains: won ? levelGains(game, horde) : [], joined: won ? joiner(game) : null };
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
