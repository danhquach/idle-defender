// The injury band before a horde (ID-155): how many survivors a win is likely to cost, read
// off Squad Power over Recommended Power, cut where the balance seeds measured it.
import { describe, expect, it } from 'vitest';
import { INJURY_BAND } from './data.ts';
import { injuryBand } from './squadpower.ts';

describe('injury band (ID-155)', () => {
  const rec = 4000;

  it('each cut-off is picked at its edges', () => {
    expect(injuryBand(rec * INJURY_BAND.few, rec)).toBe('few');
    expect(injuryBand(rec * INJURY_BAND.few - 1, rec)).toBe('some');
    expect(injuryBand(rec * INJURY_BAND.some, rec)).toBe('some');
    expect(injuryBand(rec * INJURY_BAND.some - 1, rec)).toBe('heavy');
  });

  it('runs few → some → heavy as power falls; 0 power is heavy, far above is few', () => {
    expect(INJURY_BAND.few).toBeGreaterThan(INJURY_BAND.some);
    expect(INJURY_BAND.some).toBeGreaterThan(0);
    expect(injuryBand(0, rec)).toBe('heavy');
    expect(injuryBand(rec * 10, rec)).toBe('few');
  });
});
