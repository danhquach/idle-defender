import { describe, expect, it } from 'vitest';
import { enemyHp, waveCount, waveSize, xpToNext } from './waves.ts';

describe('wave plan', () => {
  it('waveCount grows every second horde up to 10', () => {
    expect(waveCount(1)).toBe(5);
    expect(waveCount(3)).toBe(6);
    expect(waveCount(20)).toBe(10);
  });

  it('waveSize grows per wave and per horde', () => {
    expect(waveSize(1, 1)).toBe(8);
    expect(waveSize(1, 5)).toBe(24);
    expect(waveSize(2, 1)).toBe(9);
  });

  it('enemyHp scales ×1.10 per wave and ×1.17 per horde (ID-020)', () => {
    expect(enemyHp('shambler', 1, 1)).toBe(20);
    expect(enemyHp('shambler', 1, 2)).toBe(22);
    expect(enemyHp('shambler', 2, 1)).toBe(23);
    expect(enemyHp('shambler', 3, 1)).toBe(27); // 26 at ×1.15
  });

  it('xpToNext follows the curve', () => {
    expect([1, 2, 3, 4].map(xpToNext)).toEqual([10, 14, 20, 27]);
  });

  it.each([0, 1.5, NaN])('rejects %s', (bad) => {
    expect(() => waveCount(bad)).toThrow(RangeError);
    expect(() => waveSize(bad, 1)).toThrow(RangeError);
    expect(() => waveSize(1, bad)).toThrow(RangeError);
    expect(() => enemyHp('shambler', bad, 1)).toThrow(RangeError);
    expect(() => enemyHp('shambler', 1, bad)).toThrow(RangeError);
    expect(() => xpToNext(bad)).toThrow(RangeError);
  });
});
