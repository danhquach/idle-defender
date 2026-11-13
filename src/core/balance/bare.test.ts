// Balance on the starting base, nothing built (see shared.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { repairAllCost } from '../base.ts';
import { MATERIALS, type Stock } from '../data.ts';
import { finishHorde, hordePayout } from '../game.ts';
import { playHorde, summarise, type HordeRun } from '../sim.ts';
import { cacheFor } from './cache.ts';
import { bareGame, SEEDS, winRate } from './shared.ts';

const keep = cacheFor(import.meta.url);

const HORDES = 9;

interface Played {
  run: HordeRun;
  pay: Stock | null;
  bill: Stock | null;
}

describe('balance on the starting base, no building', () => {
  /** Every horde 1…HORDES played once per seed 1…SEEDS: its summary, and for a win its payout and repair bill. */
  const played = new Map<number, Played[]>();
  const byHorde = new Map<number, HordeRun[]>();
  beforeAll(() => {
    for (let n = 1; n <= HORDES; n++) {
      const hordes = Array.from({ length: SEEDS }, (_, i) =>
        keep(`${n} ${i + 1}`, (): Played => {
          const horde = playHorde(bareGame(n), i + 1, 0);
          const won = horde.outcome === 'won';
          return {
            run: summarise(horde, i + 1),
            pay: won ? hordePayout(horde) : null,
            bill: won ? repairAllCost(finishHorde(bareGame(n), horde, 0).base) : null,
          };
        }),
      );
      played.set(n, hordes);
      byHorde.set(
        n,
        hordes.map((h) => h.run),
      );
    }
  }, 60_000);

  it('Horde 1 (the tutorial) is won on every seed with nobody injured', () => {
    const runs = byHorde.get(1)!;
    expect(runs.every((r) => r.outcome === 'won' && r.injured === 0)).toBe(true);
  });

  it('Hordes 2 and 3 are won on every seed: the first hordes are sure wins (ID-097)', () => {
    expect(winRate(byHorde.get(2)!)).toBe(1);
    expect(winRate(byHorde.get(3)!)).toBe(1);
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
        if (!horde.pay || !horde.bill) continue;
        const { pay, bill } = horde;
        if (MATERIALS.some((m) => bill[m] > 0)) damaged += 1;
        for (const m of MATERIALS) {
          expect(pay[m], `horde ${n} seed ${i + 1} ${m}`).toBeGreaterThanOrEqual(bill[m]);
        }
      }
    }
    expect(damaged).toBeGreaterThan(0);
  });
});
