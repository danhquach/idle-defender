// ID-118: a Spewer's spit is a generated acid glob in flight, then a splash flip-book.
import { describe, expect, it } from 'vitest';
import { SPIT, spitFly, spitFrames } from './spit.ts';
import { ART_IDS } from './sprites.ts';

const arts = (u: number, still = false) => spitFrames(u, still).map((f) => f.art);

describe('acid spit (ID-118)', () => {
  it('uses bundled art for every frame', () => {
    for (const a of Object.values(SPIT.art)) expect(ART_IDS).toContain(a);
  });

  it('flies for the first half of its life, as the drawn dot did', () => {
    expect(SPIT.fly).toBe(0.5);
    expect(spitFly(0)).toBe(0);
    expect(spitFly(0.25)).toBe(0.5);
    expect(spitFly(0.5)).toBe(1);
    expect(spitFly(0.9)).toBe(1);
    expect(spitFly(-1)).toBe(0);
  });

  it('runs glob, splash, stain in order, cross-fading, and is gone at the end', () => {
    expect(arts(0)).toEqual([SPIT.art.glob]);
    expect(arts(0.49)).toEqual([SPIT.art.glob]);
    expect(arts(0.5)).toEqual([SPIT.art.splash]);
    expect(arts(0.5 + 0.5 * 0.45)).toEqual([SPIT.art.stain, SPIT.art.splash]);
    expect(arts(0.95)).toEqual([SPIT.art.stain]);
    expect(spitFrames(1)).toEqual([]);
    expect(spitFrames(-0.01)).toEqual([]);
  });

  it('bursts open, then holds its size; mid cross-fade the stain is whole under the fading splash', () => {
    expect(spitFrames(0.5)[0]!.grow).toBeCloseTo(SPIT.grow[0], 9);
    expect(spitFrames(0.5 + 0.5 * SPIT.grow[1])[0]!.grow).toBeCloseTo(1, 9);
    expect(spitFrames(0.9)[0]!.grow).toBe(1);
    const [stain, splash] = spitFrames(0.5 + 0.5 * 0.45);
    expect(stain!.alpha).toBe(1);
    expect(splash!.alpha).toBeCloseTo(0.5, 9);
    // The splash is gone by the end of the cross-fade, the stain fully there.
    const late = spitFrames(0.5 + 0.5 * (SPIT.stain[1] - 1e-9));
    expect(late[1]!.alpha).toBeLessThan(1e-6);
    const after = spitFrames(0.5 + 0.5 * SPIT.stain[1]);
    expect(after.map((f) => f.art)).toEqual([SPIT.art.stain]);
    expect(after[0]!.alpha).toBeCloseTo(1, 9);
  });

  it('the stain fades out by the end', () => {
    const late = spitFrames(0.999)[0]!;
    expect(late.art).toBe(SPIT.art.stain);
    expect(late.alpha).toBeLessThan(0.01);
    expect(spitFrames(0.85)[0]!.alpha).toBeGreaterThan(late.alpha);
  });

  it('with Reduce motion the splash holds still at full size and only fades', () => {
    for (const u of [0.5, 0.7, 0.95]) {
      const f = spitFrames(u, true);
      expect(f.map((x) => x.art)).toEqual([SPIT.art.splash]);
      expect(f[0]!.grow).toBe(1);
      expect(f[0]!.alpha).toBeCloseTo(1 - (u - 0.5) * 2, 9);
    }
    expect(arts(0.2, true)).toEqual([SPIT.art.glob]);
  });
});
