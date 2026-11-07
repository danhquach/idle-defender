// Balance: the horde-only build, Hordes 1–10 (see shared.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { SQUAD_CAP } from '../data.ts';
import { newGame } from '../game.ts';
import { playSquadCampaign, playSquadHorde } from '../sim.ts';
import { horrorAbility } from '../waves.ts';
import { SEEDS, winRate } from './shared.ts';

// CI runs the balance files side by side (ID-076), so each runs several times slower
// than alone (37 s on a laptop, 234 s to over 300 s on CI): 600 s for the campaigns,
// still under the job's 15-min limit.
describe('the horde-only build, Hordes 1–10 (ID-066)', () => {
  const LAST = 10;
  /** The first horde that is a wall to farm past (ID-097; targets with ID-102). */
  const WALLS_FROM = 8;
  /** Each seed's campaign: every fight in order, a loss replayed as the player would. */
  const campaigns: ReturnType<typeof playSquadCampaign>[] = [];
  beforeAll(() => {
    for (let i = 1; i <= SEEDS; i++) campaigns.push(playSquadCampaign(i * 1000, LAST));
  }, 600_000);
  /** Each seed's first fight at horde `n`: the expected squad's try at it. */
  const firstTry = (n: number) => campaigns.map((runs) => runs.find((r) => r.hordeNumber === n)!);

  // ID-097: Hordes 1–3 are sure wins while the player learns the cards; 4–7 are won on
  // most seeds at the first try. From Horde 8 the hordes are walls the player farms past;
  // their targets come with farming in the balance pass (ID-102).
  it('the expected squad wins Hordes 1–3 on every seed, and 4–7 on most, at the first try', () => {
    for (let n = 1; n <= WALLS_FROM; n++) {
      expect(
        firstTry(n).every((r) => r !== undefined),
        `Horde ${n} reached`,
      ).toBe(true);
    }
    for (let n = 1; n <= 3; n++) expect(winRate(firstTry(n)), `Horde ${n}`).toBe(1);
    for (let n = 4; n < WALLS_FROM; n++) {
      expect(winRate(firstTry(n)), `Horde ${n}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('the expected squad is one survivor more per horde won, up to 6', () => {
    for (let n = 1; n <= WALLS_FROM; n++) {
      for (const r of firstTry(n)) expect(r.squad).toBe(Math.min(n, SQUAD_CAP));
    }
  });

  // Until farming (ID-098) lets the scripted player grow past a wall, a campaign only
  // retries; how far past Horde 7 it gets is the balance pass's target (ID-102).
  it('every campaign gets past Horde 7 and reaches the walls', () => {
    for (const runs of campaigns) {
      expect(runs.some((r) => r.hordeNumber === WALLS_FROM)).toBe(true);
    }
    expect(horrorAbility(LAST)).not.toBeNull();
  });

  it('the starting squad of one loses every horde after Horde 3', () => {
    for (let n = 4; n <= LAST; n++) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const h = playSquadHorde({ ...newGame('horde'), hordeNumber: n }, seed);
        expect(h.outcome, `Horde ${n}, seed ${seed}`).toBe('lost');
      }
    }
  }, 300_000);

  it('the starting survivor wins Horde 1 (the first fight) on every seed', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(playSquadHorde(newGame('horde'), seed).outcome).toBe('won');
    }
  });
});
