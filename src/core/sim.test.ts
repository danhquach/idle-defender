import { describe, expect, it } from 'vitest';
import { buildPost } from './base.ts';
import { newGame, startHorde, type GameState } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  answerOffer,
  balanceReport,
  gearUp,
  nearestEnemy,
  nextHorde,
  opening,
  playCampaign,
  playHorde,
  repairWhatYouCan,
  spendAll,
  summarise,
} from './sim.ts';
import { SEGMENTS, START_BASE, stockOf } from './data.ts';
import { NO_STATS } from './stats.ts';
import { loadoutFrom } from './loadout.ts';
import { gunPower, rollWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import { createRng } from './rng.ts';
import { newHorde } from './horde.ts';
import { enemy, setup } from './testing.ts';

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
    expect(answerOffer(s).mods.damage).toBeCloseTo(1.1);
  });

  it('sends the first bench defender in for an injured one', () => {
    const s = fresh();
    const [bob] = s.defenders.splice(0, 1);
    s.posts[0]!.defenderId = null;
    s.injured.push({
      defender: { id: 'bob', name: 'Bob', loadout: loadoutFrom('pistol') },
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

/** A new game with segments of column 0 at these HP (rows 0…), the rest full (the starting gate row is 150 HP). */
function damaged(...hps: number[]): GameState {
  const game = newGame();
  hps.forEach((hp, row) => (game.base.layers[0]!.slots[row]!.hp = hp));
  return game;
}

/** Full HP of every starting segment (200, the gate 150), with `at` rows overridden. */
const slotHps = (at: Record<number, number>): number[] =>
  Array.from({ length: SEGMENTS }, (_, row) => at[row] ?? (row === START_BASE.gate ? 150 : 200));

describe('repairWhatYouCan', () => {
  it('repairs the most damaged segment first, while the stock covers it', () => {
    const game = damaged(100, 0);
    game.stock = stockOf({ scrap: 5, wood: 15, metal: 0, concrete: 0 });
    const after = repairWhatYouCan(game);
    // Row 1 (empty) costs 10 wood 5 scrap; then row 0 needs 3 scrap it no longer has.
    expect(after.base.layers[0]!.slots.map((s) => s!.hp)).toEqual(slotHps({ 0: 100 }));
    expect(after.stock).toEqual(stockOf({ scrap: 0, wood: 5, metal: 0, concrete: 0 }));
  });

  it("skips a segment it can't afford and repairs a cheaper one", () => {
    const game = damaged(0, 150);
    game.stock = stockOf({ scrap: 2, wood: 3, metal: 0, concrete: 0 });
    const after = repairWhatYouCan(game);
    expect(after.base.layers[0]!.slots.map((s) => s!.hp)).toEqual(slotHps({ 0: 0 }));
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
  it("puts every point into the job's stat, and leaves a game with none alone", () => {
    const g = newGame();
    g.roster[0]!.xp = 150; // Bob, a Gunner, level 4: 3 points
    g.roster[1]!.xp = 525; // Jack, a Ripper, level 7: 6 points, 2 already in Instinct
    g.roster[1]!.stats = { ...NO_STATS, instinct: 2 };
    g.roster[2]!.xp = 150; // John, an Engineer, level 4: 3 points
    const after = spendAll(g);
    expect(after.roster.map((d) => d.stats)).toEqual([
      { ...NO_STATS, mind: 3 },
      { ...NO_STATS, instinct: 2, mind: 4 },
      { ...NO_STATS, agility: 3 },
    ]);
    // A plain survivor (horde-only, ID-066) puts theirs in Sharp Mind.
    const squad = newGame('horde');
    squad.roster[0]!.xp = 150;
    expect(spendAll(squad).roster[0]!.stats).toEqual({ ...NO_STATS, mind: 3 });
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
  }, 30_000);

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

describe('gearUp (ID-096)', () => {
  it('hands the stash’s strongest guns to the weakest-armed survivors, while they are stronger', () => {
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const rusty = rollWeapon(createRng(2), 'h2', 'smg', 'rusty');
    const g: GameState = {
      ...newGame('horde'),
      roster: [recruit(1), recruit(2)],
      armoury: [rusty, relic],
    };
    expect(gunPower(relic)).toBeGreaterThan(gunPower(rusty));
    const after = gearUp(g);
    const held = after.roster.map((d) => d.loadout.primary);
    expect(held).toContainEqual(relic);
    // The rusty gun goes on only if it beats the pistol it would replace.
    const rustyBetter = gunPower(rusty) > gunPower('pistol');
    expect(held.some((h) => h === rusty || (typeof h === 'object' && h.uid === 'h2'))).toBe(
      rustyBetter,
    );
    expect(g.roster.every((d) => d.loadout.primary === 'pistol')).toBe(true); // input untouched
    // Nothing better in the stash: no change.
    expect(gearUp(after)).toEqual(after);
  });
});

describe('nearestEnemy (ID-096)', () => {
  it('px from the wall’s face to the closest standing enemy; 0 at it, Infinity with none', () => {
    const s = newHorde(1, setup());
    expect(nearestEnemy(s)).toBe(Infinity);
    const built = s.layers.filter((l) => l.segments.some((seg) => seg.kind !== null));
    const face = Math.max(...built.map((l) => l.x)) + 20;
    enemy(s, { x: face + 300, y: 200 });
    enemy(s, { x: face + 500, y: 200 });
    expect(nearestEnemy(s)).toBe(300);
    enemy(s, { x: face + 10, y: 200, hp: 0 }); // dead: not counted
    expect(nearestEnemy(s)).toBe(300);
    enemy(s, { x: face - 5, y: 200 });
    expect(nearestEnemy(s)).toBe(0);
  });
});
