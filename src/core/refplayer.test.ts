// ID-265: the reference player's research schedule, pinned. The balance tests play it (balance/
// refplayer.ts); a change to Scrap pay, slot prices or node costs moves this table on purpose.
import { describe, expect, it } from 'vitest';
import { TECH, TECH_IDS, TECH_TABS } from './data.ts';
import { MODE_IDS, MODE_UNLOCK_HORDE, type Mode } from './modes.ts';
import {
  REF_EARNED_FLOOR,
  refEarnedFactor,
  REF_SHARE,
  REF_SHARE_LOW,
  REF_SLOTS_COST,
  refEarned,
  REF_NODES,
  refTech,
} from './balance/refplayer.ts';

/** Horde, then the nodes owned at 65% and at 40%: the schedule the balance tests rest on. */
const SCHEDULE: [Mode, number, number, number][] = [
  ['normal', 20, 0, 0],
  ['normal', 29, 0, 0],
  ['normal', 30, 0, 0],
  ['normal', 31, 1, 0],
  ['normal', 32, 2, 1],
  ['normal', 34, 3, 2],
  ['normal', 37, 4, 3],
  ['normal', 40, 5, 4],
  ['normal', 50, 7, 6],
  ['nightmare', 1, 8, 6],
  ['nightmare', 10, 10, 8],
  ['nightmare', 30, 12, 11],
  ['hell', 10, 14, 13],
  ['hell', 30, 14, 14],
];

describe('the reference player (ID-265)', () => {
  it('buys from the four Upgrades branches only, never one of the 15 ammo and throwable nodes (ID-284)', () => {
    expect(REF_NODES.length).toBe(14);
    expect(REF_NODES).toEqual(TECH_IDS.slice(0, 14));
    for (const id of REF_NODES) expect(TECH_TABS.upgrades).toContain(TECH[id].branch);
    const kit = TECH_IDS.slice(14);
    for (const mode of MODE_IDS) {
      for (let n = 1; n <= MODE_UNLOCK_HORDE; n++) {
        for (const share of [REF_SHARE_LOW, REF_SHARE, 1]) {
          for (const id of refTech(mode, n, share)) expect(kit).not.toContain(id);
        }
      }
    }
    // Even with all the Scrap there is, it stops at the 14 (every one of them).
    expect(refTech('hell', MODE_UNLOCK_HORDE, 1).length).toBe(14);
  });

  it('owns the pinned number of nodes at each point', () => {
    for (const [mode, n, at65, at40] of SCHEDULE) {
      expect(refTech(mode, n, REF_SHARE).length, `${mode} ${n} at 65%`).toBe(at65);
      expect(refTech(mode, n, REF_SHARE_LOW).length, `${mode} ${n} at 40%`).toBe(at40);
    }
  });

  it('buys the cheapest open node first, ties in TECH_IDS order', () => {
    // Reinforced Wall and Razor Wire both cost 200 and are Tier 1: the earlier id comes first.
    expect(TECH['reinforced-wall'].cost).toBe(TECH['razor-wire'].cost);
    expect(refTech('normal', 31)).toEqual(['reinforced-wall']);
    expect(refTech('normal', 32)).toEqual(['reinforced-wall', 'razor-wire']);
  });

  it('spends the slots first: nothing is owned until the earned Scrap passes their price', () => {
    expect(REF_SLOTS_COST).toBe(3100);
    expect(refEarned('normal', 20)).toBeLessThan(REF_SLOTS_COST);
    expect(refTech('normal', 20, 1)).toEqual([]);
    // Past it, only the share of the surplus counts: 3,264 earned at Horde 30 leaves 164, 3,491 at 31 leaves 391.
    expect(refTech('normal', 30, 1)).toEqual([]);
    expect(refTech('normal', 31, 1)).toEqual(['reinforced-wall']);
    for (const share of [REF_SHARE_LOW, REF_SHARE]) {
      for (const [mode, n] of SCHEDULE) {
        const cost = refTech(mode, n, share).reduce((sum, id) => sum + TECH[id].cost, 0);
        expect(cost).toBeLessThanOrEqual(share * Math.max(0, refEarned(mode, n) - REF_SLOTS_COST));
      }
    }
  });

  it('owns a node only with its parents, and the 40% player owns a part of the 65% one', () => {
    for (const mode of MODE_IDS) {
      for (let n = 1; n <= MODE_UNLOCK_HORDE; n++) {
        const tech = refTech(mode, n);
        for (const id of tech) for (const need of TECH[id].needs) expect(tech).toContain(need);
        for (const id of refTech(mode, n, REF_SHARE_LOW)) expect(tech).toContain(id);
        expect(tech).toEqual(TECH_IDS.filter((id) => tech.includes(id)));
      }
    }
  });

  it('earns more with every horde, across the mode boundaries too', () => {
    let last = 0;
    for (const mode of MODE_IDS) {
      for (let n = 1; n <= MODE_UNLOCK_HORDE; n++) {
        const earned = refEarned(mode, n);
        expect(earned, `${mode} ${n}`).toBeGreaterThan(last);
        last = earned;
      }
    }
  });

  it('counts the start stock and the first clears (Normal 1 to 49 pay 6,615) at the worst-luck floor factor', () => {
    expect(refEarned('normal', 1)).toBe(60);
    expect(refEarned('normal', 50)).toBeCloseTo(60 + 1.43 * 6615, 6);
  });

  it('interpolates the floor factor between its points, held outside them', () => {
    expect(REF_EARNED_FLOOR).toEqual([
      [20, 1.06],
      [30, 1.3],
      [40, 1.37],
      [50, 1.43],
    ]);
    for (const [n, f] of REF_EARNED_FLOOR) expect(refEarnedFactor(n)).toBe(f);
    expect(refEarnedFactor(1)).toBe(1.06);
    expect(refEarnedFactor(25)).toBeCloseTo(1.18, 12);
    expect(refEarnedFactor(35)).toBeCloseTo(1.335, 12);
    expect(refEarnedFactor(45)).toBeCloseTo(1.4, 12);
    expect(refEarnedFactor(80)).toBe(1.43);
    // Nightmare and Hell take the Normal 50 factor.
    expect(refEarned('nightmare', 1)).toBeCloseTo(60 + 1.43 * 6875, 6);
  });
});
