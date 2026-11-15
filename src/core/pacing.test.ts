// ID-171: wave pacing in one table.
import { describe, expect, it } from 'vitest';
import { FULL_PACE, SQUAD_PACE, nextWaveDue, wavePace, type Pace } from './pacing.ts';

describe('the pacing table (ID-171)', () => {
  it('starts at Horde 1, its rows in order, every knob in range', () => {
    expect(SQUAD_PACE[0]!.from).toBe(1);
    for (const [i, row] of SQUAD_PACE.entries()) {
      if (i > 0) expect(row.from, `row ${i}`).toBeGreaterThan(SQUAD_PACE[i - 1]!.from);
      expect(Number.isInteger(row.from)).toBe(true);
      expect(row.interval).toBeGreaterThan(0);
      expect(row.break).toBeGreaterThanOrEqual(0);
      expect(row.overlap).toBeGreaterThanOrEqual(0);
      expect(row.overlap).toBeLessThanOrEqual(1);
    }
  });

  it('only ever gets faster: no later row spawns slower or overlaps less', () => {
    for (let i = 1; i < SQUAD_PACE.length; i++) {
      const [a, b] = [SQUAD_PACE[i - 1]!, SQUAD_PACE[i]!];
      expect(b.interval, `row ${i}`).toBeLessThanOrEqual(a.interval);
      expect(b.overlap, `row ${i}`).toBeGreaterThanOrEqual(a.overlap);
    }
  });

  it('a horde takes the last row it has reached; the full game always its own', () => {
    for (let n = 1; n <= 40; n++) {
      const row = SQUAD_PACE.filter((r) => r.from <= n).at(-1)!;
      expect(wavePace(n, true), `Horde ${n}`).toBe(row);
      expect(wavePace(n, false)).toBe(FULL_PACE);
    }
    expect(FULL_PACE.overlap).toBe(0);
  });

  it('ramps overlap 0.5, 0.75, then full from Horde 8, all 0.6 s apart from Horde 6', () => {
    // The tuned ramp (design §9, ID-171); the horde-only balance test holds its numbers.
    expect([5, 6, 7, 8, 30].map((n) => wavePace(n, true).overlap)).toEqual([0, 0.5, 0.75, 1, 1]);
    expect([5, 6, 7, 8].map((n) => wavePace(n, true).interval)).toEqual([0.8, 0.6, 0.6, 0.6]);
  });

  it('the first overlap is a partial one, so no horde jumps from a clear to full overlap', () => {
    const first = SQUAD_PACE.find((r) => r.overlap > 0)!;
    expect(first.overlap).toBeLessThan(1);
  });
});

describe('when the next wave is due (ID-171)', () => {
  const at = (overlap: number): Pace => ({ ...FULL_PACE, overlap });

  it('no overlap waits for a clear field', () => {
    expect(nextWaveDue(at(0), 0, 20)).toBe(true);
    expect(nextWaveDue(at(0), 1, 20)).toBe(false);
  });

  it('full overlap never waits, however many are standing', () => {
    expect(nextWaveDue(at(1), 0, 20)).toBe(true);
    expect(nextWaveDue(at(1), 100, 20)).toBe(true);
  });

  it('a partial overlap waits until no more than its share of the wave is left', () => {
    expect(nextWaveDue(at(0.5), 11, 20)).toBe(false);
    expect(nextWaveDue(at(0.5), 10, 20)).toBe(true);
    expect(nextWaveDue(at(0.25), 6, 20)).toBe(false);
    expect(nextWaveDue(at(0.25), 5, 20)).toBe(true);
    expect(nextWaveDue(at(0.25), 0, 20)).toBe(true);
  });
});
