// Balance (ID-125): Sharp Mind, Agility and Instinct are each as strong a choice. The
// scripted player puts every point in one stat; each stat must play within 10 points of
// the others (see shared.ts for the seeds). The close fights at Recommended Power, the
// measure that shows the stats apart, are in stats-close.test.ts, so the two files run
// side by side.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Stat } from '../data.ts';
import { playSquadCampaign } from '../sim.ts';
import { SEEDS, spread, STAT_PICKS as PICKS, STAT_WITHIN as WITHIN, winRate } from './shared.ts';

// About 2.5 min a stat alone, more on CI. One hook a stat, so each stat's campaigns get
// the full limit: in one hook, the three outran it once the epic cards' costs (ID-137)
// lost more hordes and so played more replays.
describe('the stats are each as strong a choice (ID-125)', () => {
  const rates = new Map<Stat, number>();
  for (const stat of PICKS) {
    beforeAll(() => {
      const first = [];
      for (let i = 1; i <= SEEDS; i++) {
        const runs = playSquadCampaign(i * 1000, 10, { stat });
        for (let n = 4; n <= 10; n++) {
          const r = runs.find((r) => r.hordeNumber === n && !r.replay);
          if (r) first.push(r);
        }
      }
      rates.set(stat, winRate(first));
    }, 600_000);
  }

  // The ticket's measure. It can hardly tell the stats apart (a squad with no points wins
  // about 86%), so it passes with or without ID-125's effects: stats-close.test.ts is the
  // one that shows them.
  it('every point in one stat: first-try wins over Hordes 4–10 within 10 points', () => {
    const all = PICKS.map((s) => rates.get(s)!);
    const said = PICKS.map((s, i) => `${s} ${all[i]!.toFixed(2)}`).join(' ');
    expect(spread(all), said).toBeLessThanOrEqual(WITHIN);
  });
});
