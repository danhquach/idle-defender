// Balance: the horde-only build, Hordes 1–10 (see shared.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { SQUAD_CAP } from '../data.ts';
import { newGame } from '../game.ts';
import { playSquadCampaign, playSquadHorde } from '../sim.ts';
import { horrorAbility } from '../waves.ts';
import { SEEDS, winRate } from './shared.ts';

describe('the horde-only build, Hordes 1–10 (ID-066)', () => {
  const LAST = 10;
  /** Each seed's campaign: every fight in order, a loss replayed as the player would. */
  const campaigns: ReturnType<typeof playSquadCampaign>[] = [];
  beforeAll(() => {
    for (let i = 1; i <= SEEDS; i++) campaigns.push(playSquadCampaign(i * 1000, LAST));
  }, 120_000);
  /** Each seed's first fight at horde `n`: the expected squad's try at it. */
  const firstTry = (n: number) => campaigns.map((runs) => runs.find((r) => r.hordeNumber === n)!);

  it('the expected squad wins each horde on most seeds, Horde 10’s boss included', () => {
    for (let n = 1; n <= LAST; n++) {
      const runs = firstTry(n);
      expect(
        runs.every((r) => r !== undefined),
        `Horde ${n} reached`,
      ).toBe(true);
      expect(winRate(runs), `Horde ${n}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('the expected squad is one survivor more per horde won, up to 6', () => {
    for (let n = 1; n <= LAST; n++) {
      for (const r of firstTry(n)) expect(r.squad).toBe(Math.min(n, SQUAD_CAP));
    }
  });

  it('every campaign gets past Horde 10, its boss beaten', () => {
    for (const runs of campaigns) {
      const last = runs.at(-1)!;
      expect(last.hordeNumber).toBe(LAST);
      expect(last.outcome).toBe('won');
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
  }, 120_000);

  it('the starting survivor wins Horde 1 (the first fight) on every seed', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(playSquadHorde(newGame('horde'), seed).outcome).toBe('won');
    }
  });
});
