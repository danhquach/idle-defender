// Balance: a campaign played without building (see shared.ts).
import { describe, expect, it } from 'vitest';
import { playCampaign } from '../sim.ts';

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
