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
  /** Each seed's campaign: every fight in order, a loss farmed past as the player would. */
  const campaigns: ReturnType<typeof playSquadCampaign>[] = [];
  beforeAll(() => {
    for (let i = 1; i <= SEEDS; i++) campaigns.push(playSquadCampaign(i * 1000, LAST));
  }, 600_000);
  /** Each seed's first fight at horde `n`: the expected squad's try at it. */
  const firstTry = (n: number) =>
    campaigns.map((runs) => runs.find((r) => r.hordeNumber === n && !r.replay)!);

  // ID-097: Hordes 1–3 are sure wins while the player learns the cards. ID-102 restores the
  // rest: the expected squad wins Hordes 4–10 at the first try on most seeds; the walls the
  // player farms past come after the first boss.
  it('the expected squad wins Hordes 1–3 on every seed, and 4–10 on most, at the first try', () => {
    for (let n = 1; n <= LAST; n++) {
      expect(
        firstTry(n).every((r) => r !== undefined),
        `Horde ${n} reached`,
      ).toBe(true);
    }
    for (let n = 1; n <= 3; n++) expect(winRate(firstTry(n)), `Horde ${n}`).toBe(1);
    for (let n = 4; n <= LAST; n++) {
      expect(winRate(firstTry(n)), `Horde ${n}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('the expected squad is one survivor more per horde won, up to 6', () => {
    for (let n = 1; n <= LAST; n++) {
      for (const r of firstTry(n)) expect(r.squad).toBe(Math.min(n, SQUAD_CAP));
    }
  });

  it('every campaign gets past Horde 10, its boss beaten, farming where it lost', () => {
    for (const runs of campaigns) {
      const last = runs.at(-1)!;
      expect(last.hordeNumber).toBe(LAST);
      expect(last.outcome).toBe('won');
      expect(last.replay).toBe(false);
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

  // The scripted player looks every second to use its skills (ID-102): 5.5 s on CI.
  it('the starting survivor wins Horde 1 (the first fight) on every seed', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(playSquadHorde(newGame('horde'), seed).outcome).toBe('won');
    }
  }, 60_000);
});
