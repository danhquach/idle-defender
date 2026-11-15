// Balance: the horde-only build, Hordes 1–10 (see shared.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { SQUAD_CAP } from '../data.ts';
import { newGame } from '../game.ts';
import { playSquadCampaign, playSquadHorde } from '../sim.ts';
import { injuryBand, recommendedPower } from '../squadpower.ts';
import { horrorAbility } from '../waves.ts';
import { cacheFor } from './cache.ts';
import { SEEDS, winRate } from './shared.ts';

const keep = cacheFor(import.meta.url);

// CI runs the balance files side by side (ID-076), so each runs several times slower
// than alone (37 s on a laptop, 234 s to over 300 s on CI): 600 s for the campaigns,
// still under the job's 15-min limit.
describe('the horde-only build, Hordes 1–10 (ID-066)', () => {
  const LAST = 10;
  /** Each seed's campaign: every fight in order, a loss farmed past as the player would. */
  const campaigns: ReturnType<typeof playSquadCampaign>[] = [];
  beforeAll(() => {
    for (let i = 1; i <= SEEDS; i++) {
      campaigns.push(keep(`campaign ${i}`, () => playSquadCampaign(i * 1000, LAST)));
    }
  }, 600_000);
  /** Each seed's first fight at horde `n`: the expected squad's try at it. */
  const firstTry = (n: number) =>
    campaigns.map((runs) => runs.find((r) => r.hordeNumber === n && !r.replay)!);

  // ID-097: Hordes 1–3 are sure wins while the player learns the cards (ID-163: Horde 3 may
  // dent the wall, still won). ID-102 restores the rest: the expected squad wins Hordes 4–10
  // at the first try on most seeds; the walls the player farms past come after the first boss.
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

  // ID-163: pressure builds before Horde 5. Hordes 3 and 4 dent the wall on some seeds
  // (Horde 4's preview elite, its enemies a step tougher), and the squad's lead over
  // Recommended Power shrinks steadily into Horde 5 instead of falling from 6× to 1.6×.
  it('Hordes 3–4 dent the wall on some seeds, and the step into Horde 5 is gentle (ID-163)', () => {
    // "Visible wall damage" (the ticket): a twentieth of the wall gone.
    const VISIBLE = 0.95;
    const dented = [3, 4].flatMap((n) => firstTry(n)).filter((r) => r.wallLeft < VISIBLE).length;
    expect(dented).toBeGreaterThanOrEqual(4);
    const lead = (n: number): number => {
      const xs = firstTry(n)
        .map((r) => r.power / recommendedPower(n))
        .sort((a, b) => a - b);
      return xs[Math.floor(xs.length / 2)]!;
    };
    // About 1.3 measured; 6.4 / 1.6 = 4 before ID-163.
    expect(lead(4) / lead(5)).toBeLessThanOrEqual(1.6);
    expect(lead(4)).toBeGreaterThan(lead(5));
  });

  // ID-171: overlapping waves ramp in (pacing.ts) instead of arriving with the Spewers, so
  // Hordes 5–8 harden a step at a time: 13/20 won and 3.2 injured a try at Horde 6 before,
  // after 20/20 and none at Horde 5. A squad the injury forecast puts in "some" mostly wins.
  it('Hordes 5–8 harden a step at a time, and "some" squads mostly win (ID-171)', () => {
    const injured = (n: number): number =>
      firstTry(n).reduce((t, r) => t + r.injured, 0) / firstTry(n).length;
    const lost = (n: number): number => firstTry(n).filter((r) => r.outcome !== 'won').length;
    for (let n = 6; n <= 8; n++) {
      expect(lost(n) - lost(n - 1), `Horde ${n - 1}→${n} first tries lost`).toBeLessThanOrEqual(4);
      expect(injured(n) - injured(n - 1), `Horde ${n - 1}→${n} injured`).toBeLessThanOrEqual(1.5);
    }
    const some = [6, 7, 8]
      .flatMap((n) =>
        firstTry(n).map((r) => ({ r, band: injuryBand(r.power, recommendedPower(n)) })),
      )
      .filter((x) => x.band === 'some');
    expect(some.length).toBeGreaterThan(0);
    expect(some.filter((x) => x.r.outcome !== 'won').length).toBeLessThan(some.length / 2);
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
        const outcome = keep(
          `lone ${n} ${seed}`,
          () => playSquadHorde({ ...newGame('horde'), hordeNumber: n }, seed).outcome,
        );
        expect(outcome, `Horde ${n}, seed ${seed}`).toBe('lost');
      }
    }
  }, 300_000);

  // The scripted player looks every second to use its skills (ID-102): 5.5 s on CI.
  it('the starting survivor wins Horde 1 (the first fight) on every seed', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(keep(`first ${seed}`, () => playSquadHorde(newGame('horde'), seed).outcome)).toBe(
        'won',
      );
    }
  }, 60_000);
});
