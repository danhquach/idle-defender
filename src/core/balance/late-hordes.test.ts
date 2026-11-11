// Balance: mid-game horde-only hordes (ID-096, ID-102; see shared.ts). Past the first boss
// the hordes are walls: enemies reach the Barbed Wire's band in most fights and hit the
// wall in some, the scripted player loses some new hordes at the first try on most seeds,
// and it farms past each one within a bounded number of replays, with average luck.
import { beforeAll, describe, expect, it } from 'vitest';
import { CARD } from '../data.ts';
import { playSquadCampaign, type SquadRun } from '../sim.ts';

// Each campaign to Horde 18 is 40–70 fights; CI runs the balance files side by side.
describe('mid-game horde-only hordes (ID-102)', () => {
  const SEEDS = 4;
  const FROM = 11;
  const LAST = 18;
  /**
   * Seeds that must lose a new horde at the first try across Hordes FROM…LAST: most, not
   * every one, since Horde 10's boss unlocks Heavy Rounds (ID-127) and the squad is
   * stronger past it by design.
   */
  const WALL_SEEDS = SEEDS - 1;
  /** Most replays a seed spends farming past any one horde, with average luck. */
  const MAX_REPLAYS = 30;
  const campaigns: SquadRun[][] = [];
  /** Every fight at Hordes FROM…LAST that was a new horde, not a replay, watched. */
  const tries: SquadRun[] = [];
  beforeAll(() => {
    for (let i = 1; i <= SEEDS; i++) {
      const runs = playSquadCampaign(i * 1000, LAST, { watch: true, maxFights: LAST * 12 });
      campaigns.push(runs);
      tries.push(...runs.filter((r) => !r.replay && r.hordeNumber >= FROM));
    }
  }, 900_000);

  it('every campaign beats Horde 18', () => {
    for (const runs of campaigns) {
      const last = runs.at(-1)!;
      expect([last.hordeNumber, last.outcome, last.replay]).toEqual([LAST, 'won', false]);
    }
  });

  it('enemies reach the Barbed Wire’s band in most fights, and hit the wall in some, not every one', () => {
    const wire = tries.filter((r) => r.nearest! <= CARD.wire.to).length / tries.length;
    const hit = tries.filter((r) => r.wallLeft < 1).length / tries.length;
    expect(wire).toBeGreaterThanOrEqual(0.75);
    expect(hit).toBeGreaterThanOrEqual(0.15);
    expect(hit).toBeLessThan(0.95);
  });

  it('they are walls: most seeds lose at least one new horde at the first try', () => {
    const walled = campaigns.filter((runs) => {
      const first = new Map<number, SquadRun>();
      for (const r of runs) {
        if (!r.replay && r.hordeNumber >= FROM && !first.has(r.hordeNumber)) {
          first.set(r.hordeNumber, r);
        }
      }
      return [...first.values()].some((r) => r.outcome === 'lost');
    }).length;
    expect(walled).toBeGreaterThanOrEqual(WALL_SEEDS);
  });

  it('with average luck, farming gets past each wall within a bounded number of replays', () => {
    for (const [i, runs] of campaigns.entries()) {
      // Replays spent at each new horde: the scripted player farms after each loss there.
      const spent = new Map<number, number>();
      for (const r of runs) {
        if (r.replay) spent.set(r.hordeNumber + 1, (spent.get(r.hordeNumber + 1) ?? 0) + 1);
      }
      for (const [n, k] of spent) {
        expect(k, `seed ${i + 1}, Horde ${n}`).toBeLessThanOrEqual(MAX_REPLAYS);
      }
    }
  });
});
