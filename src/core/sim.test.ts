import { describe, expect, it } from 'vitest';
import { buildPost } from './base.ts';
import { newGame, startHorde, type GameState } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  answerOffer,
  balanceReport,
  nextHorde,
  opening,
  playCampaign,
  playHorde,
  repairWhatYouCan,
  spendAll,
  summarise,
} from './sim.ts';
import { NO_STATS } from './stats.ts';

/** Horde 1 on the starting base: bob on post 0, jack and john on the bench. */
const fresh = (): HordeState => startHorde(newGame(), 1, 'bob', 0, 0);

describe('opening', () => {
  it('starts the first fit defender on the usable post furthest forward', () => {
    const game = newGame();
    game.roster[0]!.injuredUntil = 10;
    const built = buildPost(game.base, game.stock, { kind: 'wall-walk', column: 0, row: 4 });
    if (!built.ok) throw new Error(built.reason);
    const g: GameState = { ...game, base: built.base, stock: built.stock };
    const at = g.base.posts.findIndex((p) => p.kind === 'wall-walk');
    expect(opening(g, 0)).toEqual({ defenderId: 'jack', postId: at });
    expect(opening(g, 10).defenderId).toBe('bob');
  });

  it('throws with nobody fit or no usable post', () => {
    const game = newGame();
    for (const d of game.roster) d.injuredUntil = 10;
    expect(() => opening(game, 0)).toThrow(RangeError);
    const bare = newGame();
    bare.base.posts = [{ kind: 'wall-walk', column: 0, row: 0 }];
    bare.base.layers[0]!.slots[0]!.hp = 0;
    expect(() => opening(bare, 0)).toThrow(RangeError);
  });
});

describe('answerOffer', () => {
  it('takes the recruit card when one is offered', () => {
    const s = fresh();
    s.offer = [
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'recruit', defender: { ...s.bench[1]! } },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    const after = answerOffer(s);
    expect(after.offer).toBeNull();
    expect(after.defenders.map((d) => d.id)).toEqual(['bob', 'john']);
    expect(after.mods.damage).toBe(1);
  });

  it('takes the first card when no recruit is offered', () => {
    const s = fresh();
    s.offer = [
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'rapid-fire' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    expect(answerOffer(s).mods.damage).toBeCloseTo(1.2);
  });

  it('sends the first bench defender in for an injured one', () => {
    const s = fresh();
    const [bob] = s.defenders.splice(0, 1);
    s.posts[0]!.defenderId = null;
    s.injured.push({
      defender: { id: 'bob', name: 'Bob', weapon: 'pistol' },
      postId: bob!.postId,
      at: 0,
      offered: false,
      by: null,
    });
    s.replace = { injuredId: 'bob', postId: 0 };
    const after = answerOffer(s);
    expect(after.replace).toBeNull();
    expect(after.defenders.map((d) => [d.id, d.postId])).toEqual([['jack', 0]]);
  });

  it('throws with nothing open', () => {
    expect(() => answerOffer(fresh())).toThrow(RangeError);
  });
});

describe('playHorde', () => {
  it('plays to the end, the same way every time for a seed', () => {
    const a = playHorde(newGame(), 7, 0);
    expect(a.outcome).not.toBe('fighting');
    expect(playHorde(newGame(), 7, 0)).toEqual(a);
    expect(playHorde(newGame(), 8, 0)).not.toEqual(a);
  });

  it('throws on a fight still on past the time limit', () => {
    expect(() => playHorde(newGame(), 7, 0, 10)).toThrow(/never ended/);
  });
});

describe('summarise', () => {
  it('reads the result off a finished horde', () => {
    const h = fresh();
    h.outcome = 'lost';
    h.wave = 3;
    h.time = 100.4;
    const lost = h.layers[0]!.segments[0]!.maxHp;
    h.layers[0]!.segments[0]!.hp = 0;
    const max = h.layers[0]!.segments.reduce((t, g) => t + g.maxHp, 0);
    expect(summarise(h, 5)).toEqual({
      hordeNumber: 1,
      seed: 5,
      outcome: 'lost',
      wave: 3,
      waveCount: 5,
      seconds: 100,
      tookPart: 1,
      injured: 0,
      wallLeft: (max - lost) / max,
    });
  });

  it('counts no wall as none left, and throws mid-fight', () => {
    const h = fresh();
    expect(() => summarise(h, 1)).toThrow(RangeError);
    h.outcome = 'won';
    h.layers = [];
    expect(summarise(h, 1).wallLeft).toBe(0);
  });
});

/** A new game with segments of column 0 at these HP (rows 0…), the rest full (row 2 is the 150 HP gate). */
function damaged(...hps: number[]): GameState {
  const game = newGame();
  hps.forEach((hp, row) => (game.base.layers[0]!.slots[row]!.hp = hp));
  return game;
}

describe('repairWhatYouCan', () => {
  it('repairs the most damaged segment first, while the stock covers it', () => {
    const game = damaged(100, 0);
    game.stock = { scrap: 5, wood: 15, metal: 0, concrete: 0 };
    const after = repairWhatYouCan(game);
    // Row 1 (empty) costs 10 wood 5 scrap; then row 0 needs 3 scrap it no longer has.
    expect(after.base.layers[0]!.slots.map((s) => s!.hp)).toEqual([100, 200, 150, 200, 200]);
    expect(after.stock).toEqual({ scrap: 0, wood: 5, metal: 0, concrete: 0 });
  });

  it("skips a segment it can't afford and repairs a cheaper one", () => {
    const game = damaged(0, 150);
    game.stock = { scrap: 2, wood: 3, metal: 0, concrete: 0 };
    const after = repairWhatYouCan(game);
    expect(after.base.layers[0]!.slots.map((s) => s!.hp)).toEqual([0, 200, 150, 200, 200]);
  });
});

describe('nextHorde', () => {
  it('waits until the whole roster is fit, repairs, and builds nothing', () => {
    const game = damaged(0);
    game.roster[0]!.injuredUntil = 500;
    game.roster[1]!.injuredUntil = 900;
    const { game: g, now } = nextHorde(game, 100);
    expect(now).toBe(900);
    expect(g.roster.every((d) => d.injuredUntil === null)).toBe(true);
    expect(g.base.layers[0]!.slots[0]!.hp).toBe(200);
    expect(g.base.posts).toEqual(game.base.posts);
    expect(g.base.layers).toHaveLength(game.base.layers.length);
  });

  it('starts at once with everyone fit', () => {
    expect(nextHorde(newGame(), 100).now).toBe(100);
  });
});

describe('spendAll', () => {
  it("puts every point into the held weapon's stat, and leaves a game with none alone", () => {
    const g = newGame();
    g.roster[0]!.xp = 25; // Bob, pistol: 3 points
    g.roster[1]!.xp = 75; // Jack, knife: 6 points, 1 already in Grit
    g.roster[1]!.stats = { ...NO_STATS, grit: 1 };
    const after = spendAll(g);
    expect(after.roster.map((d) => d.stats)).toEqual([
      { ...NO_STATS, aim: 3 },
      { ...NO_STATS, might: 5, grit: 1 },
      NO_STATS,
    ]);
    expect(g.roster[0]!.stats).toEqual(NO_STATS);
    expect(spendAll(newGame())).toEqual(newGame());
  });
});

describe('playCampaign', () => {
  it('chains hordes: a win moves on, a loss retries, the same way every time', () => {
    const runs = playCampaign(1000, 6);
    expect(runs).toHaveLength(6);
    expect(runs.map((r) => r.seed)).toEqual([1000, 1001, 1002, 1003, 1004, 1005]);
    let next = 1;
    for (const r of runs) {
      expect(r.hordeNumber).toBe(next);
      if (r.outcome === 'won') next += 1;
    }
    expect(playCampaign(1000, 6)).toEqual(runs);
  });

  it('refuses a bad count', () => {
    expect(playCampaign(1, 0)).toEqual([]);
    for (const n of [-1, 1.5, NaN]) expect(() => playCampaign(1, n)).toThrow(RangeError);
  });
});

describe('balanceReport', () => {
  it('has a row per horde and a line per campaign seed', () => {
    const lines = balanceReport(2, 2).split('\n');
    expect(lines.slice(0, 2)).toEqual([
      'Starting base, no building',
      'Horde  Won    Wave  Minutes min/median/max  Injured',
    ]);
    expect(lines[2]).toMatch(/^1 {6}2\/2 {4}5\/5 {3}\d+\.\d\/\d+\.\d\/\d+\.\d +0\.0$/);
    expect(lines[3]).toMatch(/^2 /);
    expect(lines.slice(5)).toHaveLength(3);
    expect(lines[6]).toMatch(/^seed 1: next horde \d+ \(\d+\/\d+\)$/);
  }, 30_000);

  it('refuses a count that is not a whole number from 1 to 100', () => {
    for (const n of [0, -1, 1.5, NaN, Infinity, 101]) {
      expect(() => balanceReport(n, 1)).toThrow(RangeError);
      expect(() => balanceReport(1, n)).toThrow(RangeError);
    }
  });
});
