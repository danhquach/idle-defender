// Balance: late horde-only hordes (ID-096, see shared.ts). With 1 stat point a level,
// level-12-ish survivors with the guns the wins dropped still win, but enemies reach the
// Barbed Wire's band in every fight and sometimes hit the wall.
import { beforeAll, describe, expect, it } from 'vitest';
import { CARD } from '../data.ts';
import { playSquadCampaign, type SquadRun } from '../sim.ts';
import { winRate } from './shared.ts';

describe('late horde-only hordes (ID-096)', () => {
  const SEEDS = 4;
  const FROM = 15;
  const LAST = 18;
  /** Each seed's first fight at Hordes FROM…LAST, watched. */
  const late: SquadRun[] = [];
  beforeAll(() => {
    for (let i = 1; i <= SEEDS; i++) {
      const runs = playSquadCampaign(i * 1000, LAST, LAST * 3, true);
      for (let n = FROM; n <= LAST; n++) late.push(runs.find((r) => r.hordeNumber === n)!);
    }
  }, 300_000);

  it('is played by level-10-to-12 survivors, every horde reached', () => {
    expect(late.every((r) => r !== undefined)).toBe(true);
    expect(late.length).toBe(SEEDS * (LAST - FROM + 1));
    for (const r of late) expect(r.level, `Horde ${r.hordeNumber}`).toBeGreaterThanOrEqual(9.5);
    expect(Math.max(...late.map((r) => r.level))).toBeGreaterThanOrEqual(11.5);
  });

  it('enemies reach the Barbed Wire’s band in every fight', () => {
    for (const r of late) {
      expect(r.nearest, `Horde ${r.hordeNumber}, seed ${r.seed}`).toBeLessThanOrEqual(CARD.wire.to);
    }
  });

  it('enemies hit the wall in some fights, not every one, and the squad still mostly wins', () => {
    const hit = late.filter((r) => r.wallLeft < 1).length / late.length;
    expect(hit).toBeGreaterThanOrEqual(0.15);
    expect(hit).toBeLessThan(0.9);
    expect(winRate(late)).toBeGreaterThanOrEqual(0.6);
  });
});
