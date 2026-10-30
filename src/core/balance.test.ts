// Balance tests (design §16): the starting numbers in data.ts, played by the
// scripted player in sim.ts, still meet the design's targets. A retune that breaks
// one fails here; `npm run balance` shows the full table.
import { beforeAll, describe, expect, it } from 'vitest';
import { lineWall, repairAllCost } from './base.ts';
import { MATERIALS } from './data.ts';
import { finishHorde, hordePayout, newGame } from './game.ts';
import type { HordeState } from './horde.ts';
import { playCampaign, playHorde, summarise, type HordeRun } from './sim.ts';

const SEEDS = 20;
const HORDES = 8;

/** Horde `n` on the starting base with a fresh roster. */
const bareGame = (n: number) => ({ ...newGame(), hordeNumber: n });
const winRate = (runs: HordeRun[]): number =>
  runs.filter((r) => r.outcome === 'won').length / runs.length;

describe('balance on the starting base, no building', () => {
  /** Every horde 1…HORDES played once per seed 1…SEEDS, and its summary. */
  const played = new Map<number, HordeState[]>();
  const byHorde = new Map<number, HordeRun[]>();
  beforeAll(() => {
    for (let n = 1; n <= HORDES; n++) {
      const hordes = Array.from({ length: SEEDS }, (_, i) => playHorde(bareGame(n), i + 1, 0));
      played.set(n, hordes);
      byHorde.set(
        n,
        hordes.map((h, i) => summarise(h, i + 1)),
      );
    }
  }, 60_000);

  it('Horde 1 (the tutorial) is won on every seed with nobody injured', () => {
    const runs = byHorde.get(1)!;
    expect(runs.every((r) => r.outcome === 'won' && r.injured === 0)).toBe(true);
  });

  it('Horde 2 is won on every seed', () => {
    expect(winRate(byHorde.get(2)!)).toBe(1);
  });

  it('Hordes 1 and 2 last 3–5 minutes (design §4)', () => {
    for (const r of [...byHorde.get(1)!, ...byHorde.get(2)!]) {
      expect(r.seconds, `horde ${r.hordeNumber} seed ${r.seed}`).toBeGreaterThanOrEqual(180);
      expect(r.seconds, `horde ${r.hordeNumber} seed ${r.seed}`).toBeLessThanOrEqual(300);
    }
  });

  // Seeded, so never flaky: a failure here means a retune moved the curve.
  it('gets harder every horde: the win rate never rises', () => {
    for (let n = 2; n <= HORDES; n++) {
      expect(winRate(byHorde.get(n)!), `horde ${n}`).toBeLessThanOrEqual(
        winRate(byHorde.get(n - 1)!),
      );
    }
  });

  it('wins nothing from Horde 5 on: past that, the camp must grow (design §2)', () => {
    for (let n = 5; n <= HORDES; n++) expect(winRate(byHorde.get(n)!), `horde ${n}`).toBe(0);
  });

  it('a win pays for repairing its own damage', () => {
    let damaged = 0;
    for (const [n, hordes] of played) {
      for (const [i, horde] of hordes.entries()) {
        if (horde.outcome !== 'won') continue;
        const pay = hordePayout(horde);
        const bill = repairAllCost(finishHorde(bareGame(n), horde, 0).base);
        if (MATERIALS.some((m) => bill[m] > 0)) damaged += 1;
        for (const m of MATERIALS) {
          expect(pay[m], `horde ${n} seed ${i + 1} ${m}`).toBeGreaterThanOrEqual(bill[m]);
        }
      }
    }
    expect(damaged).toBeGreaterThan(0);
  });
});

describe('a campaign without building', () => {
  it('reaches Horde 4 on every seed and stalls before Horde 6', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const runs = playCampaign(seed * 1000, 12);
      const reached = runs.filter((r) => r.outcome === 'won').length + 1;
      expect(reached, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      expect(reached, `seed ${seed}`).toBeLessThanOrEqual(5);
    }
  }, 60_000);
});

describe('a full firing line on the starting wall (ID-048)', () => {
  // Every wall-walk spot of the starting layer built: 20 posts for 3 defenders. A line
  // adds no firepower past the roster; three staffed wall-walk posts play the same.
  const byHorde = new Map<number, HordeRun[]>();
  beforeAll(() => {
    for (let n = 1; n <= 7; n++) {
      const game = bareGame(n);
      const lined = lineWall(game.base, { scrap: 999, wood: 999, metal: 0, concrete: 0 }, 0);
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

  it('never stalls: an enemy in the camp reaches the wall line, so every horde ends within 12 minutes', () => {
    for (const runs of byHorde.values()) {
      for (const r of runs) {
        expect(r.seconds, `horde ${r.hordeNumber} seed ${r.seed}`).toBeLessThanOrEqual(720);
      }
    }
  });
});
