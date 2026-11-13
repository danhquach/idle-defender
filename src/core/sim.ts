// The headless balance simulator (design §16): plays hordes with a fixed scripted
// player, no page and no clock, so the starting numbers in `data.ts` can be checked
// by the balance tests and the `npm run balance` report without playing by hand.
import { repairSegment } from './base.ts';
import { chooseCard, postUsable, replaces } from './cards.ts';
import { available, finishHorde, newGame, recover, startHorde, type GameState } from './game.ts';
import {
  layoutOf,
  tick,
  tickInPlace,
  took,
  type Card,
  type HordeState,
  type Outcome,
  type UpgradeId,
} from './horde.ts';
import { gunPower, type OwnedWeapon } from './armoury.ts';
import {
  equipGun,
  finishSquadHorde,
  highestBeaten,
  squadDrop,
  squadOf,
  startSquadHorde,
  stashWith,
  type SquadDrop,
} from './hordeonly.ts';
import { skillLock, useSkill } from './skills.ts';
import { squadPower } from './squadpower.ts';
import { isGun } from './loadout.ts';
import { replaceInjured, replacePosts, skipReplace } from './replace.ts';
import { levelOf } from './stats.ts';
import { FARM, FIELD, WALL } from './data.ts';

/** Longest a simulated horde may run, in fight seconds, before it counts as stuck. */
const MAX_FIGHT = 3600;

/** What one simulated horde came to. */
export interface HordeRun {
  hordeNumber: number;
  seed: number;
  outcome: Exclude<Outcome, 'fighting'>;
  /** Wave reached (the last one on a win). */
  wave: number;
  waveCount: number;
  /** Fight time in seconds; offers don't count. */
  seconds: number;
  /** Defenders who took part, and how many of them were injured. */
  tookPart: number;
  injured: number;
  /** Share of the base's wall and gate HP left at the end, 0…1. */
  wallLeft: number;
}

/** A horde-only campaign's fight (`playSquadCampaign`). */
export interface SquadRun extends HordeRun {
  /** Survivors in the fight, and their mean level going in. */
  squad: number;
  level: number;
  /** Whether it was a replay of a beaten horde, farmed (ID-102). */
  replay: boolean;
  /** The squad's Squad Power going in (ID-102). */
  power: number;
  /** How close enemies came to the wall, px (`nearestEnemy`); only when watched. */
  nearest?: number;
}

/** The scripted player's start: the first fit defender on the usable post furthest forward. */
export function opening(game: GameState, now: number): { defenderId: string; postId: number } {
  const fit = game.roster.find((d) => available(d, now));
  if (!fit) throw new RangeError('opening: nobody can defend');
  const { layers, posts } = layoutOf(game.base);
  let best: (typeof posts)[number] | undefined;
  for (const p of posts) if (postUsable(layers, p) && (!best || p.x > best.x)) best = p;
  if (!best) throw new RangeError('opening: no usable post');
  return { defenderId: fit.id, postId: best.id };
}

/**
 * The scripted player's answer to an open offer: a recruit if offered, else the first card,
 * passing over Hollow Points until Aim for the Head is held (ID-130: with only a Gunner's
 * crit it does next to nothing, so a real player wouldn't take it); every replacement taken.
 */
export function answerOffer(s: HordeState): HordeState {
  if (s.offer) {
    const recruit = s.offer.findIndex((c) => c.kind === 'recruit');
    if (recruit >= 0) return chooseCard(s, recruit);
    const useful = s.offer.findIndex(
      (c) => c.kind !== 'upgrade' || c.id !== 'hollow-point-rounds' || took(s, 'aim-for-the-head'),
    );
    return chooseCard(s, Math.max(0, useful));
  }
  const post = replacePosts(s)[0];
  const r = post ? replaceInjured(s, s.bench[0]!.id, post.id) : undefined;
  return r?.ok ? r.state : skipReplace(s);
}

/**
 * Plays `game`'s next horde to the end with the scripted player; returns the finished
 * horde. Throws once it has run past `maxFight` fight seconds (a stuck fight).
 */
export function playHorde(
  game: GameState,
  seed: number,
  now: number,
  maxFight = MAX_FIGHT,
): HordeState {
  const { defenderId, postId } = opening(game, now);
  let s = startHorde(game, seed, defenderId, postId, now);
  while (s.outcome === 'fighting') {
    if (s.time > maxFight) throw new RangeError(`playHorde: horde ${s.hordeNumber} never ended`);
    s = s.offer || s.replace ? answerOffer(s) : tick(s, 60);
  }
  return s;
}

/** The numbers the balance tests and report read off a finished horde. */
export function summarise(horde: HordeState, seed: number): HordeRun {
  if (horde.outcome === 'fighting') throw new RangeError('summarise: the horde is still on');
  const segs = horde.layers.flatMap((l) => l.segments).filter((g) => g.kind !== null);
  const max = segs.reduce((n, g) => n + g.maxHp, 0);
  return {
    hordeNumber: horde.hordeNumber,
    seed,
    outcome: horde.outcome,
    wave: horde.wave,
    waveCount: horde.waveCount,
    seconds: Math.round(horde.time),
    tookPart: horde.tookPart.length,
    injured: horde.injured.length,
    wallLeft: max > 0 ? segs.reduce((n, g) => n + Math.max(0, g.hp), 0) / max : 0,
  };
}

/** Repairs damaged segments one at a time, most damaged first, while the stock covers them. */
export function repairWhatYouCan(game: GameState): GameState {
  const damaged = game.base.layers
    .flatMap((l) => l.slots.map((seg, row) => ({ column: l.column, row, seg })))
    .filter(({ seg }) => seg !== null && seg.hp < seg.maxHp)
    .sort((a, b) => a.seg!.hp / a.seg!.maxHp - b.seg!.hp / b.seg!.maxHp);
  let { base, stock } = game;
  for (const { column, row } of damaged) {
    const r = repairSegment(base, stock, column, row);
    if (r.ok) ({ base, stock } = r);
  }
  return { ...game, base, stock };
}

/**
 * The horde-only scripted player's guns (ID-096), as a player equips their drops: while the
 * stash's strongest gun hits harder (`gunPower`) than the weakest one in the squad's hands,
 * it goes to that survivor (theirs goes to the stash).
 */
export function gearUp(game: GameState): GameState {
  let g = game;
  // Each swap raises the squad's total gun power, so this ends.
  for (;;) {
    const held = squadOf(g).filter((d) => isGun(d.loadout.primary));
    const weakest = held.reduce<(typeof held)[number] | undefined>(
      (a, d) => (!a || gunPower(d.loadout.primary) < gunPower(a.loadout.primary) ? d : a),
      undefined,
    );
    const best = g.armoury
      .filter(isGun)
      .reduce<OwnedWeapon | undefined>(
        (a, w) => (!a || gunPower(w) > gunPower(a) ? w : a),
        undefined,
      );
    if (!weakest || !best || gunPower(best) <= gunPower(weakest.loadout.primary)) return g;
    const r = equipGun(g, weakest.id, best.uid);
    if (!r.ok) return g;
    g = r.game;
  }
}

/**
 * The scripted player between hordes: waits until the whole roster is fit, then
 * repairs what it can afford. Never builds. Returns the game and the clock it starts at.
 */
export function nextHorde(game: GameState, now: number): { game: GameState; now: number } {
  const at = Math.max(now, ...game.roster.map((d) => d.injuredUntil ?? now));
  return { game: repairWhatYouCan(recover(game, at)), now: at };
}

/**
 * Plays hordes from a new game until `hordes` have been fought. Between hordes the
 * scripted player waits until the whole roster is fit, repairs what it can afford
 * (most damaged segment first) and retries a lost horde. It never builds. Horde `i`
 * (from 0) uses seed `seed + i`.
 */
export function playCampaign(seed: number, hordes: number): HordeRun[] {
  if (!Number.isInteger(hordes) || hordes < 0) {
    throw new RangeError(`playCampaign: bad count ${hordes}`);
  }
  let game = newGame();
  let now = 0;
  const runs: HordeRun[] = [];
  for (let i = 0; i < hordes; i++) {
    ({ game, now } = nextHorde(game, now));
    const horde = playHorde(game, seed + i, now);
    now += horde.time * 1000;
    runs.push(summarise(horde, seed + i));
    game = finishHorde(game, horde, now);
  }
  return runs;
}

/**
 * The horde-only scripted player's cards (ID-066, ID-077), best first: damage, then
 * shots that spread it or hold enemies back, then reach, then the wall. Any card not
 * listed comes last.
 */
const SQUAD_PICKS: readonly UpgradeId[] = [
  'hollow-points',
  'sharpshooter',
  'rapid-fire',
  'frag-grenades',
  'flashbang',
  'molotov',
  'piercing-rounds',
  'concussion-rounds',
  'extended-mags',
  'incendiary-rounds',
  'shock-rounds',
  'ricochet',
  'speed-loaders',
  'scavenged-ammo',
  'long-sight',
  'barbed-wire',
  'oil-bomb',
  'sandbags',
  'reinforce',
  'field-repairs',
  'patch-up',
];

/**
 * Which card of the open offer the horde-only scripted player takes: the best by
 * `SQUAD_PICKS`. It keeps the ammo it loaded first (ID-097), and the throwable it took
 * first (ID-139): a card that would replace either comes last.
 */
export function squadPick(s: Pick<HordeState, 'offer' | 'taken'>): number {
  const rank = (c: Card): number => {
    if (c.kind === 'upgrade' && replaces(s, c.id)) return SQUAD_PICKS.length + 1;
    const i = c.kind === 'upgrade' ? SQUAD_PICKS.indexOf(c.id) : -1;
    return i < 0 ? SQUAD_PICKS.length : i;
  };
  const ranks = (s.offer ?? []).map(rank);
  return ranks.indexOf(Math.min(...ranks));
}

/**
 * How close to the wall any enemy standing in `s` is (ID-096): px in front of the
 * outermost layer's face, 0 for one at it or past it; Infinity with none or no wall.
 */
export function nearestEnemy(s: Pick<HordeState, 'layers' | 'enemies'>): number {
  const built = s.layers.filter((l) => l.segments.some((seg) => seg.kind !== null));
  if (built.length === 0) return Infinity;
  const front = Math.max(...built.map((l) => l.x)) + WALL.depth;
  let near = Infinity;
  for (const e of s.enemies) if (e.hp > 0) near = Math.min(near, e.inCamp ? 0 : e.x - front);
  return Math.max(0, near);
}

/**
 * How often (fight s) a watched horde is looked at. Watching only slices the ticks, and a
 * fight ticked in slices plays the same, so a watched fight is the same as one not watched.
 */
const WATCH_EVERY = 0.5;

/**
 * The horde-only scripted player's skills (ID-102): it looks every `look` fight s and uses
 * each picked skill that is ready once `crowd` enemies stand on the field, aimed at the one
 * nearest the wall.
 */
const SQUAD_SKILL_USE = { look: 1, crowd: 6 } as const;

/** The scripted player's skills (`SQUAD_SKILL_USE`): `s` with every ready skill used, or as it was. */
export function useSkills(s: HordeState): HordeState {
  const live = s.enemies.filter((e) => e.hp > 0 && !e.inCamp);
  if (live.length < SQUAD_SKILL_USE.crowd) return s;
  const near = live.reduce((a, e) => (e.x < a.x ? e : a));
  const x = Math.min(FIELD.right, Math.max(0, near.x));
  const y = Math.min(FIELD.height, Math.max(0, near.y));
  let out = s;
  for (const id of s.skills) {
    if (skillLock(out, id) !== null) continue;
    const r = useSkill(out, id, x, y);
    if (r.ok) out = r.state;
  }
  return out;
}

/**
 * Plays horde-only Horde `hordeNumber` (the next new one by default, or a beaten one to
 * farm, ID-098) to the end with the scripted player (ID-066): it takes cards by
 * `squadPick` and uses its picked skills (`useSkills`, ID-102). With `watch`, also how
 * close the enemies came to the wall (`nearestEnemy`, looked at every `WATCH_EVERY` s).
 */
export function playSquadHorde(
  game: GameState,
  seed: number,
  maxFight = MAX_FIGHT,
  watch?: { nearest: number },
  hordeNumber = game.hordeNumber,
): HordeState {
  let s = startSquadHorde(game, seed, 0, hordeNumber);
  const step = s.skills.length > 0 ? SQUAD_SKILL_USE.look : 60;
  // Watching ticks each look in slices (ID-105): the player still looks to use its skills
  // every `step`, so watching never changes how it plays.
  const slices = watch ? Math.ceil(step / WATCH_EVERY) : 1;
  const look = (): void => {
    if (watch) watch.nearest = Math.min(watch.nearest, nearestEnemy(s));
  };
  // Whether `s` came from our own tick, so nothing else holds it and the next tick can
  // skip the copy (`tickInPlace`). A card pick or a skill makes a state that may share
  // parts with others, so the tick after one copies as usual.
  let owned = false;
  while (s.outcome === 'fighting') {
    if (s.time > maxFight)
      throw new RangeError(`playSquadHorde: horde ${s.hordeNumber} never ended`);
    if (s.offer) {
      s = chooseCard(s, squadPick(s));
      owned = false;
    } else {
      const next = useSkills(s);
      s = owned && next === s ? tickInPlace(s, step / slices) : tick(next, step / slices);
      owned = true;
      for (let k = 1; k < slices && !s.offer && !s.replace && s.outcome === 'fighting'; k++) {
        look();
        s = tickInPlace(s, step / slices);
      }
    }
    look();
  }
  return s;
}

/**
 * How the horde-only scripted player farms (ID-102): after each loss at a new horde, it
 * replays the highest horde beaten `replays` times, then tries the new one again.
 */
export const SQUAD_FARM = { replays: 3 } as const;

/** How a scripted horde-only campaign is played (`playSquadCampaign`). */
export interface SquadPlay {
  /** Most fights in all, replays included. */
  maxFights?: number;
  /** Watch how close enemies come to the wall (`SquadRun.nearest`). */
  watch?: boolean;
  /**
   * The worst luck (ID-102): every replay drop but a guaranteed upgrade (bonus guns too,
   * ID-122) is thrown away and counts toward the bad-luck guarantee, as if it were no
   * upgrade for anyone.
   */
  worstLuck?: boolean;
}

/**
 * A replay's result at the worst luck (`SquadPlay.worstLuck`): `next` (the game after
 * `finishSquadHorde`) with the stash as it was, plus `drop`'s gun only if it was a
 * guaranteed upgrade; with no guaranteed upgrade, the bad-luck count up by 1 as for a drop
 * that is no upgrade.
 */
export function unlucky(game: GameState, next: GameState, drop: SquadDrop): GameState {
  if (drop.kind === 'guaranteed') {
    return { ...next, armoury: stashWith(game.armoury, [drop.weapon]).armoury };
  }
  return {
    ...next,
    armoury: game.armoury,
    farm: {
      ...next.farm,
      badLuck: drop.noUpgrades
        ? game.farm.badLuck
        : Math.min(FARM.guarantee, game.farm.badLuck + 1),
    },
  };
}

/**
 * A horde-only campaign (ID-066, ID-102) from a new game until Horde `hordes` is won, as
 * the player plays it: a win adds XP (levels, ID-146), a survivor and a gun (equipped
 * by `gearUp`); a loss pays its little XP, then the player farms (`SQUAD_FARM`) and tries
 * again. Stops after `maxFights` fights in all (`hordes × 10` by default). Fight `i` (from
 * 0) uses seed `seed + i`. Returns every fight, in order: the horde, whether it was a
 * replay, the squad size it was fought with, the squad's mean level and Squad Power, and
 * with `watch` how close enemies came to the wall.
 */
export function playSquadCampaign(seed: number, hordes: number, play: SquadPlay = {}): SquadRun[] {
  const maxFights = play.maxFights ?? hordes * 10;
  let game = newGame('horde');
  const runs: SquadRun[] = [];
  let farm = 0;
  for (let i = 0; i < maxFights && game.hordeNumber <= hordes; i++) {
    const n = farm > 0 ? highestBeaten(game) : game.hordeNumber;
    const seen = play.watch ? { nearest: Infinity } : undefined;
    const horde = playSquadHorde(game, seed + i, MAX_FIGHT, seen, n);
    const squad = squadOf(game);
    runs.push({
      ...summarise(horde, seed + i),
      replay: farm > 0,
      squad: squad.length,
      level: squad.reduce((t, d) => t + levelOf(d.xp).level, 0) / squad.length,
      power: squadPower(game),
      ...(seen ? { nearest: seen.nearest } : {}),
    });
    const drop = farm > 0 && play.worstLuck ? squadDrop(game, horde) : null;
    let next = finishSquadHorde(game, horde);
    if (drop) next = unlucky(game, next, drop);
    game = gearUp(next);
    if (farm > 0) farm--;
    else if (horde.outcome !== 'won' && n > 1) farm = SQUAD_FARM.replays;
  }
  return runs;
}

const minutes = (s: number): string => (s / 60).toFixed(1);

/**
 * The balance report (`npm run balance`): hordes 1…`hordes` on the starting base over
 * `seeds` seeds (1…seeds), then a campaign per seed. Plain text, one line per row.
 */
export function balanceReport(seeds: number, hordes: number): string {
  for (const n of [seeds, hordes]) {
    // Capped so a typo can't start an hours-long run.
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      throw new RangeError(`balanceReport: expected a whole number from 1 to 100, got ${n}`);
    }
  }
  const lines = [
    'Starting base, no building',
    'Horde  Won    Wave  Minutes min/median/max  Injured',
  ];
  for (let n = 1; n <= hordes; n++) {
    const runs = Array.from({ length: seeds }, (_, i) =>
      summarise(playHorde({ ...newGame(), hordeNumber: n }, i + 1, 0), i + 1),
    );
    const secs = runs.map((r) => r.seconds).sort((a, b) => a - b);
    const won = runs.filter((r) => r.outcome === 'won').length;
    const wave = Math.round(runs.reduce((t, r) => t + r.wave, 0) / seeds);
    const injured = runs.reduce((t, r) => t + r.injured, 0) / seeds;
    lines.push(
      [
        String(n).padEnd(6),
        `${won}/${seeds}`.padEnd(6),
        `${wave}/${runs[0]!.waveCount}`.padEnd(5),
        [secs[0]!, secs[secs.length >> 1]!, secs[secs.length - 1]!]
          .map(minutes)
          .join('/')
          .padEnd(22),
        injured.toFixed(1),
      ].join(' '),
    );
  }
  lines.push('', `Campaign of ${hordes * 2} hordes, no building: next horde (wins/losses)`);
  for (let i = 1; i <= seeds; i++) {
    const runs = playCampaign(i * 1000, hordes * 2);
    const won = runs.filter((r) => r.outcome === 'won').length;
    lines.push(`seed ${i}: next horde ${won + 1} (${won}/${runs.length - won})`);
  }
  return lines.join('\n');
}
