// Balance: a full firing line on the starting wall (see shared.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { lineWall } from '../base.ts';
import { ENEMY_MIX, stockOf } from '../data.ts';
import { playHorde, summarise, type HordeRun } from '../sim.ts';
import { bareGame, SEEDS, winRate } from './shared.ts';

describe('a full firing line on the starting wall (ID-048)', () => {
  // Every wall-walk spot of the starting layer built: 20 posts for 3 defenders. A line
  // adds no firepower past the roster; three staffed wall-walk posts play the same.
  const byHorde = new Map<number, HordeRun[]>();
  beforeAll(() => {
    for (let n = 1; n <= 7; n++) {
      const game = bareGame(n);
      const lined = lineWall(
        game.base,
        stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }),
        0,
      );
      if (!lined.ok) throw new Error(lined.reason);
      const g = { ...game, base: lined.base };
      byHorde.set(
        n,
        Array.from({ length: SEEDS }, (_, i) => summarise(playHorde(g, i + 1, 0), i + 1)),
      );
    }
  }, 60_000);

  it("doesn't trivialise the curve: Horde 5 at most half won, Horde 6 rarely, Horde 7 never", () => {
    expect(winRate(byHorde.get(5)!)).toBeLessThanOrEqual(0.5);
    expect(winRate(byHorde.get(6)!)).toBeLessThanOrEqual(0.25);
    expect(winRate(byHorde.get(7)!)).toBe(0);
  });

  it('mutants make it harder: from Horde 5 the line wins less than against Shamblers only (ID-023)', () => {
    const mix = ENEMY_MIX as Record<string, unknown>;
    const saved = { ...mix };
    const shamblersOnly = new Map<number, number>();
    try {
      for (const k of Object.keys(mix)) delete mix[k];
      for (let n = 5; n <= 7; n++) {
        const game = bareGame(n);
        const lined = lineWall(
          game.base,
          stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }),
          0,
        );
        if (!lined.ok) throw new Error(lined.reason);
        const g = { ...game, base: lined.base };
        const runs = Array.from({ length: SEEDS }, (_, i) =>
          summarise(playHorde(g, i + 1, 0), i + 1),
        );
        shamblersOnly.set(n, winRate(runs));
      }
    } finally {
      Object.assign(mix, saved);
    }
    let mixed = 0;
    let plain = 0;
    for (let n = 5; n <= 7; n++) {
      expect(winRate(byHorde.get(n)!), `horde ${n}`).toBeLessThanOrEqual(shamblersOnly.get(n)!);
      mixed += winRate(byHorde.get(n)!);
      plain += shamblersOnly.get(n)!;
    }
    expect(mixed).toBeLessThan(plain);
  }, 60_000);

  it('never stalls: an enemy in the camp reaches the wall line, so every horde ends within 12 minutes', () => {
    for (const runs of byHorde.values()) {
      for (const r of runs) {
        expect(r.seconds, `horde ${r.hordeNumber} seed ${r.seed}`).toBeLessThanOrEqual(720);
      }
    }
  });
});
