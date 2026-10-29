// The headless balance simulator (design §16): plays hordes with a fixed scripted
// player, no page and no clock, so the starting numbers in `data.ts` can be checked
// by the balance tests and the `npm run balance` report without playing by hand.
import { repairSegment } from './base.ts';
import { chooseCard, postUsable } from './cards.ts';
import { PROFESSION_STAT } from './data.ts';
import {
  available,
  finishHorde,
  newGame,
  recover,
  spendPoint,
  startHorde,
  type GameState,
} from './game.ts';
import { layoutOf, tick, type HordeState, type Outcome } from './horde.ts';
import { professionOf } from './loadout.ts';
import { replaceInjured, replacePosts, skipReplace } from './replace.ts';
import { unspentPoints } from './stats.ts';

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

/** The scripted player's answer to an open offer: a recruit if offered, else the first card; every replacement taken. */
export function answerOffer(s: HordeState): HordeState {
  if (s.offer) {
    const recruit = s.offer.findIndex((c) => c.kind === 'recruit');
    return chooseCard(s, Math.max(0, recruit));
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

/** The scripted player's stat points: every one into the stat of the profession worked. */
export function spendAll(game: GameState): GameState {
  let g = game;
  for (const d of game.roster) {
    const stat = PROFESSION_STAT[professionOf(d.loadout)];
    for (let n = unspentPoints(d); n > 0; n--) {
      const r = spendPoint(g, d.id, stat);
      if (r.ok) g = r.game;
    }
  }
  return g;
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
 * (most damaged segment first), spends stat points (`spendAll`) and retries a lost
 * horde. It never builds. Horde `i` (from 0) uses seed `seed + i`.
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
    game = spendAll(finishHorde(game, horde, now));
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
